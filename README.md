开发计划：Gemini Flow 工作流应用
阶段 0：项目准备
确认项目结构
当前是 Vite + React 项目
安装必要的依赖：

npm install react-sortable-hoc jszip file-saver zustand
# 或者使用轻量级状态管理
npm install zustand
阶段 1：基础架构搭建
步骤	任务	说明
1.1	创建文件夹结构	components/, hooks/, utils/, contexts/
1.2	创建全局状态管理	使用 Zustand 或 Context
1.3	创建通用组件	Button.jsx, Card.jsx
1.4	创建布局组件	AppLayout.jsx, AppHeader.jsx
阶段 2：布局层

App.jsx
 └── AppLayout.jsx
     ├── AppHeader.jsx
     ├── 左侧边栏占位
     ├── 中间工作区占位
     └── 右侧边栏占位
目标：先搭出三栏布局框架，内容后续填充

阶段 3：侧边栏
步骤	组件	功能
3.1	SelectedListPanel.jsx	左侧已选分镜
3.2	HistoryPanel.jsx	右侧历史记录
目标：两侧边栏可独立展示

阶段 4：工作流步骤（核心）
按顺序实现每个步骤卡片：

步骤	组件	优先级
4.1	StepSplit.jsx	⭐⭐⭐
4.2	StepSegment.jsx + RefImageDropZone.jsx	⭐⭐⭐
4.3	StepScriptReview.jsx	⭐⭐
4.4	StepWorkspace.jsx + InteractiveGrid.jsx	⭐⭐⭐
4.5	StepResults.jsx	⭐
阶段 5：核心功能实现
步骤	功能
5.1	图片切片逻辑 (useImageSlicing)
5.2	拖拽排序 (react-dnd 或 react-sortable-hoc)
5.3	状态持久化
5.4	导出功能 (JSZip + FileSaver)
阶段 6：UI 与交互优化
步骤	任务
6.1	样式系统 (CSS 变量 + 模块化)
6.2	动画效果 (fade-in, drag 反馈)
6.3	响应式适配
建议开发顺序

阶段 1 → 阶段 2 → 阶段 3
                         ↓
                    阶段 4.1
                         ↓
                    阶段 4.2
                         ↓
                    阶段 4.3
                         ↓
                    阶段 4.4 ← 阶段 5.1, 5.2
                         ↓
                    阶段 4.5
                         ↓
                    阶段 5.3, 5.4
                         ↓
                    阶段 6