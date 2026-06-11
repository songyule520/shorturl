# Short URL Service — Design Spec

**Date:** 2026-06-11  
**Stack:** Node.js, Express, better-sqlite3, SQLite, plain HTML

---

## Overview

A lightweight URL shortener service. Users manually define short keys (e.g. `1`, `abc`) that map to destination URLs. Visiting `34.cn/1` issues a 302 redirect to the configured destination. A web-based admin page allows managing links without touching the database directly.

---

## Architecture

Single Node.js process. No build step. SQLite database file created automatically on first run.

```
shorturl/
├── app.js          # Express server, route definitions
├── db.js           # SQLite init, CRUD helpers
├── views/
│   └── admin.html  # Admin UI (HTML + fetch)
├── links.db        # SQLite file (auto-created at runtime)
└── package.json
```

---

## Data Model

One table:

```sql
CREATE TABLE IF NOT EXISTS links (
  key        TEXT PRIMARY KEY,
  url        TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

- `key` — the short code (e.g. `1`, `abc`). No leading slash stored.
- `url` — full destination URL (e.g. `https://www.baidu.com`).
- `created_at` — Unix timestamp, set on insert.

---

## Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:key` | Look up key in DB; 302 redirect if found, 404 if not |
| `GET` | `/admin` | Serve admin HTML page |
| `GET` | `/api/links` | Return all links as JSON array |
| `POST` | `/api/links` | Add a link `{ key, url }` |
| `DELETE` | `/api/links/:key` | Delete a link by key |

**Route conflict:** `/admin` is registered before `/:key` so it is never treated as a short key.

---

## Redirect Behavior

- HTTP **302** (temporary redirect) on every request — no browser caching, supports real-time updates and future click counting.
- If key not found: return HTTP 404 with plain text `Not found`.

---

## Admin UI

Single HTML page served from `views/admin.html`. No framework, no build.

- **Add form** at top: two inputs (`key`, `url`) + submit button. Calls `POST /api/links`.
- **Links table** below: columns — Key, Destination URL, Created At, Action.
- Each row has a **Delete** button. Calls `DELETE /api/links/:key`.
- Table auto-refreshes after add or delete via `fetch`.

---

## Error Handling

- Duplicate key on insert → return HTTP 409 with `{ error: "Key already exists" }`.
- Missing `key` or `url` in POST body → return HTTP 400 with `{ error: "key and url are required" }`.
- All other errors → HTTP 500.

---

## Dependencies

```json
{
  "express": "^4",
  "better-sqlite3": "^9"
}
```

No other runtime dependencies.

---

## Out of Scope

- Authentication on admin page (assumed internal/trusted network)
- Auto-generated short codes
- Click analytics
- HTTPS termination (handled by reverse proxy like Nginx)
