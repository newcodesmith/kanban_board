import os

import httpx


OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-120b"
OPENROUTER_TIMEOUT_SECONDS = 20.0


class AIClientError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


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


def _request_payload(prompt: str) -> dict[str, object]:
    return {
        "model": OPENROUTER_MODEL,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
    }


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
    if not isinstance(content, str) or not content.strip():
        raise AIClientError("AI provider returned an empty message", status_code=502)

    return content


async def run_connectivity_prompt(prompt: str) -> str:
    api_key = _api_key()

    try:
        async with httpx.AsyncClient(timeout=OPENROUTER_TIMEOUT_SECONDS) as client:
            response = await client.post(
                OPENROUTER_API_URL,
                headers=_request_headers(api_key),
                json=_request_payload(prompt),
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