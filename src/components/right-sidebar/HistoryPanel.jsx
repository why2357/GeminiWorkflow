import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWorkflowStore, WorkflowSteps } from '../../store/useWorkflowStore';
import Button from '../common/Button';
import { getHistory, getTaskGridImage, restoreTaskFromHistory } from '../../services/api';
import Loading from '../common/Loading';
import './HistoryPanel.css';

const HistoryPanel = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiTasks, setApiTasks] = useState([]);
  const [thumbnailUrls, setThumbnailUrls] = useState({}); // 缓存缩略图 URL
  const [loadedTasks, setLoadedTasks] = useState(new Set()); // 已加载缩略图的任务

  const {
    sessions,
    activeSessionId,
    setActiveSession,
    deleteSession,
    resetWorkflow,
    setStoryboard,
    setTaskId,
    setFullScript,
    setCurrentStep
  } = useWorkflowStore();

  // 从 API 加载历史记录
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getHistory();
      if (response.history) {
        // 转换 API 任务数据为会话格式
        const convertedSessions = response.history.map(task => ({
          id: task.task_id,
          name: task.script?.substring(0, 30) + '...' || '未命名任务',
          thumb: null, // 缩略图按需加载
          timestamp: new Date(task.created_at),
          tiles: task.storyboard?.shots?.length || 0,
          taskId: task.task_id,
          storyboard: task.storyboard,
          script: task.script,
          hasGridImage: true, // 标记可能有宫格图
          // 使用后端返回的 has_grid 和 has_splits 字段
          hasGrid: task.has_grid ?? true,
          hasSplits: task.has_splits ?? true
        }));
        setApiTasks(convertedSessions);
      }
    } catch (err) {
      setError(err.message || '加载历史记录失败');
    } finally {
      setLoading(false);
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

      // 设置基本信息并跳转到 SPLIT 步骤
      setTaskId(session.taskId);
      setStoryboard(storyboardToUse);
      setFullScript(session.script || '');
      setCurrentStep(WorkflowSteps.SPLIT);

      // 不自动加载 splits 数据，让用户手动点击"生成宫格图"后再显示
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

  return (
    <div className="history-panel">
      {/* 头部 */}
      <div className="sidebar-header">
        <span>🕘 历史记录</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="secondary"
            size="small"
            onClick={resetWorkflow}
            title="新建"
          >
            ＋
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={loadHistory}
            title="刷新"
            disabled={loading}
          >
            {loading ? '...' : '🔄'}
          </Button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="sidebar-content">
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

              return (
                <div
                  key={session.id}
                  className={`session-item ${activeSessionId === session.id ? 'active' : ''}`}
                  onClick={() => handleSessionClick(session)}
                >
                  {/* 缩略图 */}
                  <div
                    className="session-thumb"
                    ref={(el) => setThumbnailRef(el, session.taskId)}
                    data-task-id={session.taskId}
                    data-has-grid={session.hasGrid ?? true}
                  >
                    {thumbUrl ? (
                      <img src={thumbUrl} alt={session.name} />
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
