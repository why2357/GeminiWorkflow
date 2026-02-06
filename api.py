"""分镜生成核心 API."""
import base64
import json
import logging
import uuid
from datetime import datetime
from io import BytesIO
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

from app.config import HISTORY_DIR
from app.prompt import SHOT_PROMPT
from app.schemas import GenerateGridResponse, GenerateShotsResponse
from app.services.lingke import (
    call_warfox_gemini,
    call_warfox_image,
    extract_image,
    parse_json_from_text,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["storyboard"])


def _split_grid_image(base64_data: str) -> list[str]:
    """
    将 5×5 宫格图分割成 25 张独立图片.
    
    Args:
        base64_data: 去掉 data URL 前缀的纯 base64 字符串
    
    Returns:
        25 张图片的 base64 data URL 列表
    """
    # 解码 base64 图片
    img_data = base64.b64decode(base64_data)
    img = Image.open(BytesIO(img_data))
    
    width, height = img.size
    cell_width = width // 5
    cell_height = height // 5
    
    split_images = []
    for row in range(5):
        for col in range(5):
            # 计算裁剪区域
            left = col * cell_width
            top = row * cell_height
            right = left + cell_width
            bottom = top + cell_height
            
            # 裁剪并保存
            cell = img.crop((left, top, right, bottom))
            
            # 转换为 base64
            buffer = BytesIO()
            cell.save(buffer, format='PNG')
            cell_base64 = base64.b64encode(buffer.getvalue()).decode('ascii')
            split_images.append(f"data:image/png;base64,{cell_base64}")
    
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


def _load_history(client_id: str) -> tuple[list[str], dict]:
    """读取用户历史：返回 (order: task_id 顺序, tasks: {task_id: 任务数据})."""
    history_file = HISTORY_DIR / f"{client_id}.json"
    if not history_file.exists():
        return [], {}
    try:
        data = json.loads(history_file.read_text(encoding="utf-8"))
        if isinstance(data, dict) and "order" in data and "tasks" in data:
            return data["order"], data["tasks"]
        # 兼容旧格式：列表则转为新结构
        if isinstance(data, list):
            order, tasks = [], {}
            for i, item in enumerate(data[: _MAX_TASKS]):
                tid = item.get("task_id") or f"legacy_{i}"
                order.append(tid)
                tasks[tid] = {**item, "task_id": tid}
            return order, tasks
    except Exception:
        pass
    return [], {}


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
    按 task_id 新增或更新一条任务，不冗余；一个用户最多保留 _MAX_TASKS 个 task_id.
    图片数据完整保存（grid_image、split_images）.
    """
    history_file = HISTORY_DIR / f"{client_id}.json"
    order, tasks = _load_history(client_id)

    now = datetime.utcnow().isoformat() + "Z"
    if task_id in tasks:
        t = tasks[task_id]
        if script is not None:
            t["script"] = script
        if storyboard is not None:
            t["storyboard"] = storyboard
        if grid_image is not None:
            t["grid_image"] = grid_image
        if split_images is not None:
            t["split_images"] = split_images
        t["updated_at"] = now
    else:
        # 新任务：插入到最前，超过数量则删最旧的
        order.insert(0, task_id)
        for _ in range(len(order) - _MAX_TASKS):
            old_id = order.pop()
            tasks.pop(old_id, None)
        tasks[task_id] = {
            "task_id": task_id,
            "created_at": now,
            "updated_at": now,
            "script": script or "",
            "storyboard": storyboard or {},
            "grid_image": grid_image,
            "split_images": split_images or [],
        }

    history_file.parent.mkdir(parents=True, exist_ok=True)
    history_file.write_text(
        json.dumps({"order": order, "tasks": tasks}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


@router.post(
    "/generate-shots",
    response_model=GenerateShotsResponse,
    summary="生成 25 条分镜描述",
    response_description="返回 client_id、task_id、storyboard（含 shots 等）、created_at",
)
async def generate_shots(request: Request) -> JSONResponse:
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
        
        return JSONResponse({
            "client_id": client_id,
            "task_id": task_id,
            "storyboard": storyboard,
            "created_at": created_at,
        })
    
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
    ref_images: list[UploadFile] | None = File(default=None, description="参考图文件，可传多张（同名字段多次）"),
) -> JSONResponse:
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
        
        grid_image_url = f"data:{img['mime_type']};base64,{img['data']}"
        logger.info(f"[generate_grid] 成功生成宫格图，大小: {len(img['data'])} 字符")
        
        # ========== 分割宫格图 ==========
        logger.info("[generate_grid] 分割宫格图为 25 张独立图片...")
        
        try:
            split_images = _split_grid_image(img['data'])
            logger.info(f"[generate_grid] 成功分割为 {len(split_images)} 张图片")
        except Exception as e:
            logger.error(f"[generate_grid] 图片分割失败: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"图片分割失败: {str(e)}"
            )
        
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
        
        # ========== 返回结果 ==========
        return JSONResponse({
            "client_id": client_id,
            "task_id": task_id,
            "grid_image": grid_image_url,
            "split_images": split_images,
            "created_at": created_at,
        })
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[generate_grid] 未知错误: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"服务器内部错误: {str(e)}"
        )


@router.get("/history/{client_id}")
async def get_history(client_id: str) -> JSONResponse:
    """获取客户端的历史记录，按 task_id 顺序返回，每任务含完整 storyboard 与图片（grid_image、split_images）."""
    order, tasks = _load_history(client_id)
    history = [tasks[tid] for tid in order if tid in tasks]
    return JSONResponse({
        "client_id": client_id,
        "history": history,
    })
