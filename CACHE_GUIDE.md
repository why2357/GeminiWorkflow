# 图片缓存方案说明

## 概述

本方案使用 IndexedDB 在浏览器本地缓存图片数据，减少重复请求，提升用户体验。

---

## 前端实现

### 1. 缓存工具类

**位置:** `src/utils/imageCache.js`

**功能:**
- 使用 IndexedDB 存储图片数据
- 自动缓存过期管理（默认 7 天）
- 缓存大小限制（默认 100MB）
- 定期清理过期缓存

**API:**
```javascript
// 保存图片到缓存
await imageCache.saveImage(type, clientId, taskId, imageData);

// 从缓存获取图片
const data = await imageCache.getImage(type, clientId, taskId);

// 删除指定缓存
await imageCache.deleteImage(type, clientId, taskId);

// 清理过期缓存
await imageCache.cleanExpired();

// 清空所有缓存
await imageCache.clearAll();

// 获取缓存大小
const size = await imageCache.getCacheSize();
```

### 2. 缓存 API 封装

**位置:** `src/services/api.js`

**修改的 API:**
- `getTaskGridImage(taskId, clientId, forceRefresh)` - 获取宫格图
- `getTaskSplitImages(taskId, clientId, forceRefresh)` - 获取分镜图

**使用示例:**
```javascript
// 首次请求 - 从 API 获取并缓存
const data = await getTaskGridImage(taskId);

// 再次请求 - 从缓存读取（无网络请求）
const cachedData = await getTaskGridImage(taskId);

// 强制刷新 - 忽略缓存，从 API 获取最新数据
const freshData = await getTaskGridImage(taskId, clientId, true);
```

### 3. 缓存管理组件

**位置:** `src/components/common/CacheManager.jsx`

用户可以查看缓存状态、清理过期缓存、清空所有缓存。

---

## 后端配合

### 1. 添加缓存控制头（推荐）

在 API 响应中添加 HTTP 缓存头，帮助前端判断数据是否需要更新：

```python
# FastAPI 示例
from fastapi import Response
from datetime import datetime, timedelta

@app.get("/api/history/{client_id}/{task_id}/grid")
async def get_task_grid_image(client_id: str, task_id: str, response: Response):
    # ... 获取图片数据 ...

    # 设置缓存控制头
    response.headers["Cache-Control"] = "public, max-age=86400"  # 24小时
    response.headers["ETag"] = f'"{calculate_etag(task_data)}"'  # 数据指纹
    response.headers["Last-Modified"] = task_data.created_at.strftime("%a, %d %b %Y %H:%M:%S GMT")

    return {"grid_image": grid_image_base64}
```

**缓存头说明:**

| 头 | 说明 | 示例值 |
|------|------|--------|
| `Cache-Control` | 缓存策略和过期时间 | `public, max-age=86400` |
| `ETag` | 数据指纹（内容变化时改变） | `"abc123def456"` |
| `Last-Modified` | 最后修改时间 | `Wed, 21 Oct 2024 07:28:00 GMT` |

### 2. 添加版本控制（可选）

在返回的数据中添加版本字段：

```python
{
    "grid_image": "data:image/png;base64,...",
    "version": "20241021072800",  # 时间戳版本号
    "etag": "abc123def456"         # 数据哈希
}
```

前端可以根据版本号判断是否需要更新缓存。

### 3. 支持 304 Not Modified（可选）

实现条件请求，当数据未变化时返回 304 状态码：

```python
from fastapi import Request, Response

@app.get("/api/history/{client_id}/{task_id}/grid")
async def get_task_grid_image(
    client_id: str,
    task_id: str,
    request: Request,
    response: Response
):
    task_data = get_task_from_db(task_id)

    # 计算当前数据的 ETag
    current_etag = calculate_etag(task_data)

    # 检查请求头中的 If-None-Match
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip('"') == current_etag:
        response.status_code = 304
        return response  # 返回空响应，节省带宽

    # 设置 ETag 并返回数据
    response.headers["ETag"] = f'"{current_etag}"'
    return {"grid_image": task_data.grid_image}
```

