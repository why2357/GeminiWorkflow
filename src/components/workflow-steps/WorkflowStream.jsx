import React from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { WorkflowSteps } from '../../store/useWorkflowStore';
import StepSplit from './StepSplit';
import StepSegment from './StepSegment';
import StepScriptReview from './StepScriptReview';
import StepWorkspace from './StepWorkspace';
import StepResults from './StepResults';
import './WorkflowStream.css';

const WorkflowStream = () => {
  const { currentStep } = useWorkflowStore();

  // 根据当前步骤确定哪些步骤应该显示
  const stepOrder = [
    WorkflowSteps.SPLIT,
    WorkflowSteps.SEGMENT,
    WorkflowSteps.SCRIPT_REVIEW,
    WorkflowSteps.WORKSPACE,
    WorkflowSteps.RESULTS
  ];

  const currentStepIndex = stepOrder.indexOf(currentStep);

  // 判断步骤是否应该显示
  const isStepVisible = (step) => {
    const stepIndex = stepOrder.indexOf(step);
    return stepIndex <= currentStepIndex;
  };

  return (
    <div className="chat-stream">
      <StepSplit visible={isStepVisible(WorkflowSteps.SPLIT)} />
      <StepSegment visible={isStepVisible(WorkflowSteps.SEGMENT)} />
      <StepScriptReview visible={isStepVisible(WorkflowSteps.SCRIPT_REVIEW)} />
      <StepWorkspace visible={isStepVisible(WorkflowSteps.WORKSPACE)} />
      <StepResults visible={isStepVisible(WorkflowSteps.RESULTS)} />
    </div>
  );
};

export default WorkflowStream;
