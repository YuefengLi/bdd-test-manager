// backend/models/nodeTag.js
import db from '../db/index.js';

export function replaceNodeTags(nodeId, ops) {
  db.prepare('DELETE FROM node_tag WHERE node_id = ?').run(nodeId);
  const ins = db.prepare('INSERT OR IGNORE INTO node_tag (node_id, tag, op) VALUES (?, ?, ?)');
  for (const o of ops) ins.run(nodeId, o.tag, o.op);
}

export function addNodeTag(nodeId, tag, op) {
  db.prepare('INSERT OR IGNORE INTO node_tag (node_id, tag, op) VALUES (?, ?, ?)').run(nodeId, tag, op);
}

export function removeNodeTag(nodeId, tag, op) {
  db.prepare('DELETE FROM node_tag WHERE node_id = ? AND tag = ? AND op = ?').run(nodeId, tag, op);
}

export function getNodeTagsOps(nodeId) {
  return db.prepare('SELECT tag, op FROM node_tag WHERE node_id = ?').all(nodeId);
}

export function getEffectiveTags(nodeId) {
  const rows = db.prepare(`
    WITH RECURSIVE ancestors(id) AS (
      SELECT ?
      UNION ALL
      SELECT n.parent_id
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
