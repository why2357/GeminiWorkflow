import { useEffect, useState } from 'react';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
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
  const insertIntoSelectedList = useWorkflowStore(state => state.insertIntoSelectedList); // 新增：支持在指定位置插入 - 按照宫格.html样式
  const reorderedSplitsImages = useWorkflowStore(state => state.reorderedSplitsImages);
  const setReorderedSplitsImages = useWorkflowStore(state => state.setReorderedSplitsImages);

  // 拖拽状态 - 按照宫格.html样式，用于控制高亮效果
  const [dragActiveId, setDragActiveId] = useState(null);
  const [activeDragData, setActiveDragData] = useState(null); // 用于DragOverlay显示

  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 需要拖动 8px 才开始拖动
      },
    })
  );

  // 自定义放置动画 - 按照宫格.html样式优化动画效果
  const dropAnimation = {
    duration: 200, // 200ms 动画时长，与宫格.html一致
    easing: 'cubic-bezier(0.25, 1, 0.5, 1)', // 平滑的缓动函数
    scale: 1.05, // 轻微放大效果
  };

  // 拖拽开始回调 - 按照宫格.html样式，设置拖拽状态
  const handleDragStart = (event) => {
    setDragActiveId(true);
    // 捕获拖拽数据用于显示预览
    if (event.active?.data?.current) {
      setActiveDragData(event.active.data.current);
    }
  };

  // 全局拖拽处理函数 - 按照宫格.html样式，添加高亮效果控制
  const handleDragEnd = (event) => {
    const { active, over } = event;

    // 清除拖拽状态 - 按照宫格.html样式
    setDragActiveId(null);
    setActiveDragData(null);

    if (!over) return;

    // 优先处理网格内重排序 - 按照宫格.html样式
    if (active.id.toString().startsWith('split-image-') && over.id.toString().startsWith('split-image-')) {
      // 网格内重排序 - 直接交换两个元素
      const oldIndex = reorderedSplitsImages.findIndex((_, index) => {
        return `split-image-${index}` === active.id.toString();
      });
      const newIndex = reorderedSplitsImages.findIndex((_, index) => {
        return `split-image-${index}` === over.id.toString();
      });

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        // 创建新数组并直接交换两个位置的元素
        const newList = [...reorderedSplitsImages];
        [newList[oldIndex], newList[newIndex]] = [newList[newIndex], newList[oldIndex]];
        setReorderedSplitsImages(newList);
      }
      return;
    }

    // 检查是否是外部拖拽源（来自 StepSplit 或 GridDisplayModal 的图片）拖到左侧边栏
    const isExternalSource = active.id.toString().startsWith('split-image-') || active.id.toString().startsWith('grid-image-');
    const isDropZone = over.id.toString() === 'selected-list-panel';

    if (isExternalSource) {
      // 从 active.data.current 获取拖拽数据
      const dragData = active.data.current;
      if (!dragData) return;

      const newItem = {
        instanceId: `${Date.now()}-${dragData.id || dragData.originalIndex}`,
        tileId: dragData.tileId || `split-${dragData.index || dragData.originalIndex}`,
        src: dragData.src,
        badge: dragData.badge,
        shotNumber: dragData.shotNumber || dragData.originalIndex + 1
      };

      // 检查是否拖到某个具体 item 上 - 按照宫格.html样式
      const overIndex = globalSelectedList.findIndex(item => item.instanceId === over.id);

      if (overIndex !== -1) {
        // 拖到某个 item 上，插入到该位置
        insertIntoSelectedList(newItem, overIndex);
      } else if (isDropZone) {
        // 拖到整个面板上（没有具体 item），添加到末尾
        addToSelectedList(newItem);
      }
    } else if (active.id !== over.id) {
      // 内部排序 - 直接交换两个元素
      const oldIndex = globalSelectedList.findIndex((item) => item.instanceId === active.id);
      const newIndex = globalSelectedList.findIndex((item) => item.instanceId === over.id);

      if (oldIndex >= 0 && newIndex >= 0) {
        // 创建新数组并直接交换两个位置的元素
        const newList = [...globalSelectedList];
        [newList[oldIndex], newList[newIndex]] = [newList[newIndex], newList[oldIndex]];
        reorderSelectedList(newList);
      }
    }
  };

  // 应用启动时初始化
  useEffect(() => {
    const clientId = getOrCreateClientId();

    // 1. 初始化图片缓存
    initImageCache().catch(() => {
      // console.error('图片缓存初始化失败');
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
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        sensors={sensors}
        dropAnimation={dropAnimation}
        activeDragData={activeDragData}
      >
        <WorkflowStream />
      </AppLayout>
    </>
  );
}

export default App;
