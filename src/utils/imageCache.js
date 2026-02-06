/**
 * 图片缓存工具 - 使用 IndexedDB 存储图片数据
 * 适合存储大量 base64 图片数据
 */

const DB_NAME = 'GeminiWorkflowCache';
const DB_VERSION = 1;
const STORE_NAME = 'images';

// 缓存配置
const CACHE_CONFIG = {
  // 默认缓存过期时间（7天）
  DEFAULT_EXPIRY: 7 * 24 * 60 * 60 * 1000,
  // 最大缓存大小（MB）- 超过后清理最旧的
  MAX_CACHE_SIZE: 100,
  // 强制刷新间隔（小时）
  FORCE_REFRESH_INTERVAL: 24 * 60 * 60 * 1000
};

class ImageCache {
  constructor() {
    this.db = null;
    this.pendingRequests = new Map(); // 防止重复请求
  }

  /**
   * 初始化数据库
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        // console.error('[ImageCache] 数据库打开失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        // console.log('[ImageCache] 数据库初始化成功');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 创建图片存储对象
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });

          // 创建索引
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('expiry', 'expiry', { unique: false });
          store.createIndex('size', 'size', { unique: false });

          // console.log('[ImageCache] 对象存储创建成功');
        }
      };
    });
  }

  /**
   * 生成缓存键
   */
  _generateKey(type, clientId, taskId) {
    return `${type}:${clientId}:${taskId}`;
  }

  /**
   * 计算数据大小（MB）
   */
  _calculateSize(data) {
    const jsonString = JSON.stringify(data);
    return new Blob([jsonString]).size / (1024 * 1024);
  }

  /**
   * 检查缓存是否过期
   */
  _isExpired(cacheItem) {
    if (!cacheItem.expiry) return false;
    return Date.now() > cacheItem.expiry;
  }

  /**
   * 获取原始缓存项（包含元数据）
   */
  async _getRawCacheItem(type, clientId, taskId) {
    await this.init();

    const key = this._generateKey(type, clientId, taskId);

    return new Promise((resolve) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        // console.error(`[ImageCache] 读取缓存失败: ${key}`, request.error);
        resolve(null);
      };
    });
  }

  /**
   * 保存图片到缓存
   */
  async saveImage(type, clientId, taskId, imageData, etag = null, version = null) {
    await this.init();

    const key = this._generateKey(type, clientId, taskId);
    const timestamp = Date.now();
    const size = this._calculateSize(imageData);

    // 从响应中提取元数据
    const meta = imageData?._meta || {};
    const cacheEtag = etag || meta.etag || null;
    const cacheVersion = version || meta.version || null;

    const cacheItem = {
      key,
      type,
      clientId,
      taskId,
      data: imageData,
      timestamp,
      expiry: timestamp + CACHE_CONFIG.DEFAULT_EXPIRY,
      size,
      etag: cacheEtag,  // 后端提供的数据指纹
      version: cacheVersion,  // 后端提供的版本号
      lastModified: meta.updated_at || null
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(cacheItem);

      request.onsuccess = () => {
        // console.log(`[ImageCache] 已缓存: ${key} (${size.toFixed(2)}MB)`, {
        //   etag: cacheEtag,
        //   version: cacheVersion
        // });
        resolve(true);
      };

      request.onerror = () => {
        // console.error(`[ImageCache] 缓存失败: ${key}`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 从缓存获取图片
   */
  async getImage(type, clientId, taskId) {
    await this.init();

    const key = this._generateKey(type, clientId, taskId);

    return new Promise((resolve) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const cacheItem = request.result;

        if (!cacheItem) {
          // console.log(`[ImageCache] 缓存未命中: ${key}`);
          resolve(null);
          return;
        }

        if (this._isExpired(cacheItem)) {
          // console.log(`[ImageCache] 缓存已过期: ${key}`);
          this.deleteImage(type, clientId, taskId);
          resolve(null);
          return;
        }

        // console.log(`[ImageCache] 缓存命中: ${key}`);
        resolve(cacheItem.data);
      };

      request.onerror = () => {
        // console.error(`[ImageCache] 读取缓存失败: ${key}`, request.error);
        resolve(null);
      };
    });
  }

  /**
   * 删除指定缓存
   */
  async deleteImage(type, clientId, taskId) {
    await this.init();

    const key = this._generateKey(type, clientId, taskId);

    return new Promise((resolve) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => {
        // console.log(`[ImageCache] 已删除缓存: ${key}`);
        resolve(true);
      };

      request.onerror = () => {
        // console.error(`[ImageCache] 删除缓存失败: ${key}`, request.error);
        resolve(false);
      };
    });
  }

  /**
   * 清理过期缓存
   */
  async cleanExpired() {
    await this.init();

    return new Promise((resolve) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('expiry');
      const request = index.openCursor(IDBKeyRange.upperBound(Date.now()));

      let deletedCount = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          // console.log(`[ImageCache] 清理了 ${deletedCount} 个过期缓存`);
          resolve(deletedCount);
        }
      };

      request.onerror = () => {
        // console.error('[ImageCache] 清理缓存失败:', request.error);
        resolve(0);
      };
    });
  }

  /**
   * 获取缓存大小
   */
  async getCacheSize() {
    await this.init();

    return new Promise((resolve) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result;
        const totalSize = items.reduce((sum, item) => sum + (item.size || 0), 0);
        resolve(totalSize);
      };

      request.onerror = () => {
        resolve(0);
      };
    });
  }

  /**
   * 清理所有缓存
   */
  async clearAll() {
    await this.init();

    return new Promise((resolve) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        // console.log('[ImageCache] 已清空所有缓存');
        resolve(true);
      };

      request.onerror = () => {
        // console.error('[ImageCache] 清空缓存失败:', request.error);
        resolve(false);
      };
    });
  }

  /**
   * 获取所有缓存项的键和版本信息
   */
  async getAllCacheMeta() {
    await this.init();

    return new Promise((resolve) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result;
        const meta = items.map(item => ({
          key: item.key,
          type: item.type,
          clientId: item.clientId,
          taskId: item.taskId,
          version: item.version,
          timestamp: item.timestamp
        }));
        resolve(meta);
      };

      request.onerror = () => {
        // console.error('[ImageCache] 获取缓存元数据失败:', request.error);
        resolve([]);
      };
    });
  }
}

