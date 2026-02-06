/**
 * 分镜生成 API 服务
 */

import { API_BASE_URL, API_ENDPOINTS, API_TIMEOUT, MAX_RETRIES, RETRY_DELAY } from '../config/apiConfig';
import { getOrCreateClientId } from '../utils/clientId';
import { imageCache } from '../utils/imageCache';

/**
 * 延迟函数
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 带重试的 fetch 封装
 */
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接');
    }

    if (retries > 0 && !error.message.includes('超时')) {
      await delay(RETRY_DELAY);
      return fetchWithRetry(url, options, retries - 1);
    }

    throw error;
  }
}

/**
 * 健康检查
 */
export async function healthCheck() {
  const url = `${API_BASE_URL}${API_ENDPOINTS.HEALTH}`;
  return fetchWithRetry(url, { method: 'GET' });
}

/**
 * 获取 API 信息
 */
export async function getApiInfo() {
  const url = `${API_BASE_URL}${API_ENDPOINTS.INFO}`;
  return fetchWithRetry(url, { method: 'GET' });
}

/**
 * 构建 multipart/form-data
 */
function buildFormData(data) {
  const formData = new FormData();

  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value);
    }
  });

  return formData;
}

/**
 * 生成分镜提示词
 * @param {string} script - 剧本文本
 * @param {File} imageFile - 全景图片文件
 * @param {string} taskId - 任务 ID（可选，默认自动生成）
 */
export async function generateShots(script, imageFile, taskId = null) {
  const clientId = getOrCreateClientId();
  const finalTaskId = taskId || `task_${Date.now()}`;

  const formData = buildFormData({
    client_id: clientId,
    task_id: finalTaskId,
    script,
    panorama_image: imageFile,
  });

  const url = `${API_BASE_URL}${API_ENDPOINTS.GENERATE_SHOTS}`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    body: formData,
  });

  return {
    ...response,
    client_id: clientId,
    // 使用后端返回的 task_id，如果没有则使用前端生成的
    task_id: response.task_id || finalTaskId,
  };
}

/**
 * 生成 5×5 宫格图（步骤 2）
 *
 * 根据分镜脚本（storyboard）生成一张包含 25 个分镜的宫格图。
 * 后端会：
 * 1. 接收分镜脚本 JSON（包含 25 个镜头的 prompt）
 * 2. 调用 AI 图片生成模型生成宫格图
 * 3. 返回宫格图的 base64 data URL
 *
 * @param {object} storyboard - 分镜脚本对象，包含：
 *   - image_generation_model: 图片生成模型名称
 *   - grid_layout: 宫格布局（如 "5x5"）
 *   - global_settings: 全局设置（style, negative_prompt）
 *   - shots: 分镜数组，每个包含 shot_number, angle_type, prompt_text
 *   - reference_control_prompt: 参考控制提示
 * @param {string} taskId - 任务 ID（必须与步骤 1 返回的 task_id 一致）
 * @param {Array<File>} refImages - 参考图文件数组（可选）
 *
 * @returns {Promise<object>} 返回对象包含：
 *   - client_id: 客户端 ID
 *   - task_id: 任务 ID
 *   - grid_image: 宫格图的完整 data URL（data:image/xxx;base64,xxx）
 *   - split_images: 25 张分割后的独立图片 data URL 数组（可选）
 *   - created_at: 创建时间（ISO 8601 格式）
 *   - success: 是否成功（基于 grid_image 是否存在）
 *
 * @example
 * const response = await generateGrid(storyboard, 'task_123', [file1, file2]);
 * if (response.success) {
 *   console.log(response.grid_image); // "data:image/png;base64,iVBORw0KG..."
 * }
 */
export async function generateGrid(storyboard, taskId, refImages = []) {
  const clientId = getOrCreateClientId();

  // 构建 multipart/form-data 请求
  const formData = new FormData();
  formData.append('client_id', clientId);
  formData.append('task_id', taskId);
  formData.append('storyboard', JSON.stringify(storyboard));  // 将对象序列化为 JSON 字符串

  // 添加参考图
  refImages.forEach(file => {
    formData.append('ref_images', file);
  });

  const url = `${API_BASE_URL}${API_ENDPOINTS.GENERATE_GRID}`;

  // 发送 POST 请求，包含自动重试机制
  const response = await fetchWithRetry(url, {
    method: 'POST',
    body: formData,
  });

  return {
    ...response,
    client_id: clientId,
    task_id: response.task_id || taskId,
    success: !!response.grid_image, // 添加 success 标志，方便判断是否成功
  };
}

/**
 * 获取历史记录
 * @param {string} clientId - 客户端 ID（可选，默认使用当前客户端）
 * @returns {Promise<object>} 返回轻量级历史记录（不含图片 base64）
 */
export async function getHistory(clientId = null) {
  const finalClientId = clientId || getOrCreateClientId();
  const url = `${API_BASE_URL}${API_ENDPOINTS.GET_HISTORY}/${encodeURIComponent(finalClientId)}`;

  return fetchWithRetry(url, { method: 'GET' });
}

/**
 * 获取历史记录元数据（轻量级新鲜度检查）
 * 仅返回各任务的 updated_at，用于与本地缓存比较
 * @param {string} clientId - 客户端 ID（可选，默认使用当前客户端）
 * @returns {Promise<object>} 返回格式: { client_id, updated_at, tasks: { taskId: updated_at, ... } }
 */