---

## 缓存策略

### 缓存类型

| 数据类型 | 缓存键 | 过期时间 | 说明 |
|---------|--------|----------|------|
| 宫格图 | `grid:{clientId}:{taskId}` | 7 天 | 完整的 5×5 宫格图 |
| 分镜图 | `splits:{clientId}:{taskId}` | 7 天 | 25 张分镜图数组 |

### 缓存更新时机

1. **首次访问** - 从 API 获取数据并缓存
2. **缓存过期** - 重新从 API 获取
3. **强制刷新** - 用户手动刷新（forceRefresh=true）
4. **空间不足** - 自动清理最旧的缓存

---

## 使用示例

### 前端使用

```javascript
// 自动缓存 - 首次请求后自动缓存
import { getTaskSplitImages } from './services/api';

// 第一次调用 - 从 API 获取
const data1 = await getTaskSplitImages(taskId);
// console: [ImageCache] 缓存未命中: splits:xxx:xxx
// console: [fetchWithCache] 调用 API: splits/xxx

// 第二次调用 - 从缓存获取
const data2 = await getTaskSplitImages(taskId);
// console: [ImageCache] 缓存命中: splits:xxx:xxx
// 返回: { ...data, _fromCache: true }

// 强制刷新
const data3 = await getTaskSplitImages(taskId, null, true);
// console: [fetchWithCache] 调用 API: splits/xxx
```

### 用户管理缓存

```javascript
// 在设置中添加缓存管理入口
import CacheManager from './components/common/CacheManager';

function App() {
  const [showCacheManager, setShowCacheManager] = useState(false);

  return (
    <>
      {/* ... */}
      <button onClick={() => setShowCacheManager(true)}>
        缓存管理
      </button>

      <CacheManager
        isOpen={showCacheManager}
        onClose={() => setShowCacheManager(false)}
      />
    </>
  );
}
```

---

## 注意事项

### 1. 存储空间

- IndexedDB 通常有 50%+ 磁盘空间限制
- 建议监控缓存大小，必要时自动清理
- 提供"清空缓存"功能给用户

### 2. 数据一致性

- 后端数据更新时，考虑通过 WebSocket 通知前端清理缓存
- 或者在关键操作后使用 `forceRefresh=true` 强制刷新

### 3. 隐私和安全

- 缓存数据存储在用户浏览器本地
- 敏感数据不应缓存，或加密存储
- 提供"清除缓存"功能，保护用户隐私

### 4. 浏览器兼容性

- IndexedDB 支持所有现代浏览器
- IE 10+ 支持（如果需要支持）

---

## 性能优化建议

### 后端

1. **压缩图片** - 减少传输大小
2. **使用 CDN** - 静态资源托管
3. **生成缩略图** - 列表页使用小图
4. **HTTP/2** - 多路复用，减少连接数

### 前端

1. **懒加载** - 只在需要时加载图片
2. **预加载** - 提前加载即将查看的图片
3. **渐进式加载** - 先显示模糊图，再显示清晰图
4. **Web Worker** - 在后台线程处理大图片

---

## 调试

### 查看缓存内容

```javascript
// 在浏览器控制台
import { imageCache } from './utils/imageCache';

// 查看所有缓存
const request = indexedDB.open('GeminiWorkflowCache', 1);
request.onsuccess = () => {
  const db = request.result;
  const transaction = db.transaction(['images'], 'readonly');
  const store = transaction.objectStore('images');
  const getAll = store.getAll();

  getAll.onsuccess = () => {
    console.log('所有缓存:', getAll.result);
  };
};
```

### 清空所有缓存

```javascript
// 在浏览器控制台
indexedDB.deleteDatabase('GeminiWorkflowCache');
```