// 导出单例
export const imageCache = new ImageCache();

/**
 * 带缓存的 API 调用封装（简化版）
 * 使用 updated_at 作为版本标识
 */
export async function fetchWithCache(apiFn, cacheType, clientId, taskId, forceRefresh = false) {
  const key = `${cacheType}:${clientId}:${taskId}`;

  // 防止重复请求
  if (imageCache.pendingRequests.has(key)) {
    // console.log(`[fetchWithCache] 请求进行中，等待: ${key}`);
    return imageCache.pendingRequests.get(key);
  }

  // 1. 尝试从缓存读取（立即返回，提升响应速度）
  if (!forceRefresh) {
    const cachedItem = await imageCache._getRawCacheItem(cacheType, clientId, taskId);
    if (cachedItem && !imageCache._isExpired(cachedItem)) {
      // console.log(`[fetchWithCache] 使用缓存: ${key}`, {
      //   cached_version: cachedItem.version,
      //   cached_timestamp: cachedItem.timestamp
      // });

      // 后台验证：检查服务器是否有更新
      apiFn().then(response => {
        const serverVersion = response._version || response._timestamp;
        const serverTimestamp = response._timestamp || Date.now();

        // 如果服务器版本更新，更新缓存
        if (serverVersion && serverVersion !== cachedItem.version) {
          // console.log(`[fetchWithCache] 检测到新版本，更新缓存: ${key}`);
          imageCache.saveImage(
            cacheType,
            clientId,
            taskId,
            response,
            response._etag,
            response._version
          );
        }
      }).catch(err => {
        // console.warn(`[fetchWithCache] 后台验证失败:`, err);
      });

      // 立即返回缓存数据
      return {
        ...cachedItem.data,
        _fromCache: true,
        _version: cachedItem.version
      };
    }
  }

  // 2. 缓存未命中、过期或强制刷新，调用 API
  // console.log(`[fetchWithCache] 调用 API: ${cacheType}/${taskId}`);

  const requestPromise = (async () => {
    try {
      const response = await apiFn();

      // 保存到缓存（使用 updated_at 作为版本）
      if (response) {
        await imageCache.saveImage(
          cacheType,
          clientId,
          taskId,
          response,
          response._etag,
          response._version
        );
      }

      return {
        ...response,
        _fromCache: false
      };
    } catch (error) {
      // console.error(`[fetchWithCache] API 请求失败: ${key}`, error);
      throw error;
    }
  })();

  imageCache.pendingRequests.set(key, requestPromise);

  try {
    const result = await requestPromise;
    return result;
  } finally {
    imageCache.pendingRequests.delete(key);
  }
}

/**
 * 初始化时清理过期缓存
 */
export async function initImageCache() {
  await imageCache.init();
  await imageCache.cleanExpired();

  // 定期清理过期缓存（每 10 分钟）
  setInterval(() => {
    imageCache.cleanExpired();
  }, 10 * 60 * 1000);
}

/**
 * 智能缓存更新管理器
 * 使用 getHistoryMeta 定期检查服务器更新
 */

// 更新间隔（5 分钟）
const CACHE_UPDATE_INTERVAL = 5 * 60 * 1000;
let updateTimer = null;
let isUpdating = false;

/**
 * 检查并更新过期的缓存
 * @param {Function} getHistoryMetaFn - 获取历史元数据的函数
 * @param {Function} getGridFn - 获取宫格图的函数
 * @param {Function} getSplitsFn - 获取分割图的函数
 * @param {string} clientId - 客户端 ID
 */
