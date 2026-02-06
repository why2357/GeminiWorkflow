import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { WorkflowSteps } from '../../store/useWorkflowStore';
import Card from '../common/Card';
import Button from '../common/Button';
import ChatMessage from './ChatMessage';
import { generateGrid, restoreTaskFromHistory, getTaskGridImage } from '../../services/api';
import Loading from '../common/Loading';
import './StepWorkspace.css';

const StepWorkspace = ({ visible = true }) => {
  const {
    storyboard,
    taskId,
    generatedScripts,
    currentImage,
    setCurrentImage,
    tiles,
    setTiles,
    selectedTileIds,
    toggleTileSelection,
    clearTileSelection,
    addToSelectedList,
    setCurrentStep,
    setStoryboard
  } = useWorkflowStore();

  const [viewMode, setViewMode] = useState('upload'); // upload | grid
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gridImage, setGridImage] = useState(null);
  const fileInputRef = useRef(null);

  // 计算网格布局（根据 storyboard.grid_layout）
  const gridLayout = useMemo(() => {
    const layout = storyboard?.grid_layout || '5x5';
    const [rows, cols] = layout.split('x').map(Number);
    return { rows, cols, total: rows * cols };
  }, [storyboard]);

  // 是否有 storyboard 数据
  const hasStoryboard = !!storyboard && !!taskId;

  // 检查 storyboard 是否完整（包含 prompt_text）
  const isStoryboardIncomplete = useMemo(() => {
    if (!storyboard?.shots) return false;
    // 检查第一个 shot 是否有 prompt_text
    return !storyboard.shots[0]?.prompt_text;
  }, [storyboard]);

  // 组件挂载时，如果 storyboard 不完整，从历史记录恢复
  useEffect(() => {
    const restoreStoryboard = async () => {
      if (hasStoryboard && isStoryboardIncomplete && taskId) {
        try {
          const task = await restoreTaskFromHistory(taskId);
          if (task?.storyboard) {
            setStoryboard(task.storyboard);
          }
        } catch (err) {
          // console.warn('恢复 storyboard 失败:', err);
        }
      }
    };
    restoreStoryboard();
  }, [hasStoryboard, isStoryboardIncomplete, taskId]);

  // 当 taskId 切换时，重置宫格图和视图模式
  useEffect(() => {
    // console.log('[StepWorkspace taskId 切换] 重置宫格图状态, 新 taskId:', taskId);
    setGridImage(null);
    setTiles([]);
    setViewMode('upload');
    clearTileSelection();
  }, [taskId, clearTileSelection]);

  // 组件挂载时，尝试从历史记录恢复宫格图，或重新生成
  useEffect(() => {
    const restoreOrGenerate = async () => {
      // console.log('[StepWorkspace restoreOrGenerate] 开始检查, hasStoryboard:', hasStoryboard, 'isStoryboardIncomplete:', isStoryboardIncomplete, 'gridImage:', !!gridImage, 'loading:', loading, 'taskId:', taskId);

      // 只在有完整 storyboard 且没有宫格图时执行
      if (hasStoryboard && !isStoryboardIncomplete && !gridImage && !loading) {
        // console.log('[StepWorkspace restoreOrGenerate] 条件满足，尝试从历史记录获取宫格图');

        // 先尝试从历史记录获取已生成的宫格图
        try {
          const response = await getTaskGridImage(taskId);
          // console.log('[StepWorkspace restoreOrGenerate] getTaskGridImage 响应:', response);
          // console.log('[StepWorkspace restoreOrGenerate] response.grid_image 存在?', !!response?.grid_image);

          if (response?.grid_image) {
            // 找到已生成的宫格图，直接使用
            // console.log('[StepWorkspace restoreOrGenerate] 找到已生成的宫格图，直接使用');
            setGridImage(response.grid_image);
            generateVirtualTiles(response.grid_image);
            setViewMode('grid');
            return;
          } else {
            // console.log('[StepWorkspace restoreOrGenerate] 历史记录中没有 grid_image');
          }
        } catch (err) {
          // 历史记录中没有宫格图，继续生成
          // console.warn('[StepWorkspace restoreOrGenerate] 从历史记录获取宫格图失败:', err);
        }

        // 没有找到已生成的宫格图，调用生成接口
        // console.log('[StepWorkspace restoreOrGenerate] 没有找到已生成的宫格图，调用生成接口');
        handleGenerateGrid();
      } else {
        // console.log('[StepWorkspace restoreOrGenerate] 条件不满足，跳过');
      }
    };
    restoreOrGenerate();
  }, [hasStoryboard, isStoryboardIncomplete, taskId]); // 添加 taskId 依赖，切换任务时重新加载宫格图

  // 生成宫格图
  const handleGenerateGrid = async () => {
    // console.log('[StepWorkspace handleGenerateGrid] 开始生成宫格图, storyboard:', !!storyboard, 'taskId:', taskId);

    if (!storyboard || !taskId) {
      // console.error('[StepWorkspace handleGenerateGrid] 缺少数据');
      setError('缺少分镜脚本数据，请先完成前面的步骤');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // console.log('[StepWorkspace handleGenerateGrid] 调用 generateGrid API');
      const response = await generateGrid(storyboard, taskId);

      // console.log('[StepWorkspace handleGenerateGrid] generateGrid 响应:', response);
      // console.log('[StepWorkspace handleGenerateGrid] response.grid_image 存在?', !!response?.grid_image);
      // console.log('[StepWorkspace handleGenerateGrid] response.error:', response?.error);

      // 检查响应是否包含 grid_image（成功标志）
      if (response.grid_image) {
        // 后端已返回完整的 data URL，直接使用
        const fullGridImage = response.grid_image;
        // console.log('[StepWorkspace handleGenerateGrid] 成功获取宫格图，长度:', fullGridImage.length);

        // 设置宫格图
        setGridImage(fullGridImage);

        // 使用虚拟网格切片（从宫格图提取），避免加载 25 张独立 4K 图片
        // 这样只需要加载一张宫格图（约 5-10MB），而不是 25 张独立图（125-250MB）
        generateVirtualTiles(fullGridImage);

        // 切换到网格视图
        setViewMode('grid');
        // console.log('[StepWorkspace handleGenerateGrid] 宫格图设置完成');
      } else {
        // console.error('[StepWorkspace handleGenerateGrid] 响应中没有 grid_image');
        setError(response.error || '生成宫格图失败，请重试');
      }
    } catch (err) {
      // console.error('[StepWorkspace handleGenerateGrid] 生成宫格图失败:', err);
      setError(err.message || '网络错误，请检查连接');
    } finally {
      setLoading(false);
    }
  };

  // 生成虚拟切片（使用 background-position）
  const generateVirtualTiles = (imgSrc) => {
    const { rows, cols } = gridLayout;
    const newTiles = [];

    // 确保 imgSrc 是完整的 data URL
    let fullImgSrc = imgSrc || gridImage;
    if (fullImgSrc && typeof fullImgSrc === 'string' && !fullImgSrc.startsWith('data:')) {
      fullImgSrc = `data:image/png;base64,${fullImgSrc}`;
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        newTiles.push({
          id: `${row}-${col}`,
          src: fullImgSrc,
          row,
          col,
          shotNumber: row * cols + col + 1
        });
      }
    }
    setTiles(newTiles);
  };

  // 处理图片上传（备用方案）
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setCurrentImage(event.target.result);
      generateVirtualTiles(event.target.result);
      setViewMode('grid');
    };
    reader.readAsDataURL(file);
  };

  // 切换图块选择
  const handleTileClick = (tileId) => {
    toggleTileSelection(tileId);
  };

  // 确认选择
  const handleConfirmSelection = () => {
    const selectedTiles = tiles.filter(t => selectedTileIds.has(t.id));

    // 获取对应的 shot 信息
    selectedTiles.forEach((tile) => {
      const shotIndex = tile.shotNumber - 1;
      const shot = storyboard?.shots?.[shotIndex];

      addToSelectedList({
        instanceId: `${Date.now()}-${tile.id}`,
        tileId: tile.id,
        src: tile.src,
        badge: shot ? `${shot.angle_type}` : `切片 ${tile.shotNumber}`,
        shotNumber: shot?.shot_number || tile.shotNumber
      });
    });

    clearTileSelection();
    setCurrentStep(WorkflowSteps.RESULTS);
  };

  // 重新生成
  const handleRegenerate = () => {
    handleGenerateGrid();
  };

  // 重新上传
  const handleReupload = () => {
    setViewMode('upload');
    setCurrentImage(null);
    setGridImage(null);
    setTiles([]);
    clearTileSelection();
  };

  const hasSelection = selectedTileIds.size > 0;

  // 加载状态
  if (loading) {
    return (
      <ChatMessage stepId="step-workspace" visible={visible}>
        <Card className="chat-bubble flex-grow">
          <Card.Header>
            <Card.Title>交互式工作台</Card.Title>
          </Card.Header>
          <Card.Body style={{ padding: 0, position: 'relative' }}>
            <div className="loading-zone">
              <Loading variant="spinner" text="AI 正在生成分镜宫格图..." />
            </div>
          </Card.Body>
        </Card>
      </ChatMessage>
    );
  }

  return (
    <ChatMessage stepId="step-workspace" visible={visible}>
      <Card className="chat-bubble flex-grow">
        <Card.Header style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Card.Title>交互式工作台</Card.Title>
            <span style={{ marginLeft: '8px', fontSize: '0.85rem', color: 'var(--text-sub)' }}>
              ({gridLayout.rows}×{gridLayout.cols} 网格)
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {hasSelection && (
              <Button onClick={handleConfirmSelection}>
                ✅ 确认选择 ({selectedTileIds.size})
              </Button>
            )}
            {gridImage && (
              <Button variant="secondary" onClick={handleRegenerate}>
                🔄 重新生成
              </Button>
            )}
            <Button variant="secondary" onClick={handleReupload}>
              📂 上传图片
            </Button>
          </div>
        </Card.Header>
        <Card.Body style={{ padding: 0, position: 'relative' }}>
          {/* 错误提示 */}
          {error && (
            <div className="error-overlay">
              <div className="error-content">
                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚠️</div>
                <div style={{ fontWeight: 600, marginBottom: '8px' }}>生成失败</div>
                <div style={{ color: 'var(--text-sub)', marginBottom: '16px' }}>{error}</div>
                <Button onClick={handleRegenerate}>重试</Button>
              </div>
            </div>
          )}

          {/* 上传视图 */}
          {viewMode === 'upload' && (
            <div className="upload-zone">
              <input
                ref={fileInputRef}
                type="file"
                id="imageUpload"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
              <div style={{ fontSize: '2rem', marginBottom: '10px' }}>📂</div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>点击上传图片</div>
              <div style={{ color: 'var(--text-sub)', fontSize: '0.85rem' }}>或拖拽文件到此处</div>
              <Button
                style={{ marginTop: '16px' }}
                onClick={() => fileInputRef.current?.click()}
              >
                选择文件
              </Button>
            </div>
          )}

          {/* 网格视图 */}
          {viewMode === 'grid' && tiles.length > 0 && (
            <div className="grid-container">
              <div
                className="interactive-grid"
                style={{
                  gridTemplateColumns: `repeat(${gridLayout.cols}, 1fr)`,
                  gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)`
                }}
              >
                {tiles.map((tile) => {
                  const xPercent = gridLayout.cols > 1 ? (tile.col / (gridLayout.cols - 1)) * 100 : 0;
                  const yPercent = gridLayout.rows > 1 ? (tile.row / (gridLayout.rows - 1)) * 100 : 0;

                  return (
                    <div
                      key={tile.id}
                      className={`tile ${selectedTileIds.has(tile.id) ? 'selected' : ''}`}
                      onClick={() => handleTileClick(tile.id)}
                      style={{
                        backgroundImage: `url(${tile.src})`,
                        backgroundPosition: `${xPercent}% ${yPercent}%`,
                        backgroundSize: `${gridLayout.cols * 100}% ${gridLayout.rows * 100}%`
                      }}
                    >
                      <div className="tile-number">{tile.shotNumber}</div>
                      {selectedTileIds.has(tile.id) && (
                        <div className="tile-check">✓</div>
                      )}
                    </div>
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

export default StepWorkspace;
