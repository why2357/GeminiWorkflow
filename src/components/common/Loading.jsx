import React from 'react';
import './Loading.css';

/**
 * 加载状态组件
 */
const Loading = ({
  variant = 'spinner',
  size = 'md',
  text = '',
  fullScreen = false,
  className = ''
}) => {
  const content = (
    <div className={`loading-container loading-${variant} loading-${size} ${className}`}>
      {variant === 'spinner' && <div className="loading-spinner" />}
      {variant === 'dots' && (
        <div className="loading-dots">
          <span />
          <span />
          <span />
        </div>
      )}
      {variant === 'pulse' && <div className="loading-pulse" />}
      {variant === 'bar' && <div className="loading-bar" />}
      {variant === 'bounce' && (
        <div className="loading-bounce">
          <div />
          <div />
          <div />
        </div>
      )}
      {text && <p className="loading-text">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return <div className="loading-fullscreen">{content}</div>;
  }

  return content;
};

/**
 * 内联加载指示器（小尺寸）
 */
export const LoadingInline = ({ text = '' }) => (
  <Loading variant="dots" size="sm" text={text} />
);

/**
 * 全屏加载遮罩
 */
export const LoadingOverlay = ({ text = '加载中...' }) => (
  <Loading variant="spinner" size="lg" text={text} fullScreen />
);

/**
 * 按钮加载状态
 */
export const LoadingButton = ({ loading, children, ...props }) => (
  <button {...props} disabled={loading || props.disabled}>
    {loading ? <Loading variant="dots" size="sm" /> : children}
  </button>
);

export default Loading;
