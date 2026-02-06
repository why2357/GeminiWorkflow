import { useState, useCallback } from 'react';

/**
 * 图片切片 Hook
 * 将图片按指定行列数切分成多个图块
 */
const useImageSlicing = () => {
  const [tiles, setTiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * 执行图片切片
   * @param {string} imageSrc - 图片的 Data URL
   * @param {number} rows - 行数
   * @param {number} cols - 列数
   * @returns {Promise<Array>} 切片后的图块数组
   */
  const sliceImage = useCallback(async (imageSrc, rows = 4, cols = 4) => {
    setIsProcessing(true);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          // 创建 canvas
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          const tileWidth = img.width / cols;
          const tileHeight = img.height / rows;

          const slicedTiles = [];

          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              // 设置 canvas 大小为单个图块大小
              canvas.width = tileWidth;
              canvas.height = tileHeight;

              // 清空 canvas
              ctx.clearRect(0, 0, tileWidth, tileHeight);

              // 绘制对应区域的图片
              ctx.drawImage(
                img,
                col * tileWidth,  // 源 x
                row * tileHeight, // 源 y
                tileWidth,        // 源宽度
                tileHeight,       // 源高度
                0,                // 目标 x
                0,                // 目标 y
                tileWidth,        // 目标宽度
                tileHeight        // 目标高度
              );

              // 转换为 Data URL
              const tileDataUrl = canvas.toDataURL('image/png', 0.9);

              slicedTiles.push({
                id: `${row}-${col}`,
                src: tileDataUrl,
                originalSrc: imageSrc,
                row,
                col,
                x: col * tileWidth,
                y: row * tileHeight,
                width: tileWidth,
                height: tileHeight,
                selected: false
              });
            }
          }

          setTiles(slicedTiles);
          setIsProcessing(false);
          resolve(slicedTiles);
        } catch (error) {
          // console.error('Image slicing failed:', error);
          setIsProcessing(false);
          reject(error);
        }
      };

      img.onerror = () => {
        const error = new Error('Failed to load image');
        setIsProcessing(false);
        reject(error);
      };

      img.src = imageSrc;
    });
  }, []);

  /**
   * 重新生成切片网格（使用 background-position 方式）
   * 这种方式更适合大图，因为不需要实际切割图片
   */
  const createVirtualGrid = useCallback((imageSrc, rows = 4, cols = 4) => {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const tileWidth = img.width / cols;
        const tileHeight = img.height / rows;

        const virtualTiles = [];

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            virtualTiles.push({
              id: `${row}-${col}`,
              src: imageSrc,
              row,
              col,
              width: tileWidth,
              height: tileHeight,
              selected: false,
              // 用于 background-position 的百分比
              bgX: (col / (cols - 1)) * 100,
              bgY: (row / (rows - 1)) * 100
            });
          }
        }

        setTiles(virtualTiles);
        resolve(virtualTiles);
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = imageSrc;
    });
  }, []);

  /**
   * 清空切片
   */
  const clearTiles = useCallback(() => {
    setTiles([]);
  }, []);

  /**
   * 切换图块选中状态
   */
  const toggleTile = useCallback((tileId) => {
    setTiles(prev => prev.map(tile =>
      tile.id === tileId ? { ...tile, selected: !tile.selected } : tile
    ));
  }, []);

  /**
   * 设置图块选中状态
   */
  const setTileSelected = useCallback((tileId, selected) => {
    setTiles(prev => prev.map(tile =>
      tile.id === tileId ? { ...tile, selected } : tile
    ));
  }, []);

  /**
   * 清除所有选中状态
   */
  const clearSelection = useCallback(() => {
    setTiles(prev => prev.map(tile => ({ ...tile, selected: false })));
  }, []);

  /**
   * 获取选中的图块
   */
  const getSelectedTiles = useCallback(() => {
    return tiles.filter(tile => tile.selected);
  }, [tiles]);

  return {
    tiles,
    isProcessing,
    sliceImage,
    createVirtualGrid,
    clearTiles,
    toggleTile,
    setTileSelected,
    clearSelection,
    getSelectedTiles
  };
};

export default useImageSlicing;
