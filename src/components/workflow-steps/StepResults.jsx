import React, { useState } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import Card from '../common/Card';
import Button from '../common/Button';
import ChatMessage from './ChatMessage';
import { exportProject, exportConfig, exportReport } from '../../utils/exportUtils';
import './StepResults.css';

const StepResults = ({ visible = true }) => {
  const { globalSelectedList } = useWorkflowStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState(null);

  const count = globalSelectedList.length;

  // 导出完整项目（ZIP）
  const handleExportProject = async () => {
    setIsExporting(true);
    setExportMessage(null);
    const state = useWorkflowStore.getState();
    const result = await exportProject(state);
    setIsExporting(false);

    if (result.success) {
      setExportMessage({ type: 'success', text: `✅ 已导出: ${result.filename}` });
    } else {
      setExportMessage({ type: 'error', text: `❌ 导出失败: ${result.error}` });
    }
  };

  // 仅导出配置
  const handleExportConfig = () => {
    const state = useWorkflowStore.getState();
    const result = exportConfig(state);
    setExportMessage({ type: 'success', text: `✅ 已导出配置: ${result.filename}` });
  };

  // 仅导出报告
  const handleExportReport = () => {
    const state = useWorkflowStore.getState();
    const result = exportReport(state);
    setExportMessage({ type: 'success', text: `✅ 已导出报告: ${result.filename}` });
  };

  return (
    <ChatMessage stepId="step-results" visible={visible}>
      <Card className="chat-bubble">
        <Card.Header>
          <Card.Title>结果与说明</Card.Title>
        </Card.Header>
        <Card.Body style={{ flexGrow: 0 }}>
          {count === 0 ? (
            <div className="results-empty">
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📋</div>
              <p style={{ color: 'var(--text-sub)' }}>
                在这里可以看到你在工作台中的选择结果与简单说明。
              </p>
            </div>
          ) : (
            <div className="results-summary">
              <p className="results-title">
                🎉 已成功选择 {count} 个分镜切片
              </p>
              <div className="results-list">
                {globalSelectedList.map((item, index) => (
                  <div key={item.instanceId} className="result-item">
                    <span className="result-number">{index + 1}.</span>
                    <span className="result-badge">{item.badge}</span>
                  </div>
                ))}
              </div>

              {/* 导出按钮组 */}
              <div className="export-buttons">
                <Button
                  onClick={handleExportProject}
                  disabled={isExporting}
                  className="export-primary"
                >
                  {isExporting ? '📦 导出中...' : '📦 导出完整项目 (ZIP)'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleExportConfig}
                  disabled={isExporting}
                >
                  📄 导出配置 (JSON)
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleExportReport}
                  disabled={isExporting}
                >
                  📝 导出报告 (MD)
                </Button>
              </div>

              {/* 导出消息 */}
              {exportMessage && (
                <div className={`export-message ${exportMessage.type}`}>
                  {exportMessage.text}
                </div>
              )}

              <p className="results-note" style={{ color: 'var(--text-sub)', fontSize: '0.9rem' }}>
                💡 提示：你可以在左侧边栏查看已选分镜，或点击导出按钮保存结果。
              </p>
            </div>
          )}
        </Card.Body>
      </Card>
    </ChatMessage>
  );
};

export default StepResults;
