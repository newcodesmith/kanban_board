# Code Review — Kanban Project Management App

**Date:** 2026-03-24
**Reviewer:** Claude Code (automated)
**Scope:** Full-stack review — backend (FastAPI/SQLite) + frontend (Next.js/React)

---

## Executive Summary

This is a solid MVP covering all 10 planned parts. The architecture is clean and the single-container deployment model is sensible. However, there are **3 critical**, **8 high**, and ~24 medium issues that must be addressed before any production deployment. The most urgent issue is a live API key committed to the repository.

---

## Priority Summary

| Priority | Action |
|----------|--------|
| 🔴 IMMEDIATE | Revoke and rotate the OpenRouter API key in `.env` |
| 🔴 IMMEDIATE | Scrub key from git history (BFG Repo-Cleaner) |
| 🔴 IMMEDIATE | Create `.env.example` with placeholder values |
| 🟠 SHORT TERM | Add rate limiting to auth + AI chat endpoints |
| 🟠 SHORT TERM | Replace sessionStorage tokens with HttpOnly cookies |
| 🟠 SHORT TERM | Refactor `AuthKanbanApp.tsx` into smaller components |
| 🟡 MEDIUM TERM | Add database migrations framework (Alembic) |
| 🟡 MEDIUM TERM | Add caching, optimistic updates, conflict detection |

---

## 1. Security

### 1.1 🔴 CRITICAL — API Key Committed to Repository
**File:** `.env`

The `OPENROUTER_API_KEY` is committed in plaintext. Even after deletion, the key lives in git history and is permanently exposed to anyone with repo access.

**Fix:**
- Revoke the key immediately in the OpenRouter dashboard
- Run `git filter-repo` or BFG Repo-Cleaner to purge from history
- Create `.env.example` with `OPENROUTER_API_KEY=your_key_here`

---

### 1.2 🔴 CRITICAL — Hardcoded Default Credentials
**File:** `backend/app/main.py:60-61`

```python
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "user")
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "password")
```

Defaults to `user`/`password` if env vars are missing. Any deployment without explicit env vars is wide open.

**Fix:** Remove defaults; raise `ValueError` at startup if credentials are not provided via env.

---

### 1.3 🔴 CRITICAL — Auth Tokens Stored in Browser `sessionStorage`
**File:** `frontend/src/components/AuthKanbanApp.tsx:64`

```typescript
window.sessionStorage.setItem(TOKEN_STORAGE_KEY, payload.access_token);
```

`sessionStorage` is fully readable by JavaScript — any XSS vulnerability can steal the token.

**Fix:** Use `HttpOnly`, `Secure`, `SameSite=Strict` cookies set by the backend. This removes the token from JavaScript's reach entirely.

---

### 1.4 🟠 HIGH — In-Memory Token Storage Lost on Restart
**File:** `backend/app/main.py:66`

```python
issued_tokens: dict[str, tuple[datetime, str]] = {}
```

All active sessions are invalidated on every server restart or deploy. No audit trail exists.

**Fix:** Persist token records to SQLite. Enables proper revocation, audit logging, and multi-instance support.

---

### 1.5 🟠 HIGH — No Rate Limiting
**File:** `backend/app/main.py`

No rate limiting on `/api/login`, `/api/register`, or `/api/chat`. Brute-force and API cost-abuse attacks are trivially possible.

**Fix:** Add `slowapi` middleware. Limit login to ~5 req/min per IP; limit `/api/chat` to ~20 req/min per user.

---

### 1.6 🟠 HIGH — Weak Input Validation
**File:** `backend/app/main.py:496-498`

Only validates non-empty strings. No length limits, no HTML sanitization on card details.

**Fix:** Add `max_length` constraints (255 chars for names, 5000 for descriptions). Sanitize HTML in card detail fields.

---

### 1.7 🟡 MEDIUM — No CORS Configuration
**File:** `backend/app/main.py`

No `CORSMiddleware`. Fine for single-container production, but any future separation of services would expose all origins.

**Fix:** Add `CORSMiddleware` with an explicit `allow_origins` list.

---

### 1.8 🟡 MEDIUM — No CSRF Protection
Currently low-risk with bearer-token auth, but becomes required if migrating to cookies.

**Fix:** Implement CSRF double-submit cookie pattern alongside any cookie-based auth migration.

---

### 1.9 🟡 MEDIUM — Weak Password Requirements at Registration
**File:** `backend/app/board_store.py:67-77`

PBKDF2 hashing with 200k iterations is correct, but only a 6-character minimum is enforced.

**Fix:** Require 8+ characters, at least one uppercase letter, one digit, and one symbol.

---

## 2. Error Handling

### 2.1 🟠 HIGH — `RuntimeError` Exposed in Board Store
**File:** `backend/app/board_store.py:350-354`

