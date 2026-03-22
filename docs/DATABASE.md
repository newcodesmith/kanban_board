# Database modeling proposal (Part 5)

## Goal

Provide a simple SQLite model for MVP that:

- Supports multiple users
- Stores exactly one Kanban board per user
- Stores board content as JSON for fast delivery in MVP
- Is easy to initialize on first run

## Proposed database

- Engine: SQLite
- File location (proposal): `backend/data/app.db`
- Foreign keys: enabled on connection (`PRAGMA foreign_keys = ON`)

## Proposed schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  board_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
```

## Why this shape

- `users` enables future multi-user support with stable IDs.
- `boards.user_id UNIQUE` guarantees one board per user for MVP.
- `board_json` keeps current frontend board shape intact and avoids premature normalization.
- Timestamp fields support lightweight auditing and future sync/debug support.

## Board JSON contract (stored in `boards.board_json`)

```json
{
  "columns": [
    { "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"] }
  ],
  "cards": {
    "card-1": {
      "id": "card-1",
      "title": "Example",
      "details": "Example details"
    }
  }
}
```

## Backend behavior proposal (for Part 6)

1. On startup, ensure DB directory exists.
2. Open SQLite connection.
3. Run schema SQL (`CREATE TABLE IF NOT EXISTS ...`).
4. Ensure default MVP user row exists for username `user`.
5. Ensure default board row exists for that user.

This keeps startup deterministic and guarantees first-run readiness.

## Read/write contract proposal

- Read board: `SELECT board_json FROM boards WHERE user_id = ?`
- Write board: `UPDATE boards SET board_json = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`

If write finds no row, fallback to `INSERT` once for that user.

## Migration approach proposal

- Use a lightweight SQL migration table:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- Versioned SQL files in `backend/migrations/` (example: `001_init.sql`).
- On startup, apply unapplied migrations in lexical order.

For MVP, a single init migration is sufficient; this path keeps future changes predictable.

## Practical validation done for this proposal

- Schema supports all current frontend board fields (`columns`, `cards`, `title`, `details`, `cardIds`).
- Round-trip model validated with SQLite insert + select of one user board JSON.

## Tradeoffs and future path

- JSON storage is optimal for MVP speed and schema stability while frontend evolves.
- Future optimization can normalize cards/columns into separate tables without breaking auth/user model.
- Keeping `users` and `boards` separate now avoids costly data migration later.
