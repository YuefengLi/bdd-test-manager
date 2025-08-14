// backend/services/nodeService.js
import db from '../db/index.js';
import { getNode } from '../models/node.js';

export function getEffectiveStatus(nodeId) {
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
  return res?.effective_status ?? 'to do';
}

export function getLeafWhenCount(nodeId) {
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
