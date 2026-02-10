import React, { useState, useEffect, useRef } from 'react';
import Modal from './common/Modal';
import { useWorkflowStore } from '../store/useWorkflowStore';
import RefImageDropZone from './workflow-steps/RefImageDropZone';
import { generateGrid } from '../services/api';
import Loading from './common/Loading';
import './ShotsEditModal.css';

/**
 * 分镜编辑模态框 - 按照宫格.html样式
 * 用于编辑25个分镜描述和参考控制提示
 */
const ShotsEditModal = ({ open, onClose }) => {
  const {
    storyboard,
    setStoryboard,
    taskId,
    setSplitsImages,
    setSplitScenes
  } = useWorkflowStore();

  // 从 storyboard 中读取参考图
  const refImages = storyboard?.refImages || [];

  const [editableShots, setEditableShots] = useState([]);
  const [editableRefPrompt, setEditableRefPrompt] = useState('');
  const [refPromptLocked, setRefPromptLocked] = useState(false); // 参考控制提示锁定状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 当模态框打开时，加载数据
  useEffect(() => {
    if (open && storyboard?.shots) {
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
  }, [open, storyboard, refPromptLocked]);

  // 处理分镜描述修改
  const handleShotChange = (index, newPromptText) => {
    setEditableShots(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], promptText: newPromptText };
      return updated;
    });
  };

  // 处理参考图添加
  const handleAddRefImage = (imageData) => {
    setStoryboard({
      ...storyboard,
      refImages: [...refImages, imageData]
    });
  };

  // 处理参考图移除
  const handleRemoveRefImage = (id) => {
    setStoryboard({
      ...storyboard,
      refImages: refImages.filter(img => img.id !== id)
    });
  };

  // 处理参考图重新排序
  const handleReorderRefImages = (reorderedImages) => {
    setStoryboard({
      ...storyboard,
      refImages: reorderedImages
    });
  };

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

    setLoading(true);
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

      // 更新 store 中的 storyboard
      setStoryboard(updatedStoryboard);

      const response = await generateGrid(updatedStoryboard, taskId, []);

      if (response.success) {
        // 保存 splitsImages 到 store
        if (response.split_images && response.split_images.length > 0) {
          setSplitsImages(response.split_images);
        }

        // 转换为 scenes 格式
        const scenes = updatedStoryboard.shots.map((shot, index) => ({
          id: shot.shot_number,
          title: `分镜 ${index + 1}: ${shot.angle_type}`,
          description: shot.prompt_text
        }));
        setSplitScenes(scenes);

        // 关闭当前模态框，打开宫格展示模态框
        onClose();
        // 打开宫格展示模态框
        setTimeout(() => {
          const event = new CustomEvent('openGridModal');
          window.dispatchEvent(event);
        }, 100);
      } else {
        setError(response.error || '生成宫格失败，请重试');
      }
    } catch (err) {
      setError(err.message || '网络错误，请检查连接');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📝 分镜脚本编辑"
      size="lg"
    >
      <div className="shots-edit-content">
        {/* 分镜描述列表 */}
        <div className="shots-edit-header">
          <span className="shots-edit-title">分镜描述 ({editableShots.length} 个分镜)</span>
        </div>

        <div className="shots-edit-list">
          {editableShots.map((shot, index) => (
            <div key={index} className="shot-edit-item">
              <div className="shot-edit-header">
                <span className="shot-edit-badge">{shot.shotNumber}</span>
                <span className="shot-edit-angle">{shot.angleType}</span>
              </div>
              <textarea
                value={shot.promptText}
                onChange={(e) => handleShotChange(index, e.target.value)}
                className="shot-edit-textarea"
                placeholder="输入分镜描述..."
                style={{ minHeight: '60px' }}
              />
            </div>
          ))}
        </div>

        {/* 参考控制提示 */}
        <div className="ref-prompt-section">
          <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>参考控制提示（可编辑）</span>
            <button
              onClick={() => setRefPromptLocked(!refPromptLocked)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1rem',
                padding: '4px 8px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title={refPromptLocked ? '解锁参考控制提示' : '锁定参考控制提示'}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.05)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              {refPromptLocked ? '🔒' : '🔓'}
              <span style={{
                fontSize: '0.75rem',
                color: refPromptLocked ? 'var(--primary, #6366f1)' : 'var(--text-sub, #64748b)'
              }}>
                {refPromptLocked ? '已锁定' : '锁定'}
              </span>
            </button>
          </div>
          <textarea
            value={editableRefPrompt}
            onChange={(e) => setEditableRefPrompt(e.target.value)}
            className="ref-prompt-textarea"
            placeholder="输入参考控制提示..."
            disabled={refPromptLocked}
            style={{
              minHeight: '80px',
              opacity: refPromptLocked ? 0.7 : 1,
              cursor: refPromptLocked ? 'not-allowed' : 'text'
            }}
          />
        </div>

        {/* 参考图上传 */}
        <div className="ref-images-section">
          <div className="section-title">参考图上传（可选）</div>
          <RefImageDropZone
            images={refImages}
            onAdd={handleAddRefImage}
            onRemove={handleRemoveRefImage}
            onReorder={handleReorderRefImages}
            placeholder="点击或拖拽上传宫格生成参考图"
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        {/* 加载状态 */}
        {loading && (
          <div className="loading-overlay">
            <Loading variant="spinner" text="AI 正在生成宫格图..." />
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="shots-edit-footer">
        <button className="secondary" onClick={onClose} disabled={loading}>
          取消
        </button>
        <button className="primary" onClick={handleGenerateGrid} disabled={loading}>
          {loading ? '生成中...' : '🎨 生成宫格图'}
        </button>
      </div>
    </Modal>
  );
};

export default ShotsEditModal;
