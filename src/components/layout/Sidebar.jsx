import React from 'react';
import './Sidebar.css';

const Sidebar = ({
  position = 'left',      // left | right
  header,
  footer,
  children,
  className = ''
}) => {
  const classes = [
    'sidebar',
    position === 'right' ? 'sidebar-right' : 'sidebar-left',
    className
  ].filter(Boolean).join(' ');

  return (
    <aside className={classes}>
      {/* 侧边栏头部 */}
      {header && <div className="sidebar-header">{header}</div>}

      {/* 侧边栏内容区 */}
      <div className="sidebar-content">
        {children}
      </div>

      {/* 侧边栏底部 */}
      {footer && <div className="sidebar-footer">{footer}</div>}
    </aside>
  );
};

export default Sidebar;
