import React from 'react';
import './Card.css';

const Card = ({
  children,
  className = '',
  flexGrow = false,        // 是否弹性增长
  style = {},
  ...props
}) => {
  const classes = [
    'card',
    flexGrow ? 'flex-grow' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} style={style} {...props}>
      {children}
    </div>
  );
};

// 卡片头部
const CardHeader = ({
  children,
  className = '',
  style = {},
  ...props
}) => {
  return (
    <div className={`card-header ${className}`} style={style} {...props}>
      {children}
    </div>
  );
};

// 卡片主体
const CardBody = ({
  children,
  className = '',
  style = {},
  ...props
}) => {
  return (
    <div className={`card-body ${className}`} style={style} {...props}>
      {children}
    </div>
  );
};

// 卡片标题
const CardTitle = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <span className={`card-title ${className}`} {...props}>
      {children}
    </span>
  );
};

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Title = CardTitle;

export default Card;
