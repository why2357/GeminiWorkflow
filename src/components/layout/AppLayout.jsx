import React from 'react';
import './AppLayout.css';

const AppLayout = ({
  leftSidebar,
  rightSidebar,
  children  // 中间区域内容
}) => {
  return (
    <div className="app-layout">
      {/* 左侧边栏 */}
      {leftSidebar && (
        <aside className="sidebar sidebar-left">
          {leftSidebar}
        </aside>
      )}

      {/* 中间主要工作区 */}
      <main className="center-column">
        {children}
      </main>

      {/* 右侧边栏 */}
      {rightSidebar && (
        <aside className="sidebar sidebar-right">
          {rightSidebar}
        </aside>
      )}
    </div>
  );
};

export default AppLayout;
