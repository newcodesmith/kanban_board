import os
from typing import Literal, TypedDict

import httpx


OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-120b"
OPENROUTER_TIMEOUT_SECONDS = 20.0


class AIClientError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class ChatMessage(TypedDict):
    role: Literal["system", "user", "assistant"]
    content: str


def _api_key() -> str:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise AIClientError("AI provider is not configured", status_code=500)
    return api_key


def _request_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def _request_payload(
    messages: list[ChatMessage],
    max_tokens: int | None = None,
    response_format: dict[str, object] | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
        "temperature": 0,
    }

    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    if response_format is not None:
        payload["response_format"] = response_format

    return payload


def _extract_message(response_json: dict[str, object]) -> str:
    choices = response_json.get("choices")
    if not isinstance(choices, list) or not choices:
        raise AIClientError("AI provider returned an invalid response", status_code=502)

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        raise AIClientError("AI provider returned an invalid response", status_code=502)

    message = first_choice.get("message")
    if not isinstance(message, dict):
        raise AIClientError("AI provider returned an invalid response", status_code=502)

    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content

    if isinstance(content, list):
        text_parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                if item.strip():
                    text_parts.append(item)
                continue

            if not isinstance(item, dict):
                continue

            text_value = item.get("text")
            if isinstance(text_value, str) and text_value.strip():
                text_parts.append(text_value)

        merged_content = "".join(text_parts).strip()
        if merged_content:
            return merged_content

    fallback_text = first_choice.get("text")
    if isinstance(fallback_text, str) and fallback_text.strip():
        return fallback_text

    raise AIClientError("AI provider returned an empty message", status_code=502)


async def run_connectivity_prompt(prompt: str) -> str:
    return await run_chat_messages([{"role": "user", "content": prompt}])


async def run_chat_messages(
    messages: list[ChatMessage],
    max_tokens: int | None = None,
    response_format: dict[str, object] | None = None,
) -> str:
    api_key = _api_key()

    try:
        async with httpx.AsyncClient(timeout=OPENROUTER_TIMEOUT_SECONDS) as client:
            response = await client.post(
                OPENROUTER_API_URL,
                headers=_request_headers(api_key),
                json=_request_payload(
                    messages,
                    max_tokens=max_tokens,
                    response_format=response_format,
                ),
            )
    except httpx.TimeoutException as exc:
        raise AIClientError("AI provider request timed out", status_code=504) from exc
    except httpx.HTTPError as exc:
        raise AIClientError("AI provider request failed", status_code=502) from exc

    if response.status_code >= 400:
        raise AIClientError("AI provider returned an error", status_code=502)

    try:
        response_json = response.json()
    except ValueError as exc:
        raise AIClientError("AI provider returned invalid JSON", status_code=502) from exc

    if not isinstance(response_json, dict):
        raise AIClientError("AI provider returned an invalid response", status_code=502)

    return _extract_message(response_json)