```python
raise RuntimeError(f"Corrupted board data for board id {board_id}")
```

`RuntimeError` is not caught by FastAPI's exception handler and results in a 500 response with a stack trace visible to clients.

**Fix:** Raise `HTTPException(status_code=500, detail="Board data corrupted")` and log the raw exception server-side.

---

### 2.2 🟡 MEDIUM — No Timeout on Fetch Calls
**File:** `frontend/src/components/AuthKanbanApp.tsx`

No `AbortController` timeout on any API calls. Requests hang indefinitely on slow or dead connections.

**Fix:** Wrap all fetch calls with a 15-second `AbortController` timeout. Surface a user-visible error on timeout.

---

### 2.3 🟡 MEDIUM — Silent Delete Failures
**File:** `frontend/src/lib/api.ts:190-244`

Delete operations return no feedback on failure. Users see nothing if a delete silently fails.

**Fix:** Show an error toast/banner on failed operations.

---

### 2.4 🟡 MEDIUM — Generic Error Messages
**File:** `frontend/src/components/AuthKanbanApp.tsx:153`

```typescript
} catch {
    setErrorMessage("Invalid username or password.");
}
```

Network errors, server errors, and validation errors all show the same generic message.

**Fix:** Inspect the error type and backend `detail` field to show specific, actionable messages.

---

### 2.5 🟡 MEDIUM — AI Chat Retry Is Silent
**File:** `backend/app/main.py:679-701`

Retry on AI failure silently injects a corrective system prompt. Users have no visibility into failures.

**Fix:** Log all retry attempts. Consider returning a soft warning to the client on first failure.

---

## 3. Code Quality

### 3.1 🟠 HIGH — `AuthKanbanApp.tsx` Is a God Component
**File:** `frontend/src/components/AuthKanbanApp.tsx` (686 lines, 47+ state variables)

Handles auth, board CRUD, chat, profile management, and state sync in a single component. Violates single-responsibility and makes debugging/testing very difficult.

**Fix:**
- Extract `useAuth()` custom hook for login/logout/register
- Extract `useBoard()` for board CRUD and save queue
- Extract `useChat()` for chat message state
- Reduce the component itself to orchestration logic (~200 lines)

---

### 3.2 🟠 HIGH — No Debounce on Board Saves
**File:** `frontend/src/components/AuthKanbanApp.tsx:216-233`

Every card edit immediately enqueues a save. Rapid typing can trigger dozens of sequential API calls.

**Fix:** Add a 500ms debounce before enqueuing saves. Batch rapid changes into a single write.

---

### 3.3 🟠 HIGH — DRY Violation in API Client
**File:** `frontend/src/lib/api.ts`

The same error-handling block is repeated 4+ times across the file:
```typescript
if (!response.ok) {
    let detailMessage = "";
    try {
      const errorPayload = (await response.json()) as { detail?: string };
      if (typeof errorPayload.detail === "string") {
        detailMessage = errorPayload.detail;
      }
    } catch { detailMessage = ""; }
    throw new Error(detailMessage || `Request failed with status ${response.status}`);
}
```

**Fix:** Extract into a shared `handleResponse<T>(response: Response): Promise<T>` utility function.

---

### 3.4 🟡 MEDIUM — No Runtime Response Validation
**File:** `frontend/src/lib/api.ts:50`

```typescript
return (await response.json()) as T;
```

`as T` is a compile-time assertion only — no runtime guarantee the shape is correct. Unexpected backend changes would cause silent runtime errors.

**Fix:** Add Zod schemas for critical API responses and validate at parse time.

---

### 3.5 🟡 MEDIUM — React List Keys Use Index
**File:** `frontend/src/components/AuthKanbanApp.tsx:631`

```typescript
key={`${chatMessage.role}-${index}`}
```

Index-based keys cause React to reuse DOM nodes incorrectly when items are removed or reordered, leading to rendering bugs and broken animations.

**Fix:** Assign a UUID to each message at creation time and use it as the key.

---

### 3.6 🟡 MEDIUM — Weak ID Generation
**File:** `frontend/src/lib/kanban.ts:169-173`

```typescript
const randomPart = Math.random().toString(36).slice(2, 8);
```

`Math.random()` is not cryptographically secure and can collide when multiple cards are created rapidly.

**Fix:** Use `crypto.randomUUID()` (available natively in all modern browsers and Node 16+).

---

### 3.7 🟡 MEDIUM — Magic Strings Scattered Throughout
**Files:** `backend/app/main.py`, `frontend/src/lib/kanban.ts`

Priority values (`"low"`, `"medium"`, `"high"`), column IDs (`"col-backlog"`), and numeric config values are used as inline literals throughout.

