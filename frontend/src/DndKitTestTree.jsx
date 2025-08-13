/**
 * DndKitTestTree.jsx
 * Tree visualization component using dnd-kit for a stable, custom implementation.
 */

import React, { useState, useEffect, useMemo } from 'react';

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

  const reload = async () => {
    try {
      setLoading(true);
      // Backend expects a numeric root id in the `root` query param.
      // The database is seeded with a single root that will likely have id=1.
      const nodesArr = await api('/nodes?root=1');
      // Build effective info for each node
      const effArr = await Promise.all(
        nodesArr.map(async (n) => {
          const eff = await api(`/nodes/${n.id}/effective`);
          return { id: n.id, ...eff };
        })
      );
      setData({ nodes: nodesArr, effective: effArr });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
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
    await reload();
  };

  const onCopy = async ({ active, over }) => {
    if (!active || !over || active.id === over.id) return;
    const activeNode = byId.get(active.id);
    const overNode = byId.get(over.id);
    if (!activeNode || !overNode) return;

    const target_parent_id = overNode.parent_id ?? null;
    try {
      const res = await api(`/nodes/${active.id}/copy`, {
        method: 'POST',
        body: JSON.stringify({
          target_parent_id,
          sibling_of: overNode.id,
          include_subtree: true,
          reset_explicit_to_inherit: true,
          skip_duplicates: true,
        })
      });
      await reload();
      if (target_parent_id != null) {
        setOpenNodes(prev => ({ ...prev, [target_parent_id]: true }));
      }
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
    await reload();
  };

  const removeEffectiveTagHere = async (node, tagText) => {
    if (!node || !tagText) return;
    await api(`/nodes/${node.id}/tags`, {
      method: "PATCH",
      body: JSON.stringify({ tag: tagText, op: "remove", action: "add" })
    });
    await reload();
  };

  const onMove = async ({ active, over }) => {
    if (!active || !over || active.id === over.id) return;

    const activeNode = byId.get(active.id);
    const overNode = byId.get(over.id);
    if (!activeNode || !overNode) return;

    // Simple re-parenting logic. More complex logic would be needed for sorting.
    const newParentId = overNode.parent_id;
    const newSort = overNode.sort + 0.5; // simplistic sort update

    await api(`/nodes/${active.id}`, {
      method: "PATCH",
      body: JSON.stringify({ parent_id: newParentId, sort: newSort })
    });
    await reload();
  };

  const selected = selectedId ? byId.get(selectedId) : null;
  const visibleIds = useVisibleIds(effective, byId, filterTag, filterStatus);

  if (error) return <div style={{ color: 'red' }}>Error: {error.message}</div>;
  if (loading) return <div>Loading...</div>;
  if (!data) return <div>No data</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, padding: 16, fontFamily: 'sans-serif' }}>
      <div>
        <Toolbar onNew={reload} selectedId={selectedId} byId={byId} roots={roots} setOpenNodes={setOpenNodes} effective={effective}
                 filterTag={filterTag} setFilterTag={setFilterTag}
                 filterStatus={filterStatus} setFilterStatus={setFilterStatus} />
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
              onSetStatus={onSetStatus}
              onAddTag={onAddTag}
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
