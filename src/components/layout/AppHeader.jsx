import React from 'react';
import './AppHeader.css';

const AppHeader = ({ title = 'Gemini Workflow', badge = 'v2.1 Layout' }) => {
  return (
    <header className="app-header">
      <h1 className="app-title">
        <span className="app-icon">💎</span>
        {title}
        {badge && <span className="badge">{badge}</span>}
      </h1>
    </header>
  );
};

export default AppHeader;