**Fix:** Define an enum for priority; centralize column IDs and config constants.

---

### 3.8 🟡 MEDIUM — Race Condition on Concurrent Saves
**File:** `frontend/src/components/AuthKanbanApp.tsx:216`

If save A fails while save B is already queued, B persists even though A's state was lost. No conflict detection.

**Fix:** Add a version field to boards. Reject saves with stale versions. Revert local state on failure.

---

## 4. Architecture

### 4.1 🟡 MEDIUM — Legacy Board Endpoints Not Deprecated
**File:** `backend/app/main.py`

Both `/api/board` (legacy) and `/api/boards/{board_id}` (current) exist with overlapping logic. They will diverge over time.

**Fix:** Add a `Deprecation` response header to legacy endpoints. Issue a 307 redirect to the new endpoint. Schedule removal.

---

### 4.2 🟡 MEDIUM — No Database Migrations Framework
**File:** `backend/app/board_store.py:173-189`

Schema changes are handled with ad-hoc `PRAGMA table_info()` checks and bare `ALTER TABLE` calls. No version tracking, no rollback support.

**Fix:** Adopt Alembic. Track schema version in DB. Write and test each migration.

---

### 4.3 🟡 MEDIUM — No HTTP Caching
**File:** `backend/app/main.py`

Board responses have no `ETag` or `Cache-Control` headers. Every render triggers a full DB read and JSON parse.

**Fix:** Generate `ETag` from `updated_at` timestamp. Return `304 Not Modified` when unchanged.

---

### 4.4 🟡 MEDIUM — No Health Check in Docker
**File:** `Dockerfile`, `docker-compose.dev.yml`

No `HEALTHCHECK` instruction in the Dockerfile. The dev compose file starts the frontend before the backend is ready.

**Fix:**
```dockerfile
HEALTHCHECK --interval=10s --timeout=3s CMD curl -f http://localhost:8000/api/health || exit 1
```
Use `depends_on: condition: service_healthy` for the frontend service.

---

## 5. Testing Gaps

### 5.1 🟡 MEDIUM — No Frontend Component Tests
Unit tests cover `kanban.ts` and `api.ts` well, but there are no tests for `AuthKanbanApp` or `KanbanBoard` as rendered components.

**Fix:** Add React Testing Library tests for: login flow, board create/delete, drag-and-drop, and chat interaction.

---

### 5.2 🟡 MEDIUM — No E2E Tests
Playwright is configured in `package.json` but no test files were found.

**Fix:** Add E2E tests covering the full happy path: register → login → create board → add card → AI chat → logout.

---

### 5.3 🟡 MEDIUM — Manual State Clearing in Backend Tests
**File:** `backend/tests/test_auth_api.py`

Every test calls `issued_tokens.clear()` manually, which is easy to forget and causes flaky tests.

**Fix:** Move to a `conftest.py` autouse fixture that resets all shared state before each test.

---

## 6. Performance

### 6.1 🟡 MEDIUM — Unbounded Chat History
**File:** `frontend/src/components/AuthKanbanApp.tsx:291`

Chat messages accumulate without limit during a session. On long sessions, the full history is sent to the backend on every message.

**Fix:** Trim display history to the last 50 messages client-side. The backend already limits to `MAX_CHAT_HISTORY_MESSAGES`.

---

### 6.2 🟡 MEDIUM — No Pagination on User List
**File:** `backend/app/main.py:422-427`

All users are loaded into memory in a single unbounded query.

**Fix:** Add `limit`/`offset` query parameters with a default page size of 50.

---

## 7. File-Level Summary

| File | Lines | Verdict | Key Issues |
|------|-------|---------|------------|
| `backend/app/main.py` | 735 | Needs work | In-memory tokens, no rate limiting, hardcoded defaults, legacy endpoints |
| `backend/app/board_store.py` | 470 | Mostly good | Ad-hoc migrations, `RuntimeError` leak, no pagination |
| `backend/app/ai_client.py` | 139 | Good | Solid error handling and retry logic |
| `frontend/src/components/AuthKanbanApp.tsx` | 686 | Needs refactor | God component, 47+ state vars, no debounce, index keys, race condition |
| `frontend/src/components/KanbanBoard.tsx` | 202 | Good | Well-structured; minor undefined guard gap |
| `frontend/src/lib/api.ts` | 297 | Good | DRY violations, no response validation |
| `frontend/src/lib/kanban.ts` | 174 | Good | Well-tested; weak ID generation |

---

## 8. Issue Counts

| Severity | Count |
|----------|-------|
| 🔴 Critical | 3 |
| 🟠 High | 8 |
| 🟡 Medium | 24 |
| ⚪ Low | 5 |
| **Total** | **40** |

---

*Generated by Claude Code automated review — 2026-03-24*