export async function checkAndUpdateStaleCache(
  getHistoryMetaFn,
  getGridFn,
  getSplitsFn,
  clientId
) {
  if (isUpdating) {
    // console.log('[CacheUpdate] 正在更新中，跳过本次检查');
    return;
  }

  isUpdating = true;
  // console.log('[CacheUpdate] 开始检查缓存更新...');

  try {
    // 1. 获取服务器的最新元数据
    const metaResponse = await getHistoryMetaFn(clientId);
    // console.log('[CacheUpdate] 服务器元数据:', metaResponse);

    if (!metaResponse || !metaResponse.tasks) {
      // console.warn('[CacheUpdate] 无效的元数据响应');
      return;
    }

    // 2. 获取本地缓存的所有元数据
    const localCacheMeta = await imageCache.getAllCacheMeta();
    // console.log('[CacheUpdate] 本地缓存项数:', localCacheMeta.length);

    // 3. 比较并找出需要更新的缓存项
    const updates = [];

    for (const cacheItem of localCacheMeta) {
      const { type, clientId: cacheClientId, taskId, version } = cacheItem;
      const cacheKey = `${type}:${cacheClientId}:${taskId}`;

      // 从服务器元数据中查找对应的任务
      const serverUpdatedAt = metaResponse.tasks[taskId];

      if (!serverUpdatedAt) {
        // 服务器上没有此任务，标记为待删除（可选）
        // console.log(`[CacheUpdate] 任务 ${taskId} 在服务器上不存在`);
        continue;
      }

      // 比较版本（updated_at）
      if (version !== serverUpdatedAt) {
        // console.log(`[CacheUpdate] 发现过期缓存: ${cacheKey}`, {
        //   local_version: version,
        //   server_version: serverUpdatedAt
        // });

        updates.push({
          type,
          clientId: cacheClientId,
          taskId,
          serverUpdatedAt
        });
      }
    }

    // console.log(`[CacheUpdate] 发现 ${updates.length} 个过期缓存`);

    // 4. 并发更新过期的缓存（限制并发数）
    const CONCURRENT_LIMIT = 3;
    for (let i = 0; i < updates.length; i += CONCURRENT_LIMIT) {
      const batch = updates.slice(i, i + CONCURRENT_LIMIT);
      await Promise.all(
        batch.map(async (update) => {
          try {
            await updateCacheItem(update, getGridFn, getSplitsFn);
          } catch (err) {
            // console.error(`[CacheUpdate] 更新缓存失败: ${update.type}:${update.taskId}`, err);
          }
        })
      );
    }

    // console.log('[CacheUpdate] 缓存更新完成');
  } catch (error) {
    // console.error('[CacheUpdate] 检查缓存更新失败:', error);
  } finally {
    isUpdating = false;
  }
}

/**
 * 更新单个缓存项
 */
async function updateCacheItem(update, getGridFn, getSplitsFn) {
  const { type, clientId, taskId } = update;

  // console.log(`[CacheUpdate] 更新缓存: ${type}:${taskId}`);

  let response;
  if (type === 'grid') {
    response = await getGridFn(taskId, clientId);
  } else if (type === 'splits') {
    response = await getSplitsFn(taskId, clientId);
  } else {
    // console.warn(`[CacheUpdate] 未知的缓存类型: ${type}`);
    return;
  }

  // 缓存已经由 getTaskGridImage/getTaskSplitImages 自动更新
  // console.log(`[CacheUpdate] 缓存已更新: ${type}:${taskId}`, {
  //   fromCache: response?._fromCache
  // });
}

/**
 * 启动智能缓存更新
 * @param {Function} getHistoryMetaFn - 获取历史元数据的函数
 * @param {Function} getGridFn - 获取宫格图的函数
 * @param {Function} getSplitsFn - 获取分割图的函数
 * @param {string} clientId - 客户端 ID
 * @param {number} interval - 更新间隔（毫秒）
 */
export function startSmartCacheUpdate(
  getHistoryMetaFn,
  getGridFn,
  getSplitsFn,
  clientId,
  interval = CACHE_UPDATE_INTERVAL
) {
  // 停止之前的定时器
  if (updateTimer) {
    clearInterval(updateTimer);
  }

  // console.log('[CacheUpdate] 启动智能缓存更新，间隔:', interval, 'ms');

  // 立即执行一次检查
  checkAndUpdateStaleCache(getHistoryMetaFn, getGridFn, getSplitsFn, clientId);

  // 定期检查
  updateTimer = setInterval(() => {
    checkAndUpdateStaleCache(getHistoryMetaFn, getGridFn, getSplitsFn, clientId);
  }, interval);

  return () => {
    if (updateTimer) {
      clearInterval(updateTimer);
      updateTimer = null;
      // console.log('[CacheUpdate] 已停止智能缓存更新');
    }
  };
}

/**
 * 停止智能缓存更新
 */
export function stopSmartCacheUpdate() {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
    // console.log('[CacheUpdate] 已停止智能缓存更新');
  }
}
