from datetime import UTC, datetime, timedelta
from pathlib import Path
import secrets
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


app = FastAPI(title="Project Management MVP Backend")
FRONTEND_DIST_DIR = Path("/app/frontend_dist")
AUTH_USERNAME = "user"
AUTH_PASSWORD = "password"
TOKEN_TTL_HOURS = 8

auth_scheme = HTTPBearer(auto_error=False)
issued_tokens: dict[str, datetime] = {}


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"


def _cleanup_expired_tokens() -> None:
    now = datetime.now(UTC)
    expired_tokens = [
        token for token, expiry in issued_tokens.items() if expiry <= now
    ]
    for token in expired_tokens:
        issued_tokens.pop(token, None)


def _issue_token() -> str:
    _cleanup_expired_tokens()
    token = secrets.token_urlsafe(32)
    issued_tokens[token] = datetime.now(UTC) + timedelta(hours=TOKEN_TTL_HOURS)
    return token


def _validate_token(token: str) -> bool:
    _cleanup_expired_tokens()
    expiry = issued_tokens.get(token)
    return expiry is not None and expiry > datetime.now(UTC)


def _require_bearer_token(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(auth_scheme),
    ],
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = credentials.credentials
    if not _validate_token(token):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return token


@app.post("/api/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest) -> LoginResponse:
    if payload.username != AUTH_USERNAME or payload.password != AUTH_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return LoginResponse(access_token=_issue_token())


@app.get("/api/auth/validate")
async def validate_token(
    token: Annotated[str, Depends(_require_bearer_token)],
) -> dict[str, str]:
    return {"status": "ok", "token": token}


@app.get("/api/hello")
async def api_hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI API"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


if FRONTEND_DIST_DIR.exists():
    next_assets_dir = FRONTEND_DIST_DIR / "_next"
    if next_assets_dir.exists():
        app.mount("/_next", StaticFiles(directory=next_assets_dir), name="next-assets")


@app.get("/")
async def home() -> FileResponse:
    index_file = FRONTEND_DIST_DIR / "index.html"
    if not index_file.exists():
        raise RuntimeError("Frontend build artifacts are missing. Build frontend first.")
    return FileResponse(index_file)


@app.get("/{full_path:path}")
async def frontend_routes(full_path: str) -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")

    requested_path = FRONTEND_DIST_DIR / full_path
    if requested_path.is_file():
        return FileResponse(requested_path)

    index_file = FRONTEND_DIST_DIR / "index.html"
    if not index_file.exists():
        raise RuntimeError("Frontend build artifacts are missing. Build frontend first.")
    return FileResponse(index_file)
