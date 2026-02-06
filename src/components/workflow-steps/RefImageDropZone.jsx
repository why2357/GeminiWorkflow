import React, { useRef, useState } from 'react';
import './RefImageDropZone.css';

const RefImageDropZone = ({
  images = [],
  onAdd,
  onRemove,
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

  return (
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
          <div className="ref-images-list">
            {images.map((image) => (
              <div key={image.id} className="ref-image-item">
                <img src={image.src} alt={image.name} />
                <button
                  className="ref-image-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove?.(image.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="ref-add-more">＋</div>
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
  );
};

export default RefImageDropZone;
