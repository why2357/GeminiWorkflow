import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWorkflowStore, WorkflowSteps } from '../../store/useWorkflowStore';
import Button from '../common/Button';
import { getHistory, getTaskGridImage, getTaskSplitImages, restoreTaskFromHistory } from '../../services/api';
import Loading from '../common/Loading';
import { imageCache } from '../../utils/imageCache';
import './HistoryPanel.css';

// localStorage key for tracking grid generation attempts
const GRID_ATTEMPTS_KEY = 'grid_generation_attempts';

// Helper functions for localStorage
const getGridAttempts = () => {
  try {
    return JSON.parse(localStorage.getItem(GRID_ATTEMPTS_KEY) || '{}');
  } catch {
    return {};
  }
};

const hasGridAttempt = (taskId) => {
  const attempts = getGridAttempts();
  return !!attempts[taskId];
};

const HistoryPanel = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiTasks, setApiTasks] = useState([]);
  const [thumbnailUrls, setThumbnailUrls] = useState({}); // 缓存缩略图 URL
  const [loadedTasks, setLoadedTasks] = useState(new Set()); // 已加载缩略图的任务
  const [retryingTasks, setRetryingTasks] = useState(new Set()); // 正在重试的任务
  const pollingIntervalRef = useRef(null); // 轮询定时器引用
  const scrollContentRef = useRef(null); // 滚动容器引用
  const scrollPositionRef = useRef(0); // 保存滚动位置
  const isInitialLoadRef = useRef(true); // 标记是否为初始加载

  const {
    sessions,
    activeSessionId,
    setActiveSession,
    deleteSession,
    resetWorkflow,
    setStoryboard,
    setTaskId,
    setFullScript,
    setCurrentStep,
    setSplitsImages
  } = useWorkflowStore();

  // 从 API 加载历史记录，并启动持续轮询
  useEffect(() => {
    // 立即执行一次
    loadHistory();

    // 每 5 秒轮询一次
    pollingIntervalRef.current = setInterval(() => {
      loadHistory();
    }, 5000);

    // 清理函数
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  const loadHistory = async () => {
    // 保存当前滚动位置
    if (scrollContentRef.current) {
      scrollPositionRef.current = scrollContentRef.current.scrollTop;
    }

    // 只在初始加载时显示 loading 状态，轮询更新时静默更新
    const isInitialLoad = isInitialLoadRef.current;
    if (isInitialLoad) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await getHistory();
      if (response.history) {
        // 转换 API 任务数据为会话格式
        const convertedSessions = response.history.map(task => {
          const hasGrid = task.has_grid ?? true;
          // 使用 localStorage 判断是否尝试过生成
          const attempted = hasGridAttempt(task.task_id);

          // 确定状态：pending(等待生成), success(成功), failed(失败)
          let gridStatus = 'pending';
          if (hasGrid) {
            gridStatus = 'success';
          } else if (attempted) {
            gridStatus = 'failed';
          }

          return {
            id: task.task_id,
            name: task.script?.substring(0, 30) + '...' || '未命名任务',
            thumb: null,
            timestamp: new Date(task.created_at),
            tiles: task.storyboard?.shots?.length || 0,
            taskId: task.task_id,
            storyboard: task.storyboard,
            script: task.script,
            hasGridImage: true,
            hasGrid: hasGrid,
            hasSplits: task.has_splits ?? true,
            gridGenerationStatus: gridStatus
          };
        });
        setApiTasks(convertedSessions);

        // 恢复滚动位置
        requestAnimationFrame(() => {
          if (scrollContentRef.current) {
            scrollContentRef.current.scrollTop = scrollPositionRef.current;
          }
        });
      }
    } catch (err) {
      setError(err.message || '加载历史记录失败');
    } finally {
      // 只在初始加载结束时清除 loading 状态
      if (isInitialLoad) {
        setLoading(false);
        isInitialLoadRef.current = false;
      }
    }
  };

  // 按需加载单个任务的缩略图
  const loadThumbnail = useCallback(async (taskId, hasGrid = true) => {
    // 检查后端标记是否有宫格图
    if (!hasGrid) {
      // console.log(`[HistoryPanel loadThumbnail] 任务 ${taskId} 没有 has_grid 标记，跳过加载缩略图`);
      return;
    }

    // 如果已经有缩略图 URL，直接返回
    if (thumbnailUrls[taskId]) {
      // console.log(`[HistoryPanel loadThumbnail] 任务 ${taskId} 已有缩略图，跳过`);
      return;
    }

    // 如果正在加载或已经加载失败过（已尝试过），不再重复请求
    if (loadedTasks.has(taskId)) {
      // console.log(`[HistoryPanel loadThumbnail] 任务 ${taskId} 已尝试过加载，跳过`);
      return;
    }

    // console.log(`[HistoryPanel loadThumbnail] 开始加载任务 ${taskId} 的缩略图`);
    // 标记为"已尝试"，防止重复请求
    setLoadedTasks(prev => new Set([...prev, taskId]));

    try {
      const response = await getTaskGridImage(taskId);
      // console.log(`[HistoryPanel loadThumbnail] 任务 ${taskId} API 响应:`, response);
      // console.log(`[HistoryPanel loadThumbnail] response.grid_image 存在?`, !!response?.grid_image);
      // console.log(`[HistoryPanel loadThumbnail] grid_image 长度:`, response?.grid_image?.length);

      if (response?.grid_image) {
        setThumbnailUrls(prev => ({
          ...prev,
          [taskId]: response.grid_image
        }));
        // console.log(`[HistoryPanel loadThumbnail] 任务 ${taskId} 缩略图设置成功`);
      } else {
        // console.warn(`[HistoryPanel loadThumbnail] 任务 ${taskId} 响应中没有 grid_image，响应内容:`, response);
      }
    } catch (err) {
      // 静默失败，不影响用户体验
      // console.error(`[HistoryPanel loadThumbnail] 加载任务 ${taskId} 缩略图失败:`, err);
    }
  }, [loadedTasks, thumbnailUrls]);

  // 使用 Intersection Observer 实现懒加载
  const observerRef = useRef(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const taskId = entry.target.dataset.taskId;
            const hasGrid = entry.target.dataset.hasGrid === 'true';
            if (taskId) {
              loadThumbnail(taskId, hasGrid);
              observerRef.current?.unobserve(entry.target);
            }
          }
        });
      },
      { rootMargin: '100px' } // 提前 100px 开始加载
    );

    return () => {
      observerRef.current?.disconnect();
    };
  }, [loadThumbnail]);

  // 合并本地会话和 API 任务
  const allSessions = [...apiTasks, ...sessions];

  const handleDeleteSession = (e, sessionId) => {
    e.stopPropagation();
    if (confirm('确定要删除这个切片组吗？')) {
      deleteSession(sessionId);
    }
  };

  // 处理会话/历史记录点击
  const handleSessionClick = async (session) => {
    // 打印卡片数据
    console.log('========== 点击历史记录卡片 ==========');
    console.log('📋 卡片数据 (session):', {
      id: session.id,
      name: session.name,
      timestamp: session.timestamp,
      tiles: session.tiles,
      taskId: session.taskId,
      storyboard: session.storyboard,
      script: session.script,
      hasGridImage: session.hasGridImage,
      hasGrid: session.hasGrid,
      hasSplits: session.hasSplits
    });

    // 打印对应的 IndexedDB 数据
    if (session.taskId && imageCache.db) {
      try {
        await imageCache.init();

        // 获取该任务的 grid 缓存
        const gridCache = await imageCache._getRawCacheItem('grid', 'default', session.taskId);
        console.log('🗄️ IndexedDB - grid 缓存:', gridCache ? {
          key: gridCache.key,
          type: gridCache.type,
          clientId: gridCache.clientId,
          taskId: gridCache.taskId,
          size: gridCache.size,
          timestamp: new Date(gridCache.timestamp).toLocaleString(),
          expiry: new Date(gridCache.expiry).toLocaleString(),
          etag: gridCache.etag,
          version: gridCache.version,
          isExpired: Date.now() > gridCache.expiry,
          dataPreview: {
            hasGridImage: !!gridCache.data?.grid_image,
            gridImageLength: gridCache.data?.grid_image?.length || 0
          }
        } : '无 grid 缓存');

        // 获取该任务的 splits 缓存
        const splitsCache = await imageCache._getRawCacheItem('splits', 'default', session.taskId);
        console.log('🗄️ IndexedDB - splits 缓存:', splitsCache ? {
          key: splitsCache.key,
          type: splitsCache.type,
          clientId: splitsCache.clientId,
          taskId: splitsCache.taskId,
          size: splitsCache.size,
          timestamp: new Date(splitsCache.timestamp).toLocaleString(),
          expiry: new Date(splitsCache.expiry).toLocaleString(),
          etag: splitsCache.etag,
          version: splitsCache.version,
          isExpired: Date.now() > splitsCache.expiry,
          dataPreview: {
            hasSplitImages: !!splitsCache.data?.split_images,
            splitImagesCount: splitsCache.data?.split_images?.length || 0
          }
        } : '无 splits 缓存');

        // 获取所有缓存项
        const allItems = await new Promise((resolve) => {
          const transaction = imageCache.db.transaction(['images'], 'readonly');
          const store = transaction.objectStore('images');
          const request = store.getAll();

          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve([]);
        });

        console.log('🗄️ IndexedDB - 所有缓存项:', allItems.map(item => ({
          key: item.key,
          type: item.type,
          taskId: item.taskId,
          size: item.size,
          timestamp: new Date(item.timestamp).toLocaleString()
        })));

      } catch (err) {
        console.error('读取 IndexedDB 失败:', err);
      }
    }

    console.log('======================================');

    setActiveSession(session.id);

    // 如果是 API 任务（有 taskId），恢复到工作流
    if (session.taskId) {
      // 检查本地数据是否完整（有 shots 和 prompt_text）
      const isComplete = session.storyboard?.shots?.length > 0 &&
                        session.storyboard.shots[0]?.prompt_text;

      let storyboardToUse = isComplete ? session.storyboard : null;

      if (!isComplete) {
        // 本地数据不完整，从后端重新获取
        try {
          const task = await restoreTaskFromHistory(session.taskId);
          if (task && task.storyboard && task.storyboard.shots?.length > 0) {
            storyboardToUse = task.storyboard;
          } else {
            return;
          }
        } catch (err) {
          // Suppress unused variable warning
          void err;
          return;
        }
      }

      // 如果历史任务有分割图片，先加载再跳转
      if (session.hasSplits) {
        try {
          const splitsData = await getTaskSplitImages(session.taskId);
          if (splitsData?.split_images) {
            setSplitsImages(splitsData.split_images);
          }
        } catch (err) {
          // 静默失败，不影响主流程
          console.warn('加载分割图片失败:', err);
        }
      }

      // 设置基本信息并跳转到 SPLIT 步骤
      setTaskId(session.taskId);
      setStoryboard(storyboardToUse);
      setFullScript(session.script || '');
      setCurrentStep(WorkflowSteps.SPLIT);
    }
  };

  // 格式化时间
  const formatTime = (date) => {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return `${days} 天前`;
  };

  // 设置缩略图元素的观察
  const setThumbnailRef = (element, taskId) => {
    if (element && observerRef.current && taskId) {
      observerRef.current.observe(element);
    }
  };

  // 处理重新生成点击
  const handleRetryClick = async (e, session) => {
    e.stopPropagation(); // 阻止触发卡片的点击事件

    // 设置重试状态
    setRetryingTasks(prev => new Set([...prev, session.taskId]));

    // 将该任务移到列表顶部
    setApiTasks(prev => {
      const taskIndex = prev.findIndex(t => t.taskId === session.taskId);
      if (taskIndex > 0) {
        const newTasks = [...prev];
        const [task] = newTasks.splice(taskIndex, 1);
        return [task, ...newTasks];
      }
      return prev;
    });

    // 恢复任务并跳转到工作区
    setActiveSession(session.id);

    // 如果是 API 任务（有 taskId），恢复到工作流
    if (session.taskId) {
      // 检查本地数据是否完整（有 shots 和 prompt_text）
      const isComplete = session.storyboard?.shots?.length > 0 &&
                        session.storyboard.shots[0]?.prompt_text;

      let storyboardToUse = isComplete ? session.storyboard : null;

      if (!isComplete) {
        // 本地数据不完整，从后端重新获取
        try {
          const task = await restoreTaskFromHistory(session.taskId);
          if (task && task.storyboard && task.storyboard.shots?.length > 0) {
            storyboardToUse = task.storyboard;
          } else {
            setRetryingTasks(prev => {
              const newSet = new Set(prev);
              newSet.delete(session.taskId);
              return newSet;
            });
            return;
          }
        } catch (err) {
          void err;
          setRetryingTasks(prev => {
            const newSet = new Set(prev);
            newSet.delete(session.taskId);
            return newSet;
          });
          return;
        }
      }

      // 设置基本信息并跳转到 SPLIT 步骤
      setTaskId(session.taskId);
      setStoryboard(storyboardToUse);
      setFullScript(session.script || '');
      setCurrentStep(WorkflowSteps.SPLIT);

      // 触发自动生成宫格事件
      // 使用 setTimeout 确保状态已更新
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('autoGenerateGrid', {
          detail: { taskId: session.taskId }
        }));
      }, 100);
    }
  };

  return (
    <div className="history-panel">
      {/* 头部 */}
      <div className="sidebar-header">
        <span>🕘 历史记录</span>
        <Button
          variant="secondary"
          size="small"
          onClick={resetWorkflow}
          title="新建"
        >
          ＋
        </Button>
      </div>

      {/* 内容区 */}
      <div className="sidebar-content" ref={scrollContentRef}>
        {error && (
          <div style={{ padding: '10px', color: '#ef4444', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <Loading variant="dots" text="加载中..." />
          </div>
        ) : allSessions.length === 0 ? (
          <div className="sidebar-empty">
            暂无切片<br/>点击上方 ＋ 创建
          </div>
        ) : (
          <div className="session-list">
            {allSessions.map((session) => {
              const thumbUrl = session.taskId ? thumbnailUrls[session.taskId] : session.thumb;
              // 获取宫格生成状态: pending(等待生成), success(成功), failed(失败)
              const gridStatus = session.gridGenerationStatus || 'pending';

              return (
                <div
                  key={session.id}
                  className={`session-item ${activeSessionId === session.id ? 'active' : ''}`}
                  onClick={() => handleSessionClick(session)}
                >
                  {/* 缩略图 */}
                  <div
                    className={`session-thumb ${gridStatus === 'failed' ? 'session-thumb-failed' : ''} ${gridStatus === 'pending' ? 'session-thumb-pending' : ''}`}
                    ref={(el) => setThumbnailRef(el, session.taskId)}
                    data-task-id={session.taskId}
                    data-has-grid={session.hasGrid ?? true}
                  >
                    {thumbUrl ? (
                      <img src={thumbUrl} alt={session.name} />
                    ) : gridStatus === 'failed' ? (
                      <div className="session-thumb-failed-content">
                        {retryingTasks.has(session.taskId) ? (
                          <>
                            <Loading variant="dots" size="small" />
                            <span className="failed-text" style={{ color: '#6366f1' }}>重新生成中...</span>
                          </>
                        ) : (
                          <>
                            <span className="failed-icon">❌</span>
                            <span className="failed-text">生成失败,请重新生成</span>
                            <button
                              className="retry-btn"
                              onClick={(e) => handleRetryClick(e, session)}
                            >
                              重新生成
                            </button>
                          </>
                        )}
                      </div>
                    ) : gridStatus === 'pending' ? (
                      <div className="session-thumb-pending-content">
                        <span className="pending-icon">⏳</span>
                        <span className="pending-text">等待生成宫格</span>
                      </div>
                    ) : session.taskId ? (
                      <div className="session-thumb-placeholder">
                        <Loading variant="dots" size="small" />
                      </div>
                    ) : (
                      <div className="session-thumb-placeholder">
                        <span>🎬</span>
                      </div>
                    )}
                  </div>

                  {/* 信息 */}
                  <div className="session-info">
                    <div className="session-name">{session.name}</div>
                    <div className="session-meta">
                      {session.tiles || 0} 切片 · {formatTime(new Date(session.timestamp))}
                    </div>
                  </div>

                  {/* 删除按钮 */}
                  <button
                    className="session-delete"
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryPanel;
