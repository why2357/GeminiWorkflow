import React from 'react';
import './Button.css';

// 按钮变体
const Button = ({
  children,
  variant = 'primary',    // primary | secondary | danger-ghost
  size = 'medium',        // small | medium | large
  onClick,
  disabled = false,
  loading = false,
  type = 'button',
  className = '',
  style = {},
  ...props
}) => {
  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    (disabled || loading) ? 'btn-disabled' : '',
    loading ? 'btn-loading' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classes}
      onClick={loading ? undefined : onClick}
      disabled={disabled || loading}
      style={style}
      {...props}
    >
      {loading && (
        <span className="btn-loading-spinner">
          <span />
          <span />
          <span />
        </span>
      )}
      <span className="btn-content" style={{ opacity: loading ? 0.7 : 1 }}>
        {children}
      </span>
    </button>
  );
};

export default Button;
