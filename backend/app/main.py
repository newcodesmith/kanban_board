from datetime import UTC, datetime, timedelta
from contextlib import asynccontextmanager
import json
import logging
import os
from pathlib import Path
import secrets
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, ValidationError
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.ai_client import (
    AIClientError,
    ChatMessage,
    OPENROUTER_MODEL,
    run_chat_messages,
    run_connectivity_prompt,
)
from app.board_store import (
    authenticate_user,
    create_board_for_user,
    DEFAULT_BOARD,
    delete_board,
    delete_user_by_username,
    get_board_by_id,
    get_board_for_username,
    get_board_meta_by_id,
    get_user_by_username,
    initialize_database,
    list_boards_for_user,
    list_users,
    register_user,
    rename_board,
    save_board_by_id,
    save_board_for_username,
    set_user_active,
    update_user_password,
)

_log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database(
        _database_path(),
        default_username=AUTH_USERNAME,
        default_password=AUTH_PASSWORD,
    )
    if not os.getenv("OPENROUTER_API_KEY"):
        _log.warning("OPENROUTER_API_KEY is not set; AI endpoints will fail at runtime")
    yield


app = FastAPI(title="Project Management MVP Backend", lifespan=lifespan)
FRONTEND_DIST_DIR = Path("/app/frontend_dist")
DEFAULT_DB_PATH = Path("/app/backend/data/app.db")
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "user")
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "password")
TOKEN_TTL_HOURS = 8
REGISTRATION_ENABLED = os.getenv("REGISTRATION_ENABLED", "true").lower() == "true"

auth_scheme = HTTPBearer(auto_error=False)
issued_tokens: dict[str, tuple[datetime, str]] = {}
MAX_CHAT_HISTORY_MESSAGES = 8
AI_CHAT_MAX_TOKENS = 15000
AI_CHAT_RESPONSE_FORMAT = {"type": "json_object"}
RETRYABLE_AI_CHAT_ERRORS = {
    "AI model returned invalid structured output",
    "AI provider returned an empty message",
}
AI_CHAT_SYSTEM_PROMPT = """You are an assistant for a Kanban project board.
You must return only valid JSON, with no markdown or extra text.
Return an object with exactly two keys:
- assistant_message: string
- board_update: null or a full board object

Rules:
- Keep assistant_message concise and helpful.
- Set board_update to null unless the user clearly asks to create, edit, move, or rename board content.
- If board_update is present, it must be the full updated board matching the existing board schema.
"""
AI_CHAT_RETRY_SYSTEM_PROMPT = """Your previous answer was invalid.
Return strictly valid JSON with exactly:
- assistant_message (string)
- board_update (null or full board object)
Do not include markdown, code fences, or extra keys.
"""


# ── Request / Response models ──────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    username: str
    role: str


class RegisterRequest(BaseModel):
    username: str
    password: str


class RegisterResponse(BaseModel):
    username: str
    role: str


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: str


class ChangePasswordRequest(BaseModel):
    new_password: str


class CardModel(BaseModel):
    id: str
    title: str
    details: str
    priority: Literal["low", "medium", "high"] | None = None
    due_date: str | None = None  # ISO date string YYYY-MM-DD
    labels: list[str] = Field(default_factory=list)


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


class BoardMeta(BaseModel):
    id: int
    name: str
    created_at: str
    updated_at: str


class BoardWithMeta(BaseModel):
    id: int
    name: str
    board: BoardModel


class CreateBoardRequest(BaseModel):
    name: str


class RenameBoardRequest(BaseModel):
    name: str


class AIConnectivityRequest(BaseModel):
    prompt: str


class AIConnectivityResponse(BaseModel):
    message: str
    model: str


class AIChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AIChatRequest(BaseModel):
    message: str
    conversation_history: list[AIChatHistoryMessage] = Field(default_factory=list)
    board_id: int | None = None


class AIModelOutput(BaseModel):
    assistant_message: str
    board_update: dict[str, Any] | None = None


class AIChatResponse(BaseModel):
    assistant_message: str
    board_update: BoardModel | None = None


# ── Auth helpers ───────────────────────────────────────────────────────────────

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
    _, username = token_entry
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


