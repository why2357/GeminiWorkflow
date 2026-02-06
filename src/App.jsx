import React, { useEffect } from 'react';
import AppHeader from './components/layout/AppHeader';
import AppLayout from './components/layout/AppLayout';
import SelectedListPanel from './components/left-sidebar/SelectedListPanel';
import HistoryPanel from './components/right-sidebar/HistoryPanel';
import WorkflowStream from './components/workflow-steps/WorkflowStream';
import { useWorkflowStore } from './store/useWorkflowStore';
import './App.css';

function App() {
  const hydrate = useWorkflowStore(state => state.hydrate);

  // 应用启动时恢复上次保存的状态
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <>
      <AppHeader />
      <AppLayout
        leftSidebar={<SelectedListPanel />}
        rightSidebar={<HistoryPanel />}
      >
        <WorkflowStream />
      </AppLayout>
    </>
  );
}

export default App;
