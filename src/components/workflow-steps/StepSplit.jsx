import React, { useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { useDraggable } from '@dnd-kit/core';
import Card from '../common/Card';
import Button from '../common/Button';
import ChatMessage from './ChatMessage';
import RefImageDropZone from './RefImageDropZone';
import { generateShots, generateGrid } from '../../services/api';
import Loading from '../common/Loading';
import './StepSplit.css';

// 可拖拽的分镜图片组件
const DraggableImage = ({ imageUrl, index, shotInfo }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `split-image-${index}`,
    data: {
      id: `split-image-${index}`,
      index,
      src: imageUrl,
      tileId: `split-${index}`,
      badge: shotInfo?.angle_type || `分镜 ${index + 1}`,
      shotNumber: shotInfo?.shot_number || index + 1
    }
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab'
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        aspectRatio: '1',
        backgroundColor: 'var(--border)',
        borderRadius: 'var(--radius-xs)',
        overflow: 'hidden',
        position: 'relative',
        ...style
      }}
      {...attributes}
      {...listeners}
    >
      <img
        src={imageUrl}
        alt={`分镜 ${index + 1}`}
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
        {index + 1}
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
    splitsImages
  } = useWorkflowStore();

  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [error, setError] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const [refImages, setRefImages] = useState([]);
  const [editableShots, setEditableShots] = useState([]);
  const [editableRefPrompt, setEditableRefPrompt] = useState('');
  const taskId = useWorkflowStore(state => state.taskId);

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

    if (file.size > 10 * 1024 * 1024) {
      setError('图片大小不能超过 10MB');
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
    setRefImages(prev => [...prev, imageData]);
  };

  // 处理参考图移除
  const handleRemoveRefImage = (id) => {
    setRefImages(prev => prev.filter(img => img.id !== id));
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
      setRefImages([]);
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
      setEditableRefPrompt(storyboard.reference_control_prompt || '');
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
      // 获取参考图的 File 对象（需要从 src data URL 转换回 File）
      const refImageFiles = refImages.map(img => {
        // 将 base64 转换回 Blob，然后创建 File 对象
        const arr = img.src.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        return new File([blob], img.name || `ref_image_${Date.now()}`, { type: mime });
      });

      // 创建包含编辑后分镜的 storyboard
      const updatedStoryboard = {
        ...storyboard,
        reference_control_prompt: editableRefPrompt,
        shots: editableShots.map(shot => ({
          shot_number: shot.shotNumber,
          angle_type: shot.angleType,
          prompt_text: shot.promptText
        }))
      };

      const response = await generateGrid(updatedStoryboard, taskId, refImageFiles);

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

  // 调试日志
  // console.log('[StepSplit] 渲染状态:', {
  //   splitsImages,
  //   splitsImagesLength: splitsImages?.length,
  //   storyboard,
  //   splitResults
  // });

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
                <div className="upload-hint">支持 JPG、PNG，最大 10MB</div>
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

          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={handleSplit} disabled={loading} loading={loading}>
              生成文本 →
            </Button>
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
              {/* 参考控制提示（可编辑） */}
              <div style={{
                marginBottom: '12px'
              }}>
                <div style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-sub)',
                  marginBottom: '6px'
                }}>
                  参考控制提示（可编辑）
                </div>
                <textarea
                  value={editableRefPrompt}
                  onChange={(e) => setEditableRefPrompt(e.target.value)}
                  placeholder="输入参考控制提示..."
                  style={{
                    width: '100%',
                    minHeight: '60px',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    backgroundColor: 'var(--bg-subtle)',
                    color: 'var(--text)'
                  }}
                />
              </div>

              {/* 分镜描述列表 */}
              <div style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text-sub)',
                marginBottom: '8px'
              }}>
                分镜描述（可编辑）({editableShots.length} 个分镜)
              </div>
              <div style={{
                maxHeight: '50vh',
                overflowY: 'auto',
                backgroundColor: 'var(--bg-subtle)',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)'
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
          {splitsImages && splitsImages.length > 0 && (
            <div style={{
              marginTop: '16px'
            }}>
              <div style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text-sub)',
                marginBottom: '8px'
              }}>
                分镜画面 ({splitsImages.length} 张) - 可拖拽到左侧
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
                {splitsImages.map((imageUrl, index) => {
                  // 获取对应的 shot 信息
                  const shotInfo = storyboard?.shots?.[index];
                  return (
                    <DraggableImage
                      key={index}
                      imageUrl={imageUrl}
                      index={index}
                      shotInfo={shotInfo}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </Card.Body>
      </Card>
    </ChatMessage>
  );
};

export default StepSplit;
