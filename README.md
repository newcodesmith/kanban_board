# Kanban Studio

A full-stack project management app with a drag-and-drop Kanban board and an AI chat assistant that can read and manipulate your board.

---

## Features

- **Kanban board** — drag and drop cards across columns, add/edit/delete cards and columns
- **Card details** — priority levels, due dates, labels, and freeform notes
- **AI chat sidebar** — describe changes in plain English and the AI updates the board
- **Multi-board support** — create and switch between multiple boards
- **User accounts** — registration, login, and password management
- **Admin panel** — manage users (admin role)
- **Single container deploy** — frontend and backend served from one Docker image

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Drag & drop | @dnd-kit |
| Backend | Python, FastAPI |
| Database | SQLite |
| AI | OpenRouter API (`openai/gpt-oss-120b`) |
| Package mgmt | npm (frontend), uv (backend) |
| Deployment | Docker (multi-stage build) |
| Testing | Vitest + Playwright (frontend), pytest (backend) |

---

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) (for production)
- Node.js 22+ and Python 3.12+ (for local development)
- An [OpenRouter](https://openrouter.ai/) API key

### Environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | Your OpenRouter API key |
| `AUTH_USERNAME` | Yes | Admin username |
| `AUTH_PASSWORD` | Yes | Admin password |
| `DATABASE_PATH` | No | Path to SQLite file (default: `/app/backend/data/app.db`) |

---

## Running with Docker (recommended)

```bash
docker compose build
docker compose up
```

App is available at **http://localhost:8000**

---

## Local Development

Two servers run separately — the frontend proxies API calls to the backend.

### Backend (port 8000)

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

### Frontend (port 3000)

```bash
cd frontend
npm install
npm run dev
```

Or use the helper scripts to start both at once:

```bash
# Mac / Linux
./scripts/start-mac-dev.sh

# Windows
./scripts/start-windows-dev.ps1
```

---

## Running Tests

### Backend

```bash
cd backend
uv run pytest
```

### Frontend

```bash
cd frontend
npm run test:unit   # Vitest unit tests
npm run test:e2e    # Playwright E2E tests
npm run test:all    # Both
```

---

## Project Structure

```
├── backend/
│   └── app/
│       ├── main.py          # FastAPI endpoints
│       ├── board_store.py   # SQLite data layer
│       └── ai_client.py     # OpenRouter integration
├── frontend/
│   └── src/
│       ├── components/      # React components
│       └── lib/             # API client, board logic
├── scripts/                 # Dev start/stop helpers
├── docs/                    # Project documentation
├── docker-compose.yml       # Production compose
├── docker-compose.dev.yml   # Development compose
└── Dockerfile               # Multi-stage build
```

---

## Deployment

The app ships as a single Docker container. Any Docker-compatible host works with no code changes.

**Recommended: [Render](https://render.com) or [Fly.io](https://fly.io)**

For persistent data on Render, attach a disk mounted at `/app/backend/data`.

See [`docs/`](./docs/) for detailed deployment notes and architecture decisions.
