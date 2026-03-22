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


def test_ai_connectivity_requires_auth(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "app.db"))
    issued_tokens.clear()

    with TestClient(app) as client:
        response = client.post("/api/ai/connectivity", json={"prompt": "2+2"})
        assert response.status_code == 401


def test_ai_connectivity_returns_provider_message(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "app.db"))
    issued_tokens.clear()

    async def _fake_run_connectivity_prompt(prompt: str) -> str:
        assert prompt == "2+2"
        return "4"

    monkeypatch.setattr("app.main.run_connectivity_prompt", _fake_run_connectivity_prompt)

    with TestClient(app) as client:
        headers = _login_and_get_headers(client)
        response = client.post(
            "/api/ai/connectivity",
            headers=headers,
            json={"prompt": "2+2"},
        )

        assert response.status_code == 200
        assert response.json() == {
            "message": "4",
            "model": "openai/gpt-oss-120b",
        }


def test_ai_connectivity_rejects_empty_prompt(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "app.db"))
    issued_tokens.clear()

    with TestClient(app) as client:
        headers = _login_and_get_headers(client)
        response = client.post(
            "/api/ai/connectivity",
            headers=headers,
            json={"prompt": "   "},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Prompt is required"