import hashlib
import json
import os
import secrets
from pathlib import Path
import sqlite3
from typing import Any


DEFAULT_BOARD: dict[str, Any] = {
    "columns": [
        {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
        {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
        {
            "id": "col-progress",
            "title": "In Progress",
            "cardIds": ["card-4", "card-5"],
        },
        {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
        {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
    ],
    "cards": {
        "card-1": {
            "id": "card-1",
            "title": "Align roadmap themes",
            "details": "Draft quarterly themes with impact statements and metrics.",
        },
        "card-2": {
            "id": "card-2",
            "title": "Gather customer signals",
            "details": "Review support tags, sales notes, and churn feedback.",
        },
        "card-3": {
            "id": "card-3",
            "title": "Prototype analytics view",
            "details": "Sketch initial dashboard layout and key drill-downs.",
        },
        "card-4": {
            "id": "card-4",
            "title": "Refine status language",
            "details": "Standardize column labels and tone across the board.",
        },
        "card-5": {
            "id": "card-5",
            "title": "Design card layout",
            "details": "Add hierarchy and spacing for scanning dense lists.",
        },
        "card-6": {
            "id": "card-6",
            "title": "QA micro-interactions",
            "details": "Verify hover, focus, and loading states.",
        },
        "card-7": {
            "id": "card-7",
            "title": "Ship marketing page",
            "details": "Final copy approved and asset pack delivered.",
        },
        "card-8": {
            "id": "card-8",
            "title": "Close onboarding sprint",
            "details": "Document release notes and share internally.",
        },
    },
}


def _hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    """Returns (hash_hex, salt) using PBKDF2-HMAC-SHA256."""
    if salt is None:
        salt = secrets.token_hex(16)
    pw_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations=200_000,
    )
    return pw_hash.hex(), salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    computed, _ = _hash_password(password, salt)
    return secrets.compare_digest(computed, stored_hash)


def _connect(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database(
    db_path: Path,
    default_username: str = "user",
    default_password: str = "password",
) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL DEFAULT '',
              password_salt TEXT NOT NULL DEFAULT '',
              role TEXT NOT NULL DEFAULT 'user',
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS boards (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              name TEXT NOT NULL DEFAULT 'My Board',
              board_json TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id)"
        )

        # Migrate: add columns to existing tables if needed
        _migrate_users_table(connection)

        # Ensure default user exists with hashed password
        existing = connection.execute(
            "SELECT id, password_hash FROM users WHERE username = ?",
            (default_username,),
        ).fetchone()

        if existing is None:
            pw_hash, pw_salt = _hash_password(default_password)
            connection.execute(
                "INSERT INTO users (username, password_hash, password_salt, role) VALUES (?, ?, ?, ?)",
                (default_username, pw_hash, pw_salt, "admin"),
            )
        elif not existing["password_hash"]:
            # Migrate legacy user with no password
            pw_hash, pw_salt = _hash_password(default_password)
            connection.execute(
                "UPDATE users SET password_hash = ?, password_salt = ?, role = 'admin' WHERE username = ?",
                (pw_hash, pw_salt, default_username),
            )

        user_row = connection.execute(
            "SELECT id FROM users WHERE username = ?",
            (default_username,),
        ).fetchone()
        if user_row is None:
            raise RuntimeError("Unable to initialize default user")

        board_exists = connection.execute(
            "SELECT 1 FROM boards WHERE user_id = ?",
            (user_row["id"],),
        ).fetchone()

        if board_exists is None:
            connection.execute(
                "INSERT INTO boards (user_id, name, board_json) VALUES (?, ?, ?)",
                (user_row["id"], "My Board", json.dumps(DEFAULT_BOARD)),
            )

        connection.commit()


def _migrate_users_table(connection: sqlite3.Connection) -> None:
    """Add new columns to users table if migrating from old schema."""
    cols = {row[1] for row in connection.execute("PRAGMA table_info(users)").fetchall()}
    if "password_hash" not in cols:
        connection.execute("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''")
    if "password_salt" not in cols:
        connection.execute("ALTER TABLE users ADD COLUMN password_salt TEXT NOT NULL DEFAULT ''")
    if "role" not in cols:
        connection.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
    if "is_active" not in cols:
        connection.execute("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")

    # Migrate boards table: add name column if missing
    board_cols = {row[1] for row in connection.execute("PRAGMA table_info(boards)").fetchall()}
    if "name" not in board_cols:
        connection.execute("ALTER TABLE boards ADD COLUMN name TEXT NOT NULL DEFAULT 'My Board'")


# ── User management ────────────────────────────────────────────────────────────

def register_user(
    db_path: Path,
    username: str,
    password: str,
    role: str = "user",
) -> dict[str, Any] | None:
    """Create a new user. Returns user info dict or None if username taken."""
    pw_hash, pw_salt = _hash_password(password)
    try:
        with _connect(db_path) as connection:
            cursor = connection.execute(
                "INSERT INTO users (username, password_hash, password_salt, role) VALUES (?, ?, ?, ?)",
                (username, pw_hash, pw_salt, role),
            )
            user_id = cursor.lastrowid
            # Create a default board for the new user
            connection.execute(
                "INSERT INTO boards (user_id, name, board_json) VALUES (?, ?, ?)",
                (user_id, "My Board", json.dumps(DEFAULT_BOARD)),
            )
            connection.commit()
            return {"id": user_id, "username": username, "role": role}
    except sqlite3.IntegrityError:
        return None


def authenticate_user(db_path: Path, username: str, password: str) -> dict[str, Any] | None:
    """Verify credentials, return user info or None."""
    with _connect(db_path) as connection:
        row = connection.execute(
            "SELECT id, username, password_hash, password_salt, role, is_active FROM users WHERE username = ?",
            (username,),
        ).fetchone()

    if row is None or not row["is_active"]:
        return None

    # Handle legacy users with no password hash (migrate on first login)
    if not row["password_hash"]:
        return None

    if not verify_password(password, row["password_hash"], row["password_salt"]):
        return None

    return {"id": row["id"], "username": row["username"], "role": row["role"]}


def get_user_by_username(db_path: Path, username: str) -> dict[str, Any] | None:
    with _connect(db_path) as connection:
        row = connection.execute(
            "SELECT id, username, role, is_active, created_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    if row is None:
        return None
    return dict(row)


def list_users(db_path: Path) -> list[dict[str, Any]]:
    with _connect(db_path) as connection:
        rows = connection.execute(
            "SELECT id, username, role, is_active, created_at FROM users ORDER BY created_at"
        ).fetchall()
    return [dict(row) for row in rows]


def update_user_password(db_path: Path, username: str, new_password: str) -> bool:
    pw_hash, pw_salt = _hash_password(new_password)
    with _connect(db_path) as connection:
        result = connection.execute(
            "UPDATE users SET password_hash = ?, password_salt = ? WHERE username = ?",
            (pw_hash, pw_salt, username),
        )
        connection.commit()
    return result.rowcount > 0


def delete_user_by_username(db_path: Path, username: str) -> bool:
    with _connect(db_path) as connection:
        result = connection.execute(
            "DELETE FROM users WHERE username = ?",
            (username,),
        )
        connection.commit()
    return result.rowcount > 0


def set_user_active(db_path: Path, username: str, is_active: bool) -> bool:
    with _connect(db_path) as connection:
        result = connection.execute(
            "UPDATE users SET is_active = ? WHERE username = ?",
            (1 if is_active else 0, username),
        )
        connection.commit()
    return result.rowcount > 0


# ── Multi-board management ─────────────────────────────────────────────────────

def list_boards_for_user(db_path: Path, username: str) -> list[dict[str, Any]]:
    """Return all boards for a user (id, name, created_at, updated_at)."""
    with _connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT b.id, b.name, b.created_at, b.updated_at
            FROM boards b
            JOIN users u ON u.id = b.user_id
            WHERE u.username = ?
            ORDER BY b.created_at
            """,
            (username,),
        ).fetchall()
    return [dict(row) for row in rows]


def create_board_for_user(
    db_path: Path,
    username: str,
    name: str,
    board_data: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Create a new board for a user. Returns board meta or None if user not found."""
    if board_data is None:
        board_data = DEFAULT_BOARD
    with _connect(db_path) as connection:
        user_row = connection.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if user_row is None:
            return None
        cursor = connection.execute(
            "INSERT INTO boards (user_id, name, board_json) VALUES (?, ?, ?)",
            (user_row["id"], name, json.dumps(board_data)),
        )
        board_id = cursor.lastrowid
        connection.commit()
    return {"id": board_id, "name": name}


def get_board_by_id(
    db_path: Path,
    board_id: int,
    username: str,
) -> dict[str, Any] | None:
    """Get full board data by id, ensuring ownership."""
    with _connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT b.id, b.name, b.board_json
            FROM boards b
            JOIN users u ON u.id = b.user_id
            WHERE b.id = ? AND u.username = ?
            """,
            (board_id, username),
        ).fetchone()
    if row is None:
        return None
    try:
        board_data = json.loads(row["board_json"])
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Corrupted board data for board id {board_id}") from exc
    return {"id": row["id"], "name": row["name"], "board": board_data}


def save_board_by_id(
    db_path: Path,
    board_id: int,
    username: str,
    board: dict[str, Any],
) -> bool:
    """Save board data by id, ensuring ownership."""
    with _connect(db_path) as connection:
        result = connection.execute(
            """
            UPDATE boards
            SET board_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = (SELECT id FROM users WHERE username = ?)
            """,
            (json.dumps(board), board_id, username),
        )
        connection.commit()
    return result.rowcount > 0


def rename_board(
    db_path: Path,
    board_id: int,
    username: str,
    new_name: str,
) -> bool:
    with _connect(db_path) as connection:
        result = connection.execute(
            """
            UPDATE boards
            SET name = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = (SELECT id FROM users WHERE username = ?)
            """,
            (new_name, board_id, username),
        )
        connection.commit()
    return result.rowcount > 0


def delete_board(
    db_path: Path,
    board_id: int,
    username: str,
) -> bool:
    with _connect(db_path) as connection:
        result = connection.execute(
            """
            DELETE FROM boards
            WHERE id = ? AND user_id = (SELECT id FROM users WHERE username = ?)
            """,
            (board_id, username),
        )
        connection.commit()
    return result.rowcount > 0


# ── Legacy compat (used by existing tests / board endpoints) ───────────────────

def get_board_for_username(db_path: Path, username: str) -> dict[str, Any] | None:
    """Return the first board's data for the user (legacy compat)."""
    with _connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT b.board_json
            FROM boards b
            JOIN users u ON u.id = b.user_id
            WHERE u.username = ?
            ORDER BY b.id
            LIMIT 1
            """,
            (username,),
        ).fetchone()

        if row is None:
            return None

        try:
            return json.loads(row["board_json"])
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Corrupted board data for user: {username}") from exc


def save_board_for_username(db_path: Path, username: str, board: dict[str, Any]) -> bool:
    """Save to the first board for the user (legacy compat)."""
    with _connect(db_path) as connection:
        user_row = connection.execute(
            "SELECT id FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if user_row is None:
            return False

        board_row = connection.execute(
            "SELECT id FROM boards WHERE user_id = ? ORDER BY id LIMIT 1",
            (user_row["id"],),
        ).fetchone()

        if board_row is None:
            connection.execute(
                "INSERT INTO boards (user_id, name, board_json) VALUES (?, ?, ?)",
                (user_row["id"], "My Board", json.dumps(board)),
            )
        else:
            connection.execute(
                """
                UPDATE boards
                SET board_json = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (json.dumps(board), board_row["id"]),
            )

        connection.commit()
        return True
