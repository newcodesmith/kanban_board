import asyncio
from pathlib import Path
import sys

import httpx
import pytest


sys.path.append(str(Path(__file__).resolve().parents[1]))
from app import ai_client


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, object]) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict[str, object]:
        return self._payload


class _FakeAsyncClient:
    def __init__(
        self,
        timeout: float,
        *,
        response: _FakeResponse | None = None,
        raises: Exception | None = None,
        capture: dict[str, object] | None = None,
    ) -> None:
        self.timeout = timeout
        self._response = response
        self._raises = raises
        self._capture = capture if capture is not None else {}

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def post(
        self,
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, object],
    ) -> _FakeResponse:
        self._capture["url"] = url
        self._capture["headers"] = headers
        self._capture["json"] = json
        self._capture["timeout"] = self.timeout

        if self._raises is not None:
            raise self._raises
        if self._response is None:
            raise RuntimeError("response was not configured")

        return self._response


def test_run_connectivity_prompt_builds_expected_request(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    captured: dict[str, object] = {}

    def _factory(*, timeout: float) -> _FakeAsyncClient:
        return _FakeAsyncClient(
            timeout,
            response=_FakeResponse(
                200,
                {"choices": [{"message": {"content": "4"}}]},
            ),
            capture=captured,
        )

    monkeypatch.setattr(ai_client.httpx, "AsyncClient", _factory)

    result = asyncio.run(ai_client.run_connectivity_prompt("2+2"))

    assert result == "4"
    assert captured["url"] == ai_client.OPENROUTER_API_URL
    assert captured["timeout"] == ai_client.OPENROUTER_TIMEOUT_SECONDS
    assert captured["headers"] == {
        "Authorization": "Bearer test-key",
        "Content-Type": "application/json",
    }
    assert captured["json"] == {
        "model": ai_client.OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": "2+2"}],
        "temperature": 0,
    }


def test_run_chat_messages_passes_optional_request_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    captured: dict[str, object] = {}

    def _factory(*, timeout: float) -> _FakeAsyncClient:
        return _FakeAsyncClient(
            timeout,
            response=_FakeResponse(
                200,
                {"choices": [{"message": {"content": "ok"}}]},
            ),
            capture=captured,
        )

    monkeypatch.setattr(ai_client.httpx, "AsyncClient", _factory)

    result = asyncio.run(
        ai_client.run_chat_messages(
            [{"role": "user", "content": "hi"}],
            max_tokens=120,
            response_format={"type": "json_object"},
        )
    )

    assert result == "ok"
    assert captured["json"] == {
        "model": ai_client.OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": "hi"}],
        "temperature": 0,
        "max_tokens": 120,
        "response_format": {"type": "json_object"},
    }


def test_run_connectivity_prompt_times_out(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def _factory(*, timeout: float) -> _FakeAsyncClient:
        return _FakeAsyncClient(timeout, raises=httpx.ReadTimeout("timeout"))

    monkeypatch.setattr(ai_client.httpx, "AsyncClient", _factory)

    with pytest.raises(ai_client.AIClientError) as exc_info:
        asyncio.run(ai_client.run_connectivity_prompt("2+2"))

    assert exc_info.value.status_code == 504
    assert exc_info.value.detail == "AI provider request timed out"


def test_run_connectivity_prompt_reports_provider_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def _factory(*, timeout: float) -> _FakeAsyncClient:
        return _FakeAsyncClient(
            timeout,
            response=_FakeResponse(503, {"error": {"message": "unavailable"}}),
        )

    monkeypatch.setattr(ai_client.httpx, "AsyncClient", _factory)

    with pytest.raises(ai_client.AIClientError) as exc_info:
        asyncio.run(ai_client.run_connectivity_prompt("2+2"))

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "AI provider returned an error"


def test_run_connectivity_prompt_extracts_text_from_content_parts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def _factory(*, timeout: float) -> _FakeAsyncClient:
        return _FakeAsyncClient(
            timeout,
            response=_FakeResponse(
                200,
                {
                    "choices": [
                        {
                            "message": {
                                "content": [
                                    {"type": "text", "text": "{\"assistant_message\":"},
                                    {"type": "text", "text": " \"ok\", \"board_update\": null}"},
                                ]
                            }
                        }
                    ]
                },
            ),
        )

    monkeypatch.setattr(ai_client.httpx, "AsyncClient", _factory)

    result = asyncio.run(ai_client.run_connectivity_prompt("2+2"))
    assert result == '{"assistant_message": "ok", "board_update": null}'