import React from 'react';
import './Skeleton.css';

/**
 * 骨架屏组件 - 用于内容加载时的占位显示
 */
const Skeleton = ({ variant = 'text', width, height, className = '', count = 1 }) => {
  const items = Array.from({ length: count }, (_, i) => i);

  const getStyle = () => {
    const style = {};
    if (width) style.width = typeof width === 'number' ? `${width}px` : width;
    if (height) style.height = typeof height === 'number' ? `${height}px` : height;
    return style;
  };

  const renderSkeleton = () => {
    switch (variant) {
      case 'circle':
        return <div className={`skeleton skeleton-circle ${className}`} style={getStyle()} />;
      case 'rect':
        return <div className={`skeleton skeleton-rect ${className}`} style={getStyle()} />;
      case 'card':
        return (
          <div className={`skeleton-card ${className}`}>
            <div className="skeleton skeleton-card-header" />
            <div className="skeleton skeleton-card-body" />
          </div>
        );
      case 'avatar':
        return <div className={`skeleton skeleton-avatar ${className}`} />;
      case 'button':
        return <div className={`skeleton skeleton-button ${className}`} style={getStyle()} />;
      case 'image':
        return <div className={`skeleton skeleton-image ${className}`} style={getStyle()} />;
      case 'list':
        return (
          <div className={`skeleton-list ${className}`}>
            {items.map((i) => (
              <div key={i} className="skeleton-list-item">
                <div className="skeleton skeleton-list-item-avatar" />
                <div className="skeleton skeleton-list-item-content" />
              </div>
            ))}
          </div>
        );
      case 'chat':
        return (
          <div className={`skeleton-chat ${className}`}>
            <div className="skeleton skeleton-chat-avatar" />
            <div className="skeleton skeleton-chat-content">
              <div className="skeleton skeleton-chat-title" />
              <div className="skeleton skeleton-chat-line" />
              <div className="skeleton skeleton-chat-line-short" />
            </div>
          </div>
        );
      default: // text
        return <div className={`skeleton skeleton-text ${className}`} style={getStyle()} />;
    }
  };

  return renderSkeleton();
};

/**
 * 文本骨架屏组合
 */
export const SkeletonText = ({ lines = 3, className = '' }) => (
  <div className={`skeleton-text-group ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        variant="text"
        className={i === lines - 1 ? 'skeleton-text-short' : ''}
      />
    ))}
  </div>
);

/**
 * 卡片骨架屏组合
 */
export const SkeletonCard = ({ className = '' }) => (
  <div className={`skeleton ${className}`}>
    <div className="skeleton-card-header">
      <Skeleton variant="rect" width={120} height={20} />
    </div>
    <div className="skeleton-card-body">
      <SkeletonText lines={4} />
    </div>
  </div>
);

/**
 * 聊天消息骨架屏组合
 */
export const SkeletonChat = ({ className = '' }) => (
  <Skeleton variant="chat" className={className} />
);

export default Skeleton;
