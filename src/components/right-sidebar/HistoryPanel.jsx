import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWorkflowStore, WorkflowSteps } from '../../store/useWorkflowStore';
import Button from '../common/Button';
import { getHistory, getTaskGridImage, restoreTaskFromHistory, getTaskSplitImages } from '../../services/api';
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
    addSession,
    setSplitsImages,
    setCurrentStep,
    setStoryboard,
    setTaskId,
    setFullScript,
    setSplitScenes
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
          hasGridImage: true // 标记可能有宫格图
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
  const loadThumbnail = useCallback(async (taskId) => {
    // 如果已经有缩略图 URL，直接返回
    if (thumbnailUrls[taskId]) {
      console.log(`[HistoryPanel loadThumbnail] 任务 ${taskId} 已有缩略图，跳过`);
      return;
    }

    // 如果正在加载或已经加载失败过（已尝试过），不再重复请求
    if (loadedTasks.has(taskId)) {
      console.log(`[HistoryPanel loadThumbnail] 任务 ${taskId} 已尝试过加载，跳过`);
      return;
    }

    console.log(`[HistoryPanel loadThumbnail] 开始加载任务 ${taskId} 的缩略图`);
    // 标记为"已尝试"，防止重复请求
    setLoadedTasks(prev => new Set([...prev, taskId]));

    try {
      const response = await getTaskGridImage(taskId);
      console.log(`[HistoryPanel loadThumbnail] 任务 ${taskId} API 响应:`, response);
      console.log(`[HistoryPanel loadThumbnail] response.grid_image 存在?`, !!response?.grid_image);
      console.log(`[HistoryPanel loadThumbnail] grid_image 长度:`, response?.grid_image?.length);

      if (response?.grid_image) {
        setThumbnailUrls(prev => ({
          ...prev,
          [taskId]: response.grid_image
        }));
        console.log(`[HistoryPanel loadThumbnail] 任务 ${taskId} 缩略图设置成功`);
      } else {
        console.warn(`[HistoryPanel loadThumbnail] 任务 ${taskId} 响应中没有 grid_image，响应内容:`, response);
      }
    } catch (err) {
      // 静默失败，不影响用户体验
      console.error(`[HistoryPanel loadThumbnail] 加载任务 ${taskId} 缩略图失败:`, err);
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
            if (taskId) {
              loadThumbnail(taskId);
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

  const handleCreateSession = () => {
    const newSession = {
      id: Date.now(),
      name: `切片组 ${allSessions.length + 1}`,
      thumb: null,
      timestamp: new Date(),
      tiles: []
    };
    addSession(newSession);
    setActiveSession(newSession.id);
  };

  const handleDeleteSession = (e, sessionId) => {
    e.stopPropagation();
    if (confirm('确定要删除这个切片组吗？')) {
      deleteSession(sessionId);
    }
  };

  // 处理会话/历史记录点击
  const handleSessionClick = async (session) => {
    console.log('[HistoryPanel] 点击历史记录:', session);
    console.log('[HistoryPanel] session.taskId:', session.taskId);
    console.log('[HistoryPanel] session.storyboard:', session.storyboard);

    setActiveSession(session.id);

    // 如果是 API 任务（有 taskId），恢复到工作流
    if (session.taskId) {
      // 检查本地数据是否完整（有 shots 和 prompt_text）
      const isComplete = session.storyboard?.shots?.length > 0 &&
                        session.storyboard.shots[0]?.prompt_text;

      console.log('[HistoryPanel] 本地数据是否完整:', isComplete);

      let storyboardToUse = isComplete ? session.storyboard : null;

      if (isComplete) {
        // 本地数据完整，直接使用
        console.log('[HistoryPanel] 使用本地数据恢复任务');
      } else {
        // 本地数据不完整，从后端重新获取
        console.log('[HistoryPanel] 本地数据不完整，从后端获取完整数据');
        try {
          const task = await restoreTaskFromHistory(session.taskId);
          console.log('[HistoryPanel] 从后端获取的任务:', task);
          console.log('[HistoryPanel] task.storyboard:', task?.storyboard);
          console.log('[HistoryPanel] task.storyboard.shots:', task?.storyboard?.shots);

          if (task && task.storyboard && task.storyboard.shots?.length > 0) {
            console.log('[HistoryPanel] 数据完整');
            storyboardToUse = task.storyboard;
          } else {
            console.warn('[HistoryPanel] 从历史记录获取的数据不完整');
            return;
          }
        } catch (err) {
          console.error('[HistoryPanel] 恢复任务失败:', err);
          return;
        }
      }

      // 获取 splits 数据并显示在分镜脚本步骤
      try {
        console.log('[HistoryPanel] 获取 splits 数据...');
        const splitsResponse = await getTaskSplitImages(session.taskId);
        console.log('[HistoryPanel] splits 响应:', splitsResponse);

        if (splitsResponse?.split_images) {
          // 直接设置状态，不调用 restoreTask（避免跳转到 WORKSPACE）
          setTaskId(session.taskId);
          setStoryboard(storyboardToUse);
          setFullScript(session.script || '');

          // 将 shots 转换为 scenes 格式
          const scenes = storyboardToUse.shots.map((shot, index) => ({
            id: shot.shot_number,
            title: `分镜 ${index + 1}: ${shot.angle_type}`,
            description: shot.prompt_text
          }));
          setSplitScenes(scenes);

          setSplitsImages(splitsResponse.split_images);
          setCurrentStep(WorkflowSteps.SPLIT); // 跳转到分镜脚本步骤
          console.log('[HistoryPanel] 已跳转到分镜脚本步骤');
        }
      } catch (err) {
        console.error('[HistoryPanel] 获取 splits 数据失败:', err);
      }
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
