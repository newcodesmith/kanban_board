# Code Review: Project Management MVP

## Overview

Next.js + FastAPI Kanban application with SQLite persistence, token-based auth, and AI chat via OpenRouter. Architecture is straightforward and well-organized for an MVP.

---

## Backend Review (`backend/`)

### Strengths
- Clean REST API structure (`/api/auth/*`, `/api/board`, `/api/ai/*`)
- Proper separation: `board_store.py` handles DB, `ai_client.py` handles AI
- Token management with expiry cleanup is appropriate for MVP
- Custom error handling with typed `AIClientError`
- Pydantic validation on all request/response models
- Auto-creating DB on startup

### Issues & Recommendations

**1. Security - Token storage is in-memory** (`main.py:44`)
- Tokens lost on restart, forcing re-login
- Recommendation: Document as known MVP limitation, consider Redis for production

**2. Security - Hardcoded fallback credentials** (`main.py:39-40`)
- Defaults to `user/password` if env vars not set
- Recommendation: Fail fast if env vars missing in production

**3. Missing rate limiting** (`main.py`)
- No rate limiting on auth or AI endpoints
- Recommendation: Add before production

**4. SQLite connection handling** (`board_store.py:64-68`)
- Creates new connection per operation - not thread-safe
- Recommendation: Use connection pooling

**5. No XSS protection** on AI-injected content
- Board content rendered without sanitization
- Recommendation: Add sanitization if content ever rendered as HTML

---

## Frontend Review (`frontend/`)

### Strengths
- Clean component structure (Board > Column > Card)
- TypeScript throughout with proper types
- Good state management with useState/useEffect/useRef
- Proper dnd-kit integration
- Design tokens in CSS variables match spec
- Loading states, error handling, debounced save queue

### Issues & Recommendations

**1. Unbounded save queue** (`AuthKanbanApp.tsx:35`)
- Promise chain could grow indefinitely
- Recommendation: Add queue size limit

**2. Missing error boundary** (`AuthKanbanApp.tsx`)
- No React error boundary
- Recommendation: Add error boundary wrapper

**3. Token validation on startup** (`AuthKanbanApp.tsx:44-65`)
- Extra network call on every page load
- Recommendation: Could rely on API errors instead

**4. Chat history unbounded** (`AuthKanbanApp.tsx:28`)
- Grows indefinitely during session
- Recommendation: Trim old messages (backend sends 8, frontend keeps all)

**5. Missing accessibility**
- No ARIA live regions for dynamic updates
- Keyboard navigation could be improved

**6. No optimistic UI for card operations**
- Adding/deleting waits for API response

---

## Testing Review

**Backend tests exist for:**
- Auth endpoints
- Board CRUD
- AI client
- Chat endpoint
- DB operations

**Frontend tests exist for:**
- Unit tests for components
- API client tests
- E2E tests with Playwright

**Observations:**
- Good test organization by feature
- Missing: Edge cases like malformed board JSON, concurrent writes

---

## Docker & Infrastructure

- Multi-stage Dockerfile appropriate
- Using `npm ci` (good)
- Missing: Container health check

---

## Summary

**High Priority:**
1. Add environment validation (fail if AUTH credentials not set)
2. Add rate limiting to API endpoints
3. Add React error boundary
4. Add request logging/tracing

**Medium Priority:**
5. Bound chat message history
6. Add XSS protection
7. SQLite connection pooling
8. Add container health check

**Low Priority:**
9. Request correlation IDs
10. Optimistic UI updates
11. Improve keyboard accessibility

---

The codebase is well-structured for an MVP. Core functionality is correctly implemented. No critical security issues for MVP, but rate limiting and input validation should be added before production.