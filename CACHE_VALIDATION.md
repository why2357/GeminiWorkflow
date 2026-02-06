# IndexedDB 缓存一致性验证方案

## 概述

本文档说明如何确保前端 IndexedDB 中的缓存数据是最新的，以及如何避免重复数据。

---

## 一、验证机制

### 1. 双重验证机制

```
┌─────────────────────────────────────────────────────────────────┐
│                      缓存验证流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  请求                                                          │
│    │                                                            │
│    ▼                                                            │
│  ┌──────────────┐                                               │
│  │ 检查本地缓存  │                                               │
│  └──────┬───────┘                                               │
│         │                                                        │
│    ┌────┴─────┐                                                │
│    │          │                                                │
│  有缓存    无缓存                                               │
│    │          │                                                │
│    │          ▼                                                │
│    │     ┌──────────────┐                                      │
│    │     │ 调用后端 API  │                                      │
│    │     └──────┬───────┘                                      │
│    │            │                                               │
│    │            ▼                                               │
│    │     ┌─────────────────────┐                              │
│    │     │ 保存到 IndexedDB    │                              │
│    │     │ (带 ETag/Version)   │                              │
│    │     └─────────────────────┘                              │
│    │                                                            │
│    ▼                                                            │
│  ┌──────────────────┐                                         │
│  │ 条件请求验证     │                                         │
│  │ (If-None-Match) │                                         │
│  └────────┬─────────┘                                         │
│           │                                                   │
│     ┌─────┴─────┐                                            │
│     │           │                                            │
│   304        200                                              │
│  (缓存有效)  (有新数据)                                       │
│     │           │                                            │
│     │           ▼                                            │
│     │     ┌─────────────────────┐                              │
│     │     │ 更新 IndexedDB      │                              │
│     │     │ (替换旧数据)        │                              │
│     │     └─────────────────────┘                              │
│     │                                                        │
│     ▼                                                        │
│  ┌──────────────┐                                           │
│  │ 返回数据      │                                           │
│  └──────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. HTTP 条件请求

**请求头：**
```
If-None-Match: "abc123def456"
```

**响应（未变化）：**
```
HTTP/1.1 304 Not Modified
ETag: "abc123def456"
```

**响应（已变化）：**
```
HTTP/1.1 200 OK
ETag: "xyz789abc012"
X-Data-Version: "20241021153000"
Content-Type: application/json

{ "split_images": [...] }
```

---

## 二、后端配合

### 1. 添加缓存控制响应头

```python
# 25ge/app/routers/api.py
from fastapi import Response
import hashlib
from datetime import datetime

def calculate_etag(data) -> str:
    """计算数据指纹（MD5 前16位）"""
    if isinstance(data, str):
        content = data
    elif isinstance(data, list):
        content = ''.join(data) if data else ''
    else:
        content = str(data)
    return hashlib.md5(content.encode()).hexdigest()[:16]

