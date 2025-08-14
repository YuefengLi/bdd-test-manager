// backend/services/copyService.js
import { getNode, getChildren, getChildByTitle, getNodeType, nextSort, updateTimestampAndVersion } from '../models/node.js';
import { getNodeTagsOps } from '../models/nodeTag.js';
import db from '../db/index.js';

export function insertNodeCopy({ source, destParentId, placeAfterSort }) {
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
  const ops = getNodeTagsOps(source.id);
  const insTag = db.prepare('INSERT OR IGNORE INTO node_tag (node_id, tag, op) VALUES (?, ?, ?)');
  for (const o of ops) insTag.run(newId, o.tag, o.op);
  updateTimestampAndVersion(newId);
  return { id: newId, sort: sortVal };
}

export function copyOrMergeSubtree({ sourceId, destParentId, placeAfterId, createdRoots, mapping, merged, skipped }) {
  const source = getNode(sourceId);
  if (!source) return null;

  if (destParentId != null) {
    const destType = getNodeType(destParentId);
    if (destType === 'WHEN') {
      skipped.push({ oldId: sourceId, reason: 'dest_parent_is_WHEN' });
      return null;
    }
  }

  const existing = getChildByTitle(destParentId ?? null, source.title);
  if (existing) {
    merged.push({ sourceOldId: sourceId, targetExistingId: existing.id });
    const kids = getChildren(sourceId);
    for (const child of kids) {
      copyOrMergeSubtree({
        sourceId: child.id,
        destParentId: existing.id,
        placeAfterId: null,
        createdRoots,
        mapping,
        merged,
        skipped,
      });
    }
    return { mergedIntoId: existing.id };
  }

  let afterSort = null;
  if (placeAfterId != null) {
    const afterNode = getNode(placeAfterId);
    afterSort = afterNode ? afterNode.sort : null;
  }
  const inserted = insertNodeCopy({ source, destParentId, placeAfterSort: afterSort });
  mapping[sourceId] = inserted.id;
  if (!createdRoots.length) createdRoots.push(inserted.id);

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
      skipped,
    });
    if (r && r.createdId) lastSortId = r.createdId;
  }
  return { createdId: inserted.id };
}
