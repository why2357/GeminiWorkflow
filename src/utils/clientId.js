/**
 * 客户端 ID 生成工具 client_id
 * 用于生成唯一且持久的客户端标识符
 */

const CLIENT_ID_KEY = 'workflow_client_id';

/**
 * 生成安全的客户端 ID
 * 优先使用浏览器原生 crypto API，回退到时间戳+随机数方案
 */
export function generateClientId() {
  // 方法 1: 使用浏览器原生 crypto API (推荐)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // 方法 2: 回退方案 - 时间戳 + 随机数
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `client_${timestamp}_${random}`;
}

/**
 * 获取或创建客户端 ID
 * 从 localStorage 读取已存在的 ID，不存在则创建新 ID 并保存
 */
export function getOrCreateClientId() {
  try {
    // 尝试从 localStorage 读取
    let clientId = localStorage.getItem(CLIENT_ID_KEY);

    if (!clientId) {
      // 不存在则生成新 ID
      clientId = generateClientId();
      localStorage.setItem(CLIENT_ID_KEY, clientId);
    }

    return clientId;
  } catch (error) {
    // localStorage 不可用时直接返回新 ID
    // console.warn('localStorage unavailable, generating temporary client_id');
    return generateClientId();
  }
}

/**
 * 重置客户端 ID
 * 用于登出或重新生成身份的场景
 */
export function resetClientId() {
  try {
    localStorage.removeItem(CLIENT_ID_KEY);
  } catch (error) {
    // console.warn('Failed to reset client_id');
  }
}

/**
 * 验证客户端 ID 格式
 */
export function isValidClientId(clientId) {
  return typeof clientId === 'string' && clientId.length > 0;
}
