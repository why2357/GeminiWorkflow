import React, { useState, useEffect, useRef } from 'react';
import Modal from './common/Modal';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { useDraggable } from '@dnd-kit/core';
import './GridDisplayModal.css';

/**
 * 宫格展示模态框 - 按照宫格.html样式
 * 用于展示25张宫格图片并支持拖拽到左侧边栏
 */
const GridDisplayModal = ({ open, onClose }) => {
  const {
    splitsImages,
    storyboard,
    addToSelectedList
  } = useWorkflowStore();

  const [excludedImageIds, setExcludedImageIds] = useState(new Set());
  const [localImages, setLocalImages] = useState([]);
  const gridImageInputRef = useRef(null);

  // 当 splitsImages 变化时，初始化本地状态
  useEffect(() => {
    setExcludedImageIds(new Set());
    setLocalImages((splitsImages || []).map((src, originalIndex) => ({
      src,
      originalIndex
    })));
  }, [splitsImages]);

  // 切换图片排除状态
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
    localImages.forEach(({ src, originalIndex }) => {
      if (!excludedImageIds.has(originalIndex)) {
        const shotInfo = storyboard?.shots?.[originalIndex];
        addToSelectedList({
          instanceId: `${Date.now()}-${originalIndex}`,
          tileId: `grid-${originalIndex}`,
          src: src,
          badge: shotInfo ? `${shotInfo.angle_type}` : `分镜 ${originalIndex + 1}`,
          shotNumber: shotInfo?.shot_number || originalIndex + 1
        });
      }
    });

    // 关闭模态框
    onClose();
  };

  // 本地导入宫格图
  const handleLocalGridImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const rows = 5;
        const cols = 5;
        const tileWidth = img.width / cols;
        const tileHeight = img.height / rows;

        const splitImages = [];

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
        const { setSplitsImages } = useWorkflowStore.getState();
        setSplitsImages(splitImages);

        // 重置排除状态
        setExcludedImageIds(new Set());
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);

    if (gridImageInputRef.current) {
      gridImageInputRef.current.value = '';
    }
  };

  // 计算未被排除的图片数量
  const selectedCount = localImages.length - excludedImageIds.size;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🖼️ 分镜画面 (25张)"
      size="lg"
    >
      <div className="grid-display-content">
        {/* 顶部工具栏 */}
        <div className="grid-display-toolbar">
          <span className="grid-display-count">
            已选 {selectedCount} / {localImages.length} 张
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              ref={gridImageInputRef}
              type="file"
              accept="image/*"
              onChange={handleLocalGridImport}
              style={{ display: 'none' }}
            />
            <button
              className="secondary"
              onClick={() => gridImageInputRef.current?.click()}
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
            >
              📁 本地导入
            </button>
          </div>
        </div>

        {/* 网格展示 */}
        <div className="grid-display-grid">
          {localImages.map(({ src, originalIndex }, index) => (
            <DraggableGridImage
              key={`grid-image-${index}`}
              src={src}
              originalIndex={originalIndex}
              isExcluded={excludedImageIds.has(originalIndex)}
              onToggleExclude={handleToggleExclude}
            />
          ))}
        </div>

        {/* 提示信息 */}
        <div className="grid-display-hint">
          💡 点击图片可切换选中状态（变灰表示不选中），拖拽图片到左侧边栏可单独添加
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="grid-display-footer">
        <button className="secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          onClick={handleConfirmSelection}
          disabled={selectedCount === 0}
        >
          ✅ 确认选择 ({selectedCount})
        </button>
      </div>
    </Modal>
  );
};

// 可拖拽的网格图片组件 - 按照宫格.html样式
const DraggableGridImage = ({ src, originalIndex, isExcluded, onToggleExclude }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useDraggable({
    id: `grid-image-${originalIndex}`,
    data: {
      id: `grid-image-${originalIndex}`,
      originalIndex,
      src
    }
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    // 按照宫格.html样式：拖拽时原位置保持完全可见
    opacity: 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 1000 : 'auto'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid-image-item ${isExcluded ? 'is-excluded' : ''} ${isDragging ? 'sortable-ghost' : ''}`}
      onClick={() => onToggleExclude(originalIndex)}
      data-index={originalIndex}
      {...attributes}
      {...listeners}
    >
      <img src={src} alt={`分镜 ${originalIndex + 1}`} />
      <div className="grid-image-number">{originalIndex + 1}</div>
      {isExcluded && (
        <div className="grid-image-excluded-badge">已排除</div>
      )}
    </div>
  );
};

export default GridDisplayModal;
