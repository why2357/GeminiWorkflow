import React from 'react';
import './ChatMessage.css';

const ChatMessage = ({
  children,
  avatar = '🤖',
  name = 'AI Agent',
  stepId = '',
  className = '',
  visible = true
}) => {
  if (!visible) return null;

  const classes = [
    'chat-message',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} id={stepId}>
      <div className="chat-avatar">{avatar}</div>
      <div className="chat-content">
        <div className="chat-name">{name}</div>
        {children}
      </div>
    </div>
  );
};

export default ChatMessage;
