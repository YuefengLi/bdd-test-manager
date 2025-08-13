# Architecture Overview

This project is a small full-stack app with a React frontend and an Express + SQLite (better-sqlite3) backend.

- Frontend (`frontend/`)
  - React with CRA.
  - DnD powered by `@dnd-kit`.
  - API calls centralized in `src/api/client.js`.
  - Tree UI split into modular components under `src/components/tree/`.
  - Cross-file constants live in `src/constants.js`.

- Backend (`backend/`)
  - Express app with CORS and morgan.
  - SQLite via `better-sqlite3` with WAL and FK enabled.
  - Routes expose nodes CRUD, tags ops, effective status/tags, copy/merge, and counts.

Data model basics:
- Table `node`: hierarchical structure (`parent_id`), `type` in {GIVEN, WHEN_GROUP, WHEN}, `explicit_status` in {to do, in progress, done, cancelled, null}, `sort` for sibling order.
- Table `node_tag`: local tag operations (`op` add/remove) which roll up into effective tags.

Key invariants (enforced primarily by backend):
- WHEN nodes cannot have children.
- Copy on drag with Ctrl/Cmd copies entire subtree, pastes as sibling of drop target, resets explicit_status to inherit, and merges by title to skip duplicates.

High-level flow:
1. Frontend loads subtree `GET /nodes?root=1` and per-node effective `GET /nodes/:id/effective`.
2. UI manipulates nodes (create, rename, move, set status, tags) by calling backend endpoints.
3. Drag-and-drop decides Copy vs Move client-side based on modifier keys; backend executes business rules for copy/merge.
