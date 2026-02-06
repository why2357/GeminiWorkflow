# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 项目概述

这是一个 **React + Vite** 应用程序。它使用 React 19.2.0 和 Vite 7.2.4 作为构建工具。项目使用 JavaScript（而非 TypeScript）和 ESLint 来保证代码质量。

## 开发命令

- `npm run dev` - 启动开发服务器（支持热模块替换 HMR）
- `npm run build` - 构建生产版本
- `npm run lint` - 运行 ESLint 代码检查
- `npm run preview` - 本地预览生产构建版本

## 架构

**入口点：** `src/main.jsx` 在 StrictMode（严格模式）下渲染 React 应用。

**插件：** 使用 `@vitejs/plugin-react` 实现 Fast Refresh（快速刷新）（通过 Babel 或 oxc）。

**React 编译器：** 当前未启用。可按照 [React Compiler 安装文档](https://react.dev/learn/react-compiler/installation)添加。

**ESLint：** 配置了 React 特定规则（`eslint-plugin-react-hooks`、`eslint-plugin-react-refresh`）。

## 项目结构

- `src/main.jsx` - 应用程序入口点
- `src/App.jsx` - 主应用组件
- `src/App.css` - 组件特定样式
- `index.html` - HTML 模板
- `vite.config.js` - Vite 配置文件
