"""分镜生成核心 API."""
import base64
import json
import logging
import uuid
from datetime import datetime
from io import BytesIO
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from PIL import Image

from app.config import HISTORY_DIR
from app.prompt import SHOT_PROMPT
from app.schemas import (
    GenerateGridResponse,
    GenerateShotsResponse,
    HistoryGridResponse,
    HistoryMetaResponse,
    HistoryResponse,
    HistorySplitsResponse,
    HistoryTaskDetail,
    TaskSummary,
)
from app.services.lingke import (
    call_warfox_gemini,
    call_warfox_image,
    extract_image,
    parse_json_from_text,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["storyboard"])


# JPEG 压缩质量（分辨率不变，仅格式与压缩）
_JPEG_QUALITY = 85
# 缩略图最长边像素（接口返回用，历史仍存原图）
_THUMB_MAX_SIZE = 400
# 宫格图缩略图：减尺寸 + JPEG 减体积
_THUMB_MAX_SIZE_GRID = 320
_THUMB_QUALITY = 80


def _pil_to_jpeg_data_url(pil_img: Image.Image, quality: int = _JPEG_QUALITY) -> str:
    """将 PIL 图转为 JPEG base64 data URL（分辨率不变）。RGBA/透明通道会先叠白底再转 RGB。"""
    if pil_img.mode in ("RGBA", "LA", "P"):
        if pil_img.mode == "P" and "transparency" in pil_img.info:
            pil_img = pil_img.convert("RGBA")
        background = Image.new("RGB", pil_img.size, (255, 255, 255))
        if pil_img.mode in ("RGBA", "LA"):
            background.paste(pil_img, mask=pil_img.split()[-1])
        else:
            background.paste(pil_img)
        pil_img = background
    elif pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")
    buffer = BytesIO()
    pil_img.save(buffer, format="JPEG", quality=quality, optimize=True)
    return f"data:image/jpeg;base64,{base64.b64encode(buffer.getvalue()).decode('ascii')}"


def _data_url_to_jpeg_keep_size(data_url: str, quality: int = _THUMB_QUALITY) -> str:
    """仅压缩为 JPEG、不改变尺寸，用于需保留分辨率的下载图（如 splits 25 张）。"""
    if not data_url or "," not in data_url:
        return data_url or ""
    try:
        raw = data_url.split(",", 1)[1]
        img = Image.open(BytesIO(base64.b64decode(raw)))
    except Exception:
        return data_url
    return _pil_to_jpeg_data_url(img, quality=quality)


def _data_url_to_thumbnail(data_url: str, max_size: int = _THUMB_MAX_SIZE, quality: int = _THUMB_QUALITY) -> str:
    """将 data URL 转为缩略图（最长边不超过 max_size，JPEG 压缩），用于接口返回。"""
    if not data_url or "," not in data_url:
        return data_url or ""
    try:
        raw = data_url.split(",", 1)[1]
        img = Image.open(BytesIO(base64.b64decode(raw)))
    except Exception:
        return data_url
    w, h = img.size
    if w <= max_size and h <= max_size:
        return _pil_to_jpeg_data_url(img, quality=quality)
    if w >= h:
        nw, nh = max_size, max(1, int(h * max_size / w))
    else:
        nw, nh = max(1, int(w * max_size / h)), max_size
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    return _pil_to_jpeg_data_url(img, quality=quality)


def _split_grid_image(base64_data: str) -> list[str]:
    """
    将 5×5 宫格图分割成 25 张独立图片，输出为 JPEG data URL（分辨率不变，体积更小）。
    
    Args:
        base64_data: 去掉 data URL 前缀的纯 base64 字符串
    
    Returns:
        25 张图片的 base64 data URL 列表（image/jpeg）
    """
    img_data = base64.b64decode(base64_data)
    img = Image.open(BytesIO(img_data))
    if img.mode in ("RGBA", "LA", "P"):
        if img.mode == "P" and "transparency" in img.info:
            img = img.convert("RGBA")
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode in ("RGBA", "LA"):
            background.paste(img, mask=img.split()[-1])
        else:
            background.paste(img)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    width, height = img.size
    cell_width = width // 5
    cell_height = height // 5

    split_images = []
    for row in range(5):
        for col in range(5):
            left = col * cell_width
            top = row * cell_height
            right = left + cell_width
            bottom = top + cell_height
            cell = img.crop((left, top, right, bottom))
            split_images.append(_pil_to_jpeg_data_url(cell))
    return split_images


