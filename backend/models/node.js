// backend/models/node.js
import db from '../db/index.js';

export function getNode(id) {
  return db.prepare('SELECT * FROM node WHERE id = ?').get(id);
}

export function getSubtree(rootId) {
  return db.prepare(`
    WITH RECURSIVE subtree(id, parent_id, type, title, description, note, sort, explicit_status, version, created_at, updated_at) AS (
      SELECT id, parent_id, type, title, description, note, sort, explicit_status, version, created_at, updated_at
      FROM node WHERE id = ?
      UNION ALL
      SELECT n.id, n.parent_id, n.type, n.title, n.description, n.note, n.sort, n.explicit_status, n.version, n.created_at, n.updated_at
      FROM node n JOIN subtree s ON n.parent_id = s.id
    )
    SELECT * FROM subtree ORDER BY parent_id, sort, id
  `).all(rootId);
}

export function createNode({ parent_id = null, type, title, description = null, note = null, explicit_status = null, sort = null }) {
  let s = sort;
  if (s == null) {
    const row = db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM node WHERE parent_id IS ?').get(parent_id ?? null);
    s = row.m + 1;
  }
  const stmt = db.prepare(`
    INSERT INTO node (parent_id, type, title, description, note, sort, explicit_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(parent_id ?? null, type, title, description, note, s, explicit_status ?? null);
  return info.lastInsertRowid;
}

export function updateNode(id, fields) {
  const sets = [];
  const vals = [];
  if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title); }
  if (fields.description !== undefined) { sets.push('description = ?'); vals.push(fields.description); }
  if (fields.note !== undefined) { sets.push('note = ?'); vals.push(fields.note); }
  if (fields.explicit_status !== undefined) { sets.push('explicit_status = ?'); vals.push(fields.explicit_status); }
  if (fields.parent_id !== undefined) { sets.push('parent_id = ?'); vals.push(fields.parent_id); }
  if (fields.sort !== undefined) { sets.push('sort = ?'); vals.push(fields.sort); }
  if (!sets.length) return;
  vals.push(id);
  db.prepare(`UPDATE node SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteNode(id) {
  db.prepare('DELETE FROM node WHERE id = ?').run(id);
}

export function updateTimestampAndVersion(id) {
  db.prepare(`UPDATE node SET updated_at = datetime('now'), version = version + 1 WHERE id = ?`).run(id);
}

export function getChildren(parentId) {
  return db.prepare('SELECT * FROM node WHERE parent_id IS ? ORDER BY sort, id').all(parentId ?? null);
}

export function getChildByTitle(parentId, title) {
  return db.prepare('SELECT * FROM node WHERE parent_id IS ? AND title = ? LIMIT 1').get(parentId ?? null, title);
}

export function getNodeType(id) {
  const n = getNode(id);
  return n?.type || null;
}

export function nextSort(parentId) {
  const row = db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM node WHERE parent_id IS ?').get(parentId ?? null);
  return row.m + 1;
}
