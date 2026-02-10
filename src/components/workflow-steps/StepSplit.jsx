import React, { useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import Card from '../common/Card';
import Button from '../common/Button';
import ChatMessage from './ChatMessage';
import RefImageDropZone from './RefImageDropZone';
import { generateShots, generateGrid } from '../../services/api';
import Loading from '../common/Loading';
import ShotsEditModal from '../ShotsEditModal';
import GridDisplayModal from '../GridDisplayModal';
import './StepSplit.css';

// 可拖拽的分镜图片组件（支持在网格内重排序）- 按照宫格.html样式
const DraggableImage = ({ imageUrl, index, originalIndex, shotInfo, isExcluded, onToggleExclude }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useDraggable({
    id: `split-image-${index}`,
    data: {
      id: `split-image-${index}`,
      index,
      originalIndex,
      src: imageUrl,
      tileId: `split-${originalIndex}`,
      badge: shotInfo?.angle_type || `分镜 ${originalIndex + 1}`,
      shotNumber: shotInfo?.shot_number || originalIndex + 1
    }
  });

  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `split-image-${index}`
  });

  // 合并两个 ref
  const setRefs = (node) => {
    setNodeRef(node);
    setDroppableRef(node);
  };

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    // 按照宫格.html样式：拖拽时原位置保持完全可见（显示ghost效果）
    opacity: 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 1000 : 'auto',
    transition: isDragging ? 'none' : 'transform 0.2s ease'
  };

  const handleClick = () => {
    // 如果正在拖拽，不触发点击
    if (isDragging) return;
    onToggleExclude(originalIndex);
  };

  return (
    <div
      ref={setRefs}
      className={`split-image-container ${isExcluded ? 'is-grayscaled' : ''} ${isDragging ? 'sortable-ghost' : ''}`}
      style={{
        aspectRatio: '16 / 9',
        backgroundColor: 'var(--border)',
        borderRadius: 'var(--radius-xs)',
        overflow: 'hidden',
        position: 'relative',
        filter: isExcluded ? 'grayscale(100%)' : 'grayscale(0%)',
        opacity: isExcluded ? 0.5 : 1,
        transition: 'all 0.2s',
        ...style
      }}
      onClick={handleClick}
      data-index={index}
      data-original-index={originalIndex}
      {...attributes}
      {...listeners}
    >
      <img
        src={imageUrl}
        alt={`分镜 ${originalIndex + 1}`}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none'
        }}
      />
      <div style={{
        position: 'absolute',
        bottom: '2px',
        right: '4px',
        fontSize: '0.7rem',
        color: 'white',
        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        fontWeight: 500
      }}>
        {originalIndex + 1}
      </div>
    </div>
  );
};

