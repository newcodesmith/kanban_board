import json
from pathlib import Path
import sys

from fastapi.testclient import TestClient
import pytest


sys.path.append(str(Path(__file__).resolve().parents[1]))
from app.board_store import DEFAULT_BOARD
from app.main import app, issued_tokens


def _login_and_get_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_ai_chat_requires_auth(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "app.db"))
    issued_tokens.clear()

    with TestClient(app) as client:
        response = client.post("/api/ai/chat", json={"message": "Move card-1 to done"})
        assert response.status_code == 401


def test_ai_chat_returns_message_without_board_update(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "app.db"))
    issued_tokens.clear()
    captured_messages: list[dict[str, str]] = []

    async def _fake_run_chat_messages(messages: list[dict[str, str]]) -> str:
        captured_messages.extend(messages)
        return json.dumps(
            {
                "assistant_message": "No board changes needed.",
                "board_update": None,
            }
        )

    monkeypatch.setattr("app.main.run_chat_messages", _fake_run_chat_messages)

    with TestClient(app) as client:
        headers = _login_and_get_headers(client)
        response = client.post(
            "/api/ai/chat",
            headers=headers,
            json={
                "message": "What should I focus on next?",
                "conversation_history": [
                    {
                        "role": "user",
                        "content": "Give me a quick status.",
                    }
                ],
            },
        )

        assert response.status_code == 200
        assert response.json() == {
            "assistant_message": "No board changes needed.",
            "board_update": None,
        }

    assert captured_messages[0]["role"] == "system"
    assert captured_messages[1]["role"] == "user"
    payload = json.loads(captured_messages[1]["content"])
    assert payload["user_message"] == "What should I focus on next?"
    assert payload["conversation_history"] == [
        {"role": "user", "content": "Give me a quick status."}
    ]
    assert "columns" in payload["board"]
    assert "cards" in payload["board"]


def test_ai_chat_returns_optional_board_update(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "app.db"))
    issued_tokens.clear()

    next_board = json.loads(json.dumps(DEFAULT_BOARD))
    next_board["columns"][0]["title"] = "Now"

    async def _fake_run_chat_messages(_messages: list[dict[str, str]]) -> str:
        return json.dumps(
            {
                "assistant_message": "Renamed backlog to now.",
                "board_update": next_board,
            }
        )

    monkeypatch.setattr("app.main.run_chat_messages", _fake_run_chat_messages)

    with TestClient(app) as client:
        headers = _login_and_get_headers(client)
        response = client.post(
            "/api/ai/chat",
            headers=headers,
            json={"message": "Rename backlog to now"},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["assistant_message"] == "Renamed backlog to now."
        assert payload["board_update"]["columns"][0]["title"] == "Now"


def test_ai_chat_rejects_invalid_model_output(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "app.db"))
    issued_tokens.clear()

    async def _fake_run_chat_messages(_messages: list[dict[str, str]]) -> str:
        return "not-json"

    monkeypatch.setattr("app.main.run_chat_messages", _fake_run_chat_messages)

    with TestClient(app) as client:
        headers = _login_and_get_headers(client)
        response = client.post(
            "/api/ai/chat",
            headers=headers,
            json={"message": "Rename backlog to now"},
        )

        assert response.status_code == 502
        assert response.json()["detail"] == "AI model returned invalid structured output"