def _require_admin(
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> tuple[str, str]:
    """Require the current user to have admin role."""
    token, username = auth
    user = get_user_by_username(_database_path(), username)
    if user is None or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return token, username


# ── AI helpers ─────────────────────────────────────────────────────────────────

def _build_ai_chat_messages(
    board: dict[str, Any],
    conversation_history: list[AIChatHistoryMessage],
    message: str,
) -> list[ChatMessage]:
    trimmed_history = conversation_history[-MAX_CHAT_HISTORY_MESSAGES:]
    user_payload = {
        "board": board,
        "conversation_history": [item.model_dump(mode="json") for item in trimmed_history],
        "user_message": message,
    }

    return [
        {
            "role": "system",
            "content": AI_CHAT_SYSTEM_PROMPT,
        },
        {
            "role": "user",
            "content": json.dumps(user_payload),
        },
    ]


def _parse_ai_chat_output(raw_output: str) -> AIChatResponse:
    normalized_output = raw_output.strip()
    json_candidates = [normalized_output]

    if normalized_output.startswith("```"):
        stripped_lines = normalized_output.splitlines()
        if len(stripped_lines) >= 2:
            inner_lines = stripped_lines[1:]
            if inner_lines and inner_lines[-1].strip().startswith("```"):
                inner_lines = inner_lines[:-1]
            json_candidates.append("\n".join(inner_lines).strip())

    first_brace = normalized_output.find("{")
    last_brace = normalized_output.rfind("}")
    if first_brace != -1 and last_brace != -1 and first_brace < last_brace:
        json_candidates.append(normalized_output[first_brace : last_brace + 1])

    output_json: dict[str, Any] | None = None
    for candidate in json_candidates:
        if not candidate:
            continue
        try:
            parsed_candidate = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        if isinstance(parsed_candidate, dict):
            output_json = parsed_candidate
            break

    if output_json is None:
        raise AIClientError(
            "AI model returned invalid structured output",
            status_code=502,
        )

    try:
        output = AIModelOutput.model_validate(output_json)
    except ValidationError as exc:
        raise AIClientError(
            "AI model returned invalid structured output",
            status_code=502,
        ) from exc

    assistant_message = output.assistant_message.strip()
    if not assistant_message:
        raise AIClientError(
            "AI model returned invalid structured output",
            status_code=502,
        )

    board_update: BoardModel | None = None
    if output.board_update is not None:
        try:
            board_update = BoardModel.model_validate(output.board_update)
        except ValidationError as exc:
            raise AIClientError(
                "AI model returned invalid structured output",
                status_code=502,
            ) from exc

    return AIChatResponse(
        assistant_message=assistant_message,
        board_update=board_update,
    )


# ── Auth endpoints ─────────────────────────────────────────────────────────────

@app.post("/api/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest) -> LoginResponse:
    user = authenticate_user(_database_path(), payload.username, payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return LoginResponse(
        access_token=_issue_token(payload.username),
        username=payload.username,
        role=user["role"],
    )


@app.post("/api/auth/register", response_model=RegisterResponse, status_code=201)
async def register(payload: RegisterRequest) -> RegisterResponse:
    if not REGISTRATION_ENABLED:
        raise HTTPException(status_code=403, detail="Registration is disabled")

    username = payload.username.strip()
    if not username or len(username) < 3:
        raise HTTPException(status_code=422, detail="Username must be at least 3 characters")
    if len(payload.password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    user = register_user(_database_path(), username, payload.password, role="user")
    if user is None:
        raise HTTPException(status_code=409, detail="Username already taken")

    return RegisterResponse(username=user["username"], role=user["role"])


@app.get("/api/auth/validate")
async def validate_token(
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> dict[str, str]:
    token, username = auth
    user = get_user_by_username(_database_path(), username)
    role = user["role"] if user else "user"
    return {"status": "ok", "token": token, "username": username, "role": role}


@app.delete("/api/auth/token", status_code=204)
async def logout(
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> None:
    token, _ = auth
    issued_tokens.pop(token, None)


# ── User management endpoints (admin) ─────────────────────────────────────────

@app.get("/api/users", response_model=list[UserResponse])
async def get_users(
    _auth: Annotated[tuple[str, str], Depends(_require_admin)],
) -> list[UserResponse]:
    users = list_users(_database_path())
    return [UserResponse(**u) for u in users]


@app.delete("/api/users/{username}", status_code=204)
async def delete_user(
    username: str,
    auth: Annotated[tuple[str, str], Depends(_require_admin)],
) -> None:
    _, admin_username = auth
    if username == admin_username:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    deleted = delete_user_by_username(_database_path(), username)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")


@app.patch("/api/users/{username}/active", status_code=200)
async def toggle_user_active(
    username: str,
    is_active: bool,
    auth: Annotated[tuple[str, str], Depends(_require_admin)],
) -> dict[str, Any]:
    _, admin_username = auth
    if username == admin_username:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    updated = set_user_active(_database_path(), username, is_active)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return {"username": username, "is_active": is_active}


@app.post("/api/users/{username}/password", status_code=204)
async def change_password(
    username: str,
    payload: ChangePasswordRequest,
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> None:
    _, requesting_username = auth
    # Users can change their own password; admins can change any
    if requesting_username != username:
        user = get_user_by_username(_database_path(), requesting_username)
        if user is None or user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Forbidden")

    if len(payload.new_password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    updated = update_user_password(_database_path(), username, payload.new_password)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")


# ── Multi-board endpoints ──────────────────────────────────────────────────────

@app.get("/api/boards", response_model=list[BoardMeta])
async def get_boards(
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> list[BoardMeta]:
    _, username = auth
    boards = list_boards_for_user(_database_path(), username)
    return [BoardMeta(**b) for b in boards]


@app.post("/api/boards", response_model=BoardWithMeta, status_code=201)
async def create_board(
    payload: CreateBoardRequest,
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> BoardWithMeta:
    _, username = auth
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Board name is required")

    result = create_board_for_user(_database_path(), username, name)
    if result is None:
        raise HTTPException(status_code=404, detail="User not found")

    return BoardWithMeta(
        id=result["id"],
        name=result["name"],
        board=BoardModel.model_validate(DEFAULT_BOARD),
    )


@app.get("/api/boards/{board_id}", response_model=BoardWithMeta)
async def get_board_by_id_endpoint(
    board_id: int,
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> BoardWithMeta:
    _, username = auth
    result = get_board_by_id(_database_path(), board_id, username)
    if result is None:
        raise HTTPException(status_code=404, detail="Board not found")

    return BoardWithMeta(
        id=result["id"],
        name=result["name"],
        board=BoardModel.model_validate(result["board"]),
    )


@app.put("/api/boards/{board_id}", response_model=BoardWithMeta)
async def update_board_by_id(
    board_id: int,
    payload: BoardUpdateRequest,
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> BoardWithMeta:
    _, username = auth
    saved = save_board_by_id(
        _database_path(),
        board_id,
        username,
        payload.board.model_dump(mode="json"),
    )
    if not saved:
        raise HTTPException(status_code=404, detail="Board not found")

    meta = get_board_meta_by_id(_database_path(), board_id, username)
    if meta is None:
        raise HTTPException(status_code=404, detail="Board not found")

    return BoardWithMeta(
        id=meta["id"],
        name=meta["name"],
        board=payload.board,
    )


@app.patch("/api/boards/{board_id}", response_model=BoardMeta)
async def rename_board_endpoint(
    board_id: int,
    payload: RenameBoardRequest,
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> BoardMeta:
    _, username = auth
    new_name = payload.name.strip()
    if not new_name:
        raise HTTPException(status_code=422, detail="Board name is required")

    renamed = rename_board(_database_path(), board_id, username, new_name)
    if not renamed:
        raise HTTPException(status_code=404, detail="Board not found")

    meta = get_board_meta_by_id(_database_path(), board_id, username)
    if meta is None:
        raise HTTPException(status_code=404, detail="Board not found")

    return BoardMeta(**meta)


@app.delete("/api/boards/{board_id}", status_code=204)
async def delete_board_endpoint(
    board_id: int,
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> None:
    _, username = auth
    # Ensure user has at least one board remaining
    boards = list_boards_for_user(_database_path(), username)
    if len(boards) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete your last board")

    deleted = delete_board(_database_path(), board_id, username)
    if not deleted:
        raise HTTPException(status_code=404, detail="Board not found")


# ── Legacy board endpoints (backward compat) ───────────────────────────────────

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


# ── Misc / AI endpoints ────────────────────────────────────────────────────────

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


@app.post("/api/ai/chat", response_model=AIChatResponse)
async def ai_chat(
    payload: AIChatRequest,
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> AIChatResponse:
    _, username = auth
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Message is required")

    if payload.board_id is not None:
        board_result = get_board_by_id(_database_path(), payload.board_id, username)
        if board_result is None:
            raise HTTPException(status_code=404, detail="Board not found")
        board = board_result["board"]
    else:
        board = get_board_for_username(_database_path(), username)
        if board is None:
            raise HTTPException(status_code=404, detail="Board not found")

    ai_messages = _build_ai_chat_messages(
        board=board,
        conversation_history=payload.conversation_history,
        message=message,
    )

    for attempt in range(2):
        attempt_messages = list(ai_messages)
        if attempt == 1:
            attempt_messages.append(
                {
                    "role": "system",
                    "content": AI_CHAT_RETRY_SYSTEM_PROMPT,
                }
            )

        try:
            raw_model_output = await run_chat_messages(
                attempt_messages,
                max_tokens=AI_CHAT_MAX_TOKENS,
                response_format=AI_CHAT_RESPONSE_FORMAT,
            )
            return _parse_ai_chat_output(raw_model_output)
        except AIClientError as exc:
            is_retryable_error = exc.detail in RETRYABLE_AI_CHAT_ERRORS
            should_retry = attempt == 0 and is_retryable_error
            if should_retry:
                continue
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


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
