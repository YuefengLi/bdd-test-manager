import express from "express";
import cors from "cors";
import morgan from "morgan";
import Database from "better-sqlite3";

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// ---- SQLite setup -----------------------------------------------------------
const db = new Database("./data.db");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Schema
db.exec(`
CREATE TABLE IF NOT EXISTS node (
  id              INTEGER PRIMARY KEY,
  parent_id       INTEGER REFERENCES node(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('GIVEN','WHEN_GROUP','WHEN')),
  title           TEXT NOT NULL,
  description     TEXT,
  sort            INTEGER NOT NULL DEFAULT 0,
  explicit_status TEXT CHECK (explicit_status IN ('to do','in progress','done','cancelled')),
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_node_parent ON node(parent_id);
CREATE INDEX IF NOT EXISTS idx_node_type   ON node(type);

CREATE TABLE IF NOT EXISTS node_tag (
  node_id   INTEGER NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  tag       TEXT    NOT NULL,
  op        TEXT    NOT NULL CHECK (op IN ('add','remove')),
  PRIMARY KEY (node_id, tag, op)
);

CREATE INDEX IF NOT EXISTS idx_node_tag_node ON node_tag(node_id);
CREATE INDEX IF NOT EXISTS idx_node_tag_tag  ON node_tag(tag);
`);

