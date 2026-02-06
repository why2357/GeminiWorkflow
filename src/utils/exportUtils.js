import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * 将 Data URL 转换为 Blob
 */
const dataURLToBlob = (dataURL) => {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

/**
 * 生成项目配置 JSON
 */
const generateProjectConfig = (state) => {
  const {
    fullScript,
    splitScenes,
    generatedScripts,
    globalSelectedList,
    currentStep
  } = state;

  return {
    version: '1.0.0',
    exportDate: new Date().toISOString(),
    project: {
      script: fullScript,
      scenes: splitScenes.map((scene, index) => ({
        id: scene.id,
        index: index + 1,
        title: scene.title,
        description: scene.description
      })),
      scripts: generatedScripts.map((script, index) => ({
        id: script.id,
        sceneId: script.sceneId,
        index: index + 1,
        content: script.content
      })),
      selectedItems: globalSelectedList.map((item, index) => ({
        id: item.instanceId,
        index: index + 1,
        tileId: item.tileId,
        badge: item.badge
      }))
    },
    status: {
      currentStep,
      totalScenes: splitScenes.length,
      totalScripts: generatedScripts.length,
      totalSelected: globalSelectedList.length
    }
  };
};

/**
 * 生成导出报告（Markdown 格式）
 */
const generateReport = (state) => {
  const {
    fullScript,
    splitScenes,
    generatedScripts,
    globalSelectedList
  } = state;

  const date = new Date().toLocaleString('zh-CN');

  let report = `# 工作流导出报告\n\n`;
  report += `**导出时间**: ${date}\n\n`;
  report += `---\n\n`;

  // 原始剧本
  report += `## 📜 原始剧本\n\n`;
  report += `${fullScript || '暂无剧本内容'}\n\n`;

  // 场景拆分
  report += `## 🎬 场景拆分 (${splitScenes.length} 个场景)\n\n`;
  if (splitScenes.length > 0) {
    splitScenes.forEach((scene, index) => {
      report += `### 场景 ${index + 1}: ${scene.title}\n\n`;
      report += `${scene.description}\n\n`;
    });
  } else {
    report += `暂无场景数据\n\n`;
  }

  // 生成的分镜脚本
  report += `## 📝 分镜脚本 (${generatedScripts.length} 个)\n\n`;
  if (generatedScripts.length > 0) {
    generatedScripts.forEach((script, index) => {
      report += `### 脚本 ${index + 1}\n\n`;
      report += `${script.content}\n\n`;
    });
  } else {
    report += `暂无脚本数据\n\n`;
  }

  // 已选项目
  report += `## ✅ 已选项目 (${globalSelectedList.length} 个)\n\n`;
  if (globalSelectedList.length > 0) {
    globalSelectedList.forEach((item, index) => {
      report += `${index + 1}. ${item.badge} (ID: ${item.instanceId})\n`;
    });
    report += `\n`;
  } else {
    report += `暂无已选项目\n\n`;
  }

  report += `---\n\n`;
  report += `*本报告由 Gemini Workflow 自动生成*\n`;

  return report;
};

/**
 * 导出项目为 ZIP 文件
 */
export const exportProject = async (state) => {
  const zip = new JSZip();

  // 1. 添加配置文件
  const config = generateProjectConfig(state);
  zip.file('project-config.json', JSON.stringify(config, null, 2));

  // 2. 添加报告
  const report = generateReport(state);
  zip.file('report.md', report);

  // 3. 创建 images 文件夹并添加图片
  const imagesFolder = zip.folder('images');
  const { globalSelectedList } = state;

  if (globalSelectedList.length > 0) {
    for (let i = 0; i < globalSelectedList.length; i++) {
      const item = globalSelectedList[i];
      try {
        const blob = dataURLToBlob(item.src);
        const ext = blob.type === 'image/png' ? 'png' : 'jpg';
        const filename = `${String(i + 1).padStart(3, '0')}-${item.badge.replace(/\s+/g, '_')}.${ext}`;
        imagesFolder.file(filename, blob);
      } catch (error) {
        // console.error(`Failed to process image ${item.instanceId}:`, error);
      }
    }
  }

  // 4. 生成并下载 ZIP
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const zipFilename = `workflow-export-${timestamp}.zip`;

  try {
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, zipFilename);
    return { success: true, filename: zipFilename };
  } catch (error) {
    // console.error('Export failed:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 仅导出配置为 JSON
 */
export const exportConfig = (state) => {
  const config = generateProjectConfig(state);
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `workflow-config-${timestamp}.json`;

  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);

  return { success: true, filename };
};

/**
 * 仅导出报告为 Markdown
 */
export const exportReport = (state) => {
  const report = generateReport(state);
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `workflow-report-${timestamp}.md`;

  const blob = new Blob([report], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);

  return { success: true, filename };
};
