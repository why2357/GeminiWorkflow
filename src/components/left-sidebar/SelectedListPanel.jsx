import { useState } from 'react';
import {
  useDroppable
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import Button from '../common/Button';
import { exportProject } from '../../utils/exportUtils';
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
  } = useSortable({
    id: item.instanceId,
    transition: {
      duration: 200, // 200ms 过渡动画
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)' // 平滑的缓动函数
    }
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
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
    removeFromSelectedList,
    fullScript,
    splitScenes,
    generatedScripts,
    currentStep
  } = useWorkflowStore();

  const [exporting, setExporting] = useState(false);
  const count = globalSelectedList.length;

  const handleRemove = (instanceId) => {
    removeFromSelectedList(instanceId);
  };

  const handleClear = () => {
    if (count === 0) return;
    if (confirm(`确定要清空已选的 ${count} 个分镜吗？`)) {
      clearSelectedList();
    }
  };

  const handleExport = async () => {
    if (count === 0) {
      alert('请先从中间工作区选择分镜图片');
      return;
    }

    setExporting(true);
    try {
      const state = {
        fullScript,
        splitScenes,
        generatedScripts,
        globalSelectedList,
        currentStep
      };

      const result = await exportProject(state);

      if (result.success) {
        // 导出成功
        // alert(`导出成功: ${result.filename}`);
      } else {
        alert(`导出失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      alert(`导出出错: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  // 设置 Droppable 区域
  const { setNodeRef } = useDroppable({
    id: 'selected-list-panel',
    disabled: false
  });

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
      <div className="sidebar-content" ref={setNodeRef}>
        {count === 0 ? (
          <div className="sidebar-empty">
            从中间拖拽图片<br/>添加到此处<br/><br/>可拖拽排序
          </div>
        ) : (
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
        )}
      </div>

      {/* 底部 */}
      <div className="sidebar-footer">
        <Button
          variant="primary"
          onClick={handleExport}
          disabled={count === 0 || exporting}
          loading={exporting}
          style={{ width: '100%' }}
        >
          📦 导出已选 ({count})
        </Button>
      </div>
    </div>
  );
};

export default SelectedListPanel;
