










# 分镜生成 API 文档

## 概述

分镜生成服务提供自动化的分镜脚本和宫格图生成功能。服务基于 Flask 构建，使用 multipart/form-data 进行文件上传和数据交互。

**基础信息**
- 默认端口: `8025`
- 数据格式: `multipart/form-data`
- 编码: `UTF-8`

**使用前准备**

启动服务：
```bash
uv run python main.py
```

---

## 接口列表

### 1. 健康检查

检查服务运行状态。

**请求**
```
GET /healthz
```

**响应**
```json
{
  "status": "ok"
}
```

---

### 2. 获取 API 信息

获取服务基本信息和可用接口列表。

**请求**
```
GET /
```

**响应**
```json
{
  "service": "Storyboard Generation API",
  "version": "1.0.0",
  "endpoints": [...]
}
```

---

### 3. 生成分镜提示词

根据剧本文本和全景图生成分镜脚本。

**请求**
```
POST /api/generate-shots
Content-Type: multipart/form-data
```

**请求参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_id | string | 是 | 客户端唯一标识 |
| task_id | string | 是 | 任务唯一标识 |
| script | string | 是 | 剧本文本内容 |
| panorama_image | file | 是 | 全景参考图片 |

**请求示例**

```http
POST http://localhost:8025/api/generate-shots
Content-Type: multipart/form-data; boundary=----boundary

------boundary
Content-Disposition: form-data; name="client_id"

test_client_001
------boundary
Content-Disposition: form-data; name="task_id"

task_001
------boundary
Content-Disposition: form-data; name="script"

一个英雄在夕阳下走向远方的故事。他背着行囊，身影被拉得很长。远处是连绵的山脉，天空被染成橙红色。
------boundary
Content-Disposition: form-data; name="panorama_image"; filename="1.jpg"
Content-Type: image/jpeg

< 二进制图片数据
------boundary--
```

**响应示例**

```json
{
  "success": true,
  "task_id": "task_001",
  "storyboard": {
    "image_generation_model": "NanoBananaPro",
    "grid_layout": "5x5",
    "global_settings": {
      "style": "Cinematic, Historical Drama, 8k Resolution",
      "negative_prompt": "text, watermark, writing, letters, signature, title, OSD, subtitles, modern objects, distortion, bad anatomy, ugly"
    },
    "shots": [
      {
        "shot_number": "Shot_1",
        "angle_type": "Back View",
        "prompt_text": "(Masterpiece, Best Quality), Back view of the character walking away..."
      }
    ],
    "reference_control_prompt": "以参考图一为主体，图二为Minister Zhang(张大人)人设..."
  }
}
```

---

### 4. 生成宫格图

根据分镜脚本生成分镜宫格图片。

**请求**
```
POST /api/generate-grid
Content-Type: multipart/form-data
```

**请求参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_id | string | 是 | 客户端唯一标识 |
| task_id | string | 是 | 任务唯一标识（与步骤1相同则更新同一任务） |
| storyboard | string(json) | 是 | 步骤1返回的 storyboard 字段的 JSON 字符串 |

**请求示例**

```http
POST http://localhost:8025/api/generate-grid
Content-Type: multipart/form-data; boundary=----boundary

------boundary
Content-Disposition: form-data; name="client_id"

test_client_001
------boundary
Content-Disposition: form-data; name="task_id"

task_001
------boundary
Content-Disposition: form-data; name="storyboard"

{"image_generation_model":"NanoBananaPro","grid_layout":"5x5","global_settings":{"style":"Cinematic, Historical Drama, 8k Resolution","negative_prompt":"text, watermark, writing, letters, signature, title, OSD, subtitles, modern objects, distortion, bad anatomy, ugly"},"shots":[{"shot_number":"Shot_1","angle_type":"Back View","prompt_text":"(Masterpiece, Best Quality), Back view of the character walking away..."}],"reference_control_prompt":"以参考图一为主体..."}
------boundary--
```

**响应示例**

```json
{
  "client_id": "test_client_001",
  "task_id": "task_001",
  "grid_image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
  "split_images": [
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
    "...（共 25 张独立图片）"
  ],
  "created_at": "2024-01-01T12:00:00Z"
}
```

**响应字段说明**

| 字段 | 类型 | 说明 |
|------|------|------|
| client_id | string | 客户端 ID |
| task_id | string | 任务 ID |
| grid_image | string | 5×5 宫格图的完整 data URL（可直接用于 img src） |
| split_images | array[string] | 25 张分割后的独立图片 data URL 数组 |
| created_at | string | 创建时间（ISO 8601 格式） |

---

### 5. 获取历史记录

获取指定客户端的所有任务历史。

**请求**
```
GET /api/history/{client_id}
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_id | string | 是 | 客户端唯一标识 |

**请求示例**

```http
GET http://localhost:8025/api/history/test_client_001
```

**响应示例**

```json
{
  "client_id": "test_client_001",
  "tasks": [
    {
      "task_id": "task_001",
      "created_at": "2024-01-01T12:00:00Z",
      "status": "completed",
      "script": "一个英雄在夕阳下走向远方的故事...",
      "storyboard": {...}
    }
  ]
}
```

---

## 数据模型

### Shot（分镜项）

| 字段 | 类型 | 说明 |
|------|------|------|
| shot_number | string | 分镜编号（如 Shot_1） |
| angle_type | string | 镜头角度类型 |
| prompt_text | string | 图片生成提示词 |

### Storyboard（分镜脚本）

| 字段 | 类型 | 说明 |
|------|------|------|
| image_generation_model | string | 图片生成模型名称 |
| grid_layout | string | 宫格布局（如 5x5） |
| global_settings | object | 全局设置 |
| global_settings.style | string | 全局风格描述 |
| global_settings.negative_prompt | string | 负面提示词 |
| shots | array[Shot] | 分镜列表 |
| reference_control_prompt | string | 参考控制提示 |

---

## 错误码

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

**错误响应示例**

```json
{
  "success": false,
  "error": "Invalid script format",
  "code": "INVALID_SCRIPT"
}
```

---

## 完整工作流示例

```
1. 上传剧本 + 全景图
   POST /api/generate-shots
   ↓
   返回分镜脚本 (storyboard JSON)

2. 上传分镜脚本
   POST /api/generate-grid
   ↓
   返回宫格图和各分镜图片

3. 查询历史
   GET /api/history/{client_id}
   ↓
   返回所有任务记录
```

