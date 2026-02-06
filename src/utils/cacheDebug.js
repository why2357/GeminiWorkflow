/**
 * 缓存调试工具
 * 用于查看、验证和管理 IndexedDB 中的缓存数据
 */

import { imageCache } from './imageCache';

/**
 * 获取所有缓存项
 */
export async function getAllCacheItems() {
  await imageCache.init();

  return new Promise((resolve) => {
    const transaction = imageCache.db.transaction(['images'], 'readonly');
    const store = transaction.objectStore('images');
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result;
      resolve(items.map(item => ({
        key: item.key,
        type: item.type,
        clientId: item.clientId,
        taskId: item.taskId,
        size: item.size,
        timestamp: new Date(item.timestamp).toLocaleString(),
        expiry: new Date(item.expiry).toLocaleString(),
        etag: item.etag,
        version: item.version,
        isExpired: Date.now() > item.expiry,
        dataPreview: {
          hasData: !!item.data,
          dataType: Array.isArray(item.data?.split_images) ? 'split_images' : 'grid_image',
          itemCount: item.data?.split_images?.length || (item.data?.grid_image ? 1 : 0)
        }
      })));
    };

    request.onerror = () => {
      // console.error('[CacheDebug] 获取缓存项失败:', request.error);
      resolve([]);
    };
  });
}

/**
 * 验证指定缓存项的数据完整性
 */
export async function validateCacheItem(type, clientId, taskId) {
  await imageCache.init();

  const cacheItem = await imageCache._getRawCacheItem(type, clientId, taskId);

  if (!cacheItem) {
    return {
      valid: false,
      error: '缓存项不存在'
    };
  }

  const validation = {
    valid: true,
    key: cacheItem.key,
    checks: {}
  };

  // 检查 1: 是否过期
  validation.checks.expiry = {
    valid: !imageCache._isExpired(cacheItem),
    value: new Date(cacheItem.expiry).toLocaleString(),
    message: imageCache._isExpired(cacheItem) ? '缓存已过期' : '缓存有效'
  };

  // 检查 2: 数据完整性
  validation.checks.dataIntegrity = {
    valid: !!cacheItem.data,
    value: !!cacheItem.data,
    message: cacheItem.data ? '数据存在' : '数据丢失'
  };

  // 检查 3: 数据格式
  if (cacheItem.data) {
    if (cacheItem.data.split_images) {
      validation.checks.dataFormat = {
        valid: Array.isArray(cacheItem.data.split_images),
        value: 'split_images',
        count: cacheItem.data.split_images.length,
        message: Array.isArray(cacheItem.data.split_images)
          ? `包含 ${cacheItem.data.split_images.length} 张图片`
          : '数据格式错误'
      };
    } else if (cacheItem.data.grid_image) {
      validation.checks.dataFormat = {
        valid: typeof cacheItem.data.grid_image === 'string',
        value: 'grid_image',
        message: typeof cacheItem.data.grid_image === 'string' ? '宫格图数据' : '数据格式错误'
      };
    }
  }

  // 检查 4: ETag
  validation.checks.etag = {
    valid: !!cacheItem.etag,
    value: cacheItem.etag || '无',
    message: cacheItem.etag ? `ETag: ${cacheItem.etag}` : '无 ETag（无法服务器验证）'
  };

  // 检查 5: 版本信息
  validation.checks.version = {
    valid: !!cacheItem.version,
    value: cacheItem.version || '无',
    message: cacheItem.version ? `版本: ${cacheItem.version}` : '无版本信息'
  };

  validation.valid = Object.values(validation.checks).every(check => check.valid);

  return validation;
}

/**
 * 对比缓存数据和服务器数据
 */
export async function compareWithServer(type, clientId, taskId, apiFn) {
  // 获取缓存数据
  const cacheItem = await imageCache._getRawCacheItem(type, clientId, taskId);

  if (!cacheItem) {
    return {
      error: '缓存不存在'
    };
  }

  // 获取服务器数据
  let serverData;
  try {
    serverData = await apiFn(taskId, clientId, cacheItem.etag);
  } catch (error) {
    return {
      error: '无法获取服务器数据',
      message: error.message
    };
  }

  // 如果返回 304，说明缓存与服务器一致
  if (serverData._cached || serverData._status === 304) {
    return {
      consistent: true,
      message: '缓存与服务器数据一致（304 Not Modified）',
      cacheEtag: cacheItem.etag
    };
  }

  // 对比 ETag
  const serverEtag = serverData._etag || serverData?._meta?.etag;
  const etagMatch = cacheItem.etag === serverEtag;

  // 对比版本
  const serverVersion = serverData._version || serverData?._meta?.version;
  const versionMatch = cacheItem.version === serverVersion;

  return {
    consistent: etagMatch && versionMatch,
    cacheEtag: cacheItem.etag,
    serverEtag: serverEtag,
    cacheVersion: cacheItem.version,
    serverVersion: serverVersion,
    etagMatch,
    versionMatch,
    needsUpdate: !etagMatch || !versionMatch
  };
}

/**
 * 打印缓存统计信息
 */
export async function printCacheStats() {
  const items = await getAllCacheItems();
  const totalSize = items.reduce((sum, item) => sum + item.size, 0);
  const expiredCount = items.filter(item => item.isExpired).length;

  // console.group('🗂️ IndexedDB 缓存统计');
  // console.log('总缓存项:', items.length);
  // console.log('已用空间:', `${totalSize.toFixed(2)} MB`);
  // console.log('过期项:', expiredCount);
  // console.log('有效项:', items.length - expiredCount);
  // console.table(items.map(item => ({
  //   key: item.key,
  //   类型: item.type,
  //   大小: `${item.size.toFixed(2)}MB`,
  //   ETag: item.etag || '无',
  //   版本: item.version || '无',
  //   状态: item.isExpired ? '已过期' : '有效'
  // })));
  // console.groupEnd();

  return { itemCount: items.length, totalSize, expiredCount };
}

/**
 * 在浏览器控制台暴露调试工具
 */
if (typeof window !== 'undefined') {
  window.CacheDebug = {
    getAll: getAllCacheItems,
    validate: validateCacheItem,
    compare: compareWithServer,
    stats: printCacheStats,
    clear: () => imageCache.clearAll(),
    clean: () => imageCache.cleanExpired(),
    inspect: async (type, clientId, taskId) => {
      const item = await imageCache._getRawCacheItem(type, clientId, taskId);
      // console.log('缓存项详情:', item);
      return item;
    }
  };

  // console.log('💡 缓存调试工具已加载到 window.CacheDebug');
  // console.log('  - CacheDebug.stats()     查看缓存统计');
  // console.log('  - CacheDebug.getAll()   查看所有缓存项');
  // console.log('  - CacheDebug.validate(type, clientId, taskId)  验证缓存');
  // console.log('  - CacheDebug.compare(type, clientId, taskId, apiFn)  与服务器对比');
}

export default window.CacheDebug;
