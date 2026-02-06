# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GeminiWorkflow** - A storyboard/image generation workflow application.

**Tech Stack:**

- **Frontend:** React 19.2.0 + Vite 7.2.4 + Zustand (state management)
- **Backend:** FastAPI (Python) in `25ge/` directory
- **Drag & Drop:** @dnd-kit library
- **Language:** JavaScript (not TypeScript)

## Development Commands

### Frontend

```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Build for production
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

### Backend

```bash
cd 25ge
python main.py   # Start FastAPI server on port 8025
# or with uvicorn directly:
uvicorn app.main:app --host 0.0.0.0 --port 8025 --reload
```

**API Base URL:** `http://172.28.104.25:8025` (configurable via `VITE_API_BASE_URL` env var)

## Architecture

### Frontend Workflow Steps

The app follows a **5-step workflow** defined in `src/store/useWorkflowStore.js`:

| Step | Component | Purpose |
| :--- | :--- | :--- |
| `SPLIT` | StepSplit.jsx | 剧本拆分 - Split script into scenes |
| `SEGMENT` | StepSegment.jsx | 分镜脚本 - Display 25 shots in 5×5 grid |
| `SCRIPT_REVIEW` | StepScriptReview.jsx | 脚本确认 - Review generated scripts |
| `WORKSPACE` | StepWorkspace.jsx | 交互式工作台 - Interactive grid editing |
| `RESULTS` | StepResults.jsx | 结果说明 - Final results |

### State Management (Zustand)

**Location:** `src/store/useWorkflowStore.js`

**Key State:**

- `currentStep` - Current workflow step
- `storyboard` - API response with shots data (`shots`, `grid_layout`, `reference_control_prompt`)
- `taskId` - Current task ID for history restoration
- `globalSelectedList` - Left sidebar selected items
- `tiles` - Workspace grid tiles

**Auto-save:** State automatically saves to localStorage with 500ms debounce

### Backend API Structure

**Location:** `25ge/app/routers/api.py`

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/api/generate-shots` | POST | Generate 25 shot descriptions from script + image |
| `/api/generate-grid` | POST | Generate 5×5 grid image and split into 25 images |
| `/api/history/{client_id}` | GET | Get history (lightweight, no images) |
| `/api/history/{client_id}/{task_id}/grid` | GET | Get grid image on-demand |
| `/api/history/{client_id}/{task_id}/splits` | GET | Get 25 split images on-demand |

### Image Handling

**Grid Display Strategy:**

- Images are stored as base64 data URLs from backend
- **Virtual slicing:** Uses CSS `background-position` to show grid portions without storing 25 separate images
- `backgroundSize: 500% 500%` scales image 5x for positioning
- Formula: `percentX = col * (100 / (cols - 1))`

**Fallback:** If backend grid image fails, falls back to test image `/Gemini_Generated_Image_g04f8dg04f8dg04f.png`

### Drag & Drop

**Library:** @dnd-kit

**Usage:**

- `useSortable` - For reorderable items (SelectedListPanel)
- `useDraggable` - For draggable items
- `useDroppable` - For drop zones
- `DndContext` - Wraps droppable areas

**Important:** `DndContext` must always be rendered (even when list is empty) to handle drops.

### Component Structure

```text
src/components/
├── layout/
│   ├── AppLayout.jsx       # Main 3-column layout
│   ├── AppHeader.jsx       # Top header
│   └── Sidebar.jsx         # Sidebar wrapper
├── workflow-steps/
│   ├── ChatMessage.jsx     # Chat bubble wrapper for steps
│   ├── StepSplit.jsx       # Step 1: Script split
│   ├── StepSegment.jsx     # Step 2: 25 shots grid
│   ├── StepScriptReview.jsx # Step 3: Script review
│   ├── StepWorkspace.jsx   # Step 4: Interactive grid
│   ├── StepResults.jsx     # Step 5: Results
│   ├── RefImageDropZone.jsx # Reference image upload
│   └── WorkflowStream.jsx  # Orchestrates step display
├── left-sidebar/
│   └── SelectedListPanel.jsx # Selected items with drag-sort
├── right-sidebar/
│   └── HistoryPanel.jsx      # Task history with lazy thumbnail load
└── common/
    ├── Button.jsx
    ├── Card.jsx
    ├── Loading.jsx
    └── Skeleton.jsx
```

## Data Flow

1. **User uploads script + image** → `POST /api/generate-shots`
2. **Backend returns storyboard** with 25 shots (`shot_number`, `angle_type`, `prompt_text`)
3. **User confirms shots** → `POST /api/generate-grid`
4. **Backend generates grid image** (5×5) and splits into 25 images
5. **Grid stored as base64** and displayed via CSS background positioning
6. **History restoration** via taskId fetches lightweight data, loads images on-demand

## Backend Environment Variables

Located in `25ge/.env`:

- `WARFOX_API_URL` - Warfox API base URL
- `WARFOX_API_KEY` - Warfox API key (JWT)
- `HOST` - Server host (default: 0.0.0.0)
- `PORT` - Server port (default: 8025)
