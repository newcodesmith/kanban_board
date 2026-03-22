from pathlib import Path
import sys

from fastapi.testclient import TestClient
import pytest


sys.path.append(str(Path(__file__).resolve().parents[1]))
from app.main import app, issued_tokens


def _login_and_get_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_get_board_requires_valid_token(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "app.db"))
    issued_tokens.clear()

    with TestClient(app) as client:
        response = client.get(
            "/api/board",
            headers={"Authorization": "Bearer invalid-token"},
        )
        assert response.status_code == 401


def test_get_board_returns_user_board(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "app.db"))
    issued_tokens.clear()

    with TestClient(app) as client:
        headers = _login_and_get_headers(client)
        response = client.get("/api/board", headers=headers)

        assert response.status_code == 200
        payload = response.json()
        assert "board" in payload
        assert "columns" in payload["board"]
        assert "cards" in payload["board"]


def test_update_board_persists_changes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "app.db"))
    issued_tokens.clear()

    with TestClient(app) as client:
        headers = _login_and_get_headers(client)
        board_response = client.get("/api/board", headers=headers)
        board = board_response.json()["board"]
        board["columns"][0]["title"] = "API Updated"

        update_response = client.put(
            "/api/board",
            headers=headers,
            json={"board": board},
        )
        assert update_response.status_code == 200

        read_back_response = client.get("/api/board", headers=headers)
        assert read_back_response.status_code == 200
        assert read_back_response.json()["board"]["columns"][0]["title"] == "API Updated"


def test_update_board_rejects_malformed_payload(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "app.db"))
    issued_tokens.clear()

    with TestClient(app) as client:
        headers = _login_and_get_headers(client)
        response = client.put(
            "/api/board",
            headers=headers,
            json={"board": {"columns": []}},
        )
        assert response.status_code == 422
