import { create } from 'zustand';
import { saveWorkflowState, loadWorkflowState, saveSelectedList, loadSelectedList } from '../utils/statePersistence';

// 工作流步骤枚举
export const WorkflowSteps = {
  SPLIT: 'split',           // 步骤1：剧本拆分
  SEGMENT: 'segment',       // 步骤2：片段选取
  SCRIPT_REVIEW: 'script',  // 步骤3：脚本确认
  WORKSPACE: 'workspace',   // 步骤4：交互式工作台
  RESULTS: 'results'        // 步骤5：结果说明
};

// 自动保存定时器
let saveTimer = null;
const SAVE_DELAY = 500; // 500ms 防抖

/**
 * 触发自动保存
 */
const triggerAutoSave = (state) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveWorkflowState(state);
    saveSelectedList(state.globalSelectedList);
  }, SAVE_DELAY);
};

const useWorkflowStore = create((set, get) => ({
  // ========== 当前状态 ==========
  currentStep: WorkflowSteps.SPLIT,

  // ========== 剧本相关 ==========
  fullScript: '',           // 完整剧本
  splitScenes: [],          // 拆分后的场景列表
  selectedScene: null,      // 当前选中的场景
  scenePrompt: '',          // 场景描述/片段

  // ========== 脚本相关 ==========
  generatedScripts: [],     // 生成的分镜脚本列表
  storyboard: null,         // API 返回的分镜脚本对象
  taskId: null,             // 当前任务 ID
  splitsImages: [],         // 历史任务的 splits 图片数据

  // ========== 参考图片 ==========
  sceneRefImages: [],       // 场景参考图片
  scriptRefImages: [],      // 脚本参考图片

  // ========== 工作区相关 ==========
  currentImage: null,       // 当前上传的图片
  tiles: [],                // 切片图块列表
  selectedTileIds: new Set(),// 选中的图块ID集合

  // ========== 会话管理 ==========
  sessions: [],             // 历史会话列表
  activeSessionId: null,    // 当前激活的会话ID

  // ========== 已选列表（左侧边栏）==========
  globalSelectedList: [],   // 全局已选分镜列表

  // ========== UI 状态 ==========
  isPromptModalOpen: false,  // 提示词弹窗是否打开
  promptModalType: null,     // 弹窗类型 ('split' | 'shot')
  promptConfig: {
    split: '',              // 拆分提示词
    shot: ''                // 镜头提示词
  },

  // ========== Actions ==========

  // 设置当前步骤
  setCurrentStep: (step) => {
    set({ currentStep: step });
    triggerAutoSave(get());
  },

  // 剧本相关
  setFullScript: (script) => {
    set({ fullScript: script });
    triggerAutoSave(get());
  },
  setSplitScenes: (scenes) => {
    set({ splitScenes: scenes });
    triggerAutoSave(get());
  },
  setSelectedScene: (scene) => {
    set({ selectedScene: scene });
    triggerAutoSave(get());
  },
  setScenePrompt: (prompt) => {
    set({ scenePrompt: prompt });
    triggerAutoSave(get());
  },

  // 脚本相关
  setGeneratedScripts: (scripts) => {
    set({ generatedScripts: scripts });
    triggerAutoSave(get());
  },
  setStoryboard: (storyboard) => {
    set({ storyboard });
    triggerAutoSave(get());
  },
  setTaskId: (taskId) => {
    set({ taskId });
    triggerAutoSave(get());
  },
  setSplitsImages: (images) => {
    set({ splitsImages: images });
    triggerAutoSave(get());
  },
  updateScript: (index, newContent) => set((state) => {
    const updated = [...state.generatedScripts];
    updated[index] = { ...updated[index], content: newContent };
    const newState = { generatedScripts: updated };
    set(newState);
    triggerAutoSave({ ...state, ...newState });
    return newState;
  }),

  // 参考图片
  setSceneRefImages: (images) => {
    set({ sceneRefImages: images });
    triggerAutoSave(get());
  },
  addSceneRefImage: (image) => set((state) => {
    const newState = { sceneRefImages: [...state.sceneRefImages, image] };
    set(newState);
    triggerAutoSave({ ...state, ...newState });
    return newState;
  }),
  removeSceneRefImage: (id) => set((state) => {
    const newState = { sceneRefImages: state.sceneRefImages.filter(img => img.id !== id) };
    set(newState);
    triggerAutoSave({ ...state, ...newState });
    return newState;
  }),
  setScriptRefImages: (images) => {
    set({ scriptRefImages: images });
    triggerAutoSave(get());
  },
  addScriptRefImage: (image) => set((state) => {
    const newState = { scriptRefImages: [...state.scriptRefImages, image] };
    set(newState);
    triggerAutoSave({ ...state, ...newState });
    return newState;
  }),
  removeScriptRefImage: (id) => set((state) => {
    const newState = { scriptRefImages: state.scriptRefImages.filter(img => img.id !== id) };
    set(newState);
    triggerAutoSave({ ...state, ...newState });
    return newState;
  }),

  // 工作区
  setCurrentImage: (image) => {
    set({ currentImage: image });
    triggerAutoSave(get());
  },
  setTiles: (tiles) => {
    set({ tiles: tiles });
    triggerAutoSave(get());
  },
  toggleTileSelection: (tileId) => set((state) => {
    const newSelected = new Set(state.selectedTileIds);
    if (newSelected.has(tileId)) {
      newSelected.delete(tileId);
    } else {
      newSelected.add(tileId);
    }
    const newState = { selectedTileIds: newSelected };
    set(newState);
    triggerAutoSave({ ...state, ...newState });
    return newState;
  }),
  clearTileSelection: () => {
    const newState = { selectedTileIds: new Set() };
    set(newState);
    triggerAutoSave(get());
  },

  // 会话管理
  addSession: (session) => set((state) => {
    const newState = { sessions: [...state.sessions, session] };
    set(newState);
    triggerAutoSave({ ...state, ...newState });
    return newState;
  }),
  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId });
    triggerAutoSave(get());
  },
  deleteSession: (sessionId) => set((state) => {
    const newState = {
      sessions: state.sessions.filter(s => s.id !== sessionId),
      activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId
    };
    set(newState);
    triggerAutoSave({ ...state, ...newState });
    return newState;
  }),

  // 从历史记录恢复任务到工作流
  restoreTask: (task) => set((state) => {
    // console.log('[Store restoreTask] 接收到的任务数据:', task);
    // console.log('[Store restoreTask] task.storyboard:', task.storyboard);
    // console.log('[Store restoreTask] task.storyboard.shots:', task.storyboard?.shots);

    const newState = {
      taskId: task.task_id,
      storyboard: task.storyboard,
      fullScript: task.script || state.fullScript,
      // 直接跳转到工作台步骤，这样可以看到宫格图
      currentStep: WorkflowSteps.WORKSPACE,
      sceneRefImages: [],
      scriptRefImages: [],
      currentImage: null,
      tiles: [],
      selectedTileIds: new Set(),
      globalSelectedList: [],
      generatedScripts: [],
    };

    // console.log('[Store restoreTask] 即将设置的新状态:', newState);
    // console.log('[Store restoreTask] 跳转到工作台步骤，准备显示宫格图');
    set(newState);
    triggerAutoSave({ ...state, ...newState });

    // 验证设置是否成功
    // console.log('[Store restoreTask] 设置后的 store 状态:', get());

    return newState;
  }),

  // 已选列表
  addToSelectedList: (item) => set((state) => {
    const newState = { globalSelectedList: [...state.globalSelectedList, item] };
    set(newState);
    triggerAutoSave({ ...state, ...newState });
    return newState;
  }),
  removeFromSelectedList: (instanceId) => set((state) => {
    const newState = { globalSelectedList: state.globalSelectedList.filter(item => item.instanceId !== instanceId) };
    set(newState);
    triggerAutoSave({ ...state, ...newState });
    return newState;
  }),
  clearSelectedList: () => {
    const newState = { globalSelectedList: [] };
    set(newState);
    triggerAutoSave(get());
  },
  reorderSelectedList: (newList) => {
    set({ globalSelectedList: newList });
    triggerAutoSave(get());
  },

  // UI 状态
  openPromptModal: (type) => set({ isPromptModalOpen: true, promptModalType: type }),
  closePromptModal: () => set({ isPromptModalOpen: false, promptModalType: null }),
  updatePromptConfig: (type, prompt) => set((state) => ({
    promptConfig: { ...state.promptConfig, [type]: prompt }
  })),

  // ========== 状态管理 ==========

  /**
   * 初始化：从 localStorage 恢复状态
   */
  hydrate: () => {
    const savedState = loadWorkflowState();
    const savedList = loadSelectedList();

    if (savedState || savedList.length > 0) {
      set({
        ...(savedState || {}),
        globalSelectedList: savedList,
        // 确保 Set 被正确恢复
        selectedTileIds: savedState?.selectedTileIds ? new Set(savedState.selectedTileIds) : new Set()
      });
    }
  },

  /**
   * 清除所有保存的状态
   */
  clearPersistedState: () => {
    // 这里需要导入 clearAllData
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.clear();
    }
    // 重置为初始状态
    set({
      currentStep: WorkflowSteps.SPLIT,
      fullScript: '',
      splitScenes: [],
      selectedScene: null,
      scenePrompt: '',
      generatedScripts: [],
      storyboard: null,
      taskId: null,
      sceneRefImages: [],
      scriptRefImages: [],
      currentImage: null,
      tiles: [],
      selectedTileIds: new Set(),
      sessions: [],
      activeSessionId: null,
      globalSelectedList: [],
      isPromptModalOpen: false,
      promptModalType: null,
      promptConfig: { split: '', shot: '' }
    });
  },

  /**
   * 重置工作流（新建任务）
   * 保留历史记录和已选列表，只重置当前工作内容
   */
  resetWorkflow: () => {
    set({
      currentStep: WorkflowSteps.SPLIT,
      fullScript: '',
      splitScenes: [],
      selectedScene: null,
      scenePrompt: '',
      storyboard: null,
      taskId: null,
      splitsImages: [],
      sceneRefImages: [],
      scriptRefImages: [],
      currentImage: null,
      tiles: [],
      selectedTileIds: new Set(),
    });
    triggerAutoSave(get());
  }
}));

export default useWorkflowStore;
export { useWorkflowStore };
