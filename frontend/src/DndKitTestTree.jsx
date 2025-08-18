/**
 * DndKitTestTree.jsx
 * Tree visualization component using dnd-kit for a stable, custom implementation.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';

import { ErrorBoundary } from './ErrorBoundary';
import { api } from './api/client';
import Toolbar from './components/tree/Toolbar';
import DetailsPanel from './components/tree/DetailsPanel';
import Tree from './components/tree/Tree';
import { useVisibleIds } from './hooks/useFilters';

// --- API Helper moved to ./api/client -------------------------------------

// --- Main Component --------------------------------------------------------

export default function DndKitTestTree() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [openNodes, setOpenNodes] = useState({});
  const [filterTag, setFilterTag] = useState(""); // comma or space separated list of tags
  const [filterStatus, setFilterStatus] = useState(""); // comma or space separated list of statuses
  const [hideCancelled, setHideCancelled] = useState(false);
  const [showOnlyToDo, setShowOnlyToDo] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const highlightTimerRef = useRef(null);

  const reload = async () => {
    try {
      setLoading(true);
      // Backend expects a numeric root id in the `root` query param.
      // The database is seeded with a single root that will likely have id=1.
      const nodesArr = await api('/nodes?root=1');
      // Batch fetch effective info to avoid 500+ parallel requests
      const allIds = nodesArr.map(n => n.id);
      const chunkSize = 200; // keep URL length and load reasonable
      const effArr = [];
      for (let i = 0; i < allIds.length; i += chunkSize) {
        const chunk = allIds.slice(i, i + chunkSize);
        const res = await api(`/nodes/effective?ids=${chunk.join(',')}`);
        // res: [{ id, status, tags }]
        for (const e of res) effArr.push(e);
      }
      setData({ nodes: nodesArr, effective: effArr });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  // Partial refresh: update a single node, its ancestors, and its entire subtree's effective data
  const refreshNode = async (id) => {
    if (!id) return reload(); // fallback
    try {
      // fetch the changed node object (structure may not change, but keep consistent)
      const updatedNode = await api(`/nodes/${id}`);

      // Collect ancestors (including self)
      const ancestorIds = [];
      let cur = byId.get(Number(id));
      while (cur) {
        ancestorIds.push(cur.id);
        if (cur.parent_id == null) break;
        cur = byId.get(cur.parent_id);
      }

      // Collect descendants (entire subtree under this node)
      const descendantIds = [];
      const start = byId.get(Number(id));
      if (start) {
        const stack = [start];
        while (stack.length) {
          const node = stack.pop();
          if (!node || node.id === Number(id)) {
            // include self only once via ancestors; skip duplicate push here
          }
          if (Array.isArray(node.children)) {
            for (const c of node.children) {
              descendantIds.push(c.id);
              const full = byId.get(c.id);
              if (full) stack.push(full);
            }
          }
        }
      }

      // Union of ids for effective refresh
      const idsToRefresh = Array.from(new Set([...ancestorIds, ...descendantIds]));

      // fetch effective for union (batched)
      let effs = [];
      if (idsToRefresh.length) {
        const chunkSize = 200;
        for (let i = 0; i < idsToRefresh.length; i += chunkSize) {
          const chunk = idsToRefresh.slice(i, i + chunkSize);
          const res = await api(`/nodes/effective?ids=${chunk.join(',')}`);
          effs = effs.concat(res);
        }
      }

      // merge into existing arrays to avoid full reload
      setData(prev => {
        if (!prev) return prev;
        // nodes
        const nodes = prev.nodes ? [...prev.nodes] : [];
        const idx = nodes.findIndex(n => n.id === updatedNode.id);
        if (idx >= 0) nodes[idx] = { ...nodes[idx], ...updatedNode };
        // effective
        const effective = prev.effective ? [...prev.effective] : [];
        for (const e of effs) {
          const ei = effective.findIndex(x => x.id === e.id);
          if (ei >= 0) effective[ei] = e; else effective.push(e);
        }
        return { nodes, effective };
      });
    } catch (err) {
      console.error('refreshNode failed; falling back to full reload', err);
      await reload();
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const { roots, byId, effective } = useMemo(() => {
    if (!data) return { roots: [], byId: new Map(), effective: new Map() };

    // Ensure each node has a tags array to avoid undefined access in DetailsPanel
    const byId = new Map(data.nodes.map(n => [n.id, { ...n, tags: n.tags ?? [], children: [] }]));
    const roots = [];

    for (const node of byId.values()) {
      if (node.parent_id && byId.has(node.parent_id)) {
        byId.get(node.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortChildren = (node) => {
      node.children.sort((a, b) => a.sort - b.sort);
      node.children.forEach(sortChildren);
    };
    roots.sort((a, b) => a.sort - b.sort);
    roots.forEach(sortChildren);

    const effective = new Map(data.effective.map(e => [e.id, e]));

    return { roots, byId, effective };
  }, [data]);

  // Auto-expand top-level roots on first data load so newly created children are visible
  useEffect(() => {
    if (!roots || roots.length === 0) return;
    if (Object.keys(openNodes).length > 0) return;
    const initial = Object.fromEntries(roots.map(r => [r.id, true]));
    setOpenNodes(initial);
  }, [roots, openNodes]);

  const onSetStatus = async (node, explicit_status) => {
    await api(`/nodes/${node.id}`, {
      method: "PATCH",
      body: JSON.stringify({ explicit_status })
    });
    await refreshNode(node.id);
  };

  const onCopy = async ({ active, over }) => {
    if (!active || !over || active.id === over.id) return;
    const activeNode = byId.get(active.id);
    if (!activeNode) return;

    const isGap = typeof over.id === 'string' && over.id.startsWith('gap-');
    let target_parent_id = null;
    let placeAfterId = null; // maps to backend sibling_of (placeAfterId)

    if (isGap) {
      const [_, pos, strId] = over.id.split('-'); // gap-before-<id> or gap-after-<id>
      const refId = Number(strId);
      const ref = byId.get(refId);
      if (!ref) return;
      target_parent_id = ref.parent_id ?? null;
      if (pos === 'after') {
        placeAfterId = ref.id; // insert after ref
      } else {
        // insert before ref: find previous sibling under same parent by sort
        const siblings = [...byId.values()].filter(n => (n.parent_id ?? null) === (target_parent_id ?? null)).sort((a,b)=>a.sort-b.sort);
        const idx = siblings.findIndex(n => n.id === ref.id);
        placeAfterId = idx > 0 ? siblings[idx - 1].id : null; // null -> at beginning
      }
    } else {
      // Dropped on a node => make child of that node, append at end
      const overNode = byId.get(over.id);
      if (!overNode) return;
      if (overNode.type === 'WHEN') {
        // WHEN cannot have children: insert after as sibling
        target_parent_id = overNode.parent_id ?? null;
        placeAfterId = overNode.id;
      } else {
        target_parent_id = overNode.id;
        const children = [...byId.values()].filter(n => (n.parent_id ?? null) === overNode.id).sort((a,b)=>a.sort-b.sort);
        placeAfterId = children.length ? children[children.length - 1].id : null;
      }
    }

    try {
      const res = await api(`/nodes/${active.id}/copy`, {
        method: 'POST',
        body: JSON.stringify({
          target_parent_id,
          sibling_of: placeAfterId,
          include_subtree: true,
          reset_explicit_to_inherit: true,
          skip_duplicates: true,
        })
      });
      await reload();
      if (target_parent_id != null) setOpenNodes(prev => ({ ...prev, [target_parent_id]: true }));
      const selectId = res?.new_root_id ?? null;
      if (selectId) {
        setSelectedId(selectId);
      } else {
        alert('No items copied (all duplicates or invalid destination).');
      }
    } catch (e) {
      console.error('Copy failed', e);
      alert(`Copy failed: ${e.message}`);
    }
  };

  const onAddTag = async (node, tagText) => {
    if (!tagText || !node) return;
    await api(`/nodes/${node.id}/tags`, {
      method: "PATCH",
      body: JSON.stringify({ tag: tagText, op: "add", action: "add" })
    });
    await refreshNode(node.id);
  };

  const removeEffectiveTagHere = async (node, tagText) => {
    if (!node || !tagText) return;
    await api(`/nodes/${node.id}/tags`, {
      method: "PATCH",
      body: JSON.stringify({ tag: tagText, op: "remove", action: "add" })
    });
    await refreshNode(node.id);
  };

  const onMove = async ({ active, over }) => {
    if (!active || !over || active.id === over.id) return;

    const activeNode = byId.get(active.id);
    if (!activeNode) return;

    const isGap = typeof over.id === 'string' && over.id.startsWith('gap-');
    let newParentId = null;
    let newSort = 0;

    if (isGap) {
      const [_, pos, strId] = over.id.split('-');
      const refId = Number(strId);
      const ref = byId.get(refId);
      if (!ref) return;
      newParentId = ref.parent_id ?? null;
      if (pos === 'after') {
        // after ref: between ref.sort and next sibling
        const siblings = [...byId.values()].filter(n => (n.parent_id ?? null) === (newParentId ?? null)).sort((a,b)=>a.sort-b.sort);
        const idx = siblings.findIndex(n => n.id === ref.id);
        const next = idx >= 0 && idx + 1 < siblings.length ? siblings[idx + 1] : null;
        newSort = next ? (ref.sort + next.sort) / 2 : ref.sort + 1;
      } else {
        // before ref
        const siblings = [...byId.values()].filter(n => (n.parent_id ?? null) === (newParentId ?? null)).sort((a,b)=>a.sort-b.sort);
        const idx = siblings.findIndex(n => n.id === ref.id);
        const prev = idx > 0 ? siblings[idx - 1] : null;
        newSort = prev ? (prev.sort + ref.sort) / 2 : ref.sort - 1;
      }
    } else {
      // Dropped on node => make child, append at end
      const overNode = byId.get(over.id);
      if (!overNode) return;
      if (overNode.type === 'WHEN') {
        // WHEN cannot have children: insert after as sibling
        newParentId = overNode.parent_id ?? null;
        const siblings = [...byId.values()].filter(n => (n.parent_id ?? null) === (newParentId ?? null)).sort((a,b)=>a.sort-b.sort);
        const idx = siblings.findIndex(n => n.id === overNode.id);
        const next = idx >= 0 && idx + 1 < siblings.length ? siblings[idx + 1] : null;
        newSort = next ? (overNode.sort + next.sort) / 2 : overNode.sort + 1;
      } else {
        newParentId = overNode.id;
        const children = [...byId.values()].filter(n => (n.parent_id ?? null) === overNode.id).sort((a,b)=>a.sort-b.sort);
        newSort = children.length ? children[children.length - 1].sort + 1 : 0;
      }
    }

    await api(`/nodes/${active.id}`, {
      method: "PATCH",
      body: JSON.stringify({ parent_id: newParentId, sort: newSort })
    });
    await reload();
    if (newParentId != null) setOpenNodes(prev => ({ ...prev, [newParentId]: true }));
  };

  const selected = selectedId ? byId.get(selectedId) : null;
  const visibleIds = useVisibleIds(effective, byId, filterTag, filterStatus, { hideCancelled, showOnlyToDo });

  // Navigate to a node id: expand all ancestors and select it
  const navigateToNode = (targetId) => {
    const target = byId.get(Number(targetId));
    if (!target) return;
    const toOpen = {};
    let cur = target;
    while (cur) {
      if (cur.parent_id != null) {
        toOpen[cur.parent_id] = true;
        cur = byId.get(cur.parent_id);
      } else {
        break;
      }
    }
    if (Object.keys(toOpen).length) {
      setOpenNodes(prev => ({ ...prev, ...toOpen }));
    }
    // transient highlight
    setHighlightedId(target.id);
    window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedId(null);
    }, 1500);
  };

  if (error) return <div style={{ color: 'red' }}>Error: {error.message}</div>;
  if (loading) return <div>Loading...</div>;
  if (!data) return <div>No data</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, padding: 16, fontFamily: 'sans-serif' }}>
      <div>
        <Toolbar
          onNew={reload}
          selectedId={selectedId}
          byId={byId}
          roots={roots}
          setOpenNodes={setOpenNodes}
          effective={effective}
          filterTag={filterTag}
          setFilterTag={setFilterTag}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          hideCancelled={hideCancelled}
          setHideCancelled={setHideCancelled}
          showOnlyToDo={showOnlyToDo}
          setShowOnlyToDo={setShowOnlyToDo}
        />
        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12, marginTop: 12 }}>
          <ErrorBoundary>
            <Tree
              nodes={roots}
              byId={byId}
              effective={effective}
              visibleIds={visibleIds}
              selectedId={selectedId}
              openNodes={openNodes}
              setSelectedId={setSelectedId}
              setOpenNodes={setOpenNodes}
              onMove={onMove}
              onCopy={onCopy}
              reload={reload}
              refreshNode={refreshNode}
              onSetStatus={onSetStatus}
              onAddTag={onAddTag}
              highlightedId={highlightedId}
            />
          </ErrorBoundary>
        </div>
      </div>
      <DetailsPanel
        node={selected}
        effective={selected ? effective.get(selected.id) : null}
        onSetStatus={onSetStatus}
        onAddTag={onAddTag}
        removeEffectiveTagHere={removeEffectiveTagHere}
        reload={reload}
        setSelectedId={setSelectedId}
        byId={byId}
        navigateToNode={navigateToNode}
        refreshNode={refreshNode}
      />
    </div>
  );
}

// --- UI Components (Toolbar, DetailsPanel) -----------------------
// STATUS_OPTIONS now imported from ./constants

// Toolbar moved to ./components/tree/Toolbar
 
// DetailsPanel moved to ./components/tree/DetailsPanel

// StatusPill moved to ./components/tree/parts/StatusPill

// Tag moved to ./components/tree/parts/Tag
