import { useState } from 'react';
import {
  useDroppable,
  useDndContext
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import Button from '../common/Button';
import { exportProject } from '../../utils/exportUtils';
import CollageModal from '../CollageModal';
import './SelectedListPanel.css';

// 可拖拽的已选项组件 - 按照宫格.html样式
const SortableItem = ({ item, index, onRemove, activeId }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    over
  } = useSortable({
    id: item.instanceId,
    data: {
      src: item.src,
      tileId: item.tileId,
      badge: item.badge,
      shotNumber: item.shotNumber
    },
    transition: {
      duration: 200, // 200ms 过渡动画 - 按照宫格.html样式
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)' // 平滑的缓动函数 - 按照宫格.html样式
    }
  });

  // 计算是否显示插入指示器
  const showInsertIndicator = activeId && over && over.id === item.instanceId && !isDragging;

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
    // 按照宫格.html样式：拖拽时原位置保持可见（ghost效果），不是半透明
    opacity: 1,
  };

  return (
    <div className="selected-item-wrapper">
      {/* 插入指示器 - 在项目上方 */}
      {showInsertIndicator && (
        <div className="insert-indicator insert-before" />
      )}
      <div
        ref={setNodeRef}
        style={style}
        className={`selected-item ${isDragging ? 'sortable-ghost' : ''}`}
      >
        <button
          className="selected-item-delete"
          onClick={() => onRemove(item.instanceId)}
          title="移除"
        >
          ×
        </button>
        <div className="selected-item-frame" {...attributes} {...listeners}>
          <img src={item.src} alt={`分镜 ${index + 1}`} />
        </div>
        <div className="tile-number" style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'rgba(0, 0, 0, 0.6)', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', pointerEvents: 'none' }}>
          #{index + 1}
        </div>
        {item.badge && (
          <span className="selected-item-badge" style={{ position: 'absolute', bottom: '4px', left: '4px', display: 'none' }}>{item.badge}</span>
        )}
      </div>
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
  const [collageModalOpen, setCollageModalOpen] = useState(false);
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

  // 设置 Droppable 区域 - 使用 isOver 属性检测拖拽状态
  const { setNodeRef, isOver } = useDroppable({
    id: 'selected-list-panel',
    disabled: false,
  });

  // 获取全局拖拽状态
  const { active } = useDndContext();
  const activeId = active ? active.id : null;

  return (
    <div className={`selected-list-panel ${isOver ? 'panel-dragging' : ''}`} ref={setNodeRef}>
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

      {/* 内容区 - 按照宫格.html样式，添加拖拽高亮效果 */}
      <div className={`sidebar-content ${isOver ? 'highlight-drop-zone' : ''}`}>
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
                  activeId={activeId}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>

      {/* 底部 - 按照宫格.html样式 */}
      <div className="sidebar-footer" style={{ display: 'flex', gap: '8px' }}>
        <button
          className="secondary"
          onClick={() => setCollageModalOpen(true)}
          disabled={count === 0}
          style={{ flex: 1, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', borderRadius: 'var(--radius-sm)', transition: 'all 0.2s ease', background: 'white', border: '1px solid var(--border)', color: 'var(--text-main)' }}
        >
          🧩 宫格拼合
        </button>
        <button
          className="primary"
          onClick={handleExport}
          disabled={count === 0 || exporting}
          style={{ flex: 1, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', borderRadius: 'var(--radius-sm)', transition: 'all 0.2s ease', background: 'var(--primary)', color: 'white', border: 'none' }}
        >
          {exporting ? '导出中...' : `📦 导出已选`}
        </button>
      </div>

      {/* 宫格拼合模态框 */}
      <CollageModal
        open={collageModalOpen}
        onClose={() => setCollageModalOpen(false)}
      />
    </div>
  );
};

export default SelectedListPanel;
