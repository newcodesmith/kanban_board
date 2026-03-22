from pathlib import Path
import json
import sys

import pytest


sys.path.append(str(Path(__file__).resolve().parents[1]))
from app.ai_client import AIClientError
from app.board_store import DEFAULT_BOARD
from app.main import _parse_ai_chat_output


def test_parse_ai_chat_output_without_board_update() -> None:
    result = _parse_ai_chat_output(
        '{"assistant_message": "No board changes needed.", "board_update": null}'
    )

    assert result.assistant_message == "No board changes needed."
    assert result.board_update is None


def test_parse_ai_chat_output_with_board_update() -> None:
    result = _parse_ai_chat_output(
        json.dumps(
            {
                "assistant_message": "Moved card.",
                "board_update": DEFAULT_BOARD,
            }
        )
    )

    assert result.assistant_message == "Moved card."
    assert result.board_update is not None
    assert result.board_update.columns[0].id == "col-backlog"


def test_parse_ai_chat_output_rejects_invalid_json() -> None:
    with pytest.raises(AIClientError) as exc_info:
        _parse_ai_chat_output("not-json")

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "AI model returned invalid structured output"