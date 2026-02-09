import React, { useState, useEffect, useRef } from 'react';
import Modal from './common/Modal';
import { useWorkflowStore } from '../store/useWorkflowStore';
import './CollageModal.css';

/**
 * 宫格拼合模态框 - 按照宫格.html样式
 * 支持将已选分镜图片拖拽拼合成宫格并导出
 */
const CollageModal = ({ open, onClose }) => {
  const { globalSelectedList } = useWorkflowStore();
  const [gridSize, setGridSize] = useState('3x3');
  const [collageImages, setCollageImages] = useState({});

  // 根据图片数量自动选择合适的宫格大小
  useEffect(() => {
    if (open && globalSelectedList.length > 0) {
      const count = globalSelectedList.length;
      let size = '3x3'; // 默认

      if (count <= 4) size = '2x2';
      else if (count <= 6) size = '2x3';
      else if (count <= 9) size = '3x3';
      else if (count <= 16) size = '4x4';
      else size = '5x5';

      setGridSize(size);
    }
  }, [open, globalSelectedList.length]);

  // 当宫格大小改变时，自动填充图片
  useEffect(() => {
    if (open && globalSelectedList.length > 0) {
      const [rows, cols] = gridSize.split('x').map(Number);
      const totalCells = rows * cols;

      const newCollageImages = {};
      for (let i = 0; i < Math.min(totalCells, globalSelectedList.length); i++) {
        newCollageImages[i] = globalSelectedList[i].src;
      }
      setCollageImages(newCollageImages);
    }
  }, [gridSize, open, globalSelectedList]);

  const [rows, cols] = gridSize.split('x').map(Number);
  const totalCells = rows * cols;
  const canvasRef = useRef(null);

  // 处理拖拽开始
  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', index);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // 处理拖拽放置
  const handleDrop = (e, cellIndex) => {
    e.preventDefault();
    const sourceIndex = e.dataTransfer.getData('text/plain');

    if (sourceIndex !== '') {
      const sourceItem = globalSelectedList[parseInt(sourceIndex)];
      if (sourceItem) {
        setCollageImages(prev => ({
          ...prev,
          [cellIndex]: sourceItem.src
        }));
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // 清除单元格图片
  const handleClearCell = (cellIndex) => {
    setCollageImages(prev => {
      const newImages = { ...prev };
      delete newImages[cellIndex];
      return newImages;
    });
  };

  // 导出宫格图片
  const handleExport = async () => {
    const canvas = document.createElement('canvas');
    const tileW = 1280; // 高清宽度
    const tileH = tileW * (9 / 16);

    canvas.width = cols * tileW;
    canvas.height = rows * tileH;
    const ctx = canvas.getContext('2d');

    // 绘制白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 加载并绘制所有图片
    const images = Object.entries(collageImages).map(([cellIndex, src]) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve({ cellIndex: parseInt(cellIndex), img });
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
      });
    });

    try {
      const loadedImages = await Promise.all(images);

      loadedImages.forEach(({ cellIndex, img }) => {
        const row = Math.floor(cellIndex / cols);
        const col = cellIndex % cols;
        ctx.drawImage(img, col * tileW, row * tileH, tileW, tileH);
      });

      // 下载图片
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Collage_${gridSize}_${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败，请重试');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🧩 宫格拼合导出"
      size="full"
    >
      <div className="collage-content">
        {/* 左侧：素材列表 */}
        <div className="collage-sidebar">
          <div className="collage-sidebar-header">
            <span>可选素材</span>
            <span className="collage-sidebar-hint">拖拽至右侧</span>
          </div>
          <div className="collage-source-list">
            {globalSelectedList.map((item, index) => (
              <div
                key={item.instanceId}
                className="source-item"
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
              >
                <img src={item.src} alt={`素材 ${index + 1}`} />
                <div className="tile-badge">#{index + 1}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：画布区域 */}
        <div className="collage-canvas-area">
          <div className="collage-controls">
            <div className="collage-controls-left">
              <span className="collage-controls-label">布局设置:</span>
              <select
                value={gridSize}
                onChange={(e) => setGridSize(e.target.value)}
                className="collage-grid-select"
              >
                <option value="2x2">2 x 2 (四宫格)</option>
                <option value="2x3">2 x 3 (六宫格)</option>
                <option value="3x3">3 x 3 (九宫格)</option>
                <option value="4x4">4 x 4 (十六宫格)</option>
                <option value="5x5">5 x 5 (二十五宫格)</option>
              </select>
            </div>
            <button className="primary" onClick={handleExport}>
              🖼️ 导出完整图片
            </button>
          </div>

          <div className="collage-canvas">
            <div
              className="collage-container"
              style={{
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, 1fr)`
              }}
            >
              {Array.from({ length: totalCells }).map((_, index) => (
                <div
                  key={index}
                  className="collage-cell"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                >
                  {collageImages[index] ? (
                    <>
                      <img src={collageImages[index]} alt={`宫格 ${index + 1}`} />
                      <button
                        className="collage-cell-clear"
                        onClick={() => handleClearCell(index)}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <div className="collage-cell-placeholder">拖拽图片到此处</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CollageModal;
