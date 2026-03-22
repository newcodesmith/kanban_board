from datetime import UTC, datetime, timedelta
from contextlib import asynccontextmanager
import os
from pathlib import Path
import secrets
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.ai_client import AIClientError, OPENROUTER_MODEL, run_connectivity_prompt
from app.board_store import get_board_for_username, initialize_database, save_board_for_username


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database(_database_path(), default_username=AUTH_USERNAME)
    yield


app = FastAPI(title="Project Management MVP Backend", lifespan=lifespan)
FRONTEND_DIST_DIR = Path("/app/frontend_dist")
DEFAULT_DB_PATH = Path("/app/backend/data/app.db")
AUTH_USERNAME = "user"
AUTH_PASSWORD = "password"
TOKEN_TTL_HOURS = 8

auth_scheme = HTTPBearer(auto_error=False)
issued_tokens: dict[str, tuple[datetime, str]] = {}


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"


class CardModel(BaseModel):
    id: str
    title: str
    details: str


class ColumnModel(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardModel(BaseModel):
    columns: list[ColumnModel]
    cards: dict[str, CardModel]


class BoardResponse(BaseModel):
    board: BoardModel


class BoardUpdateRequest(BaseModel):
    board: BoardModel


class AIConnectivityRequest(BaseModel):
    prompt: str


class AIConnectivityResponse(BaseModel):
    message: str
    model: str


def _database_path() -> Path:
    configured_path = os.getenv("DATABASE_PATH")
    return Path(configured_path) if configured_path else DEFAULT_DB_PATH


def _cleanup_expired_tokens() -> None:
    now = datetime.now(UTC)
    expired_tokens = [
        token for token, entry in issued_tokens.items() if entry[0] <= now
    ]
    for token in expired_tokens:
        issued_tokens.pop(token, None)


def _issue_token(username: str) -> str:
    _cleanup_expired_tokens()
    token = secrets.token_urlsafe(32)
    issued_tokens[token] = (
        datetime.now(UTC) + timedelta(hours=TOKEN_TTL_HOURS),
        username,
    )
    return token


def _validate_token(token: str) -> tuple[bool, str | None]:
    _cleanup_expired_tokens()
    token_entry = issued_tokens.get(token)
    if token_entry is None:
        return False, None

    expiry, username = token_entry
    if expiry <= datetime.now(UTC):
        issued_tokens.pop(token, None)
        return False, None

    return True, username


def _require_bearer_token(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(auth_scheme),
    ],
) -> tuple[str, str]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = credentials.credentials
    token_is_valid, username = _validate_token(token)
    if not token_is_valid or username is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return token, username


@app.post("/api/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest) -> LoginResponse:
    if payload.username != AUTH_USERNAME or payload.password != AUTH_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return LoginResponse(access_token=_issue_token(payload.username))


@app.get("/api/auth/validate")
async def validate_token(
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> dict[str, str]:
    token, username = auth
    return {"status": "ok", "token": token, "username": username}


@app.get("/api/board", response_model=BoardResponse)
async def get_board(
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> BoardResponse:
    _, username = auth
    board = get_board_for_username(_database_path(), username)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")

    return BoardResponse(board=BoardModel.model_validate(board))


@app.put("/api/board", response_model=BoardResponse)
async def update_board(
    payload: BoardUpdateRequest,
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> BoardResponse:
    _, username = auth
    saved = save_board_for_username(
        _database_path(),
        username,
        payload.board.model_dump(mode="json"),
    )
    if not saved:
        raise HTTPException(status_code=404, detail="User not found")

    return BoardResponse(board=payload.board)


@app.get("/api/hello")
async def api_hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI API"}


@app.post("/api/ai/connectivity", response_model=AIConnectivityResponse)
async def ai_connectivity(
    payload: AIConnectivityRequest,
    _auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> AIConnectivityResponse:
    prompt = payload.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="Prompt is required")

    try:
        message = await run_connectivity_prompt(prompt)
    except AIClientError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return AIConnectivityResponse(message=message, model=OPENROUTER_MODEL)


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
