// backend/routes/tags.js
import { Router } from 'express';
import db from '../db/index.js';
import { getNode, updateTimestampAndVersion } from '../models/node.js';
import { replaceNodeTags, addNodeTag, removeNodeTag, getEffectiveTags } from '../models/nodeTag.js';
import { getEffectiveStatus } from '../services/nodeService.js';

const router = Router();

router.put('/nodes/:id/tags', (req, res) => {
  const id = Number(req.params.id);
  if (!getNode(id)) return res.status(404).json({ error: 'Not found' });
  const ops = Array.isArray(req.body) ? req.body : [];
  for (const o of ops) {
    if (!o || typeof o.tag !== 'string' || !['add', 'remove'].includes(o.op)) {
      return res.status(400).json({ error: "each item must be { tag: string, op: 'add'|'remove' }" });
    }
  }
  const tx = db.transaction(() => {
    replaceNodeTags(id, ops);
    updateTimestampAndVersion(id);
  });
  tx();
  res.json({ ok: true, effective: { status: getEffectiveStatus(id), tags: getEffectiveTags(id) } });
});

router.patch('/nodes/:id/tags', (req, res) => {
  const id = Number(req.params.id);
  if (!getNode(id)) return res.status(404).json({ error: 'Not found' });
  const { tag, op, action = 'add' } = req.body || {};
  if (typeof tag !== 'string' || !['add', 'remove'].includes(op)) {
    return res.status(400).json({ error: "body must be { tag: string, op: 'add'|'remove', action?: 'add'|'delete' }" });
  }
  if (!['add', 'delete'].includes(action)) return res.status(400).json({ error: "action must be 'add' or 'delete'" });

  const tx = db.transaction(() => {
    if (action === 'add') {
      addNodeTag(id, tag, op);
    } else {
      removeNodeTag(id, tag, op);
    }
    updateTimestampAndVersion(id);
  });
  tx();
  res.json({ ok: true, effective: { status: getEffectiveStatus(id), tags: getEffectiveTags(id) } });
});

export default router;
