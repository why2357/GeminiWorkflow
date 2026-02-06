import React from 'react';
import { DndContext } from '@dnd-kit/core';
import './AppLayout.css';

const AppLayout = ({
  leftSidebar,
  rightSidebar,
  children,  // 中间区域内容
  onDragEnd, // 拖拽结束回调
  sensors    // 拖拽传感器配置
}) => {
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
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
    </DndContext>
  );
};

export default AppLayout;
