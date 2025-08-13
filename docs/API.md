# API

Base URL: `http://localhost:3000` (configurable for frontend via `REACT_APP_API_BASE`)

- GET /health
  - Response: `{ ok: true }`

- GET /nodes?root=:id
  - Desc: Returns subtree (flat list) under root id.
  - Response: `[{ id, parent_id, type, title, description, sort, explicit_status, version, created_at, updated_at }, ...]`

- GET /nodes/:id
  - Desc: Fetch single node.

- POST /nodes
  - Body: `{ parent_id?: number|null, type: 'GIVEN'|'WHEN_GROUP'|'WHEN', title: string, description?: string|null, explicit_status?: 'to do'|'in progress'|'done'|'cancelled'|null, sort?: number|null }`
  - Response: created node.

- PATCH /nodes/:id
  - Body (any subset): `{ title?, description?, explicit_status?, parent_id?, sort?, version? }`
  - Notes: rejects invalid `explicit_status`; optimistic concurrency via `version`.
  - Response: updated node.

- DELETE /nodes/:id
  - Cascades to subtree.
  - Response: 204 No Content

- GET /nodes/:id/effective
  - Desc: Effective (inherited) status and tags.
  - Response: `{ status: string, tags: string[] }`

- PUT /nodes/:id/tags
  - Body: `[{ tag: string, op: 'add'|'remove' }, ...]`
  - Response: `{ ok: true, effective: { status, tags } }`

- PATCH /nodes/:id/tags
  - Body: `{ tag: string, op: 'add'|'remove', action?: 'add'|'delete' }`
  - Response: `{ ok: true, effective: { status, tags } }`

- GET /nodes/:id/counts
  - Desc: Ancestor-aware WHEN-leaf count.
  - Response: `{ leaf_when_count: number }`

- POST /nodes/:id/copy
  - Body: `{ target_parent_id?: number|null, sibling_of: number, include_subtree: true, reset_explicit_to_inherit: true, skip_duplicates: true }`
  - Behavior:
    - Enforces: WHEN cannot have children; copy entire subtree; paste as sibling of target; reset explicit_status to inherit; skip duplicates (merge-by-title).
  - Response: `{ new_root_id?: number, created: Array<{oldId, newId}>, merged: Array<{sourceOldId, targetExistingId}>, skipped: Array<{oldId, reason}> }`