// Lightweight migration: if existing schema lacks 'cancelled' in CHECK, recreate the table with the new CHECK
try {
  const tbl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='node'").get();
  const sql = tbl?.sql || '';
  if (sql.includes("explicit_status IN ('to do','in progress','done')") && !sql.includes('cancelled')) {
    // Perform migration to add 'cancelled' to CHECK constraint
    db.pragma('foreign_keys = OFF');
    const tx = db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS node_mig (
          id              INTEGER PRIMARY KEY,
          parent_id       INTEGER REFERENCES node_mig(id) ON DELETE CASCADE,
          type            TEXT NOT NULL CHECK (type IN ('GIVEN','WHEN_GROUP','WHEN')),
          title           TEXT NOT NULL,
          description     TEXT,
          sort            INTEGER NOT NULL DEFAULT 0,
          explicit_status TEXT CHECK (explicit_status IN ('to do','in progress','done','cancelled')),
          version         INTEGER NOT NULL DEFAULT 1,
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      // copy data
      db.exec(`
        INSERT INTO node_mig (id, parent_id, type, title, description, sort, explicit_status, version, created_at, updated_at)
        SELECT id, parent_id, type, title, description, sort, explicit_status, version, created_at, updated_at FROM node;
      `);
      // Drop indexes that depend on old table
      db.exec(`DROP TABLE node;`);
      db.exec(`ALTER TABLE node_mig RENAME TO node;`);
      // Recreate indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_node_parent ON node(parent_id);
        CREATE INDEX IF NOT EXISTS idx_node_type   ON node(type);
      `);
    });
    tx();
  }
} finally {
  db.pragma('foreign_keys = ON');
}

// Seed a root GIVEN if DB is empty (helps first-time testing)
const rowCount = db.prepare("SELECT COUNT(*) AS c FROM node").get().c;
if (rowCount === 0) {
  db.prepare(`
    INSERT INTO node (parent_id, type, title, sort, explicit_status)
    VALUES (NULL,'GIVEN','Root GIVEN',0,'to do')
  `).run();
}

// ---- helpers ---------------------------------------------------------------

function getNode(id) {
  return db.prepare("SELECT * FROM node WHERE id = ?").get(id);
}

function getSubtree(rootId) {
  return db.prepare(`
    WITH RECURSIVE subtree(id, parent_id, type, title, description, sort, explicit_status, version, created_at, updated_at) AS (
      SELECT id, parent_id, type, title, description, sort, explicit_status, version, created_at, updated_at
      FROM node WHERE id = ?
      UNION ALL
      SELECT n.id, n.parent_id, n.type, n.title, n.description, n.sort, n.explicit_status, n.version, n.created_at, n.updated_at
      FROM node n JOIN subtree s ON n.parent_id = s.id
    )
    SELECT * FROM subtree ORDER BY parent_id, sort, id
  `).all(rootId);
}

function getEffectiveStatus(nodeId) {
  const res = db.prepare(`
    WITH RECURSIVE chain(id, parent_id, explicit_status, depth) AS (
      SELECT n.id, n.parent_id, n.explicit_status, 0
      FROM node n WHERE n.id = ?
      UNION ALL
      SELECT p.id, p.parent_id, p.explicit_status, depth+1
      FROM node p JOIN chain c ON p.id = c.parent_id
    )
    SELECT COALESCE(
      (SELECT explicit_status FROM chain WHERE explicit_status IS NOT NULL ORDER BY depth LIMIT 1),
      'to do'
    ) AS effective_status
  `).get(nodeId);
  return res?.effective_status ?? "to do";
}

function getEffectiveTags(nodeId) {
  const rows = db.prepare(`
    WITH RECURSIVE ancestors(id) AS (
      SELECT ?            -- start at node
      UNION ALL
      SELECT n.parent_id  -- walk up via parent_id
      FROM node n JOIN ancestors a ON n.id = a.id
      WHERE n.parent_id IS NOT NULL
    ),
    adds AS (
      SELECT DISTINCT tag FROM node_tag WHERE op='add' AND node_id IN (SELECT id FROM ancestors)
    ),
    removes AS (
      SELECT DISTINCT tag FROM node_tag WHERE op='remove' AND node_id IN (SELECT id FROM ancestors)
    )
    SELECT tag FROM adds EXCEPT SELECT tag FROM removes ORDER BY tag
  `).all(nodeId);
  return rows.map(r => r.tag);
}

function getLeafWhenCount(nodeId) {
  const res = db.prepare(`
    WITH RECURSIVE sub(id) AS (
      SELECT ?
      UNION ALL
      SELECT n.id FROM node n JOIN sub s ON n.parent_id = s.id
    )
    SELECT COUNT(*) AS cnt
    FROM node x
    WHERE x.id IN (SELECT id FROM sub)
      AND x.type='WHEN'
      AND NOT EXISTS (SELECT 1 FROM node c WHERE c.parent_id = x.id)
  `).get(nodeId);
  return res.cnt;
}

function updateTimestampAndVersion(id) {
  db.prepare(`
    UPDATE node SET updated_at = datetime('now'), version = version + 1 WHERE id = ?
  `).run(id);
}

// ---- routes ----------------------------------------------------------------

app.get("/health", (_req, res) => res.json({ ok: true }));

// Fetch a single node
app.get("/nodes/:id", (req, res) => {
  const node = getNode(req.params.id);
  if (!node) return res.status(404).json({ error: "Not found" });
  res.json(node);
});

// Subtree under a root node
app.get("/nodes", (req, res) => {
  const root = Number(req.query.root);
  if (!root) return res.status(400).json({ error: "root query param required" });
  res.json(getSubtree(root));
});

// Effective (inherited) status + tags
app.get("/nodes/:id/effective", (req, res) => {
  const id = Number(req.params.id);
  if (!getNode(id)) return res.status(404).json({ error: "Not found" });
  res.json({
    status: getEffectiveStatus(id),
    tags: getEffectiveTags(id)
  });
});

// Create node
app.post("/nodes", (req, res) => {
  const { parent_id = null, type, title, description = null, explicit_status = null, sort = null } = req.body || {};
  if (!["GIVEN","WHEN_GROUP","WHEN"].includes(type)) {
    return res.status(400).json({ error: "type must be GIVEN | WHEN_GROUP | WHEN" });
  }
  if (!title || typeof title !== "string") return res.status(400).json({ error: "title required" });

  const parent = parent_id == null ? null : getNode(parent_id);
  if (parent_id != null && !parent) return res.status(400).json({ error: "parent_id not found" });

  // default sort to max+1 among siblings
  let s = sort;
  if (s == null) {
    const row = db.prepare("SELECT COALESCE(MAX(sort), -1) AS m FROM node WHERE parent_id IS ?").get(parent_id ?? null);
    s = row.m + 1;
  }

  const stmt = db.prepare(`
    INSERT INTO node (parent_id, type, title, description, sort, explicit_status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(parent_id ?? null, type, title, description, s, explicit_status ?? null);
  const created = getNode(info.lastInsertRowid);
  res.status(201).json(created);
});

// Update node (title/description/status/reparent/sort) with optional optimistic concurrency
app.patch("/nodes/:id", (req, res) => {
  const id = Number(req.params.id);
  const node = getNode(id);
  if (!node) return res.status(404).json({ error: "Not found" });

  const { title, description, explicit_status, parent_id, sort, version } = req.body || {};

  if (version != null && version !== node.version) {
    return res.status(409).json({ error: "version conflict", current: node.version });
  }

  if (explicit_status != null && !["to do","in progress","done","cancelled", null].includes(explicit_status)) {
    return res.status(400).json({ error: "explicit_status must be 'to do' | 'in progress' | 'done' | 'cancelled' or null" });
  }

  if (parent_id === id) return res.status(400).json({ error: "cannot set parent_id to self" });
  if (parent_id != null && !getNode(parent_id)) return res.status(400).json({ error: "parent_id not found" });

  const fields = [];
  const vals = [];
  if (title !== undefined) { fields.push("title = ?"); vals.push(title); }
  if (description !== undefined) { fields.push("description = ?"); vals.push(description); }
  if (explicit_status !== undefined) { fields.push("explicit_status = ?"); vals.push(explicit_status); }
  if (parent_id !== undefined) { fields.push("parent_id = ?"); vals.push(parent_id); }
  if (sort !== undefined) { fields.push("sort = ?"); vals.push(sort); }

  if (fields.length === 0) return res.json(node);
  vals.push(id);

  const tx = db.transaction(() => {
    db.prepare(`UPDATE node SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    updateTimestampAndVersion(id);
    return getNode(id);
  });
  const updated = tx();
  res.json(updated);
});

// Delete node (cascades to subtree)
app.delete("/nodes/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!getNode(id)) return res.status(404).json({ error: "Not found" });
  db.prepare("DELETE FROM node WHERE id = ?").run(id);
  res.status(204).end();
});

// Replace all local tag ops for a node
app.put("/nodes/:id/tags", (req, res) => {
  const id = Number(req.params.id);
  if (!getNode(id)) return res.status(404).json({ error: "Not found" });
  const ops = Array.isArray(req.body) ? req.body : [];
  for (const o of ops) {
    if (!o || typeof o.tag !== "string" || !["add","remove"].includes(o.op)) {
      return res.status(400).json({ error: "each item must be { tag: string, op: 'add'|'remove' }" });
    }
  }
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM node_tag WHERE node_id = ?").run(id);
    const ins = db.prepare("INSERT OR IGNORE INTO node_tag (node_id, tag, op) VALUES (?, ?, ?)");
    for (const o of ops) ins.run(id, o.tag, o.op);
    updateTimestampAndVersion(id);
  });
  tx();
  res.json({ ok: true, effective: { status: getEffectiveStatus(id), tags: getEffectiveTags(id) } });
});

// Add/remove a single local tag op
app.patch("/nodes/:id/tags", (req, res) => {
  const id = Number(req.params.id);
  if (!getNode(id)) return res.status(404).json({ error: "Not found" });
  const { tag, op, action = "add" } = req.body || {};
  if (typeof tag !== "string" || !["add","remove"].includes(op)) {
    return res.status(400).json({ error: "body must be { tag: string, op: 'add'|'remove', action?: 'add'|'delete' }" });
  }
  if (!["add","delete"].includes(action)) return res.status(400).json({ error: "action must be 'add' or 'delete'" });

  const tx = db.transaction(() => {
    if (action === "add") {
      db.prepare("INSERT OR IGNORE INTO node_tag (node_id, tag, op) VALUES (?, ?, ?)").run(id, tag, op);
    } else {
      db.prepare("DELETE FROM node_tag WHERE node_id = ? AND tag = ? AND op = ?").run(id, tag, op);
    }
    updateTimestampAndVersion(id);
  });
  tx();
  res.json({ ok: true, effective: { status: getEffectiveStatus(id), tags: getEffectiveTags(id) } });
});

// Leaf WHEN count badge
app.get("/nodes/:id/counts", (req, res) => {
  const id = Number(req.params.id);
  if (!getNode(id)) return res.status(404).json({ error: "Not found" });
  res.json({ leaf_when_count: getLeafWhenCount(id) });
});

// Helper utilities for copy/merge -------------------------------------------------
function getChildren(parentId) {
  return db.prepare("SELECT * FROM node WHERE parent_id IS ? ORDER BY sort, id").all(parentId ?? null);
}

function getChildByTitle(parentId, title) {
  return db
    .prepare("SELECT * FROM node WHERE parent_id IS ? AND title = ? LIMIT 1")
    .get(parentId ?? null, title);
}

function getNodeType(id) {
  const n = getNode(id);
  return n?.type || null;
}

function getNodeTagsOps(nodeId) {
  return db.prepare("SELECT tag, op FROM node_tag WHERE node_id = ?").all(nodeId);
}

// Compute next sort under a parent (append semantics)
function nextSort(parentId) {
  const row = db.prepare("SELECT COALESCE(MAX(sort), -1) AS m FROM node WHERE parent_id IS ?").get(parentId ?? null);
  return row.m + 1;
}

// Insert a node copy under a parent, with optional after-sibling placement
function insertNodeCopy({ source, destParentId, placeAfterSort }) {
  // Determine sort: if placeAfterSort provided, use small epsilon; else append
  let sortVal;
  if (typeof placeAfterSort === 'number') {
    sortVal = placeAfterSort + 0.5;
  } else {
    sortVal = nextSort(destParentId);
  }
  const stmt = db.prepare(`
    INSERT INTO node (parent_id, type, title, description, sort, explicit_status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(destParentId ?? null, source.type, source.title, source.description ?? null, sortVal, null);
  const newId = info.lastInsertRowid;
  // Duplicate tag ops
  const ops = getNodeTagsOps(source.id);
  const insTag = db.prepare("INSERT OR IGNORE INTO node_tag (node_id, tag, op) VALUES (?, ?, ?)");
  for (const o of ops) insTag.run(newId, o.tag, o.op);
  updateTimestampAndVersion(newId);
  return { id: newId, sort: sortVal };
}

// Recursive copy with merge-by-title rule
function copyOrMergeSubtree({ sourceId, destParentId, placeAfterId, createdRoots, mapping, merged, skipped }) {
  const source = getNode(sourceId);
  if (!source) return null;

  // Enforce WHEN cannot have children: if dest parent is WHEN, we cannot insert anything under it
  if (destParentId != null) {
    const destType = getNodeType(destParentId);
    if (destType === 'WHEN') {
      skipped.push({ oldId: sourceId, reason: 'dest_parent_is_WHEN' });
      return null;
    }
  }

  // Merge-by-title: if a sibling exists with same title under destParentId, merge into it
  const existing = getChildByTitle(destParentId ?? null, source.title);
  if (existing) {
    merged.push({ sourceOldId: sourceId, targetExistingId: existing.id });
    // Recurse into children: attempt to merge/copy each child under existing.id
    const kids = getChildren(sourceId);
    let cursorSort = null;
    for (const child of kids) {
      const result = copyOrMergeSubtree({
        sourceId: child.id,
        destParentId: existing.id,
        placeAfterId: null,
        createdRoots,
        mapping,
        merged,
        skipped
      });
      // For children we just append in order; no special sibling-of handling
      if (result && result.createdId) {
        cursorSort = getNode(result.createdId).sort; // track last sort if needed by deeper merges
      }
    }
    return { mergedIntoId: existing.id };
  }

  // No existing: create a new node under destParentId
  let afterSort = null;
  if (placeAfterId != null) {
    const afterNode = getNode(placeAfterId);
    afterSort = afterNode ? afterNode.sort : null;
  }
  const inserted = insertNodeCopy({ source, destParentId, placeAfterSort: afterSort });
  mapping[sourceId] = inserted.id;
  if (!createdRoots.length) createdRoots.push(inserted.id); // first created becomes new_root_id

  // Recurse children normally under the newly inserted node
  const kids = getChildren(sourceId);
  let lastSortId = null;
  for (const child of kids) {
    const r = copyOrMergeSubtree({
      sourceId: child.id,
      destParentId: inserted.id,
      placeAfterId: lastSortId,
      createdRoots,
      mapping,
      merged,
      skipped
    });
    if (r && r.createdId) lastSortId = r.createdId;
  }
  return { createdId: inserted.id };
}

// Copy/merge endpoint
app.post('/nodes/:id/copy', (req, res) => {
  const sourceId = Number(req.params.id);
  const src = getNode(sourceId);
  if (!src) return res.status(404).json({ error: 'Not found' });

  const {
    target_parent_id = null,
    sibling_of = null,
    include_subtree = true,
    reset_explicit_to_inherit = true,
    skip_duplicates = true,
  } = req.body || {};

  // Validate sibling_of, and that sibling_of has same parent as target_parent_id if both given
  if (sibling_of != null) {
    const sib = getNode(Number(sibling_of));
    if (!sib) return res.status(400).json({ error: 'sibling_of not found' });
    const parentOk = (sib.parent_id ?? null) === (target_parent_id ?? null);
    if (!parentOk) return res.status(400).json({ error: 'sibling_of must be under target_parent_id' });
  }

  const createdRoots = [];
  const mapping = {};
  const merged = [];
  const skipped = [];

  const tx = db.transaction(() => {
    // For this version: include_subtree is always true and reset_explicit_to_inherit is always true
    // skip_duplicates triggers merge-by-title behavior
    const result = copyOrMergeSubtree({
      sourceId,
      destParentId: target_parent_id ?? null,
      placeAfterId: sibling_of ?? null,
      createdRoots,
      mapping,
      merged,
      skipped
    });
    return result;
  });

  tx();
  const new_root_id = createdRoots[0] || (merged.length ? merged[0].targetExistingId : null);
  res.json({ new_root_id, created_roots: createdRoots, mapping, merged, skipped });
});

// ----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`test-tree api listening on http://localhost:${PORT}`);
});
