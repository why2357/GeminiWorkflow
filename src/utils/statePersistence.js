/**
 * 状态持久化工具
 * 支持 localStorage 和 sessionStorage
 */

const STORAGE_KEYS = {
  WORKFLOW_STATE: 'gemini_workflow_state',
  SESSIONS: 'gemini_sessions',
  SELECTED_LIST: 'gemini_selected_list',
  CLIENT_ID: 'gemini_client_id'
};

/**
 * 获取客户端 ID
 */
export const getClientId = () => {
  let id = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
  if (!id) {
    if (window.crypto && crypto.randomUUID) {
      id = crypto.randomUUID();
    } else {
      id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
    localStorage.setItem(STORAGE_KEYS.CLIENT_ID, id);
  }
  return id;
};

/**
 * 保存数据到 localStorage
 */
export const saveToLocalStorage = (key, data) => {
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    // console.error('Failed to save to localStorage:', error);
    return false;
  }
};

/**
 * 从 localStorage 读取数据
 */
export const loadFromLocalStorage = (key, defaultValue = null) => {
  try {
    const serialized = localStorage.getItem(key);
    if (serialized === null) {
      return defaultValue;
    }
    return JSON.parse(serialized);
  } catch (error) {
    // console.error('Failed to load from localStorage:', error);
    return defaultValue;
  }
};

/**
 * 从 localStorage 删除数据
 */
export const removeFromLocalStorage = (key) => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    // console.error('Failed to remove from localStorage:', error);
    return false;
  }
};

/**
 * 保存完整工作流状态
 */
export const saveWorkflowState = (state) => {
  // 只保存必要的状态，大数据通过 taskId 从后端恢复
  const dataToSave = {
    currentStep: state.currentStep,
    fullScript: state.fullScript,
    scenePrompt: state.scenePrompt,
    taskId: state.taskId,  // 关键：通过 taskId 可以从后端恢复完整数据
    selectedTileIds: Array.from(state.selectedTileIds),
    timestamp: new Date().toISOString()
  };
  return saveToLocalStorage(STORAGE_KEYS.WORKFLOW_STATE, dataToSave);
};

/**
 * 加载完整工作流状态
 */
export const loadWorkflowState = () => {
  const data = loadFromLocalStorage(STORAGE_KEYS.WORKFLOW_STATE, null);
  if (!data) return null;

  // 只恢复基本状态，完整数据通过 taskId 从后端获取
  return {
    currentStep: data.currentStep,
    fullScript: data.fullScript || '',
    scenePrompt: data.scenePrompt || '',
    taskId: data.taskId || null,
    // 这些大数据字段不恢复，需要时从后端获取
    splitScenes: [],
    generatedScripts: [],
    storyboard: null,
    sceneRefImages: [],
    scriptRefImages: [],
    currentImage: null,
    tiles: [],
    selectedTileIds: new Set(data.selectedTileIds || []),
  };
};

/**
 * 保存会话列表
 */
export const saveSessions = (sessions) => {
  return saveToLocalStorage(STORAGE_KEYS.SESSIONS, sessions);
};

/**
 * 加载会话列表
 */
export const loadSessions = () => {
  return loadFromLocalStorage(STORAGE_KEYS.SESSIONS, []);
};

/**
 * 保存已选列表
 */
export const saveSelectedList = (list) => {
  return saveToLocalStorage(STORAGE_KEYS.SELECTED_LIST, list);
};

/**
 * 加载已选列表
 */
export const loadSelectedList = () => {
  return loadFromLocalStorage(STORAGE_KEYS.SELECTED_LIST, []);
};

/**
 * 清除所有数据
 */
export const clearAllData = () => {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
  return true;
};

/**
 * 自动保存 Hook 工厂
 * 返回一个带防抖的保存函数
 */
export const createAutoSave = (saveFn, delay = 500) => {
  let timeoutId = null;

  return (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      saveFn(...args);
      timeoutId = null;
    }, delay);
  };
};
