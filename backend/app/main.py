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
from app.board_store import get_board_for_username, initialize_database, save_board_for_username

_log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database(_database_path(), default_username=AUTH_USERNAME)
    if not os.getenv("OPENROUTER_API_KEY"):
        _log.warning("OPENROUTER_API_KEY is not set; AI endpoints will fail at runtime")
    yield


app = FastAPI(title="Project Management MVP Backend", lifespan=lifespan)
FRONTEND_DIST_DIR = Path("/app/frontend_dist")
DEFAULT_DB_PATH = Path("/app/backend/data/app.db")
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "user")
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "password")
TOKEN_TTL_HOURS = 8

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


class AIChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AIChatRequest(BaseModel):
    message: str
    conversation_history: list[AIChatHistoryMessage] = Field(default_factory=list)


class AIModelOutput(BaseModel):
    assistant_message: str
    board_update: dict[str, Any] | None = None


class AIChatResponse(BaseModel):
    assistant_message: str
    board_update: BoardModel | None = None


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


@app.delete("/api/auth/token", status_code=204)
async def logout(
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> None:
    token, _ = auth
    issued_tokens.pop(token, None)


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


@app.post("/api/ai/chat", response_model=AIChatResponse)
async def ai_chat(
    payload: AIChatRequest,
    auth: Annotated[tuple[str, str], Depends(_require_bearer_token)],
) -> AIChatResponse:
    _, username = auth
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Message is required")

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
