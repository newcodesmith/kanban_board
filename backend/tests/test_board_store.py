from pathlib import Path
import sys


sys.path.append(str(Path(__file__).resolve().parents[1]))
from app.board_store import (
    authenticate_user,
    create_board_for_user,
    delete_board,
    delete_user_by_username,
    get_board_by_id,
    get_board_for_username,
    initialize_database,
    list_boards_for_user,
    list_users,
    register_user,
    rename_board,
    save_board_by_id,
    save_board_for_username,
    set_user_active,
    update_user_password,
    verify_password,
)


# ── Initialize & legacy compat ─────────────────────────────────────────────────

def test_initialize_database_creates_default_user_board(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path, default_username="user", default_password="password")

    board = get_board_for_username(db_path, "user")
    assert board is not None
    assert "columns" in board
    assert "cards" in board


def test_save_board_roundtrip_for_user(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path, default_username="user", default_password="password")

    board = get_board_for_username(db_path, "user")
    assert board is not None

    board["columns"][0]["title"] = "Renamed"
    saved = save_board_for_username(db_path, "user", board)

    assert saved is True

    loaded = get_board_for_username(db_path, "user")
    assert loaded is not None
    assert loaded["columns"][0]["title"] == "Renamed"


def test_save_board_unknown_user_returns_false(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path, default_username="user", default_password="password")

    saved = save_board_for_username(db_path, "missing-user", {"columns": [], "cards": {}})
    assert saved is False


# ── Password hashing ───────────────────────────────────────────────────────────

def test_verify_password_correct() -> None:
    from app.board_store import _hash_password
    pw_hash, salt = _hash_password("mysecret")
    assert verify_password("mysecret", pw_hash, salt) is True


def test_verify_password_wrong() -> None:
    from app.board_store import _hash_password
    pw_hash, salt = _hash_password("mysecret")
    assert verify_password("wrongpassword", pw_hash, salt) is False


# ── User management ────────────────────────────────────────────────────────────

def test_register_user_creates_user_and_board(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)

    result = register_user(db_path, "alice", "alicepass")
    assert result is not None
    assert result["username"] == "alice"
    assert result["role"] == "user"

    # Default board should be created for new user
    boards = list_boards_for_user(db_path, "alice")
    assert len(boards) == 1


def test_register_duplicate_username_returns_none(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)

    register_user(db_path, "alice", "pass1")
    result = register_user(db_path, "alice", "pass2")
    assert result is None


def test_authenticate_user_valid_credentials(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path, default_username="user", default_password="password")

    result = authenticate_user(db_path, "user", "password")
    assert result is not None
    assert result["username"] == "user"


def test_authenticate_user_wrong_password_returns_none(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path, default_username="user", default_password="password")

    result = authenticate_user(db_path, "user", "wrongpassword")
    assert result is None


def test_authenticate_nonexistent_user_returns_none(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)

    result = authenticate_user(db_path, "ghost", "anypass")
    assert result is None


def test_list_users_returns_all(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path, default_username="admin", default_password="adminpass")
    register_user(db_path, "alice", "pass1")
    register_user(db_path, "bob", "pass2")

    users = list_users(db_path)
    usernames = [u["username"] for u in users]
    assert "admin" in usernames
    assert "alice" in usernames
    assert "bob" in usernames


def test_delete_user(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)
    register_user(db_path, "tobedeleted", "pass1")

    result = delete_user_by_username(db_path, "tobedeleted")
    assert result is True

    result = authenticate_user(db_path, "tobedeleted", "pass1")
    assert result is None


def test_delete_nonexistent_user_returns_false(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)

    result = delete_user_by_username(db_path, "ghost")
    assert result is False


def test_update_user_password(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path, default_username="user", default_password="oldpass")

    updated = update_user_password(db_path, "user", "newpass1")
    assert updated is True

    assert authenticate_user(db_path, "user", "oldpass") is None
    assert authenticate_user(db_path, "user", "newpass1") is not None


def test_set_user_inactive_prevents_login(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)
    register_user(db_path, "tempuser", "pass1")

    set_user_active(db_path, "tempuser", False)
    result = authenticate_user(db_path, "tempuser", "pass1")
    assert result is None

    set_user_active(db_path, "tempuser", True)
    result = authenticate_user(db_path, "tempuser", "pass1")
    assert result is not None


# ── Multi-board management ─────────────────────────────────────────────────────

def test_list_boards_for_new_user(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)
    register_user(db_path, "alice", "pass1")

    boards = list_boards_for_user(db_path, "alice")
    assert len(boards) == 1
    assert boards[0]["name"] == "My Board"


def test_create_board_for_user(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)
    register_user(db_path, "alice", "pass1")

    result = create_board_for_user(db_path, "alice", "Q2 Sprint")
    assert result is not None
    assert result["name"] == "Q2 Sprint"

    boards = list_boards_for_user(db_path, "alice")
    assert len(boards) == 2


def test_get_board_by_id_with_ownership(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)
    register_user(db_path, "alice", "pass1")
    register_user(db_path, "bob", "pass2")

    alice_boards = list_boards_for_user(db_path, "alice")
    board_id = alice_boards[0]["id"]

    # Alice can access her own board
    result = get_board_by_id(db_path, board_id, "alice")
    assert result is not None
    assert "board" in result

    # Bob cannot access Alice's board
    result = get_board_by_id(db_path, board_id, "bob")
    assert result is None


def test_save_board_by_id(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)
    register_user(db_path, "alice", "pass1")

    boards = list_boards_for_user(db_path, "alice")
    board_id = boards[0]["id"]

    current = get_board_by_id(db_path, board_id, "alice")
    board_data = current["board"]
    board_data["columns"][0]["title"] = "Sprint 1"

    saved = save_board_by_id(db_path, board_id, "alice", board_data)
    assert saved is True

    updated = get_board_by_id(db_path, board_id, "alice")
    assert updated["board"]["columns"][0]["title"] == "Sprint 1"


def test_rename_board(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)
    register_user(db_path, "alice", "pass1")

    boards = list_boards_for_user(db_path, "alice")
    board_id = boards[0]["id"]

    result = rename_board(db_path, board_id, "alice", "Product Roadmap")
    assert result is True

    boards_after = list_boards_for_user(db_path, "alice")
    assert boards_after[0]["name"] == "Product Roadmap"


def test_delete_board(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)
    register_user(db_path, "alice", "pass1")

    # Create a second board
    create_board_for_user(db_path, "alice", "To Delete")
    boards = list_boards_for_user(db_path, "alice")
    assert len(boards) == 2

    delete_id = next(b["id"] for b in boards if b["name"] == "To Delete")
    result = delete_board(db_path, delete_id, "alice")
    assert result is True

    boards_after = list_boards_for_user(db_path, "alice")
    assert len(boards_after) == 1
    assert boards_after[0]["name"] == "My Board"


def test_delete_board_wrong_owner_returns_false(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path)
    register_user(db_path, "alice", "pass1")
    register_user(db_path, "bob", "pass2")

    alice_boards = list_boards_for_user(db_path, "alice")
    board_id = alice_boards[0]["id"]

    result = delete_board(db_path, board_id, "bob")
    assert result is False
