// backend/routes/nodes.js
import { Router } from 'express';
import db from '../db/index.js';
import { getNode, getSubtree, createNode, updateNode, deleteNode } from '../models/node.js';
import { getEffectiveStatus, getLeafWhenCount } from '../services/nodeService.js';
import { getEffectiveTags } from '../models/nodeTag.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true }));

router.get('/nodes/:id', (req, res) => {
  const node = getNode(req.params.id);
  if (!node) return res.status(404).json({ error: 'Not found' });
  res.json(node);
});

router.get('/nodes', (req, res) => {
  const root = Number(req.query.root);
  if (!root) return res.status(400).json({ error: 'root query param required' });
  res.json(getSubtree(root));
});

router.get('/nodes/:id/effective', (req, res) => {
  const id = Number(req.params.id);
  if (!getNode(id)) return res.status(404).json({ error: 'Not found' });
  res.json({ status: getEffectiveStatus(id), tags: getEffectiveTags(id) });
});

router.post('/nodes', (req, res) => {
  const { parent_id = null, type, title, description = null, explicit_status = null, sort = null } = req.body || {};
  if (!['GIVEN', 'WHEN_GROUP', 'WHEN'].includes(type)) {
    return res.status(400).json({ error: 'type must be GIVEN | WHEN_GROUP | WHEN' });
  }
  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title required' });
  if (parent_id != null && !getNode(parent_id)) return res.status(400).json({ error: 'parent_id not found' });

  const tx = db.transaction(() => {
    const id = createNode({ parent_id, type, title, description, explicit_status, sort });
    return getNode(id);
  });
  const created = tx();
  res.status(201).json(created);
});

router.patch('/nodes/:id', (req, res) => {
  const id = Number(req.params.id);
  const node = getNode(id);
  if (!node) return res.status(404).json({ error: 'Not found' });

  const { title, description, explicit_status, parent_id, sort, version } = req.body || {};
  if (version != null && version !== node.version) {
    return res.status(409).json({ error: 'version conflict', current: node.version });
  }
  if (explicit_status != null && !['to do', 'in progress', 'done', 'cancelled', null].includes(explicit_status)) {
    return res.status(400).json({ error: "explicit_status must be 'to do' | 'in progress' | 'done' | 'cancelled' or null" });
  }
  if (parent_id === id) return res.status(400).json({ error: 'cannot set parent_id to self' });
  if (parent_id != null && !getNode(parent_id)) return res.status(400).json({ error: 'parent_id not found' });

  const tx = db.transaction(() => {
    updateNode(id, { title, description, explicit_status, parent_id, sort });
    // bump version
    db.prepare(`UPDATE node SET updated_at = datetime('now'), version = version + 1 WHERE id = ?`).run(id);
    return getNode(id);
  });
  const updated = tx();
  res.json(updated);
});

router.delete('/nodes/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getNode(id)) return res.status(404).json({ error: 'Not found' });
  deleteNode(id);
  res.status(204).end();
});

router.get('/nodes/:id/counts', (req, res) => {
  const id = Number(req.params.id);
  if (!getNode(id)) return res.status(404).json({ error: 'Not found' });
  res.json({ leaf_when_count: getLeafWhenCount(id) });
});

export default router;
