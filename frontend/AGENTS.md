# Frontend agent notes

This document describes the current frontend MVP in `frontend/`.

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4
- Drag and drop via `@dnd-kit/core` and `@dnd-kit/sortable`
- Unit tests with Vitest + Testing Library
- E2E tests with Playwright

## Current app behavior

- Entry route `/` renders an auth gate from `src/app/page.tsx`.
- User must sign in with hardcoded credentials (`user` / `password`) before seeing the board.
- Auth token is stored in `sessionStorage` for browser-session persistence.
- Logout clears session token and returns to login screen.
- Board remains client-side and in-memory after login (no board persistence yet).
- Board has 5 columns by default and seeded card data from `src/lib/kanban.ts`.
- Supported interactions:
  - Rename column titles inline
  - Add cards per column
  - Remove cards
  - Drag cards within and across columns
- No board persistence and no AI chat yet.

## Key files

- `src/app/page.tsx`: renders auth-gated app entry.
- `src/components/AuthKanbanApp.tsx`: login/logout flow and token validation.
- `src/components/KanbanBoard.tsx`: top-level board state and dnd handlers.
- `src/components/KanbanColumn.tsx`: column UI, rename input, drop zone, new card form.
- `src/components/KanbanCard.tsx`: sortable card UI and remove action.
- `src/components/NewCardForm.tsx`: inline add-card form.
- `src/components/KanbanCardPreview.tsx`: drag overlay preview.
- `src/lib/kanban.ts`: board types, seed data, `moveCard`, `createId`.
- `src/app/globals.css`: theme tokens and global styles.

## State and data flow

- `KanbanBoard` owns `board` state (`columns` + `cards`) and active drag card state.
- Child components receive callbacks for rename/add/delete.
- Card movement is centralized in `moveCard(columns, activeId, overId)`.
- IDs for new cards are generated client-side by `createId`.

## Styling and design tokens

- Color tokens in `:root` align with project palette:
  - `--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`
- Additional surface/stroke/shadow tokens are used for current look and feel.
- Components use utility classes and CSS variables.

## Existing tests

- Unit/component:
  - `src/components/AuthKanbanApp.test.tsx`
  - `src/components/KanbanBoard.test.tsx`
  - `src/lib/kanban.test.ts`
- E2E:
  - `tests/kanban.spec.ts`

## Commands

- `npm run dev`
- `npm run build`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run test:all`

## Constraints for future work

- Keep UX simple and focused on MVP requirements.
- Preserve current visual language unless requirements explicitly change.
- Prefer minimal, targeted changes over broad refactors.