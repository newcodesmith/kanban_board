"""Tests for user management endpoints."""
from pathlib import Path
import sys

from fastapi.testclient import TestClient
import pytest


sys.path.append(str(Path(__file__).resolve().parents[1]))
from app.main import app, issued_tokens


def _login(client: TestClient, username: str = "user", password: str = "password") -> str:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_list_users_requires_admin() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        # Register a regular user
        client.post("/api/auth/register", json={"username": "normaluser", "password": "pass123"})
        token = _login(client, "normaluser", "pass123")
        response = client.get("/api/users", headers=_headers(token))
        assert response.status_code == 403


def test_admin_can_list_users() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        # Register additional user
        client.post("/api/auth/register", json={"username": "alice", "password": "pass123"})
        token = _login(client)  # default admin user
        response = client.get("/api/users", headers=_headers(token))
        assert response.status_code == 200
        users = response.json()
        usernames = [u["username"] for u in users]
        assert "user" in usernames
        assert "alice" in usernames


def test_admin_can_delete_user() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        client.post("/api/auth/register", json={"username": "todelete", "password": "pass123"})
        admin_token = _login(client)
        response = client.delete("/api/users/todelete", headers=_headers(admin_token))
        assert response.status_code == 204

        # Confirm user can no longer log in
        login_response = client.post(
            "/api/auth/login",
            json={"username": "todelete", "password": "pass123"},
        )
        assert login_response.status_code == 401


def test_admin_cannot_delete_own_account() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        token = _login(client)
        response = client.delete("/api/users/user", headers=_headers(token))
        assert response.status_code == 400


def test_delete_nonexistent_user_returns_404() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        token = _login(client)
        response = client.delete("/api/users/ghostuser", headers=_headers(token))
        assert response.status_code == 404


def test_user_can_change_own_password() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        client.post("/api/auth/register", json={"username": "pwuser", "password": "oldpass1"})
        token = _login(client, "pwuser", "oldpass1")

        response = client.post(
            "/api/users/pwuser/password",
            headers=_headers(token),
            json={"new_password": "newpass1"},
        )
        assert response.status_code == 204

        # Old password should fail
        old_login = client.post(
            "/api/auth/login", json={"username": "pwuser", "password": "oldpass1"}
        )
        assert old_login.status_code == 401

        # New password should work
        new_login = client.post(
            "/api/auth/login", json={"username": "pwuser", "password": "newpass1"}
        )
        assert new_login.status_code == 200


def test_user_cannot_change_another_users_password() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        client.post("/api/auth/register", json={"username": "usera", "password": "pass123"})
        client.post("/api/auth/register", json={"username": "userb", "password": "pass123"})
        token_a = _login(client, "usera", "pass123")

        response = client.post(
            "/api/users/userb/password",
            headers=_headers(token_a),
            json={"new_password": "hackedpass"},
        )
        assert response.status_code == 403


def test_admin_can_change_any_password() -> None:
    issued_tokens.clear()
    with TestClient(app) as client:
        client.post("/api/auth/register", json={"username": "target", "password": "original1"})
        admin_token = _login(client)

        response = client.post(
            "/api/users/target/password",
            headers=_headers(admin_token),
            json={"new_password": "adminset1"},
        )
        assert response.status_code == 204

        login = client.post(
            "/api/auth/login", json={"username": "target", "password": "adminset1"}
        )
        assert login.status_code == 200
