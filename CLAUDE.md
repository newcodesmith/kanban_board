# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack Kanban project management MVP with AI chat integration. All 10 planned parts are complete. The app features user authentication, a drag-and-drop Kanban board, and an AI chat sidebar that can manipulate the board state.

## Commands

### Frontend (`/frontend`)
```bash
npm install
npm run dev          # Dev server on port 3000
npm run build        # Static export build
npm run lint
npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
npm run test:all     # Both suites
```

### Backend (`/backend`)
```bash
uv sync              # Install dependencies
uv run pytest        # Run tests
uv run uvicorn app.main:app --reload  # Dev server on port 8000
```

### Docker
```bash
# Production (single container, port 8000)
docker compose build && docker compose up

# Development (backend :8000 + frontend :3001)
./scripts/start-mac-dev.sh    # Mac/Linux
./scripts/stop-mac-dev.sh
scripts/start-windows-dev.ps1 # Windows
```

## Architecture

**Deployment model:** Docker multi-stage build compiles the Next.js static export, then copies assets into the Python container. FastAPI serves both the API (`/api/*`) and the static frontend SPA from a single container on port 8000.

**Frontend** — Next.js 16 with static export (`output: "export"`). State managed via React hooks in `AuthKanbanApp.tsx`. Drag-and-drop via `@dnd-kit`. In development, `next.config.ts` rewrites `/api/*` to `localhost:8000`.

**Backend** — FastAPI with in-memory Bearer token auth (8-hour TTL). Board data stored as JSON in SQLite (`boards` table). AI chat goes through OpenRouter API (`openai/gpt-oss-120b`) via `ai_client.py` and returns structured output that the frontend applies to the board.

**Key data flow for AI chat:** User message → `POST /api/chat` → `ai_client.py` calls OpenRouter with board context → structured JSON response → frontend applies board mutations and refreshes state.

**Auth:** Hardcoded credentials for MVP. Tokens stored in-memory on the backend; session token stored client-side in `AuthKanbanApp.tsx`.

## Key Files

| File | Purpose |
|---|---|
| `backend/app/main.py` | All FastAPI endpoints (auth, board CRUD, chat) |
| `backend/app/board_store.py` | SQLite DB layer with user/board management |
| `backend/app/ai_client.py` | OpenRouter API integration |
| `frontend/src/components/AuthKanbanApp.tsx` | Root app component — auth state, board state, chat |
| `frontend/src/lib/api.ts` | All backend API calls |
| `frontend/src/lib/kanban.ts` | Board state management and card movement logic |
| `docker-compose.dev.yml` | Dev compose (separate frontend + backend containers) |

## Design Tokens

| Token | Value |
|---|---|
| Accent Yellow | `#ecad0a` |
| Blue Primary | `#209dd7` |
| Purple Secondary | `#753991` |
| Dark Navy | `#032147` |
| Gray Text | `#888888` |

Fonts: **Space Grotesk** (display/headings), **Manrope** (body).

## Environment

`.env` at repo root contains `OPENROUTER_API_KEY`. Required for AI chat functionality.
