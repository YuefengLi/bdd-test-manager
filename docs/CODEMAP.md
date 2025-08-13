# Code Map

## Frontend (frontend/src/)
- App.js — CRA entry renders the main UI.
- ErrorBoundary.jsx — Error boundary for tree region.
- constants.js — Shared UI constants (e.g., STATUS_OPTIONS).
- api/
  - client.js — `api(path, options)` fetch helper. Respects `REACT_APP_API_BASE`.
- components/
  - tree/
    - Toolbar.jsx — Create nodes, expand/collapse, tag/status filters.
    - DetailsPanel.jsx — Right pane: status, tags, scenario lines, delete.
    - parts/
      - StatusPill.jsx — Visual status chip.
      - Tag.jsx — Tag chip with optional remove action.
- DndKitTestTree.jsx — Main feature component. Hosts data loading, filtering, dnd tree, and composes Toolbar + DetailsPanel. Contains NodeRow and a small StatusSelect + TagAdder.

Upcoming (planned):
- hooks/useTreeData.js — central data loading and memoized maps.
- hooks/useFilters.js — tag/status parsing and visibleIds.
- hooks/useDragCopyMode.js — modifier tracking for copy cursor.
- components/tree/Tree.jsx, TreeNode.jsx — orchestration and row rendering split.

## Backend (backend/)
- server.js — Express app, DB init, schema/migration, helpers, and routes (pre-refactor consolidated).

Upcoming (planned):
- app.js, server.js — bootstrap vs app split.
- db/ { index.js, migrate.js, seed.js } — DB setup and migrations.
- models/ { nodeModel.js, tagModel.js } — SQL helpers.
- services/ { effectiveService.js, copyService.js, sortService.js, countService.js } — business logic.
- routes/ { nodes.js, health.js } — route handlers.
- middleware/ { errorHandler.js, validate.js } — cross-cutting concerns.