async def _file_to_ref_async(file: UploadFile) -> dict[str, str]:
    """异步：将上传文件转为 ref_images 格式。"""
    content = await file.read()
    ext = (file.filename or "").lower().split(".")[-1] if file.filename else ""
    mime = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
        "gif": "image/gif", "webp": "image/webp",
    }.get(ext, "image/jpeg")
    return {"mime_type": mime, "data": base64.b64encode(content).decode("ascii")}


_MAX_TASKS = 50

# 方案 A：索引文件只存轻量数据；单任务完整数据存 history/{client_id}/{task_id}.json


def _task_light(task: dict) -> dict:
    """从完整任务中提取索引用轻量字段（不含 grid_image、split_images）。"""
    return {
        "task_id": task.get("task_id", ""),
        "created_at": task.get("created_at", ""),
        "updated_at": task.get("updated_at", ""),
        "script": task.get("script", ""),
        "storyboard": task.get("storyboard", {}),
        "has_grid": bool(task.get("grid_image")),
        "has_splits": bool(task.get("split_images")),
    }


def _load_index(client_id: str) -> tuple[list[str], dict]:
    """
    只读索引文件，返回 (order, tasks_light)。
    tasks_light 不含 grid_image、split_images，仅含 has_grid、has_splits 等轻量字段。
    若发现旧格式（单文件含图片），则迁移为索引 + 按任务文件后返回新索引。
    """
    index_file = HISTORY_DIR / f"{client_id}.json"
    if not index_file.exists():
        return [], {}

    try:
        data = json.loads(index_file.read_text(encoding="utf-8"))
    except Exception:
        return [], {}

    order: list[str] = []
    tasks_raw: dict = {}

    if isinstance(data, dict) and "order" in data and "tasks" in data:
        order = list(data["order"]) if isinstance(data["order"], list) else []
        tasks_raw = data["tasks"] if isinstance(data["tasks"], dict) else {}
    elif isinstance(data, list):
        for i, item in enumerate(data[: _MAX_TASKS]):
            if not isinstance(item, dict):
                continue
            tid = item.get("task_id") or f"legacy_{i}"
            order.append(tid)
            tasks_raw[tid] = {**item, "task_id": tid}

    if not tasks_raw:
        return [], {}

    # 判断是否为旧格式：任意任务含 grid_image 或 split_images 即视为旧格式，需迁移
    is_legacy = any(
        "grid_image" in t or "split_images" in t
        for t in tasks_raw.values()
        if isinstance(t, dict)
    )
    if is_legacy:
        _migrate_to_per_task_storage(client_id, order, tasks_raw)
        return _load_index(client_id)

    # 已是新格式：tasks 应为轻量（仅有 has_grid/has_splits，无大图）
    tasks_light = {tid: t for tid, t in tasks_raw.items() if isinstance(t, dict)}
    return order, tasks_light


