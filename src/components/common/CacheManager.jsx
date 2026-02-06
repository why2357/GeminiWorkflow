import React, { useState, useEffect } from 'react';
import { imageCache } from '../../utils/imageCache';
import Button from './Button';
import Card from './Card';
import './CacheManager.css';

/**
 * 缓存管理组件
 * 显示缓存状态并提供清理功能
 */
const CacheManager = ({ isOpen, onClose }) => {
  const [cacheSize, setCacheSize] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCacheInfo();
    }
  }, [isOpen]);

  const loadCacheInfo = async () => {
    const size = await imageCache.getCacheSize();
    setCacheSize(size);
  };

  const handleCleanExpired = async () => {
    setLoading(true);
    await imageCache.cleanExpired();
    await loadCacheInfo();
    setLoading(false);
  };

  const handleClearAll = async () => {
    if (confirm('确定要清空所有缓存吗？这将会删除所有本地缓存的图片数据。')) {
      setLoading(true);
      await imageCache.clearAll();
      await loadCacheInfo();
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cache-manager-overlay" onClick={onClose}>
      <Card className="cache-manager" onClick={(e) => e.stopPropagation()}>
        <Card.Header>
          <Card.Title>缓存管理</Card.Title>
          <button className="close-btn" onClick={onClose}>×</button>
        </Card.Header>
        <Card.Body>
          <div className="cache-info">
            <div className="cache-stat">
              <span className="cache-label">已用空间:</span>
              <span className="cache-value">{cacheSize.toFixed(2)} MB</span>
            </div>
            <div className="cache-stat">
              <span className="cache-label">状态:</span>
              <span className={`cache-status ${cacheSize > 80 ? 'warning' : 'normal'}`}>
                {cacheSize > 80 ? '空间紧张' : '正常'}
              </span>
            </div>
          </div>

          <div className="cache-actions">
            <Button
              variant="secondary"
              onClick={handleCleanExpired}
              disabled={loading}
            >
              清理过期缓存
            </Button>
            <Button
              variant="danger"
              onClick={handleClearAll}
              disabled={loading}
            >
              清空所有缓存
            </Button>
          </div>

          <div className="cache-tips">
            <p>💡 提示:</p>
            <ul>
              <li>图片会自动缓存 7 天</li>
              <li>缓存可以减少网络请求，提升加载速度</li>
              <li>当缓存超过 100MB 时会自动清理最旧的数据</li>
            </ul>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default CacheManager;
