import React, { useRef, useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './RefImageDropZone.css';

// 可排序的图片项组件
const SortableImageItem = ({ image, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="ref-image-item"
    >
      <img src={image.src} alt={image.name} {...attributes} {...listeners} style={{ cursor: 'grab', pointerEvents: isDragging ? 'none' : 'auto' }} />
      <button
        className="ref-image-delete"
        onClick={(e) => {
          e.stopPropagation();
          onRemove?.(image.id);
        }}
        style={{ pointerEvents: 'auto' }}
      >
        ×
      </button>
    </div>
  );
};

const RefImageDropZone = ({
  images = [],
  onAdd,
  onRemove,
  onReorder,
  placeholder = "点击或拖拽上传参考图",
  accept = "image/*"
}) => {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(processFile);
    // 重置 input 以允许重复选择同一文件
    e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    files.forEach(processFile);
  };

  const processFile = (file) => {
    if (!file.type.startsWith('image/')) return;

    // 检查文件名是否已存在
    const isDuplicate = images.some(img => img.name === file.name);
    if (isDuplicate) {
      console.warn(`文件 "${file.name}" 已存在，跳过上传`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = {
        id: Date.now() + Math.random(),
        src: e.target.result,
        name: file.name
      };
      onAdd?.(imageData);
    };
    reader.readAsDataURL(file);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = images.findIndex((img) => img.id === active.id);
      const newIndex = images.findIndex((img) => img.id === over.id);

      const reorderedImages = arrayMove(images, oldIndex, newIndex);
      onReorder?.(reorderedImages);
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div
        className={`ref-drop-zone ${isDragging ? 'dragging' : ''}`}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {images.length === 0 ? (
          <div className="ref-placeholder">
            <span>{placeholder}</span>
          </div>
        ) : (
          <>
            <SortableContext
              items={images.map(img => img.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="ref-images-list">
                {images.map((image) => (
                  <SortableImageItem
                    key={image.id}
                    image={image}
                    onRemove={onRemove}
                  />
                ))}
              </div>
            </SortableContext>
            <div className="ref-add-more" onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}>＋</div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={accept}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </DndContext>
  );
};

export default RefImageDropZone;