export async function getHistoryMeta(clientId = null) {
  const finalClientId = clientId || getOrCreateClientId();
  const url = `${API_BASE_URL}/api/history/${encodeURIComponent(finalClientId)}/meta`;

  // console.log('[getHistoryMeta] 获取历史记录元数据');
  return fetchWithRetry(url, { method: 'GET' });
}

/**
 * 按需获取指定任务的宫格图（带缓存）
 * @param {string} taskId - 任务 ID
 * @param {string} clientId - 客户端 ID（可选）
 * @returns {Promise<object>} 返回对象的 task.grid_image 字段包含宫格图 data URL
 */
export async function getTaskGridImage(taskId, clientId = null) {
  const finalClientId = clientId || getOrCreateClientId();
  const cacheKey = `grid:${finalClientId}:${taskId}`;

  // 1. 尝试从缓存读取
  const cached = await imageCache.getImage('grid', finalClientId, taskId);
  if (cached) {
    // console.log(`[getTaskGridImage] 使用缓存: ${cacheKey}`);
    return {
      ...cached,
      _fromCache: true
    };
  }

  // 2. 缓存未命中，调用 API
  // console.log(`[getTaskGridImage] 调用 API: ${cacheKey}`);
  const url = `${API_BASE_URL}/api/history/${encodeURIComponent(finalClientId)}/${encodeURIComponent(taskId)}/grid`;
  const response = await fetchWithRetry(url, { method: 'GET' });

  // 后端返回格式: { client_id, task: { task_id, updated_at, grid_image } }
  const task = response.task || {};
  const gridImage = task.grid_image || response.grid_image;

  const result = {
    client_id: response.client_id || finalClientId,
    task_id: task.task_id || taskId,
    grid_image: gridImage
  };

  // 3. 保存到缓存
  await imageCache.saveImage(
    'grid',
    finalClientId,
    taskId,
    result,
    task.updated_at  // 使用 updated_at 作为版本标识
  );

  return {
    ...result,
    _fromCache: false
  };
}

/**
 * 按需获取指定任务的 25 张分镜图（带缓存）
 * @param {string} taskId - 任务 ID
 * @param {string} clientId - 客户端 ID（可选）
 * @returns {Promise<object>} 返回对象的 task.split_images 字段包含 25 张图片 data URL 数组
 */
export async function getTaskSplitImages(taskId, clientId = null) {
  const finalClientId = clientId || getOrCreateClientId();
  const cacheKey = `splits:${finalClientId}:${taskId}`;

  // 1. 尝试从缓存读取
  const cached = await imageCache.getImage('splits', finalClientId, taskId);
  if (cached) {
    // console.log(`[getTaskSplitImages] 使用缓存: ${cacheKey}`);
    return {
      ...cached,
      _fromCache: true
    };
  }

  // 2. 缓存未命中，调用 API
  // console.log(`[getTaskSplitImages] 调用 API: ${cacheKey}`);
  const url = `${API_BASE_URL}/api/history/${encodeURIComponent(finalClientId)}/${encodeURIComponent(taskId)}/splits`;
  const response = await fetchWithRetry(url, { method: 'GET' });

  // 后端返回格式: { client_id, task: { task_id, updated_at, split_images } }
  const task = response.task || {};
  const splitImages = task.split_images || response.split_images || [];

  const result = {
    client_id: response.client_id || finalClientId,
    task_id: task.task_id || taskId,
    split_images: splitImages,
    storyboard: task.storyboard || response.storyboard,
    script: task.script || response.script
  };

  // 3. 保存到缓存
  await imageCache.saveImage(
    'splits',
    finalClientId,
    taskId,
    result,
    task.updated_at  // 使用 updated_at 作为版本标识
  );

  return {
    ...result,
    _fromCache: false
  };
}

/**
 * 从历史记录中恢复指定任务的完整 storyboard
 * @param {string} taskId - 任务 ID
 * @param {string} clientId - 客户端 ID（可选）
 */
export async function restoreTaskFromHistory(taskId, clientId = null) {
  const finalClientId = clientId || getOrCreateClientId();
  // console.log('[API restoreTaskFromHistory] 开始查找任务, taskId:', taskId, 'clientId:', finalClientId);

  const history = await getHistory(finalClientId);
  // console.log('[API restoreTaskFromHistory] getHistory 返回:', history);

  if (!history.history || !Array.isArray(history.history)) {
    // console.warn('[API restoreTaskFromHistory] history.history 不存在或不是数组');
    return null;
  }

  // console.log('[API restoreTaskFromHistory] 历史记录数组长度:', history.history.length);

  // 查找指定任务
  const task = history.history.find(t => t.task_id === taskId);
  // console.log('[API restoreTaskFromHistory] 找到的任务:', task);
  // console.log('[API restoreTaskFromHistory] task.storyboard:', task?.storyboard);
  // console.log('[API restoreTaskFromHistory] task.storyboard.shots:', task?.storyboard?.shots);

  return task || null;
}

/**
 * 获取当前客户端 ID
 */
export function getCurrentClientId() {
  return getOrCreateClientId();
}
