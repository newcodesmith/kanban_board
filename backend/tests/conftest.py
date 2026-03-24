"""Shared test fixtures for the backend test suite."""
from pathlib import Path
import sys

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))


@pytest.fixture(autouse=True)
def _auto_db_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Automatically redirect DATABASE_PATH to a temp directory for every test.

    This prevents tests from accidentally writing to the production database
    path (/app/backend/data/app.db) which may be read-only in non-Docker
    environments.
    """
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "app.db"))
