/**
 * API 配置
 */

// API 基础地址
// export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://172.28.104.25:8025';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://172.28.104.25:8025';
// API 端点
export const API_ENDPOINTS = {
  HEALTH: '/healthz',
  INFO: '/',
  GENERATE_SHOTS: '/api/generate-shots',
  GENERATE_GRID: '/api/generate-grid',
  GET_HISTORY: '/api/history',
};

// 请求超时时间（毫秒）
export const API_TIMEOUT = 120000; // 2 分钟

// 最大重试次数
export const MAX_RETRIES = 2;

// 重试延迟（毫秒）
export const RETRY_DELAY = 1000;
