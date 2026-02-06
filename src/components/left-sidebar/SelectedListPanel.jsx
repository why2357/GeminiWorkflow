import React from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import Button from '../common/Button';
import './SelectedListPanel.css';

// 可拖拽的已选项组件
const SortableItem = ({ item, index, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.instanceId });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="selected-item">
      <div className="selected-item-drag" {...attributes} {...listeners}>
        <div className="selected-item-number">{index + 1}</div>
        <img src={item.src} alt={`分镜 ${index + 1}`} className="selected-item-image" />
        {item.badge && (
          <span className="selected-item-badge">{item.badge}</span>
        )}
      </div>
      <button
        className="selected-item-delete"
        onClick={() => onRemove(item.instanceId)}
        title="移除"
      >
        ×
      </button>
    </div>
  );
};

const SelectedListPanel = () => {
  const {
    globalSelectedList,
    clearSelectedList,
    reorderSelectedList,
    removeFromSelectedList
  } = useWorkflowStore();

  const count = globalSelectedList.length;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 需要拖动 8px 才开始拖动
      },
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = globalSelectedList.findIndex((item) => item.instanceId === active.id);
      const newIndex = globalSelectedList.findIndex((item) => item.instanceId === over.id);

      const newList = arrayMove(globalSelectedList, oldIndex, newIndex);
      reorderSelectedList(newList);
    }
  };

  const handleRemove = (instanceId) => {
    removeFromSelectedList(instanceId);
  };

  const handleClear = () => {
    if (count === 0) return;
    if (confirm(`确定要清空已选的 ${count} 个分镜吗？`)) {
      clearSelectedList();
    }
  };

  const handleExport = () => {
    if (count === 0) {
      alert('请先从中间工作区选择分镜图片');
      return;
    }
    // TODO: 实现导出功能（阶段 5）
    alert(`导出 ${count} 个已选分镜（功能待实现）`);
  };

  return (
    <div className="selected-list-panel">
      {/* 头部 */}
      <div className="sidebar-header">
        <span>🎬 已选分镜</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="badge">{count}</span>
          <Button
            variant="secondary"
            size="small"
            onClick={handleClear}
            disabled={count === 0}
            title="清空已选"
          >
            🗑️
          </Button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="sidebar-content">
        {count === 0 ? (
          <div className="sidebar-empty">
            从中间点击图片<br/>添加到此处<br/><br/>可拖拽排序
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={globalSelectedList.map(item => item.instanceId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="selected-list">
                {globalSelectedList.map((item, index) => (
                  <SortableItem
                    key={item.instanceId}
                    item={item}
                    index={index}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* 底部 */}
      <div className="sidebar-footer">
        <Button
          variant="primary"
          onClick={handleExport}
          disabled={count === 0}
          style={{ width: '100%' }}
        >
          📦 导出已选
        </Button>
      </div>
    </div>
  );
};

export default SelectedListPanel;
