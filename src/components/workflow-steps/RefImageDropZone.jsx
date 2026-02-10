import React, { useRef, useState, useEffect } from 'react';
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
  const imagesRef = useRef(images);
  const [isDragging, setIsDragging] = useState(false);

  // 同步最新的 images 到 ref
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    console.log('📁 [RefImageDropZone] 选择了文件:', files.map(f => ({
      name: f.name,
      size: f.size,
      type: f.type
    })));
    console.log('📷 [RefImageDropZone] 当前已上传图片数量:', imagesRef.current.length);

    // 收集所有要上传的图片，避免重复
    const imagesToAdd = [];
    const currentImages = imagesRef.current;

    files.forEach(file => {
      if (!file.type.startsWith('image/')) {
        console.warn(`⚠️ [RefImageDropZone] 跳过非图片文件:`, file.name);
        return;
      }

      // 检查文件名是否已存在
      const isDuplicate = currentImages.some(img => img.name === file.name);
      if (isDuplicate) {
        console.warn(`⚠️ [RefImageDropZone] 文件已存在，跳过:`, file.name);
        return;
      }

      // 生成唯一 ID
      const uniqueId = `${file.name}_${file.size}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const reader = new FileReader();
      reader.onload = (e) => {
        const imageData = {
          id: uniqueId,
          src: e.target.result,
          name: file.name
        };
        console.log('✅ [RefImageDropZone] 图片读取完成:', imageData.name, imageData.id);
        onAdd?.(imageData);
      };
      reader.readAsDataURL(file);
    });

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
    console.log('📁 [RefImageDropZone] 拖拽上传文件:', files.map(f => ({
      name: f.name,
      size: f.size,
      type: f.type
    })));
    console.log('📷 [RefImageDropZone] 当前已上传图片数量:', imagesRef.current.length);

    const currentImages = imagesRef.current;

    files.forEach(file => {
      if (!file.type.startsWith('image/')) {
        console.warn(`⚠️ [RefImageDropZone] 跳过非图片文件:`, file.name);
        return;
      }

      // 检查文件名是否已存在
      const isDuplicate = currentImages.some(img => img.name === file.name);
      if (isDuplicate) {
        console.warn(`⚠️ [RefImageDropZone] 文件已存在，跳过:`, file.name);
        return;
      }

      // 生成唯一 ID
      const uniqueId = `${file.name}_${file.size}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const reader = new FileReader();
      reader.onload = (e) => {
        const imageData = {
          id: uniqueId,
          src: e.target.result,
          name: file.name
        };
        console.log('✅ [RefImageDropZone] 图片读取完成:', imageData.name, imageData.id);
        onAdd?.(imageData);
      };
      reader.readAsDataURL(file);
    });
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
