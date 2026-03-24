# Code Review: Kanban Project Management MVP

**Date:** 2026-03-24
**Reviewer:** Claude Code
**Scope:** Full-stack review — backend (FastAPI/Python) and frontend (Next.js/TypeScript)

---

## Executive Summary

The app is a well-structured MVP with functional authentication, real-time board updates, and AI integration. Code quality is generally good with proper separation of concerns and comprehensive test coverage. However, there are **critical security vulnerabilities** and several code quality issues that should be addressed before any production deployment.

---

## 1. Security Issues

### 1.1 Exposed API Key in Repository — CRITICAL

**File:** `.env`

The OpenRouter API key is committed to version control and visible in git history.

**Action required:**
- Regenerate the API key immediately
- Remove `.env` from git history using `git filter-branch` or BFG Repo-Cleaner
- Ensure `.env` is in `.gitignore` and add a `.env.example` template
- Use environment-specific secret management for production

---

### 1.2 Hardcoded Default Credentials — HIGH

**File:** `backend/app/main.py:39-40`

```python
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "user")
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "password")
```

Any deployment that doesn't explicitly set these env vars will accept `user`/`password` as valid credentials.

**Recommendation:** Remove the defaults and raise a startup error if the variables are not set.

---

### 1.3 No Rate Limiting on Login Endpoint — MEDIUM

**File:** `backend/app/main.py` — `POST /api/auth/login`

The login endpoint has no rate limiting, making brute-force attacks trivial.

**Recommendation:** Add rate limiting (e.g., `slowapi`) — 5 attempts per minute per IP with exponential backoff.

---

### 1.4 In-Memory Token Storage — MEDIUM

**File:** `backend/app/main.py:44`

```python
issued_tokens: dict[str, tuple[datetime, str]] = {}
```

Tokens are lost on server restart. Fine for MVP, but incompatible with horizontal scaling.

**Recommendation:** Use Redis or a database for token storage in production.

---

### 1.5 No CORS Configuration — MEDIUM

No `CORSMiddleware` is configured, leaving the API open to cross-origin requests.

**Recommendation:** Add explicit CORS policy restricting allowed origins to the frontend domain.

---

## 2. Code Quality

### 2.1 Inefficient Token Cleanup — LOW

**File:** `backend/app/main.py:140-147`

`_cleanup_expired_tokens()` runs on every token validation, making it O(n) overhead per request.

**Recommendation:** Use a background scheduled task (e.g., APScheduler) to clean up tokens periodically instead.

---

### 2.2 Fragile AI Response Parsing — MEDIUM

**File:** `backend/app/main.py:214-243`

The AI chat response parser tries multiple strategies (code fences, brace extraction) and silently swallows `json.JSONDecodeError`. A response like `{"a":1} {"b":2}` would silently fail.

**Recommendation:** Fail loudly with structured errors, log malformed outputs, and consider feeding parse errors back to the AI for self-correction.

---

### 2.3 No Board Data Integrity Validation — MEDIUM

**File:** `backend/app/main.py:317-331`

The `PUT /api/board` endpoint accepts board updates without checking:
- Card IDs in columns actually exist in the cards dict
- A card doesn't appear in multiple columns
- No orphaned cards

**Recommendation:** Add a `validate_board()` function to enforce these invariants before saving.

---

### 2.4 Missing Error Logging — LOW-MEDIUM

Most exception paths return HTTP errors without logging anything. Silent failures (e.g., `except json.JSONDecodeError: continue`) make debugging difficult.

**Recommendation:** Add `logger.warning()`/`logger.error()` calls at all exception paths, especially auth failures and AI parse errors.

---

### 2.5 No Request Size Limits — LOW-MEDIUM

No limits on request body size or message length. A large board payload or very long chat message could cause issues.

**Recommendation:** Add `max_body_size` middleware and Pydantic `Field(max_length=...)` constraints on user inputs.

---

### 2.6 Potential Race Condition in Board Saves — LOW

**File:** `frontend/src/components/AuthKanbanApp.tsx:132-149`

Board saves are queued sequentially, but rapid changes could queue stale states. If changes happen faster than saves complete, earlier queued states could overwrite newer ones.

**Recommendation:** Debounce saves (keep only the latest pending save) rather than queuing all intermediate states.

---

### 2.7 No Timeout on Frontend API Calls — LOW

**File:** `frontend/src/lib/api.ts`

`fetch()` calls have no timeout and can hang indefinitely on a slow/unresponsive backend.

**Recommendation:** Wrap requests with `AbortController` and a 30-second default timeout.

---

## 3. Architecture

### 3.1 `main.py` Is Doing Too Much — LOW

`backend/app/main.py` contains configuration, auth logic, Pydantic models, AI utilities, and all API endpoints in one file.