const StepSplit = ({ visible = true }) => {
  const {
    fullScript,
    setFullScript,
    setStoryboard,
    setTaskId,
    setSplitScenes,
    storyboard,
    splitsImages,
    reorderedSplitsImages,
    setReorderedSplitsImages,
    setSplitsImages,
    taskId
  } = useWorkflowStore();

  // 前端缓存每个任务的参考图（不发送到后端）
  const refImagesCache = useRef({});

  // 使用独立状态存储 refImages，不直接从 storyboard 读取
  const [refImages, setRefImages] = useState([]);
  const refImagesRef = useRef(refImages);

  // 同步 refImages 到 ref 和 storyboard
  useEffect(() => {
    refImagesRef.current = refImages;
    // 同步到 storyboard（但不触发后端保存）
    if (storyboard && JSON.stringify(storyboard.refImages) !== JSON.stringify(refImages)) {
      setStoryboard(prev => ({
        ...prev,
        refImages: refImages
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refImages]);

  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [error, setError] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const [editableShots, setEditableShots] = useState([]);
  const [editableRefPrompt, setEditableRefPrompt] = useState('');
  const [refPromptLocked, setRefPromptLocked] = useState(false); // 参考控制提示锁定状态
  const [excludedImageIds, setExcludedImageIds] = useState(new Set());
  const gridImageInputRef = useRef(null);

  // 模态框状态
  const [shotsEditModalOpen, setShotsEditModalOpen] = useState(false);
  const [gridDisplayModalOpen, setGridDisplayModalOpen] = useState(false);

  // 当 taskId 变化时，从 cache 恢复 refImages
  const prevTaskIdRef = useRef(null);
  useEffect(() => {
    console.log('🔄 [StepSplit] taskId 变化:', {
      prev: prevTaskIdRef.current,
      current: taskId,
      cacheKeys: Object.keys(refImagesCache.current)
    });

    // 只在 taskId 真正变化时执行
    if (prevTaskIdRef.current !== taskId) {
      // 切换任务时，先保存当前任务的 refImages 到 cache
      if (prevTaskIdRef.current && refImagesRef.current.length > 0) {
        console.log('💾 [StepSplit] 保存当前任务 refImages 到 cache:', prevTaskIdRef.current, refImagesRef.current.length, '张');
        refImagesCache.current[prevTaskIdRef.current] = [...refImagesRef.current];
      }

      // 从 cache 恢复 refImages 或重置
      if (taskId && refImagesCache.current[taskId]) {
        const cached = refImagesCache.current[taskId];
        console.log('📥 [StepSplit] 从 cache 恢复 refImages:', taskId, cached.length, '张');
        setRefImages(cached);
      } else {
        console.log('🆕 [StepSplit] 新任务，清空 refImages');
        setRefImages([]);
      }

      prevTaskIdRef.current = taskId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // 监听自定义事件，打开宫格展示模态框
  useEffect(() => {
    const handleOpenGridModal = () => {
      setGridDisplayModalOpen(true);
    };

    window.addEventListener('openGridModal', handleOpenGridModal);

    return () => {
      window.removeEventListener('openGridModal', handleOpenGridModal);
    };
  }, []);

  // 切换图片排除状态（使用原始索引）
  const handleToggleExclude = (originalIndex) => {
    setExcludedImageIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(originalIndex)) {
        newSet.delete(originalIndex);
      } else {
        newSet.add(originalIndex);
      }
      return newSet;
    });
  };

  // 确认选择 - 将未被排除的图片添加到左侧
  const handleConfirmSelection = () => {
    const { addToSelectedList } = useWorkflowStore.getState();

    reorderedSplitsImages.forEach(({ src, originalIndex }) => {
      // 只添加未被排除（正常显示）的图片
      if (!excludedImageIds.has(originalIndex)) {
        const shotInfo = storyboard?.shots?.[originalIndex];
        addToSelectedList({
          instanceId: `${Date.now()}-${originalIndex}`,
          tileId: `split-${originalIndex}`,
          src: src,
          badge: shotInfo ? `${shotInfo.angle_type}` : `分镜 ${originalIndex + 1}`,
          shotNumber: shotInfo?.shot_number || originalIndex + 1
        });
      }
    });
  };

  // 计算未被排除的图片数量
  const selectedCount = reorderedSplitsImages ? reorderedSplitsImages.length - excludedImageIds.size : 0;

  // 打开分镜编辑模态框
  const handleOpenShotsEditModal = () => {
    if (!storyboard) {
      setError('请先生成分镜脚本');
      return;
    }
    setShotsEditModalOpen(true);
  };

  // 打开宫格展示模态框
  const handleOpenGridDisplayModal = () => {
    if (!splitsImages || splitsImages.length === 0) {
      setError('请先生成宫格图');
      return;
    }
    setGridDisplayModalOpen(true);
  };

  // 当 splitsImages 变化时，重置排除状态并同步到本地状态
  useEffect(() => {
    setExcludedImageIds(new Set());
    // 将图片转换为包含原始索引的对象数组
    setReorderedSplitsImages((splitsImages || []).map((src, originalIndex) => ({
      src,
      originalIndex
    })));
  }, [splitsImages]);

  // 自动调整文本框高度
  const handleInput = (e) => {
    const textarea = e.target;
    setFullScript(textarea.value);
    autoResize(textarea, 80);
  };

  const autoResize = (textarea, minHeight) => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(textarea.scrollHeight, minHeight) + 'px';
  };

  // AI 智能拆分
  const handleSplit = async () => {
    if (!fullScript.trim()) {
      setError('请先输入剧本内容');
      return;
    }

    if (!imageFile) {
      setError('请先上传全景参考图');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await generateShots(fullScript, imageFile);

      // 检查响应是否包含 storyboard（成功标志）
      if (response.storyboard) {
        // 保存到 store
        setStoryboard(response.storyboard);
        setTaskId(response.task_id);

        // 初始化可编辑的分镜列表
        setEditableShots(response.storyboard.shots.map(shot => ({
          shotNumber: shot.shot_number,
          angleType: shot.angle_type,
          promptText: shot.prompt_text
        })));

        // 将 shots 转换为 scenes 格式
        const scenes = response.storyboard.shots.map((shot, index) => ({
          id: shot.shot_number,
          title: `分镜 ${index + 1}: ${shot.angle_type}`,
          description: shot.prompt_text
        }));
        setSplitScenes(scenes);

        // 不自动跳转，让用户继续编辑分镜描述
      } else {
        setError(response.error || '生成失败，请重试');
      }
    } catch (err) {
      setError(err.message || '网络错误，请检查连接');
    } finally {
      setLoading(false);
    }
  };

  // 处理图片选择
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setError('图片大小不能超过 25MB');
      return;
    }

    setImageFile(file);
    setError(null);

    // 生成预览
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  // 移除图片
  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 处理参考图添加
  const handleAddRefImage = (imageData) => {
    console.log('➕ [StepSplit] 添加参考图:', imageData.name, imageData.id);
    console.log('📷 [StepSplit] 当前 refImagesRef 数量:', refImagesRef.current.length);

    // 直接更新 refImages 状态
    setRefImages(prev => {
      const newRefImages = [...prev, imageData];
      console.log('✅ [StepSplit] 更新后的 refImages 数量:', newRefImages.length);

      // 保存到 cache
      if (taskId) {
        refImagesCache.current[taskId] = newRefImages;
      }

      return newRefImages;
    });
  };

  // 处理参考图移除
  const handleRemoveRefImage = (id) => {
    console.log('🗑️ [StepSplit] 移除参考图:', id);

    setRefImages(prev => {
      const newRefImages = prev.filter(img => img.id !== id);
      // 保存到 cache
      if (taskId) {
        refImagesCache.current[taskId] = newRefImages;
      }
      return newRefImages;
    });
  };

  // 处理参考图重新排序
  const handleReorderRefImages = (reorderedImages) => {
    console.log('🔄 [StepSplit] 参考图重新排序，数量:', reorderedImages.length);

    setRefImages(reorderedImages);
    // 保存到 cache
    if (taskId) {
      refImagesCache.current[taskId] = reorderedImages;
    }
  };

  // 处理分镜描述修改
  const handleShotChange = (index, newPromptText) => {
    setEditableShots(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], promptText: newPromptText };
      return updated;
    });
  };

  // 当 storyboard 变化时，同步 editableShots 和 editableRefPrompt（历史记录加载）
  // 当 storyboard 为 null 时（新建/重置），清空本地状态
  const prevStoryboardRef = useRef(null);
  useEffect(() => {
    // 检测从有值变为 null（新建/重置操作）
    if (prevStoryboardRef.current && !storyboard) {
      setEditableShots([]);
      setEditableRefPrompt('');
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setError(null);
    } else if (storyboard?.shots && storyboard.shots.length > 0) {
      // 有任务：加载分镜数据
      setEditableShots(storyboard.shots.map(shot => ({
        shotNumber: shot.shot_number,
        angleType: shot.angle_type,
        promptText: shot.prompt_text
      })));
      // 只有未锁定时才更新参考控制提示
      if (!refPromptLocked) {
        setEditableRefPrompt(storyboard.reference_control_prompt || '');
      }
    }
    // 更新 ref
    prevStoryboardRef.current = storyboard;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyboard]);

  // 生成宫格图
  const handleGenerateGrid = async () => {
    if (!storyboard) {
      setError('请先生成分镜脚本');
      return;
    }

    if (!taskId) {
      setError('缺少任务 ID');
      return;
    }

    setGridLoading(true);
    setError(null);

    try {
      // 创建包含编辑后分镜的 storyboard（不包含 refImages，前端单独保存）
      const updatedStoryboard = {
        ...storyboard,
        reference_control_prompt: editableRefPrompt,
        shots: editableShots.map(shot => ({
          shot_number: shot.shotNumber,
          angle_type: shot.angleType,
          prompt_text: shot.promptText
        }))
      };

      const response = await generateGrid(updatedStoryboard, taskId, []);

      if (response.success) {
        // 保存 splitsImages 到 store
        const { setSplitsImages } = useWorkflowStore.getState();
        if (response.split_images && response.split_images.length > 0) {
          setSplitsImages(response.split_images);
        }
      } else {
        setError(response.error || '生成宫格失败，请重试');
      }
    } catch (err) {
      setError(err.message || '网络错误，请检查连接');
    } finally {
      setGridLoading(false);
    }
  };

  // 本地导入宫格图 - 将一张宫格图切割成25张单独的图片
  const handleLocalGridImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }

    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // 计算每个小图的尺寸
        const rows = 5;
        const cols = 5;
        const tileWidth = img.width / cols;
        const tileHeight = img.height / rows;

        const splitImages = [];

        // 切割宫格图为25张图片
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            canvas.width = tileWidth;
            canvas.height = tileHeight;

            ctx.drawImage(
              img,
              col * tileWidth, row * tileHeight, tileWidth, tileHeight,
              0, 0, tileWidth, tileHeight
            );

            splitImages.push(canvas.toDataURL('image/png'));
          }
        }

        // 更新 store
        setSplitsImages(splitImages);

        // 重置排除状态
        setExcludedImageIds(new Set());
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);

    // 清空 input 以允许重复选择同一文件
    if (gridImageInputRef.current) {
      gridImageInputRef.current.value = '';
    }
  };

  return (
    <ChatMessage stepId="step-split" visible={visible}>
      <Card className="chat-bubble">
        <Card.Header style={{ justifyContent: 'space-between' }}>
          <Card.Title>分镜脚本 (AI Analysis)</Card.Title>
        </Card.Header>
        <Card.Body style={{ flexGrow: 0 }}>
          <p className="step-description">
            你好！我是你的分镜助手。请输入剧本内容并上传全景参考图。
          </p>

          {/* 图片上传区域 */}
          <div className="image-upload-section">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            {imagePreview ? (
              <div className="image-preview">
                <img src={imagePreview} alt="全景参考图" />
                <Button
                  variant="danger-ghost"
                  size="small"
                  onClick={handleRemoveImage}
                  className="remove-image-btn"
                >
                  ×
                </Button>
              </div>
            ) : (
              <div
                className="image-upload-placeholder"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="upload-icon">📷</div>
                <div>点击上传全景参考图</div>
                <div className="upload-hint">支持 JPG、PNG，最大 25MB</div>
              </div>
            )}
          </div>

          {/* 剧本输入 */}
          <textarea
            id="fullScriptInput"
            className="script-textarea"
            placeholder="在此输入剧本内容..."
            value={fullScript}
            onChange={handleInput}
            style={{ minHeight: '150px' }}
          />

          {/* 错误提示 */}
          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          {/* 加载状态 */}
          {loading && (
            <div className="loading-container">
              <Loading variant="spinner"  />
            </div>
          )}

          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button onClick={handleSplit} disabled={loading} loading={loading}>
              生成文本 →
            </Button>
            {/* {storyboard?.shots?.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => setShotsEditModalOpen(true)}
              >
                📝 编辑分镜脚本
              </Button>
            )} */}
            {/* {splitsImages?.length > 0 && (
              <Button
                variant="primary"
                onClick={() => setGridDisplayModalOpen(true)}
                style={{ background: 'var(--success)' }}
              >
                🖼️ 查看宫格画面
              </Button>
            )} */}
          </div>

          {/* 拆分结果区域 - 基于 storyboard 数据判断是否显示 */}
          {/* {storyboard?.shots?.length > 0 && splitResults.length > 0 && (
            <div className="split-results">
              <div className="results-header">
                <span>生成结果 ({splitResults.length} 个分镜)</span>
              </div>
              {splitResults.map((scene) => (
                <div key={scene.id} className="scene-result-item">
                  <div className="scene-title">{scene.title}</div>
                  <div className="scene-summary">{scene.description}</div>
                </div>
              ))}
            </div>
          )} */}

          {/* 可编辑分镜列表 */}
          {editableShots.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              {/* 分镜描述列表 */}
              <div style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text-sub)',
                marginBottom: '8px'
              }}>
                分镜描述({editableShots.length} 个分镜)
              </div>
              <div style={{
                maxHeight: '50vh',
                overflowY: 'auto',
                backgroundColor: 'var(--bg-subtle)',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                marginBottom: '12px'
              }}>
                {editableShots.map((shot, index) => (
                  <div key={index} style={{
                    marginBottom: index < editableShots.length - 1 ? '12px' : '0',
                    paddingBottom: index < editableShots.length - 1 ? '12px' : '0',
                    borderBottom: index < editableShots.length - 1 ? '1px solid var(--border)' : 'none'
                  }}>
                    <div style={{
                      fontSize: '1.1rem',
                      fontWeight: 600,
                      color: 'var(--text-sub)',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{
                        backgroundColor: 'var(--accent)',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.75rem'
                      }}>
                        {shot.shotNumber}
                      </span>
                      <span>{shot.angleType}</span>
                    </div>
                    <textarea
                      value={shot.promptText}
                      onChange={(e) => handleShotChange(index, e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '50px',
                        padding: '8px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-xs)',
                        fontSize: '1rem',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        fontWeight:'450'
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* 参考控制提示（可编辑） */}
              <div>
                <div style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-sub)',
                  marginBottom: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>参考控制提示（可编辑）</span>
                  <button
                    onClick={() => setRefPromptLocked(!refPromptLocked)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.1rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title={refPromptLocked ? '解锁参考控制提示' : '锁定参考控制提示'}
                    onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--bg-subtle)'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  >
                    {refPromptLocked ? '🔒' : '🔓'}
                    <span style={{
                      fontSize: '0.75rem',
                      color: refPromptLocked ? 'var(--primary)' : 'var(--text-sub)'
                    }}>
                      {refPromptLocked ? '已锁定' : '锁定'}
                    </span>
                  </button>
                </div>
                <textarea
                  value={editableRefPrompt}
                  onChange={(e) => setEditableRefPrompt(e.target.value)}
                  placeholder="输入参考控制提示..."
                  disabled={refPromptLocked}
                  style={{
                    width: '100%',
                    minHeight: '60px',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    backgroundColor: refPromptLocked ? 'var(--bg-subtle)' : 'var(--bg)',
                    color: 'var(--text)',
                    opacity: refPromptLocked ? 0.7 : 1,
                    cursor: refPromptLocked ? 'not-allowed' : 'text'
                  }}
                />
              </div>
            </div>
          )}

          {/* 参考图上传区域 */}
          {storyboard && (
            <div style={{ marginTop: '16px' }}>
              <div style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text-sub)',
                marginBottom: '8px'
              }}>
                参考图上传（可选）
              </div>
              <RefImageDropZone
                images={refImages}
                onAdd={handleAddRefImage}
                onRemove={handleRemoveRefImage}
                onReorder={handleReorderRefImages}
                placeholder="点击或拖拽上传宫格生成参考图"
              />
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <Button onClick={handleGenerateGrid} disabled={gridLoading} loading={gridLoading}>
                  {gridLoading ? '生成中...' : '🎨 生成宫格图'}
                </Button>
              </div>
            </div>
          )}

          {/* 历史任务 splits 图片展示 */}
          {reorderedSplitsImages && reorderedSplitsImages.length > 0 && (
            <div style={{
              marginTop: '16px'
            }}>
              <div style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text-sub)',
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>分镜画面 ({reorderedSplitsImages.length} 张) - 可拖拽排序或到左侧</span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {selectedCount > 0 && (
                    <Button variant="primary" size="small" onClick={handleConfirmSelection}>
                      ✅ 确认选择 ({selectedCount})
                    </Button>
                  )}
                  <input
                    ref={gridImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLocalGridImport}
                    style={{ display: 'none' }}
                  />
                  <Button
                    variant="outline"
                    size="small"
                    onClick={() => gridImageInputRef.current?.click()}
                  >
                    📁 本地导入
                  </Button>
                </div>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '8px',
                backgroundColor: 'var(--bg-subtle)',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)'
              }}>
                {reorderedSplitsImages.map(({ src, originalIndex }, index) => {
                  // 获取对应的 shot 信息（使用原始索引）
                  const shotInfo = storyboard?.shots?.[originalIndex];
                  return (
                    <DraggableImage
                      key={`split-image-${index}`}
                      imageUrl={src}
                      index={index}
                      originalIndex={originalIndex}
                      shotInfo={shotInfo}
                      isExcluded={excludedImageIds.has(originalIndex)}
                      onToggleExclude={handleToggleExclude}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* 分镜编辑模态框 */}
      <ShotsEditModal
        open={shotsEditModalOpen}
        onClose={() => setShotsEditModalOpen(false)}
      />

      {/* 宫格展示模态框 */}
      <GridDisplayModal
        open={gridDisplayModalOpen}
        onClose={() => setGridDisplayModalOpen(false)}
      />
    </ChatMessage>
  );
};

export default StepSplit;
