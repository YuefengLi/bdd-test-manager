// backend/routes/copy.js
import { Router } from 'express';
import db from '../db/index.js';
import { getNode } from '../models/node.js';
import { copyOrMergeSubtree } from '../services/copyService.js';

const router = Router();

router.post('/nodes/:id/copy', (req, res) => {
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
    copyOrMergeSubtree({
      sourceId,
      destParentId: target_parent_id ?? null,
      placeAfterId: sibling_of ?? null,
      createdRoots,
      mapping,
      merged,
      skipped,
    });
  });
  tx();
  const new_root_id = createdRoots[0] || (merged.length ? merged[0].targetExistingId : null);
  res.json({ new_root_id, created_roots: createdRoots, mapping, merged, skipped });
});

export default router;