**Recommendation:**
- `app/schemas.py` — Pydantic models
- `app/auth.py` — token issuance and validation
- `app/routes/` — endpoint handlers
- Keep `main.py` for app setup only

---

### 3.2 Conversation History Not Persisted — LOW-MEDIUM

Chat history lives only in React state and is lost on page refresh.

**Recommendation:** Persist conversation history to `localStorage` or a backend endpoint.

---

### 3.3 JSON Blob Storage for Board Data — LOW-MEDIUM

**File:** `backend/app/board_store.py`

Board data is stored as a JSON TEXT blob in SQLite. This makes querying, indexing, or migrating board contents impossible at the database level.

**Recommendation:** Acceptable for MVP. For production, normalize into `columns` and `cards` tables.

---

### 3.4 No Database Migrations — LOW-MEDIUM

Schema is created inline in `initialize_database()` with no migration system.

**Recommendation:** Introduce Alembic to manage schema evolution.

---

## 4. Testing

### 4.1 Good Coverage Overall — POSITIVE

The project has solid test coverage: board store operations, auth API, AI client, chat API, and frontend component tests.

### 4.2 Missing Test Cases — MEDIUM

- Token expiration cleanup
- Board validation edge cases (orphaned cards, duplicate card placement)
- Concurrent board update behavior
- Large payload handling
- XSS prevention in rendered chat messages

### 4.3 Parallel Test Safety — LOW

`issued_tokens.clear()` is called in every test. Parallel test runs (e.g., with `pytest-xdist`) could cause flakiness.

**Recommendation:** Isolate token state via fixtures or dependency injection.

---

## 5. Performance

### 5.1 `useMemo` on Object Reference Has No Effect — LOW

**File:** `frontend/src/components/KanbanBoard.tsx:47`

```typescript
const cardsById = useMemo(() => board.cards, [board.cards]);
```

`board.cards` is a new object reference on every board update, so the memo is always invalidated. This provides no benefit.

**Recommendation:** Use `board.cards` directly, or restructure to a stable `Map`.

---

### 5.2 AI Timeout May Be Too Short — LOW

**File:** `backend/app/ai_client.py:9`

```python
OPENROUTER_TIMEOUT_SECONDS = 20.0
```

20 seconds may not be sufficient for complex queries or high-latency periods.

**Recommendation:** Increase to 30-60 seconds and surface timeout errors to the user in the chat UI.

---

## 6. Frontend UX

### 6.1 Generic Error Messages — LOW-MEDIUM

**File:** `frontend/src/components/AuthKanbanApp.tsx:73-78`

Errors from board loading and chat always show the same generic message regardless of the cause (auth, network, server error).

**Recommendation:** Parse response status codes and display context-specific error messages.

---

### 6.2 Missing Accessibility — LOW-MEDIUM

- Drag-and-drop has no screen reader feedback
- ARIA labels on icon buttons need review
- No `aria-live` regions for state changes (e.g., AI applying board changes)

**Recommendation:** Run an automated audit with `axe-core` and address critical violations.

---

### 6.3 sessionStorage Clears on Tab Close — LOW

**File:** `frontend/src/components/AuthKanbanApp.tsx:46`

Using `sessionStorage` means users must log in every time they open a new tab. The 8-hour token TTL suggests the intent is longer sessions.

**Recommendation:** Document the tradeoff. Consider `localStorage` with explicit logout, or `httpOnly` cookies for better security.

---

## 7. Deployment & Configuration

### 7.1 No Docker Healthcheck — LOW

**File:** `docker-compose.yml`

No `healthcheck` is defined, so container orchestrators cannot verify service health.

**Recommendation:**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### 7.2 No `.env.example` — LOW

Users cloning the repo have no template for required environment variables.

**Recommendation:** Add `.env.example` with all required keys documented (with placeholder values).

---

## Summary

| Category | Severity | Items |
|---|---|---|
| Security | CRITICAL | 1 |
| Security | HIGH | 1 |
| Security | MEDIUM | 3 |
| Code Quality | MEDIUM | 3 |
| Code Quality | LOW | 4 |
| Architecture | MEDIUM | 2 |
| Testing | MEDIUM | 1 |
| Performance / UX / Infra | LOW | 8 |

---

## Critical Actions (Do First)

1. **Rotate the OpenRouter API key** — it is exposed in git history
2. **Remove `.env` from git history** — use BFG Repo-Cleaner
3. **Require env vars for auth credentials** — remove `"user"`/`"password"` defaults
4. **Add rate limiting to `/api/auth/login`**
5. **Add board integrity validation** on `PUT /api/board`

---

## Positives

- Strong type safety throughout (TypeScript + Python type hints)
- Clean API design with proper HTTP semantics
- Efficient Docker multi-stage build
- Good separation of concerns across files
- Solid test coverage for core paths
- Proper async/await usage
- Good use of React hooks and composition
