import React, { useState, useMemo, useEffect } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { WorkflowSteps } from '../../store/useWorkflowStore';
import Card from '../common/Card';
import Button from '../common/Button';
import ChatMessage from './ChatMessage';
import RefImageDropZone from './RefImageDropZone';
import SkeletonChat from '../common/Skeleton';
import { restoreTaskFromHistory, getTaskGridImage } from '../../services/api';
import './StepSegment.css';

const StepSegment = ({ visible = true }) => {
  const {
    scenePrompt,
    setScenePrompt,
    sceneRefImages,
    addSceneRefImage,
    removeSceneRefImage,
    setCurrentStep,
    storyboard,
    splitScenes,
    generatedScripts,
    setGeneratedScripts,
    taskId,
    setStoryboard
  } = useWorkflowStore();

  const [gridImage, setGridImage] = useState(null); // 宫格图
  const [loadingGrid, setLoadingGrid] = useState(false);

  const [selectedShots, setSelectedShots] = useState(new Set());
  const [expandedShots, setExpandedShots] = useState(new Set());

  // 从 storyboard 提取 shots
  const shots = useMemo(() => {
    if (!storyboard?.shots) return [];
    return storyboard.shots.map((shot, index) => ({
      id: shot.shot_number,
      number: index + 1,
      angle: shot.angle_type,
      prompt: shot.prompt_text
    }));
  }, [storyboard]);

  // 是否有 storyboard 数据
  const hasStoryboard = !!storyboard && shots.length > 0;

  // console.log('[StepSegment] 渲染状态:', {
  //   taskId,
  //   storyboard,
  //   hasStoryboard,
  //   shotsLength: shots.length
  // });

  // 组件挂载时，如果有 taskId 但没有 storyboard，从历史记录恢复
  useEffect(() => {
    const restoreStoryboard = async () => {
      if (taskId && !hasStoryboard) {
        try {
          const task = await restoreTaskFromHistory(taskId);
          if (task?.storyboard) {
            setStoryboard(task.storyboard);
          }
        } catch (err) {
          // console.warn('恢复 storyboard 失败:', err);
          // Suppress unused variable warning
          void err;
        }
      }
    };
    restoreStoryboard();
  }, [taskId, hasStoryboard]);

  // 当有 taskId 时，获取宫格图
  useEffect(() => {
    const loadGridImage = async () => {
      if (taskId && !gridImage) {
        setLoadingGrid(true);
        try {
          const response = await getTaskGridImage(taskId);
          if (response?.grid_image) {
            setGridImage(response.grid_image);
            // console.log('[StepSegment] 成功获取宫格图，长度:', response.grid_image.length);
          }
        } catch (err) {
          // console.warn('[StepSegment] 获取宫格图失败:', err);
          // Suppress unused variable warning
          void err;
        } finally {
          setLoadingGrid(false);
        }
      }
    };
    loadGridImage();
  }, [taskId]);

  const handleInputChange = (e) => {
    const textarea = e.target;
    setScenePrompt(textarea.value);
    autoResize(textarea, 100);
  };

  const autoResize = (textarea, minHeight) => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(textarea.scrollHeight, minHeight) + 'px';
  };

  // 切换选中状态
  const toggleShotSelection = (shotId) => {
    const newSelected = new Set(selectedShots);
    if (newSelected.has(shotId)) {
      newSelected.delete(shotId);
    } else {
      newSelected.add(shotId);
    }
    setSelectedShots(newSelected);
  };

  // 切换展开状态
  const toggleShotExpansion = (shotId) => {
    const newExpanded = new Set(expandedShots);
    if (newExpanded.has(shotId)) {
      newExpanded.delete(shotId);
    } else {
      newExpanded.add(shotId);
    }
    setExpandedShots(newExpanded);
  };

  // 计算网格布局（5x5）
  const gridLayout = useMemo(() => {
    const layout = storyboard?.grid_layout || '5x5';
    const [rows, cols] = layout.split('x').map(Number);
    return { rows, cols, total: rows * cols };
  }, [storyboard]);

  // 计算 shot 在宫格图中的位置（用于 background-position）
  const getShotPosition = (shotNumber) => {
    // shotNumber 格式: "Shot_1", "Shot_2", ... "Shot_25"
    const index = parseInt(shotNumber.replace('Shot_', '')) - 1;
    const row = Math.floor(index / gridLayout.cols);
    const col = index % gridLayout.cols;
    return { row, col, index };
  };

  // 计算 background-position 百分比
  const getBackgroundPosition = (shotNumber) => {
    const { row, col } = getShotPosition(shotNumber);
    // 5x5 网格，每个格子占 20%
    const percentX = col * (100 / (gridLayout.cols - 1));
    const percentY = row * (100 / (gridLayout.rows - 1));
    return `${percentX}% ${percentY}%`;
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedShots.size === shots.length) {
      setSelectedShots(new Set());
    } else {
      setSelectedShots(new Set(shots.map(s => s.id)));
    }
  };

  // 确认并继续
  const handleConfirm = () => {
    // 将选中的 shots 转换为 scripts 格式
    const selectedScripts = shots
      .filter(shot => selectedShots.has(shot.id))
      .map(shot => ({
        id: shot.id,
        sceneId: shot.id,
        content: shot.prompt
      }));

    setGeneratedScripts(selectedScripts);
    setCurrentStep(WorkflowSteps.RESULTS);
  };

  // 测试模式：生成 25 个测试 shot
  const displayShots = useMemo(() => {
    if (hasStoryboard) return shots;
    // 没有数据时，生成 25 个测试 shot
    return Array.from({ length: 25 }, (_, i) => ({
      id: `Shot_${i + 1}`,
      number: i + 1,
      angle: 'Test View',
      prompt: `Test prompt for shot ${i + 1}`
    }));
  }, [hasStoryboard, shots]);

  return (
    <ChatMessage stepId="step-segment" visible={visible}>
      <Card className="chat-bubble">
        <Card.Header style={{ justifyContent: 'space-between' }}>
          <Card.Title>25镜头 (Storyboard)</Card.Title>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>
              已选 {selectedShots.size} / {displayShots.length}
            </span>
            <Button variant="secondary" size="small" onClick={handleSelectAll}>
              {selectedShots.size === displayShots.length ? '取消全选' : '全选'}
            </Button>
          </div>
        </Card.Header>
        <Card.Body style={{ flexGrow: 0 }}>
          <p className="step-description">
            AI 已为你生成了 {displayShots.length} 个分镜脚本。请选择需要的分镜，然后点击确认继续。
          </p>

   

          {/* 分镜列表 */}
          <div className="shots-list">
            {displayShots.map((shot) => (
              <div
                key={shot.id}
                className={`shot-item ${selectedShots.has(shot.id) ? 'selected' : ''}`}
              >
                <div className="shot-header" onClick={() => toggleShotExpansion(shot.id)}>
                  <label className="shot-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedShots.has(shot.id)}
                      onChange={() => toggleShotSelection(shot.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="shot-number">{shot.number}</span>
                  </label>
                  <span className="shot-angle">{shot.angle}</span>
                  <span className="shot-expand">{expandedShots.has(shot.id) ? '▼' : '▶'}</span>
                </div>

                {/* shot 图片预览 - 从宫格图切割对应部分 */}
                <div
                  className="shot-image"
                  style={{
                    // 优先使用后端返回的宫格图，如果没有或出错则使用测试图片
                    backgroundImage: gridImage ? `url(${gridImage})` : `url(/Gemini_Generated_Image_g04f8dg04f8dg04f.png)`,
                    backgroundPosition: getBackgroundPosition(shot.id),
                    backgroundSize: `${gridLayout.cols * 100}% ${gridLayout.rows * 100}%`
                  }}
                />

                {expandedShots.has(shot.id) && (
                  <div className="shot-prompt">
                    {shot.prompt}
                  </div>
                )}
              </div>
            ))}
          </div>

         

          {/* 参考图片上传 */}
          <RefImageDropZone
            images={sceneRefImages}
            onAdd={addSceneRefImage}
            onRemove={removeSceneRefImage}
            placeholder="请上传场景参考图 (点击或拖拽上传)"
          />

          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              onClick={handleConfirm}
              disabled={selectedShots.size === 0}
            >
              确认选择 ({selectedShots.size}) →
            </Button>
          </div>
        </Card.Body>
      </Card>
    </ChatMessage>
  );
};

export default StepSegment;
