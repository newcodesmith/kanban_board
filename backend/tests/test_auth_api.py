from pathlib import Path
import sys

from fastapi.testclient import TestClient
import pytest


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
        assert payload["username"] == "user"
        assert payload["role"] == "admin"


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
        body = validate_response.json()
        assert body["status"] == "ok"
        assert body["username"] == "user"
        assert body["role"] == "admin"


def test_logout_invalidates_token() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        login_response = client.post(
            "/api/auth/login",
            json={"username": "user", "password": "password"},
        )
        token = login_response.json()["access_token"]

        logout_response = client.delete(
            "/api/auth/token",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert logout_response.status_code == 204

        validate_response = client.get(
            "/api/auth/validate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert validate_response.status_code == 401


def test_register_creates_new_user() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        response = client.post(
            "/api/auth/register",
            json={"username": "newuser", "password": "securepass"},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["username"] == "newuser"
        assert body["role"] == "user"


def test_register_duplicate_username_rejected() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        client.post(
            "/api/auth/register",
            json={"username": "dupuser", "password": "securepass"},
        )
        response = client.post(
            "/api/auth/register",
            json={"username": "dupuser", "password": "anotherpass"},
        )
        assert response.status_code == 409


def test_register_short_username_rejected() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        response = client.post(
            "/api/auth/register",
            json={"username": "ab", "password": "securepass"},
        )
        assert response.status_code == 422


def test_register_short_password_rejected() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        response = client.post(
            "/api/auth/register",
            json={"username": "validuser", "password": "abc"},
        )
        assert response.status_code == 422


def test_registered_user_can_login() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        client.post(
            "/api/auth/register",
            json={"username": "logintest", "password": "mypassword"},
        )
        login_response = client.post(
            "/api/auth/login",
            json={"username": "logintest", "password": "mypassword"},
        )
        assert login_response.status_code == 200
        assert login_response.json()["access_token"]
        assert login_response.json()["role"] == "user"
