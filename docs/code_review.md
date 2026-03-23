# Code review

## Overall assessment

The codebase is well-structured and follows the MVP philosophy throughout. Test coverage is solid across unit, integration, and E2E layers. The main concerns are a security issue with hardcoded credentials, a race condition in board saves, and a handful of error-handling gaps.

---

## High priority

### 1. Hardcoded credentials — `backend/app/main.py:34-35`

```python
AUTH_USERNAME = "user"
AUTH_PASSWORD = "password"
```

Credentials are hardcoded in source. Load from environment variables instead:

```python
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "user")
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "password")
```

For a production deployment, remove the defaults and fail fast at startup if the variable is absent.

---

### 2. Unreachable raise after AI chat retry loop — `backend/app/main.py`

The `raise HTTPException` after the retry loop is dead code — the loop always returns or raises before reaching it. Remove it.

---

### 3. Race condition in board save queue — `frontend/src/components/AuthKanbanApp.tsx`

`enqueueBoardSave` chains promises but does not cancel on component unmount. If the component unmounts during a save (e.g. on logout), state updates continue on the dead component. Add a cancel/abort mechanism, or at minimum guard state updates with an `isMounted` ref.

---

## Medium priority

### 4. No JSON decode guard in board store — `backend/app/board_store.py:140`

`json.loads(row["board_json"])` will raise an unhandled exception if the stored JSON is corrupted. Wrap in a try/except and raise a clear error:

```python
try:
    return json.loads(row["board_json"])
except json.JSONDecodeError as e:
    raise RuntimeError(f"Corrupted board data for user {username}") from e
```

---

### 5. Silent failure on non-JSON error responses — `frontend/src/lib/api.ts`

When an API error response is not valid JSON, `detailMessage` silently becomes an empty string and the user sees a generic error with no useful information. Fall back to the HTTP status instead:

```typescript
detailMessage = `Request failed with status ${response.status}`;
```

---

### 6. `validateTokenRequest` returns null on error — `frontend/src/lib/api.ts`

All other API functions throw on error; this one returns `null`. The inconsistency makes error handling harder to reason about. Consider aligning it with the other functions.

---

### 7. No token revocation on logout — `backend/app/main.py`

Tokens are only expired by TTL (8 hours). Logging out does not remove the token from `issued_tokens`. For the MVP this is an acceptable tradeoff, but the token remains valid for up to 8 hours after logout. Add a `DELETE /api/auth/token` endpoint if this matters.

---

### 8. AI API key not validated at startup — `backend/app/ai_client.py`

`_api_key()` raises only when the AI endpoint is first called. If the key is missing, the app starts and appears healthy. Call `_api_key()` in the lifespan startup block alongside DB initialisation so the problem is surfaced immediately.

---

## Low priority

### 9. Duplicated user lookup SQL — `backend/app/board_store.py`

The user-by-username SELECT appears in two functions. Extract to a `_get_user_id(db, username)` helper.

---

### 10. Repeated Bearer token header — `frontend/src/lib/api.ts`

The `Authorization: Bearer ...` header is constructed in four places. Extract to a one-line helper `authHeader(token)` to reduce repetition.

---

### 11. `AuthKanbanApp` is large (400+ lines) — `frontend/src/components/AuthKanbanApp.tsx`

The component handles auth, board management, and chat. Acceptable for the current scope, but worth splitting into a `ChatPanel` component if the chat grows.

---

### 12. `moveCard` has no test for invalid IDs — `frontend/src/lib/kanban.test.ts`

Edge cases for unknown `activeId` or `overId` are untested. Low risk (these values come from dnd-kit events), but worth one defensive test case.

---

### 13. Logout does not verify chat state is cleared — `frontend/src/components/AuthKanbanApp.test.tsx`

The logout test only checks that the login form reappears. Add an assertion that chat messages are cleared after logout.

---

## Test environment notes (not code issues)

Two E2E test bugs were found and fixed during the test run:

- **Chat test missing panel open step** (`tests/kanban.spec.ts:73`): the test interacted with the chat sidebar without first clicking "AI Chat" to open it. Fixed by adding the click.
- **"Adds a card" test not isolated** (`tests/kanban.spec.ts:23`): hardcoded card title accumulated duplicates across runs. Fixed by using `Date.now()` for uniqueness, matching the adjacent persistence test.

The test suite also requires **Node 25** (or Node 22+) on the host due to `jsdom 27` + `parse5` ESM compatibility. The Docker dev image already uses Node 22, so this only affects running tests outside Docker. Running `nvm use 25` before the test commands resolves it.