def _migrate_to_per_task_storage(client_id: str, order: list[str], tasks_raw: dict) -> None:
    """将旧版单文件历史迁移为：索引文件（轻量）+ 每任务一个 JSON 文件。"""
    index_file = HISTORY_DIR / f"{client_id}.json"
    task_dir = HISTORY_DIR / client_id
    task_dir.mkdir(parents=True, exist_ok=True)

    tasks_light = {}
    for tid in order:
        t = tasks_raw.get(tid)
        if not isinstance(t, dict):
            continue
        tasks_light[tid] = _task_light(t)
        # 写入单任务完整数据
        task_file = task_dir / f"{tid}.json"
        full = {
            "task_id": tid,
            "created_at": t.get("created_at", ""),
            "updated_at": t.get("updated_at", ""),
            "script": t.get("script", ""),
            "storyboard": t.get("storyboard", {}),
            "grid_image": t.get("grid_image"),
            "split_images": t.get("split_images") or [],
        }
        task_file.write_text(json.dumps(full, ensure_ascii=False, indent=2), encoding="utf-8")

    index_file.write_text(
        json.dumps({"order": order, "tasks": tasks_light}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    logger.info("[history] 已迁移为按任务分文件存储 client_id=%s tasks=%s", client_id, len(order))


def _load_task(client_id: str, task_id: str) -> dict | None:
    """读取单条任务完整数据（含 grid_image、split_images），仅读该任务文件。"""
    task_file = HISTORY_DIR / client_id / f"{task_id}.json"
    if not task_file.exists():
        return None
    try:
        return json.loads(task_file.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_history_upsert(
    client_id: str,
    task_id: str,
    *,
    script: str | None = None,
    storyboard: dict | None = None,
    grid_image: str | None = None,
    split_images: list[str] | None = None,
) -> None:
    """
    按 task_id 新增或更新：索引文件只存轻量；完整数据写入 history/{client_id}/{task_id}.json.
    一个用户最多保留 _MAX_TASKS 个 task_id.
    """
    order, tasks_light = _load_index(client_id)
    now = datetime.utcnow().isoformat() + "Z"
    index_file = HISTORY_DIR / f"{client_id}.json"
    task_dir = HISTORY_DIR / client_id
    task_dir.mkdir(parents=True, exist_ok=True)
    task_file = task_dir / f"{task_id}.json"

    if task_id in tasks_light:
        light = tasks_light[task_id]
        if script is not None:
            light["script"] = script
        if storyboard is not None:
            light["storyboard"] = storyboard
        if grid_image is not None:
            light["has_grid"] = True
        if split_images is not None:
            light["has_splits"] = True
        light["updated_at"] = now
    else:
        order.insert(0, task_id)
        for _ in range(len(order) - _MAX_TASKS):
            old_id = order.pop()
            tasks_light.pop(old_id, None)
            old_path = task_dir / f"{old_id}.json"
            if old_path.exists():
                try:
                    old_path.unlink()
                except OSError:
                    pass
        tasks_light[task_id] = {
            "task_id": task_id,
            "created_at": now,
            "updated_at": now,
            "script": script or "",
            "storyboard": storyboard or {},
            "has_grid": bool(grid_image),
            "has_splits": bool(split_images),
        }

    index_file.write_text(
        json.dumps({"order": order, "tasks": tasks_light}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 单任务完整数据：优先从已有文件读再合并，避免覆盖掉未传入的字段
    full: dict = {}
    if task_file.exists():
        try:
            full = json.loads(task_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    full.setdefault("task_id", task_id)
    full.setdefault("created_at", now)
    full["updated_at"] = now
    if script is not None:
        full["script"] = script
    if storyboard is not None:
        full["storyboard"] = storyboard
    if grid_image is not None:
        full["grid_image"] = grid_image
    if split_images is not None:
        full["split_images"] = split_images
    full.setdefault("script", "")
    full.setdefault("storyboard", {})
    full.setdefault("grid_image", None)
    full.setdefault("split_images", [])

    task_file.write_text(json.dumps(full, ensure_ascii=False, indent=2), encoding="utf-8")


@router.post(
    "/generate-shots",
    response_model=GenerateShotsResponse,
    summary="生成 25 条分镜描述",
    response_description="返回 client_id、task_id、storyboard（含 shots 等）、created_at",
)
async def generate_shots(request: Request) -> GenerateShotsResponse:
    """
    **步骤 1：根据剧本和全景图，生成 25 条分镜描述（NanoBananaPro 格式）。**

    ---

    **请求方式**：`POST`，`Content-Type: multipart/form-data`

    **表单字段**：

    | 字段名 | 类型 | 必填 | 说明 |
    |--------|------|------|------|
    | `client_id` | string | 是 | 客户端唯一标识 |
    | `script` | string | 是 | 剧本内容 |
    | `panorama_image` | file | 是 | 全景图文件（一张） |
    | `task_id` | string | 否 | 不传则自动生成 UUID；同 task_id 会更新同一任务 |
    | `system_prompt` | string | 否 | 可选，覆盖默认分镜提示词 |

    **前端调用示例（JavaScript）**：

    ```javascript
    const formData = new FormData();
    formData.append("client_id", "your_client_id");
    formData.append("script", "你的剧本内容...");
    formData.append("panorama_image", imageFile);  // File 对象
    // 可选：formData.append("task_id", "xxx");

    const res = await fetch("/api/generate-shots", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();  // { client_id, task_id, storyboard, created_at }
    // 步骤 2 需使用 data.task_id 和 data.storyboard
    ```

    **响应**：`storyboard` 为完整 JSON 对象（含 `shots`、`global_settings`、`reference_control_prompt` 等），步骤 2 需将 `storyboard` 序列化为 JSON 字符串传入。
    """
    try:
        form = await request.form()
        client_id = form.get("client_id")
        task_id = form.get("task_id")
        script = form.get("script")
        system_prompt = form.get("system_prompt")
        panorama_image = form.get("panorama_image")

        if not client_id or not isinstance(client_id, str) or not client_id.strip():
            raise HTTPException(status_code=422, detail="client_id 必填")
        if not script or not isinstance(script, str) or not script.strip():
            raise HTTPException(status_code=422, detail="script 必填")
        client_id = client_id.strip()
        script = script.strip()

        if not panorama_image or not hasattr(panorama_image, "read"):
            raise HTTPException(status_code=422, detail="panorama_image 必填（上传全景图文件）")

        if not (task_id and isinstance(task_id, str) and task_id.strip()):
            task_id = str(uuid.uuid4())
        else:
            task_id = task_id.strip()
        system_prompt = (system_prompt.strip() if system_prompt and isinstance(system_prompt, str) else None) or None

        logger.info(f"[generate_shots] 客户端: {client_id}, task_id: {task_id}, 剧本长度: {len(script)}")

        panorama_ref = await _file_to_ref_async(panorama_image)
        ref_images = [panorama_ref]

        sys_prompt = system_prompt or SHOT_PROMPT
        count = 25
        prompt = f"{sys_prompt}\n\n===== 任务开始 =====\n剧本内容：\n{script}\n\n请生成 {count} 条分镜描述。\n===== 任务结束 =====\n\n现在输出 JSON 数组："
        
        logger.info(f"[generate_shots] 生成 {count} 条分镜描述...")
        shots_text = await call_warfox_gemini(
            system_prompt="",
            user_text=prompt,
            ref_images=ref_images,
        )
        
        logger.info(f"[generate_shots] 模型返回（前 500 字符）: {shots_text[:500]}")
        
        # 解析 JSON（NanoBananaPro 格式: {"shots": [{"shot_number", "prompt_text", ...}], ...}）
        try:
            parsed = parse_json_from_text(shots_text)
        except Exception as e:
            logger.error(f"[generate_shots] JSON 解析失败: {e}")
            raise HTTPException(
                status_code=502,
                detail=f"模型返回内容无法解析为 JSON。请重试。错误: {str(e)}"
            )
        
        if not isinstance(parsed, dict) or "shots" not in parsed:
            raise HTTPException(
                status_code=502,
                detail="模型未返回有效的 JSON 对象（需要包含 shots 数组）"
            )
        
        # 保留完整结构，不转换
        storyboard = parsed
        raw_shots = storyboard.get("shots") or []
        logger.info(f"[generate_shots] 成功生成 {len(raw_shots)} 条分镜，完整结构已保留")
        
        created_at = datetime.utcnow().isoformat() + "Z"
        
        # ========== 按 task_id 保存/更新历史（不冗余） ==========
        try:
            _save_history_upsert(
                client_id,
                task_id,
                script=script,
                storyboard=storyboard,
            )
            logger.info(f"[generate_shots] 已保存历史 task_id={task_id}")
        except Exception as e:
            logger.warning(f"保存历史记录失败: {e}")
        
        return GenerateShotsResponse(
            client_id=client_id,
            task_id=task_id,
            storyboard=storyboard,
            created_at=created_at,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[generate_shots] 未知错误: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"服务器内部错误: {str(e)}"
        )


@router.post(
    "/generate-grid",
    response_model=GenerateGridResponse,
    summary="生成 5×5 宫格图并分割",
    description=(
        "步骤 2：根据分镜 JSON 生成 5×5 宫格图，并自动分割为 25 张独立图片。\n\n"
        "**请点击下方「Request body」展开，在 multipart/form-data 中填写：**\n"
        "- **client_id**（必填）：客户端唯一标识\n"
        "- **task_id**（必填）：步骤 1 返回的 task_id\n"
        "- **storyboard**（必填）：步骤 1 返回的 storyboard 的 JSON 字符串\n"
        "- **ref_images**（可选）：多张参考图文件\n"
        "- **system_prompt**（可选）：当前未使用\n\n"
        "Parameters 为空为正常，表单字段均在 Request body 中。"
    ),
    response_description="返回宫格图 base64、25 张分割图 base64 及任务信息",
)
async def generate_grid(
    client_id: str = Form(..., description="客户端唯一标识，与步骤 1 一致"),
    task_id: str = Form(..., description="任务 ID，必须使用步骤 1 返回的 task_id"),
    storyboard: str = Form(..., description="步骤 1 返回的 storyboard 对象序列化成的 JSON 字符串（含 shots 等）"),
    system_prompt: str | None = Form(default=None, description="可选，当前未使用"),
    ref_images: list[UploadFile] = File(default=[], description="参考图文件，可传多张（同名字段多次），不传则为空"),
) -> GenerateGridResponse:
    """步骤 2：根据分镜 JSON 生成 5×5 宫格图，并自动分割为 25 张独立图片。表单字段见 Request body。"""
    try:
        client_id = client_id.strip()
        task_id = task_id.strip()
        storyboard = storyboard.strip()
        system_prompt = (system_prompt.strip() if system_prompt else None) or None

        storyboard_obj = json.loads(storyboard)
        shots = storyboard_obj.get("shots") or []
        logger.info(f"[generate_grid] 客户端: {client_id}, 分镜数量: {len(shots)}")
        
        if len(shots) < 25:
            raise HTTPException(
                status_code=400,
                detail=f"storyboard.shots 需要至少 25 条，当前提供了 {len(shots)} 条"
            )
        
        # 将上传文件转为 base64（后端内部使用）；不传则 ref_list 为空
        ref_list = [await _file_to_ref_async(f) for f in (ref_images or []) if f and getattr(f, "filename", None)]
        logger.info(f"[generate_grid] 使用 {len(ref_list)} 张参考图")
        
        # ========== 生成 5×5 宫格图 ==========
        logger.info("[generate_grid] 生成 5×5 宫格分镜图...")
        
        # NanoBananaPro 专用格式：直接传递完整 storyboard JSON
        # 添加明确的宫格布局说明
        prompt_parts = [
            "# NanoBananaPro 5×5 分镜宫格生成",
            "",
            "## 任务要求",
            "生成一张包含 25 个分镜的 5×5 宫格图（5 行 × 5 列布局）",
            "- 第 1 行：Shot_1 至 Shot_5",
            "- 第 2 行：Shot_6 至 Shot_10",
            "- 第 3 行：Shot_11 至 Shot_15",
            "- 第 4 行：Shot_16 至 Shot_20",
            "- 第 5 行：Shot_21 至 Shot_25",
            "",
            "## Storyboard 配置",
            json.dumps(storyboard_obj, ensure_ascii=False, indent=2),
        ]
        image_prompt = "\n".join(prompt_parts)
        
        logger.info(f"[generate_grid] 图像生成 prompt 长度: {len(image_prompt)} 字符")

        image_data = await call_warfox_image(
            prompt=image_prompt,
            system_prompt=None,  # NanoBananaPro 不需要系统提示词
            aspect_ratio="16:9",  # 5×5 宫格使用 16:9
            image_size="4K",
            ref_images=ref_list,
        )
        
        try:
            img = extract_image(image_data)
        except Exception as e:
            logger.error(f"[generate_grid] 提取图片失败: {e}")
            raise HTTPException(
                status_code=502,
                detail=f"模型未返回图片。错误: {str(e)}"
            )
        
        # 统一转为 JPEG（分辨率不变，减小体积）
        grid_pil = Image.open(BytesIO(base64.b64decode(img["data"])))
        grid_image_url = _pil_to_jpeg_data_url(grid_pil)
        # 用于分割的纯 base64（与宫格图同源，已是 JPEG）
        grid_jpeg_raw = grid_image_url.split(",", 1)[1] if "," in grid_image_url else img["data"]
        logger.info(f"[generate_grid] 成功生成宫格图（已转 JPEG），大小: {len(grid_image_url)} 字符")
        
        # ========== 分割宫格图 ==========
        logger.info("[generate_grid] 分割宫格图为 25 张独立图片（JPEG）...")
        
        try:
            split_images = _split_grid_image(grid_jpeg_raw)
            logger.info(f"[generate_grid] 成功分割为 {len(split_images)} 张图片")
        except Exception as e:
            logger.error(f"[generate_grid] 图片分割失败: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"图片分割失败: {str(e)}"
            )

        # 明确返回 25 张分镜图（带 shot_number），与 storyboard.shots 顺序一致
        if len(split_images) < 25:
            logger.warning(f"[generate_grid] 分割图不足 25 张，当前 {len(split_images)} 张")
        images = [
            {"shot_number": f"Shot_{i}", "image": split_images[i - 1] if i <= len(split_images) else ""}
            for i in range(1, 26)
        ]
        
        # ========== 按 task_id 更新历史，保存完整图片数据 ==========
        created_at = datetime.utcnow().isoformat() + "Z"
        try:
            _save_history_upsert(
                client_id,
                task_id,
                storyboard=storyboard_obj,
                grid_image=grid_image_url,
                split_images=split_images,
            )
            logger.info(f"[generate_grid] 已更新历史 task_id={task_id}，含完整宫格图与 25 张分镜图")
        except Exception as e:
            logger.warning(f"保存历史记录失败: {e}")
        
        # ========== 返回结果：以缩略图返回（历史仍存原图）==========
        grid_thumb = _data_url_to_thumbnail(grid_image_url)
        splits_thumb = [_data_url_to_thumbnail(u) for u in split_images]
        images_thumb = [
            {"shot_number": f"Shot_{i}", "image": splits_thumb[i - 1] if i <= len(splits_thumb) else ""}
            for i in range(1, 26)
        ]
        return GenerateGridResponse(
            client_id=client_id,
            task_id=task_id,
            grid_image=grid_thumb,
            split_images=splits_thumb,
            images=images_thumb,
            created_at=created_at,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[generate_grid] 未知错误: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"服务器内部错误: {str(e)}"
        )


def _task_summary(task_id: str, task: dict) -> TaskSummary:
    """单条任务的轻量摘要（索引中已是轻量，含 has_grid、has_splits）。"""
    return TaskSummary(
        task_id=task_id,
        created_at=task.get("created_at", ""),
        updated_at=task.get("updated_at", ""),
        script=task.get("script", ""),
        storyboard=task.get("storyboard", {}),
        has_grid=bool(task.get("has_grid")),
        has_splits=bool(task.get("has_splits")),
    )


@router.get("/history/{client_id}", response_model=HistoryResponse)
async def get_history(client_id: str) -> HistoryResponse:
    """获取客户端的历史记录（仅读索引，不含图片 base64）。需图片时调 /grid 或 /splits。"""
    order, tasks_light = _load_index(client_id)
    history = [_task_summary(tid, tasks_light[tid]) for tid in order if tid in tasks_light]
    return HistoryResponse(client_id=client_id, history=history)


@router.get("/history/{client_id}/meta", response_model=HistoryMetaResponse)
async def get_history_meta(client_id: str) -> HistoryMetaResponse:
    """轻量新鲜度接口：仅返回各任务 updated_at，前端与本地缓存比较后决定是否拉取完整数据。"""
    order, tasks_light = _load_index(client_id)
    tasks: dict[str, str] = {}
    latest = ""
    for tid in order:
        t = tasks_light.get(tid)
        if not t:
            continue
        u = t.get("updated_at") or ""
        tasks[tid] = u
        if u and (not latest or u > latest):
            latest = u
    return HistoryMetaResponse(client_id=client_id, updated_at=latest, tasks=tasks)


@router.get("/history/{client_id}/{task_id}/grid", response_model=HistoryGridResponse)
async def get_history_grid(client_id: str, task_id: str) -> HistoryGridResponse:
    """按需获取某任务的宫格图（缩略图返回：减尺寸 + JPEG 减体积，历史存原图）。"""
    task = _load_task(client_id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    grid_image = task.get("grid_image")
    if not grid_image:
        raise HTTPException(status_code=404, detail="该任务暂无宫格图")
    return HistoryGridResponse(
        client_id=client_id,
        task_id=task_id,
        grid_image=_data_url_to_thumbnail(grid_image, max_size=_THUMB_MAX_SIZE_GRID),
    )


@router.get("/history/{client_id}/{task_id}/splits", response_model=HistorySplitsResponse)
async def get_history_splits(client_id: str, task_id: str) -> HistorySplitsResponse:
    """按需获取该任务的分镜详情：storyboard、25 张分镜图以缩略图返回。"""
    task = _load_task(client_id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    raw_splits = task.get("split_images") or []
    # 尺寸不变，仅压缩为 JPEG 以减小体积（供下载用）
    split_images_thumb = [_data_url_to_jpeg_keep_size(u) for u in raw_splits]
    detail = HistoryTaskDetail(
        task_id=task_id,
        created_at=task.get("created_at", ""),
        updated_at=task.get("updated_at", ""),
        script=task.get("script", ""),
        storyboard=task.get("storyboard", {}),
        split_images=split_images_thumb,
    )
    return HistorySplitsResponse(client_id=client_id, task=detail)
