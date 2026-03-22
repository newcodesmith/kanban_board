from pathlib import Path
import sys


sys.path.append(str(Path(__file__).resolve().parents[1]))
from app.board_store import get_board_for_username, initialize_database, save_board_for_username


def test_initialize_database_creates_default_user_board(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path, default_username="user")

    board = get_board_for_username(db_path, "user")
    assert board is not None
    assert "columns" in board
    assert "cards" in board


def test_save_board_roundtrip_for_user(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    initialize_database(db_path, default_username="user")

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
    initialize_database(db_path, default_username="user")

    saved = save_board_for_username(db_path, "missing-user", {"columns": [], "cards": {}})
    assert saved is False
