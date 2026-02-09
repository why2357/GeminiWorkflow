import React from 'react';
import './Modal.css';

/**
 * 通用模态框组件 - 按照宫格.html样式
 * @param {boolean} open - 是否打开模态框
 * @param {function} onClose - 关闭回调
 * @param {string} title - 模态框标题
 * @param {React.ReactNode} children - 内容
 * @param {React.ReactNode} footer - 底部内容
 * @param {string} size - 模态框大小 'sm' | 'md' | 'lg' | 'full'
 * @param {string} className - 额外的类名
 */
const Modal = ({
  open = false,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className = ''
}) => {
  if (!open) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose?.();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose?.();
    }
  };

  React.useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div
      className={`modal-overlay ${open ? 'active' : ''} ${className}`}
      onClick={handleOverlayClick}
    >
      <div className={`modal modal-${size}`}>
        {/* Header */}
        {title && (
          <div className="modal-header">
            <span>{title}</span>
            <button className="danger-ghost" onClick={onClose}>
              ×
            </button>
          </div>
        )}

        {/* Body */}
        {children && <div className="modal-body">{children}</div>}

        {/* Footer */}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
