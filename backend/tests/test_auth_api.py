from pathlib import Path
import sys

from fastapi.testclient import TestClient


sys.path.append(str(Path(__file__).resolve().parents[1]))
from app.main import app, issued_tokens


def test_login_success_returns_token() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        response = client.post(
            "/api/auth/login",
            json={"username": "user", "password": "password"},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["token_type"] == "Bearer"
        assert payload["access_token"]


def test_login_invalid_credentials_rejected() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        response = client.post(
            "/api/auth/login",
            json={"username": "user", "password": "wrong"},
        )

        assert response.status_code == 401


def test_validate_token_requires_authorization_header() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        response = client.get("/api/auth/validate")
        assert response.status_code == 401


def test_validate_token_accepts_valid_token() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        login_response = client.post(
            "/api/auth/login",
            json={"username": "user", "password": "password"},
        )
        token = login_response.json()["access_token"]

        validate_response = client.get(
            "/api/auth/validate",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert validate_response.status_code == 200
        assert validate_response.json()["status"] == "ok"
