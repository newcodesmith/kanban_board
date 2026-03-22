# Backend notes

The backend currently provides Step 4 baseline:

- FastAPI app in `backend/app/main.py`
- `GET /` serves the statically built frontend app
- `POST /api/auth/login` issues token for hardcoded credentials (`user` / `password`)
- `GET /api/auth/validate` validates bearer token
- `GET /api/hello` returns JSON payload
- `GET /health` returns a simple health status
- Unknown `/api/*` routes return 404 (not frontend fallback)
- Python dependencies are managed via `uv` using `backend/pyproject.toml`
- Docker multi-stage build compiles frontend static assets and copies them to `/app/frontend_dist`

Current purpose is serving auth-gated frontend plus minimal API/auth endpoints before database-backed board APIs.