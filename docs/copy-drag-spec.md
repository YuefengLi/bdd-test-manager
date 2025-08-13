# Copy-on-Drag (Ctrl/Cmd) Spec

This document specifies the expected behaviors and alternatives for the "drag while holding Ctrl/Cmd to copy" feature in the test tree app.

Relevant files:
- Frontend: `frontend/src/DndKitTestTree.jsx` (dnd-kit tree, current `onMove()` and `handleDragEnd()`)
- Backend: `backend/server.js` (Express + better-sqlite3 API, `node`, `node_tag` tables)

Authoritative decisions are highlighted as Chosen. Non-chosen alternatives include pros/cons.

---

## 1) Trigger and Mode

- Chosen: Hold Ctrl (Windows/Linux) or Cmd (macOS) during drag to indicate copy mode.
- Visual cue: show a “+”/copy badge or cursor while dragging in copy mode.

Implementation notes (frontend):
- Track modifier key state at drag start and during drag in `DndTree`.
- In `handleDragEnd()`, if copy mode is active, call `onCopy(...)`; otherwise call existing `onMove(...)`.

Alternatives:
- Force a keyboard-only copy command after drop.
  - Pros: simpler code, no dynamic cursor state.
  - Cons: worse UX; users expect Ctrl+drag for copy.

---

## 2) What Gets Copied

- Chosen: Copy the entire subtree of the dragged node.
  - All descendants are duplicated with new IDs.
  - New records have fresh `id`, `created_at`, `updated_at`, and `version = 1`.

Fields copied per node (`server.js` schema):
- `type`, `title`, `description` are cloned.
- `explicit_status` is reset to inherit (null). See section 5.
- Local `node_tag` ops are cloned to preserve effective tags behavior at the new location.

Alternatives:
- Copy only the single node (no children).
  - Pros: faster, simpler for small adjustments.
  - Cons: often not what users want; loses structure.

---

## 3) Where It Gets Pasted (Drop Semantics)

- Chosen: Always paste as a sibling of the drop target (mirrors current move behavior in `onMove()`), using a sort value adjacent to the target (`over.sort + 0.5`).
- After any copy, refresh and optionally normalize sort indexes later if needed.

Alternatives:
- If the target is a container (e.g., `GIVEN`, `WHEN_GROUP`), paste as its last child; otherwise paste as sibling.
  - Pros: more intuitive when dropping onto groups.
  - Cons: adds complexity and special-cases; less consistent with current move behavior.

---

## 4) Node Type Rules

- Chosen: Enforce "`WHEN` cannot have children" as a general validation rule on copy (and move if applicable). Copying places nodes as siblings, so this mainly prevents creating structures where a `WHEN` would end up with children.
- Otherwise, types are allowed in any sibling relationship (no additional restrictions beyond current schema).

Alternatives:
- Strict type hierarchy (e.g., `GIVEN` → `WHEN_GROUP` → `WHEN`).
  - Pros: formal structure prevents invalid states.
  - Cons: requires broader validation changes and migrations.

---

## 5) Duplicate Titles at Destination

- Chosen: Merge on duplicate title.
  - If a node to be copied has the same `title` as an existing sibling at the destination level, do not create a new node. Instead, treat the existing node as the merge target and attempt to copy the source node's children into that existing node (i.e., merge structure by title).
  - This merge proceeds recursively: for each child, if a child title matches an existing child under the merge target, merge into that existing child; otherwise, insert a new child.
  - Constraint: if the merge target is a `WHEN`, merging is not allowed because `WHEN` cannot have children; in that case, skip all would-be inserts under that target.

Alternatives:
- Allow duplicates.
  - Pros: simplest; no checks.
  - Cons: clutter and confusion when many nodes share the same title.
- Auto-suffix titles (e.g., "(copy)", "(2)").
  - Pros: ensures the copy always appears.
  - Cons: noisy titles; may require progressive numbering logic.
- Prompt/block.
  - Pros: explicit control.
  - Cons: interrupts drag flow; heavier UI.

---

## 6) Status Handling

- Chosen: Reset `explicit_status` to inherit (store `null`) on copies. Effective status will recompute from the new ancestors; default falls back to `to do` when no explicit status up the chain.

Alternatives:
- Keep explicit status from source.
  - Pros: preserves state.
  - Cons: can conflict with new context; user explicitly prefers reset.

---

## 7) Tag Handling

- Chosen: Copy local `node_tag` ops (rows in `node_tag` with `op` add/remove) for each copied node.
- Effective tags at the destination are recomputed by the existing backend logic (`GET /nodes/:id/effective`).

Alternatives:
- Copy only effective tags as local adds.
  - Pros: visually stable.
  - Cons: breaks inheritance semantics; cannot later un-inherit cleanly.

---

## 8) Selection, Expansion, and Filters

- After a successful copy, select the new top-level copied node and expand its parent so the user can see it.
- If filters (tag/status) hide the new node, show a toast indicating it may be hidden by current filters.

---

## 9) API Changes (Backend)

Add a dedicated copy endpoint to perform a single transactional subtree copy, including tag ops and duplicate-title skipping.

