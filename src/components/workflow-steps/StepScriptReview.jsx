import React, { useState, useEffect } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { WorkflowSteps } from '../../store/useWorkflowStore';
import Card from '../common/Card';
import Button from '../common/Button';
import ChatMessage from './ChatMessage';
import RefImageDropZone from './RefImageDropZone';
import './StepScriptReview.css';

const StepScriptReview = ({ visible = true }) => {
  const {
    generatedScripts,
    setGeneratedScripts,
    scriptRefImages,
    addScriptRefImage,
    removeScriptRefImage,
    setCurrentStep,
    scenePrompt,
    storyboard
  } = useWorkflowStore();

  const [localScripts, setLocalScripts] = useState([]);

  useEffect(() => {
    // 当进入此步骤时，如果没有脚本，生成模拟数据
    if (generatedScripts.length === 0 && scenePrompt) {
      const mockScripts = [
        {
          id: 1,
          title: '镜头 1',
          content: `场景：${scenePrompt.slice(0, 50)}...\n\n镜头描述：中景，主角缓缓睁开双眼，晨光透过窗帘缝隙洒在脸上。\n\n运镜：缓慢推近`,
          shotType: '中景'
        },
        {
          id: 2,
          title: '镜头 2',
          content: `场景：同上\n\n镜头描述：特写，主角的手指轻轻触碰阳光。\n\n运镜：固定镜头`,
          shotType: '特写'
        },
        {
          id: 3,
          title: '镜头 3',
          content: `场景：房间全景\n\n镜头描述：全景，展示房间布置，简单而温馨。\n\n运镜：缓慢平移`,
          shotType: '全景'
        }
      ];
      setGeneratedScripts(mockScripts);
      setLocalScripts(mockScripts);
    } else {
      setLocalScripts(generatedScripts);
    }
  }, [scenePrompt]);

  const handleScriptChange = (index, newContent) => {
    const updated = [...localScripts];
    updated[index] = { ...updated[index], content: newContent };
    setLocalScripts(updated);
  };

  const handleGenerateImages = () => {
    setGeneratedScripts(localScripts);
    setCurrentStep(WorkflowSteps.RESULTS);
  };

  return (
    <ChatMessage stepId="step-script-review" visible={visible}>
      <Card className="chat-bubble" flexGrow={true}>
        <Card.Header>
          <Card.Title>脚本确认 (Script Confirmation)</Card.Title>
        </Card.Header>
        <Card.Body style={{ flexGrow: 0 }}>
          <p className="step-description">
            分镜脚本已生成。请检查并进行二次修改，确认无误后生成画面。
          </p>

          {/* 脚本列表 */}
          <div className="script-list-container">
            {localScripts.length === 0 ? (
              <div className="script-empty">等待生成...</div>
            ) : (
              localScripts.map((script, index) => (
                <div key={script.id} className="script-item">
                  <div className="script-item-header">
                    <span className="script-item-title">{script.title}</span>
                    <span className="script-item-badge">{script.shotType}</span>
                  </div>
                  <textarea
                    className="script-textarea script-content-textarea"
                    value={script.content}
                    onChange={(e) => handleScriptChange(index, e.target.value)}
                    style={{ minHeight: '80px' }}
                  />
                </div>
              ))
            )}
          </div>

          {/* 角色和场景参考图上传 */}
          <RefImageDropZone
            images={scriptRefImages}
            onAdd={addScriptRefImage}
            onRemove={removeScriptRefImage}
            placeholder="上传角色和场景参考图 (点击或拖拽上传)"
          />

          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={handleGenerateImages}>
              🎨 生成分镜画面
            </Button>
          </div>
        </Card.Body>
      </Card>
    </ChatMessage>
  );
};

export default StepScriptReview;
