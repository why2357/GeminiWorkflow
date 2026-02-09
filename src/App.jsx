import React, { useEffect } from 'react';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import AppHeader from './components/layout/AppHeader';
import AppLayout from './components/layout/AppLayout';
import SelectedListPanel from './components/left-sidebar/SelectedListPanel';
import HistoryPanel from './components/right-sidebar/HistoryPanel';
import WorkflowStream from './components/workflow-steps/WorkflowStream';
import { useWorkflowStore } from './store/useWorkflowStore';
import { initImageCache, startSmartCacheUpdate } from './utils/imageCache';
import { getHistoryMeta, getTaskGridImage, getTaskSplitImages } from './services/api';
import { getOrCreateClientId } from './utils/clientId';
import './utils/cacheDebug'; // 加载缓存调试工具
import './App.css';

function App() {
  const hydrate = useWorkflowStore(state => state.hydrate);

  // 获取 store 中的函数
  const globalSelectedList = useWorkflowStore(state => state.globalSelectedList);
  const reorderSelectedList = useWorkflowStore(state => state.reorderSelectedList);
  const addToSelectedList = useWorkflowStore(state => state.addToSelectedList);
  const reorderedSplitsImages = useWorkflowStore(state => state.reorderedSplitsImages);
  const setReorderedSplitsImages = useWorkflowStore(state => state.setReorderedSplitsImages);

  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 需要拖动 8px 才开始拖动
      },
    })
  );

  // 全局拖拽处理函数
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over) return;

    // 检查是否是外部拖拽源（来自 StepSplit 的图片）
    const isExternalSource = active.id.toString().startsWith('split-image-');
    const isDropZone = over.id.toString() === 'selected-list-panel';

    if (isExternalSource) {
      // 检查是否是拖到左侧面板
      if (isDropZone) {
        // 从 active.data.current 获取拖拽数据
        const dragData = active.data.current;
        if (dragData) {
          addToSelectedList({
            instanceId: `${Date.now()}-${dragData.id}`,
            tileId: dragData.tileId || `split-${dragData.index}`,
            src: dragData.src,
            badge: dragData.badge,
            shotNumber: dragData.shotNumber
          });
        }
      } else if (over.id.toString().startsWith('split-image-')) {
        // 网格内重排序
        const oldIndex = reorderedSplitsImages.findIndex((_, index) => {
          return `split-image-${index}` === active.id.toString();
        });
        const newIndex = reorderedSplitsImages.findIndex((_, index) => {
          return `split-image-${index}` === over.id.toString();
        });

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newList = arrayMove(reorderedSplitsImages, oldIndex, newIndex);
          setReorderedSplitsImages(newList);
        }
      }
    } else if (active.id !== over.id) {
      // 内部排序
      const oldIndex = globalSelectedList.findIndex((item) => item.instanceId === active.id);
      const newIndex = globalSelectedList.findIndex((item) => item.instanceId === over.id);

      if (oldIndex >= 0 && newIndex >= 0) {
        const newList = arrayMove(globalSelectedList, oldIndex, newIndex);
        reorderSelectedList(newList);
      }
    }
  };

  // 应用启动时初始化
  useEffect(() => {
    const clientId = getOrCreateClientId();

    // 1. 初始化图片缓存
    initImageCache().catch(err => {
      // console.error('图片缓存初始化失败:', err);
    });

    // 2. 启动智能缓存更新（每 30 秒检查一次）
    const stopUpdate = startSmartCacheUpdate(
      getHistoryMeta,
      getTaskGridImage,
      getTaskSplitImages,
      clientId,
      10 * 1000  // 10 秒
    );

    // 3. 恢复上次保存的状态
    hydrate();

    // 清理函数
    return () => {
      stopUpdate?.();
    };
  }, [hydrate]);

  return (
    <>
      <AppHeader />
      <AppLayout
        leftSidebar={<SelectedListPanel />}
        rightSidebar={<HistoryPanel />}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <WorkflowStream />
      </AppLayout>
    </>
  );
}

export default App;
