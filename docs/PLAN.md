# Project plan

Execution model: complete one part at a time, then pause for user approval before starting the next part.

Test scope baseline for all parts: practical MVP coverage (core happy paths + key negative cases), not exhaustive edge-case coverage.

## Part 1: Planning and documentation

### Scope checklist
- [x] Expand this plan with concrete substeps, test plan, and success criteria for Parts 2-10
- [x] Document frontend baseline in `frontend/AGENTS.md`
- [x] Confirm auth direction for MVP (token-based)
- [x] Pause and request user approval

### Tests
- [x] No runtime tests required (documentation-only part)
- [x] Validate links, file paths, and command references are accurate

### Success criteria
- [x] Plan is actionable and broken into checklists
- [x] Each part includes test and success criteria sections
- [x] User explicitly approves before Part 2

## Part 2: Scaffolding (Docker + backend skeleton + scripts)

### Scope checklist
- [x] Create Dockerfile and docker-compose setup for local run
- [x] Scaffold FastAPI app in `backend/`
- [x] Add minimal hello-world HTML route and one example API route
- [x] Add start/stop scripts for macOS, Linux, and Windows in `scripts/`
- [x] Ensure Python deps use `uv` inside container

### Tests
- [x] Build container successfully
- [x] Start app via scripts on host machine
- [x] Verify `/` returns hello-world HTML
- [x] Verify example API route returns JSON

### Success criteria
- [x] One command path to build and run locally in Docker
- [x] Backend reachable at expected port
- [x] Both HTML and API endpoints confirmed

## Part 3: Serve frontend from backend

### Scope checklist
- [x] Build Next.js frontend for static export/output strategy chosen for FastAPI serving
- [x] Configure FastAPI static file serving for frontend assets and index at `/`
- [x] Keep API routes under `/api/*`
- [x] Preserve current Kanban demo behavior in browser

### Tests
- [x] Frontend unit tests pass
- [x] Frontend e2e smoke tests pass against served app
- [x] Route checks: `/` serves app shell, `/api/*` still works

### Success criteria
- [x] Demo Kanban UI is visible at `/` via backend-served app
- [x] No broken assets or route conflicts
- [x] Test commands documented and passing

## Part 4: MVP sign-in (token-based)

### Scope checklist
- [x] Add login screen at initial access to `/`
- [x] Accept only hardcoded credentials: `user` / `password`
- [x] Implement token-based auth flow (issue/validate token)
- [x] Persist auth state for current browser session
- [x] Add logout that clears token and returns to login

### Tests
- [x] Unit tests for login form validation and transitions
- [x] API tests for token issuance and invalid credentials
- [x] E2E: login success path and logout path
- [x] E2E: unauthenticated access blocked from Kanban

### Success criteria
- [x] Kanban inaccessible without valid token
- [x] Login/logout flows are stable and reproducible
- [x] Dummy credential behavior matches spec exactly

## Part 5: Database modeling

### Scope checklist
- [ ] Propose SQLite schema supporting multiple users
- [ ] Store one board JSON document per user for MVP simplicity
- [ ] Define migration/init strategy that creates DB if absent
- [ ] Document schema and rationale in `docs/`
- [ ] Pause for user sign-off before implementation in Part 6

### Tests
- [ ] Validate schema can represent all current board data
- [ ] Validate sample insert/select round-trip for one user board JSON

### Success criteria
- [ ] Schema doc approved by user
- [ ] Data model supports future multi-user extension
- [ ] Initialization strategy is clear and deterministic

## Part 6: Backend Kanban APIs

### Scope checklist
- [ ] Implement DB initialization on startup (create if missing)
- [ ] Add token-protected endpoints to read/update board for current user
- [ ] Validate request payloads and return consistent response shapes
- [ ] Add clear error responses for auth and data issues

### Tests
- [ ] Backend unit tests for service/repository logic
- [ ] Backend API tests for auth-protected read/write routes
- [ ] Negative tests: invalid token, malformed payload

### Success criteria
- [ ] Authenticated user can persist and retrieve board data
- [ ] Unauthorized requests are rejected consistently
- [ ] DB file auto-creates on first run

## Part 7: Frontend + backend integration

### Scope checklist
- [ ] Replace local in-memory board usage with API-backed state
- [ ] Load board on app start after auth
- [ ] Persist rename/add/delete/move actions through backend
- [ ] Add minimal loading/error states

### Tests
- [ ] Frontend unit tests for API integration boundaries (mocked)
- [ ] Integration/e2e tests for persistence across refresh
- [ ] E2E for core card and column interactions with backend

### Success criteria
- [ ] Board changes survive page reload
- [ ] UI remains responsive and behaviorally equivalent to current demo
- [ ] Integration test suite covers core paths

## Part 8: AI connectivity (OpenRouter)

### Scope checklist
- [ ] Add backend AI client using `OPENROUTER_API_KEY`
- [ ] Configure model `openai/gpt-oss-120b`
- [ ] Add backend route to run a basic connectivity prompt
- [ ] Implement timeout and concise error handling

### Tests
- [ ] Unit test for AI client request construction (mock HTTP)
- [ ] Integration test path with mocked provider response
- [ ] Manual live check prompt `2+2` when key is present

### Success criteria
- [ ] Backend can successfully call OpenRouter
- [ ] Failures return safe, actionable error messages
- [ ] Connectivity path is isolated and testable

## Part 9: Structured output for chat + board update intent

### Scope checklist
- [ ] Define structured output schema: assistant message + optional board update
- [ ] Send board JSON + user message + conversation history to model
- [ ] Validate model output against schema before applying
- [ ] Return both chat response and optional board update payload

### Tests
- [ ] Unit tests for schema validation and parsing
- [ ] Unit tests for no-update and with-update model responses
- [ ] Integration tests with mocked AI responses for deterministic behavior

### Success criteria
- [ ] Backend consistently returns typed response contract
- [ ] Invalid model output is rejected safely
- [ ] Optional board updates are explicit and auditable

## Part 10: Sidebar AI chat UI + live board refresh

### Scope checklist
- [ ] Add sidebar chat UI in frontend layout
- [ ] Send user prompts and display conversation history
- [ ] Apply backend-provided board updates to UI state
- [ ] Refresh board immediately when update payload is present
- [ ] Keep UX minimal and aligned with existing design tokens

### Tests
- [ ] Component tests for chat input/message rendering
- [ ] Integration tests for successful chat roundtrip
- [ ] E2E test for AI-triggered board update reflected in Kanban UI

### Success criteria
- [ ] User can chat with AI from sidebar
- [ ] AI responses render reliably
- [ ] Board updates from AI appear automatically without manual refresh

## Notes for execution

- Use latest stable libraries and simple, idiomatic implementations.
- Avoid adding extra features beyond stated requirements.
- Keep README and docs concise.
- At the end of each part, summarize changes, test evidence, and request approval to continue.