Endpoint: `POST /nodes/:id/copy`
- Body:
  - `target_parent_id` (number | null) – sibling group to paste into.
  - `sibling_of` (number) – the node being hovered; used to compute `sort` (e.g., `sibling.sort + 0.5`).
  - `include_subtree` (boolean, default true) – always true per chosen behavior.
  - `reset_explicit_to_inherit` (boolean, default true) – per chosen behavior.
  - `skip_duplicates` (boolean, default true) – per chosen behavior.
- Behavior:
  - Start transaction.
  - If `skip_duplicates` and a sibling with the same title exists at the destination level, perform a merge:
    - Use the existing sibling as the target for this level (no new insert).
    - Recursively process the source node's children against the existing target's children (merge-by-title).
  - For each node copied, insert into `node` with fresh `id`, set `parent_id` to the new parent id, compute `sort` (append or relative to `sibling_of`), and set `explicit_status` to `null` when resetting is requested.
  - For each copied node, duplicate its `node_tag` rows.
  - Enforce `WHEN` cannot have children: if the merge/copy target at any level is a `WHEN`, skip inserting children at that level.
  - Commit and return: `{ new_root_id, created_roots: number[], mapping: { [oldId]: newId }, skipped: Array<{ oldId, reason }>, merged: Array<{ sourceOldId, targetExistingId }> }`.

Alternatives:
- Frontend-only copy (many POSTs):
  - Pros: no new API.
  - Cons: complex, slow, hard to maintain consistency and apply duplicate-skip rules.

---

## 10) Frontend Changes

In `frontend/src/DndKitTestTree.jsx`:
- Track copy mode: monitor Ctrl/Cmd during drag. A `useRef` can store the state across drag lifecycle.
- Update `handleDragEnd()` to call `onCopy()` when copy mode is active; keep `onMove()` otherwise.
- Implement `onCopy({ active, over })`:
  - Resolve destination parent as the `overNode.parent_id` (copy as sibling of `over`).
  - Call `POST /nodes/:id/copy` with:
    - `target_parent_id = overNode.parent_id`
    - `sibling_of = overNode.id`
    - `include_subtree = true`
    - `reset_explicit_to_inherit = true`
    - `skip_duplicates = true`
  - After success: `reload()`, expand the destination parent, select `new_root_id`.
- Visual cue: apply a "+" badge/cursor during copy mode (e.g., modify drag overlay style).

---

## 11) Multi-select Copy (Siblings)

Feasibility: Supported with custom UI state; not provided out-of-the-box by dnd-kit.

Constraints (recommended):
- Only allow multi-select among siblings (same parent) to avoid conflicting drop semantics.
- On copy, paste all as siblings into the target sibling group, preserving relative order where possible.
- Apply duplicate-skip per node independently.
- Enforce `WHEN` cannot have children (applies only if we later allow group copy into a `WHEN` parent, which we do not create; we paste as siblings).

Approach:
- Frontend:
  - Introduce `selectedIds: Set<number>` and keyboard/mouse multi-select affordances (e.g., Ctrl+Click to toggle selection, Shift+Click for ranges within flattened list).
  - During drag, if the active node is in `selectedIds`, treat the drag as a group drag; otherwise clear selection to the active node.
  - For copy mode + group drag: call a batch copy endpoint or loop over single-copy endpoint with stable ordering (top-to-bottom) and the same destination parent.
- Backend:
  - Option A (preferred): `POST /nodes/copy-batch` accepting `{ source_ids: number[], target_parent_id, sibling_of }`, returning new ids and skipped list.
  - Option B: Call `POST /nodes/:id/copy` repeatedly; the server still enforces duplicate-skip per insertion. Slightly more API chatter but simpler to implement first.

Alternatives:
- Allow multi-select across different parents.
  - Pros: powerful.
  - Cons: ambiguous ordering, complicated drop behavior; recommend deferring.

---

## 12) Edge Cases and Notes

- Copy into a descendant of the source: allowed (no cycles because new IDs). If a node matches an existing title at the destination level, it merges into that node; the merge continues recursively for descendants.
- Copy root node: allowed if destination is valid.
- Filters: if the destination becomes hidden by current filters, show a toast after copy.
- Performance: subtree copy is transactional and fast in SQLite; for very large subtrees, consider progress feedback.
- Undo/redo: not implemented; future enhancement.

---

## 13) Testing Scenarios

- Copy a `GIVEN` with deep `WHEN_GROUP`/`WHEN` subtree; verify status reset and tag inheritance.
- Copy into a group where some children have identical titles → verify skipped items in response and in UI.
- Copy next to `WHEN` and confirm no children end up under `WHEN`.
- Copy under heavy filters; ensure user messaging explains hidden results.
- Multi-select siblings and copy; verify order and per-node duplicate skipping.

---

## 14) Open Questions / Future Enhancements

- Sort normalization strategy after many fractional inserts.
- Batch copy endpoint vs. sequential calls trade-offs.
- Option to choose copy scope (node-only vs. subtree) per action.
- Optional title de-duplication modes for different workflows.
