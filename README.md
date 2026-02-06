# GeminiWorkflow 项目开发文档

## 一、背景

### 背景
本文档描述 GeminiWorkflow 项目的开发环境搭建、开发流程和部署流程，为开发者提供完整的项目上手指南。

### 技术定位
**中级** - 适合具备以下基础的开发者：
- 熟悉 React 基础语法和组件开发
- 了解 JavaScript ES6+ 特性
- 具备 Python/FastAPI 基础认知
- 熟悉 Git 基本操作

### 目标群体
- 前端开发工程师
- 全栈开发工程师
- 需要二次开发或维护此项目的团队成员

### 技术应用场景
- 剧本拆分与分镜脚本生成
- AI 图像生成工作流
- 可视化拖拽交互编辑
- 任务历史记录管理

### 整体思路
```
用户输入（剧本+参考图）→ AI 生成分镜脚本 → 确认脚本 → 生成宫格图 → 交互式编辑 → 保存结果
```

---

## 二、操作步骤

### 2.1 开发前的准备工作

#### 开发环境准备

**必装软件：**
- **VSCode** - 代码编辑器
- **Chrome 浏览器** - 开发调试
- **Git** - 代码版本管理
- **1Panel 访问权限** - 生产环境管理

**Node.js 环境（使用 nvm 管理）：**

```bash
# 1. 安装 nvm
# 访问 https://nvm.uihtm.com/doc/download-nvm.html 下载安装

# 2. 查看可用版本
nvm ls available

# 3. 安装 Node.js 24.13.0（项目推荐版本）
nvm install 24.13.0

# 4. 切换到指定版本
nvm use 24.13.0

# 5. 验证安装
node --version  # 应显示 v24.13.0
npm --version
```

#### 版本管理环境

**Git 配置：**

```bash
# 克隆项目
git clone https://github.com/why2357/GeminiWorkflow.git
cd GeminiWorkflow

# 安装前端依赖
npm install

# 安装后端依赖
cd 25ge
pip install -r requirements.txt
```

#### 后端环境配置

创建 `25ge/.env` 文件：

```bash
# Warfox API 配置
WARFOX_API_URL=https://api.warfox.com
WARFOX_API_KEY=your_jwt_token_here

# 服务器配置
HOST=0.0.0.0
PORT=8025
```

---

### 2.2 进入开发阶段

#### 代码逻辑结构

**前端核心流程：**

```
┌─────────────────────────────────────────────────────────────┐
│                      AppLayout.jsx                           │
│  ┌──────────────┬─────────────────────────┬───────────────┐ │
│  │  Sidebar     │    Main Content Area     │  Right Panel  │ │
│  │  (左侧选择)   │   (工作流步骤展示)        │  (历史记录)    │ │
│  └──────────────┴─────────────────────────┴───────────────┘ │
└─────────────────────────────────────────────────────────────┘

工作流步骤 (WorkflowStream)：
┌─────────────────────────────────────────────────────────┐
│ Step 1: StepSplit    → 剧本拆分                        │
│ Step 2: StepSegment  → 分镜脚本展示 (25 shots 5×5)      │
│ Step 3: StepScriptReview → 脚本确认                     │
│ Step 4: StepWorkspace → 交互式工作台                    │
│ Step 5: StepResults  → 结果说明                         │
└─────────────────────────────────────────────────────────┘
```

**状态管理（Zustand）：**

| 状态名称 | 类型 | 说明 |
|---------|------|------|
| `currentStep` | string | 当前工作流步骤 |
| `storyboard` | object | API 返回的分镜数据 |
| `taskId` | string | 当前任务 ID |
| `globalSelectedList` | array | 左侧选中项列表 |
| `tiles` | array | 工作区宫格数据 |

**API 端点列表：**

| 端点 | 方法 | 说明 | 参数 |
|-----|------|------|------|
| `/api/generate-shots` | POST | 生成分镜脚本 | script, image |
| `/api/generate-grid` | POST | 生成宫格图 | storyboard |
| `/api/history/{client_id}` | GET | 获取历史记录 | client_id |
| `/api/health` | GET | 健康检查 | - |

#### 代码管理方式

**开发流程：**

```bash
# 1. 创建功能分支
git checkout -b feature/your-feature-name

# 2. 开发并提交
git add .
git commit -m "feat: 添加xxx功能"

# 3. 推送远程
git push origin feature/your-feature-name

# 4. 提交 Pull Request
```

**提交规范：**
- `feat:` 新功能
- `fix:` 修复 bug
- `refactor:` 重构
- `docs:` 文档更新
- `style:` 代码格式
- `test:` 测试相关

---

### 2.3 部署环境

#### 1Panel 管理平台

**访问地址：** http://172.28.104.54:17347/websites（内网环境）

**登录信息：**
- 用户名：`admin`
- 密码：`182818238`

#### 部署操作流程

**前端部署：**

```bash
# 1. 构建生产版本
npm run build

# 2. 将 dist 目录上传至服务器
# 3. 在 1Panel 中配置静态网站
```

**后端部署（Docker）：**

```bash
# 1. 构建 Docker 镜像
cd 25ge
docker build -t gemini-workflow-backend .

# 2. 运行容器
docker run -d \
  --name gemini-backend \
  -p 8025:8025 \
  --env-file .env \
  gemini-workflow-backend
```

**在 1Panel 中管理容器：**
- 容器列表 → 查看运行状态
- 日志查看 → 排查问题
- 终端连接 → 进入容器调试

---

## 三、总结

### 技术经验

**已积累：**

1. **拖拽交互实现** - 使用 @dnd-kit 实现流畅的拖拽排序功能
2. **虚拟切片技术** - 通过 CSS background-position 实现宫格图预览，无需存储多张图片
3. **状态持久化** - Zustand + localStorage 实现自动保存
4. **API 集成模式** - 统一的错误处理和重试机制
5. **组件化设计** - 可复用的 Loading、Skeleton、Card 等组件

### 有待提升

- [ ] 添加单元测试覆盖
- [ ] 优化大图片加载性能
- [ ] 增加错误边界处理
- [ ] 完善 API 文档
- [ ] 添加用户操作引导

### 遇到的阻塞点

- **图片格式兼容性** - 需确保支持 PNG/JPEG/WebP 等常见格式
- **网络超时处理** - AI 生成可能耗时较长，需要更好的超时和重试策略
- **浏览器兼容性** - crypto.randomUUID() 在旧浏览器不支持，需要 polyfill

---

## 附录

### 快速启动命令

```bash
# 前端开发
npm run dev          # 启动开发服务器 (http://localhost:5173)
npm run build        # 构建生产版本
npm run lint         # 代码检查

# 后端开发
cd 25ge
python main.py       # 启动 FastAPI 服务器
# 或
uvicorn app.main:app --host 0.0.0.0 --port 8025 --reload
```

### 相关文档

- [CLAUDE.md](./CLAUDE.md) - 项目架构和开发指南
- [API_DOCS.md](./API_DOCS.md) - 后端 API 文档
- [@dnd-kit 官方文档](https://docs.dndkit.com/)
- [Zustand 文档](https://github.com/pmndrs/zustand)
