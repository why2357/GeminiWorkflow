import React from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { WorkflowSteps } from '../../store/useWorkflowStore';
import StepSplit from './StepSplit';
import StepResults from './StepResults';
import './WorkflowStream.css';

const WorkflowStream = () => {
  const { currentStep } = useWorkflowStore();

  // 根据当前步骤确定哪些步骤应该显示
  const stepOrder = [
    WorkflowSteps.SPLIT,
    WorkflowSteps.RESULTS
  ];

  const currentStepIndex = stepOrder.indexOf(currentStep);

  // 判断步骤是否应该显示
  const isStepVisible = (step) => {
    const stepIndex = stepOrder.indexOf(step);
    // 如果当前步骤不在列表中（可能是已删除的步骤），显示所有步骤
    if (currentStepIndex === -1) return true;
    return stepIndex <= currentStepIndex;
  };

  return (
    <div className="chat-stream">
      <StepSplit visible={isStepVisible(WorkflowSteps.SPLIT)} />
      <StepResults visible={isStepVisible(WorkflowSteps.RESULTS)} />
    </div>
  );
};

export default WorkflowStream;
