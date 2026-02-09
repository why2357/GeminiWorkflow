import React from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import './AppLayout.css';

const AppLayout = ({
  leftSidebar,
  rightSidebar,
  children,  // 中间区域内容
  onDragStart, // 拖拽开始回调 - 按照宫格.html样式
  onDragEnd, // 拖拽结束回调
  sensors,   // 拖拽传感器配置
  dropAnimation, // 放置动画配置
  activeDragData // 当前拖拽的数据，用于显示拖拽预览
}) => {
  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      dropAnimation={dropAnimation}
    >
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
      {/* 拖拽预览 - 必须在 DndContext 内部 */}
      <DragOverlay>
        {activeDragData && activeDragData.src ? (
          <div style={{
            position: 'relative',
            width: '160px',
            height: '90px',
            opacity: 0.8,
            border: '2px solid #a855f7',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
            background: 'white',
            pointerEvents: 'none',
          }}>
            <img
              src={activeDragData.src}
              alt="拖拽预览"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
            {activeDragData.shotNumber && (
              <div style={{
                position: 'absolute',
                bottom: '4px',
                left: '4px',
                background: 'rgba(168, 85, 247, 0.95)', // 紫色背景
                color: 'white',
                fontSize: '11px',
                fontWeight: 'bold',
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              }}>
                #{activeDragData.shotNumber}
              </div>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default AppLayout;
