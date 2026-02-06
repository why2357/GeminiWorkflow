import React, { useState, useRef } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { WorkflowSteps } from '../../store/useWorkflowStore';
import Card from '../common/Card';
import Button from '../common/Button';
import ChatMessage from './ChatMessage';
import { generateShots } from '../../services/api';
import Loading from '../common/Loading';
import './StepSplit.css';

const StepSplit = ({ visible = true }) => {
  const {
    fullScript,
    setFullScript,
    setCurrentStep,
    setStoryboard,
    setTaskId,
    setSplitScenes,
    storyboard,
    splitsImages
  } = useWorkflowStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);

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

        // 将 shots 转换为 scenes 格式
        const scenes = response.storyboard.shots.map((shot, index) => ({
          id: shot.shot_number,
          title: `分镜 ${index + 1}: ${shot.angle_type}`,
          description: shot.prompt_text
        }));
        setSplitScenes(scenes);

        setShowResults(true);

        // 自动进入下一步
        setTimeout(() => {
          setCurrentStep(WorkflowSteps.SEGMENT);
        }, 500);
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

  // 获取拆分结果
  const splitResults = useWorkflowStore(state => state.splitScenes);

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
            </Button>
          </div>

          {/* 拆分结果区域 */}
          {showResults && splitResults.length > 0 && (
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
          )}

          {/* 参考控制提示卡片 */}
          {storyboard?.reference_control_prompt && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.9rem',
              color: 'var(--text)',
              marginTop: '12px',
              border: '1px solid var(--border)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{ fontWeight: 600, color: 'var(--text-sub)', marginBottom: '6px' }}>
                参考控制提示
              </div>
              <div style={{ lineHeight: '1.6' }}>
                {storyboard.reference_control_prompt}
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
                分镜画面 ({splitsImages.length} 张)
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
                {splitsImages.map((imageUrl, index) => (
                  <div
                    key={index}
                    style={{
                      aspectRatio: '1',
                      backgroundColor: 'var(--border)',
                      borderRadius: 'var(--radius-xs)',
                      overflow: 'hidden',
                      position: 'relative'
                    }}
                  >
                    <img
                      src={imageUrl}
                      alt={`分镜 ${index + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
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
                ))}
              </div>
            </div>
          )}
        </Card.Body>
      </Card>
    </ChatMessage>
  );
};

export default StepSplit;