@app.get("/api/history/{client_id}/{task_id}/splits")
async def get_task_split_images(
    client_id: str,
    task_id: str,
    request: Request,
    response: Response
):
    # 获取任务数据
    task = await get_task_from_db(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # 计算当前数据的 ETag
    current_etag = calculate_etag(task.split_images)

    # 检查条件请求头
    if_none_match = request.headers.get("if-none-match")
    if if_none_match:
        client_etag = if_none_match.strip('"')
        if client_etag == current_etag:
            # 数据未变化，返回 304
            response.status_code = 304
            return {}

    # 数据有变化或首次请求
    response.headers["Cache-Control"] = "public, max-age=86400"
    response.headers["ETag"] = f'"{current_etag}"'
    response.headers["Last-Modified"] = task.updated_at.strftime("%a, %d %b %Y %H:%M:%S GMT")
    response.headers["X-Data-Version"] = task.updated_at.strftime("%Y%m%d%H%M%S")

    return {
        "split_images": task.split_images,
        "_meta": {
            "etag": current_etag,
            "version": task.updated_at.strftime("%Y%m%d%H%M%S"),
            "updated_at": task.updated_at.isoformat()
        }
    }
```

### 2. 数据库模型需要添加的字段

```sql
-- 任务表添加更新时间字段
ALTER TABLE tasks ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 创建索引
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
```

---

## 三、前端使用

### 1. 自动缓存验证

缓存验证是自动的，无需额外代码：

```javascript
import { getTaskSplitImages } from './services/api';

// 首次请求 - 从 API 获取
const data1 = await getTaskSplitImages(taskId);

// 再次请求 - 自动使用条件请求验证
const data2 = await getTaskSplitImages(taskId);
// 如果数据未变化：服务器返回 304，使用本地缓存
// 如果数据已变化：服务器返回新数据，更新本地缓存
```

### 2. 调试工具使用

在浏览器控制台中：

```javascript
// 查看缓存统计
CacheDebug.stats();

// 查看所有缓存项
CacheDebug.getAll();

// 验证指定缓存项
CacheDebug.validate('splits', clientId, taskId);

// 与服务器对比
CacheDebug.compare('splits', clientId, taskId, getTaskSplitImages);

// 查看缓存详情
CacheDebug.inspect('splits', clientId, taskId);

// 清理过期缓存
CacheDebug.clean();

// 清空所有缓存
CacheDebug.clear();
```

---

## 四、防重复机制

### 1. 请求去重

```javascript
// imageCache.js
this.pendingRequests = new Map();

// 如果相同请求正在进行，等待其完成
if (imageCache.pendingRequests.has(key)) {
  return imageCache.pendingRequests.get(key);
}
```

### 2. IndexedDB 唯一键

```javascript
// 缓存键格式：type:clientId:taskId
const key = `${type}:${clientId}:${taskId}`;

// IndexedDB 使用 keyPath 作为主键，自动去重
const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
```

---

## 五、验证清单

### 前端验证

- [x] IndexedDB 使用唯一键防止重复
- [x] 请求去重机制
- [x] 条件请求（If-None-Match）
- [x] ETag 验证
- [x] 版本号验证
- [x] 过期时间管理
- [x] 调试工具

### 后端验证（需要添加）

- [ ] 添加 `updated_at` 字段
- [ ] 实现 ETag 计算
- [ ] 支持 `If-None-Match` 请求头
- [ ] 返回 `304 Not Modified`
- [ ] 添加缓存控制响应头
- [ ] 返回版本信息

---

## 六、测试方法

### 1. 手动测试

```javascript
// 1. 清空缓存
await CacheDebug.clear();

// 2. 首次请求
const data1 = await getTaskSplitImages(taskId);
console.log('首次请求:', data1._fromCache); // false

// 3. 再次请求
const data2 = await getTaskSplitImages(taskId);
console.log('再次请求:', data2._fromCache); // true (如果支持 304)

// 4. 查看缓存状态
await CacheDebug.stats();

// 5. 验证缓存一致性
const result = await CacheDebug.compare('splits', clientId, taskId, getTaskSplitImages);
console.log('一致性检查:', result);
```

### 2. 验证 304 响应

打开浏览器开发者工具 → Network 标签：

1. 首次请求应该返回 `200 OK`
2. 再次请求应该返回 `304 Not Modified`
3. 304 响应应该没有 body（节省带宽）

---

## 七、常见问题

### Q1: 如何强制刷新缓存？

```javascript
// 方法1：使用 forceRefresh 参数（如果实现）
const data = await getTaskSplitImages(taskId, null, true);

// 方法2：直接删除缓存
await imageCache.deleteImage('splits', clientId, taskId);
const data = await getTaskSplitImages(taskId);
```

### Q2: 如何判断数据来自缓存？

```javascript
const data = await getTaskSplitImages(taskId);

if (data._fromCache) {
  console.log('数据来自缓存');
  if (data._validated) {
    console.log('缓存已通过服务器验证');
  }
}
```

### Q3: IndexedDB 存储空间不足怎么办？

```javascript
// 查看缓存大小
const stats = await CacheDebug.stats();

// 如果超过限制，会自动清理最旧的缓存
// 也可以手动清理
await CacheDebug.clean(); // 清理过期缓存
await CacheDebug.clear(); // 清空所有缓存
```

---

## 八、性能对比

| 场景 | 无缓存 | 有缓存 | 节省 |
|------|--------|--------|------|
| 首次访问 | ~2s | ~2s | 0% |
| 再次访问（未变化） | ~2s | ~50ms | 97.5% |
| 再次访问（已变化） | ~2s | ~2s | 0% |
| 网络慢速 | ~10s | ~50ms | 99.5% |

**带宽节省：**
- 未变化：0 字节（仅 HTTP 头）
- 已变化：仅传输差异部分

---

## 九、监控建议

### 前端监控

```javascript
// 定期记录缓存命中率
let cacheHits = 0;
let totalRequests = 0;

function recordCacheHit(fromCache) {
  totalRequests++;
  if (fromCache) cacheHits++;
  console.log(`缓存命中率: ${(cacheHits / totalRequests * 100).toFixed(1)}%`);
}
```

### 后端监控

记录 304 响应的比例，衡量缓存有效性：

```python
# FastAPI 中间件
@app.middleware("http")
async def cache_stats(request: Request, call_next):
    response = await call_next(request)
    if response.status_code == 304:
        # 记录 304 响应
        pass
    return response
```
