# Backend notes

The backend currently provides Step 6 baseline:

- FastAPI app in `backend/app/main.py`
- `GET /` serves the statically built frontend app
- `POST /api/auth/login` issues token for hardcoded credentials (`user` / `password`)
- `GET /api/auth/validate` validates bearer token
- `GET /api/board` returns the authenticated user's board JSON
- `PUT /api/board` updates the authenticated user's board JSON
- `GET /api/hello` returns JSON payload
- `GET /health` returns a simple health status
- Unknown `/api/*` routes return 404 (not frontend fallback)
- SQLite board store lives in `backend/app/board_store.py`
- DB is initialized at startup (creates DB/tables/default user/default board if missing)
- Python dependencies are managed via `uv` using `backend/pyproject.toml`
- Docker multi-stage build compiles frontend static assets and copies them to `/app/frontend_dist`

Current purpose is serving auth-gated frontend and database-backed board APIs before frontend integration of persistence.