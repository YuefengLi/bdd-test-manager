/**
 * DndKitTestTree.jsx
 * Tree visualization component using dnd-kit for a stable, custom implementation.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { ErrorBoundary } from './ErrorBoundary';

// --- API Helper ------------------------------------------------------------

const api = async (path, options) => {
  const hasBody = options && Object.prototype.hasOwnProperty.call(options, 'body');
  const mergedOptions = { ...(options || {}) };
  // Ensure JSON headers so backend parses body; set headers last so they are not overwritten
  mergedOptions.headers = hasBody
    ? { 'Content-Type': 'application/json', ...((options && options.headers) || {}) }
    : (options && options.headers) || undefined;
  const res = await fetch(`http://localhost:3000${path}`, mergedOptions);
  if (!res.ok) {
    const errorBody = await res.text();
    console.error('API Error Response:', errorBody);
    throw new Error(`API Error: ${res.status} ${res.statusText} - ${errorBody}`);
  }
  if (res.status === 204) return null;
  return res.json();
};

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
  }, [roots]);

  const onSetStatus = async (node, explicit_status) => {
    await api(`/nodes/${node.id}`, {
      method: "PATCH",
      body: JSON.stringify({ explicit_status })
    });
    await reload();
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
    const childrenOfNewParent = newParentId ? byId.get(newParentId).children : roots;
    const newSort = overNode.sort + 0.5; // simplistic sort update

    await api(`/nodes/${active.id}`, {
      method: "PATCH",
      body: JSON.stringify({ parent_id: newParentId, sort: newSort })
    });
    await reload();
  };

  const selected = selectedId ? byId.get(selectedId) : null;
  // Compute which node ids should be visible given the tag/status filters.
  // If neither filter is set, everything is visible. Filtering uses effective attributes (inherits).
  const visibleIds = useMemo(() => {
    // Helper to get base matches (without ancestors) for tag filter
    const matchByTags = () => {
      const raw = (filterTag || "").trim();
      if (!raw) return null;
      const tokens = raw
        .split(/[\,\s]+/)
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
      if (tokens.length === 0) return null;
      const matches = new Set();
      for (const [id, eff] of effective.entries()) {
        const tags = (eff?.tags || []).map(t => String(t).toLowerCase());
        if (tokens.some(tok => tags.includes(tok))) matches.add(id);
      }
      return matches;
    };

    // Helper to get base matches (without ancestors) for status filter
    const matchByStatus = () => {
      const raw = (filterStatus || "").trim();
      if (!raw) return null;
      // IMPORTANT: statuses may contain spaces (e.g., "to do"), so split ONLY by commas
      const tokens = raw
        .split(",")
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
      if (tokens.length === 0) return null;
      const matches = new Set();
      for (const [id, eff] of effective.entries()) {
        const st = (eff?.status ?? "").toLowerCase();
        if (tokens.includes(st)) matches.add(id);
      }
      return matches;
    };

    const tagSet = matchByTags();
    const statusSet = matchByStatus();

    if (!tagSet && !statusSet) return null; // no filters

    // Decide base set: if both present, intersect; else the one that exists.
    let base = new Set();
    if (tagSet && statusSet) {
      for (const id of tagSet) if (statusSet.has(id)) base.add(id);
    } else if (tagSet) {
      base = tagSet;
    } else if (statusSet) {
      base = statusSet;
    }

    // If no matches, return empty set
    if (base.size === 0) return new Set();

    // Include all ancestors of matched nodes to preserve hierarchy
    const visible = new Set(base);
    for (const id of Array.from(base)) {
      let cur = byId.get(id);
      while (cur && cur.parent_id) {
        visible.add(cur.parent_id);
        cur = byId.get(cur.parent_id);
      }
    }
    return visible;
  }, [effective, byId, filterTag, filterStatus]);

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
            <DndTree
              nodes={roots}
              byId={byId}
              effective={effective}
              visibleIds={visibleIds}
              selectedId={selectedId}
              openNodes={openNodes}
              setSelectedId={setSelectedId}
              setOpenNodes={setOpenNodes}
              onMove={onMove}
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

// --- Dnd-Kit Tree Implementation -------------------------------------------

function DndTree({ nodes, byId, effective, visibleIds, selectedId, openNodes, setSelectedId, setOpenNodes, onMove, reload, onSetStatus, onAddTag }) {
  const sensors = useSensors(useSensor(PointerSensor));
  const copyModeRef = useRef(false);
  const draggingRef = useRef(false);
  const [copyMode, setCopyMode] = useState(false);
  const flattenedTree = useMemo(() => {
    const result = [];
    function flatten(nodes, depth) {
      for (const node of nodes) {
        // Skip nodes not in the visible set (if filtering is active)
        if (visibleIds && !visibleIds.has(node.id)) continue;
        result.push({ ...node, depth });
        if (openNodes[node.id]) {
          flatten(node.children, depth + 1);
        }
      }
    }
    flatten(nodes, 0);
    return result;
  }, [nodes, openNodes, visibleIds]);

  // Compute, for each node, how many WHEN-type descendants it has.
  // This counts across collapsed subtrees but excludes nodes filtered out by tag filter (visibleIds).
  const whenCounts = useMemo(() => {
    const counts = new Map();
    const allow = (id) => !visibleIds || visibleIds.has(id);

    const dfs = (node) => {
      if (!allow(node.id)) return 0; // Entire subtree filtered out
      let sum = node.type === 'WHEN' ? 1 : 0; // include self for intermediate calc
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          sum += dfs(child);
        }
      }
      // Store descendant-only count for this node
      const minusSelf = node.type === 'WHEN' ? sum - 1 : sum;
      counts.set(node.id, Math.max(0, minusSelf));
      return sum;
    };

    for (const r of nodes) dfs(r);
    return counts;
  }, [nodes, visibleIds]);

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
        // If nothing created and no clear merge target, give user feedback
        alert('No items copied (all duplicates or invalid destination).');
      }
    } catch (e) {
      console.error('Copy failed', e);
      alert(`Copy failed: ${e.message}`);
    }
  };

  const handleDragStart = (event) => {
    const ae = event?.activatorEvent;
    const isCopy = !!(ae && (ae.ctrlKey || ae.metaKey));
    copyModeRef.current = isCopy;
    draggingRef.current = true;

    const applyCursor = () => {
      const isCopyNow = copyModeRef.current;
      setCopyMode(isCopyNow);
      try { document.body.style.cursor = isCopyNow ? 'copy' : ''; } catch {}
    };

    applyCursor();

    // Listen for modifier changes during drag
    const onKeyDown = (e) => {
      if (!draggingRef.current) return;
      const next = !!(e.ctrlKey || e.metaKey);
      if (copyModeRef.current !== next) {
        copyModeRef.current = next;
        applyCursor();
      }
    };
    const onKeyUp = (e) => {
      if (!draggingRef.current) return;
      const next = !!(e.ctrlKey || e.metaKey);
      if (copyModeRef.current !== next) {
        copyModeRef.current = next;
        applyCursor();
      }
    };
    const onBlur = () => {
      if (!draggingRef.current) return;
      copyModeRef.current = false;
      applyCursor();
    };

    // Store handlers on ref so we can remove them later
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    // Save cleanup on the ref itself
    handleDragStart._cleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    const isCopy = copyModeRef.current;
    copyModeRef.current = false;
    draggingRef.current = false;
    setCopyMode(false);
    try { document.body.style.cursor = ''; } catch {}
    if (typeof handleDragStart._cleanup === 'function') {
      try { handleDragStart._cleanup(); } catch {}
      handleDragStart._cleanup = null;
    }
    if (!over || active.id === over.id) return;
    if (isCopy) {
      onCopy({ active, over });
    } else {
      onMove({ active, over });
    }
  };

  const handleDragCancel = () => {
    copyModeRef.current = false;
    draggingRef.current = false;
    setCopyMode(false);
    try { document.body.style.cursor = ''; } catch {}
    if (typeof handleDragStart._cleanup === 'function') {
      try { handleDragStart._cleanup(); } catch {}
      handleDragStart._cleanup = null;
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <div style={{ cursor: copyMode ? 'copy' : undefined }}>
        <SortableContext items={flattenedTree.map(n => n.id)} strategy={verticalListSortingStrategy}>
          {flattenedTree.map(node => (
            <SortableNode
              key={node.id}
              node={node}
              depth={node.depth}
              effective={effective.get(node.id)}
              isSelected={node.id === selectedId}
              isOpen={!!openNodes[node.id]}
              onSelect={() => setSelectedId(node.id)}
              onToggle={() => setOpenNodes(prev => ({ ...prev, [node.id]: !prev[node.id] }))}
              reload={reload}
              byId={byId}
              onSetStatus={onSetStatus}
              onAddTag={onAddTag}
              whenCount={whenCounts.get(node.id) || 0}
            />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}

function SortableNode({ node, depth, effective, isSelected, isOpen, onSelect, onToggle, reload, byId, onSetStatus, onAddTag, whenCount }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: `${depth * 24 + 8}px`,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 4,
    background: isSelected ? '#e7f3ff' : 'transparent',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <NodeRow
        node={node}
        dragHandle={{ ...attributes, ...listeners }}
        effective={effective}
        isSelected={isSelected}
        isOpen={isOpen}
        onSelect={onSelect}
        onToggle={onToggle}
        reload={reload}
        byId={byId}
        onSetStatus={onSetStatus}
        onAddTag={onAddTag}
        whenCount={whenCount}
      />
    </div>
  );
}

// --- UI Components (Toolbar, NodeRow, DetailsPanel) -----------------------

const STATUS_OPTIONS = [
  { value: null, label: "inherit" },
  { value: "to do", label: "to do" },
  { value: "in progress", label: "in progress" },
  { value: "done", label: "done" },
  { value: "cancelled", label: "cancelled" },
];

function Toolbar({ onNew, selectedId, byId, roots, setOpenNodes, effective, filterTag, setFilterTag, filterStatus, setFilterStatus }) {
  const statusValues = useMemo(() =>
    (filterStatus || "")
      // Split ONLY by commas to preserve multi-word statuses like "to do"
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  , [filterStatus]);
  const createNode = async (type) => {
    const defaultTitle = type === 'GIVEN' ? 'New GIVEN' : type === 'WHEN_GROUP' ? 'New WHEN GROUP' : 'New WHEN';
    // Attach to current selection if any; otherwise, attach to the seeded root (id=1)
    const parent_id = selectedId ?? 1;
    try {
      await api('/nodes', { method: 'POST', body: JSON.stringify({ type, title: defaultTitle, parent_id }) });
      await onNew();
    } catch (e) {
      console.error('Failed to create node', e);
      alert(`Failed to create node: ${e.message}`);
    }
  };

  const collectSubtreeIds = (startIds) => {
    const result = new Set();
    const stack = Array.isArray(startIds) ? [...startIds] : [startIds];
    while (stack.length) {
      const id = stack.pop();
      if (id == null || result.has(id)) continue;
      result.add(id);
      const n = byId.get(id);
      if (n && Array.isArray(n.children)) {
        for (const c of n.children) stack.push(c.id);
      }
    }
    return result;
  };

  const expandAll = () => {
    // Expand selected subtree; if none selected, expand entire tree
    if (selectedId != null) {
      const ids = collectSubtreeIds(selectedId);
      setOpenNodes(prev => ({ ...prev, ...Object.fromEntries([...ids].map(id => [id, true])) }));
    } else {
      const allRootIds = roots.map(r => r.id);
      // collect all descendants of all roots
      const ids = collectSubtreeIds(allRootIds);
      setOpenNodes(Object.fromEntries([...ids].map(id => [id, true])));
    }
  };

  const collapseAll = () => {
    // Collapse selected subtree; if none selected, collapse everything
    if (selectedId != null) {
      const ids = collectSubtreeIds(selectedId);
      setOpenNodes(prev => {
        const next = { ...prev };
        for (const id of ids) next[id] = false;
        return next;
      });
    } else {
      setOpenNodes({});
    }
  };

  const collapseCancelled = () => {
    // Close all nodes whose effective status is 'cancelled'
    if (!effective) return;
    const next = {};
    // Preserve other open states but force cancelled nodes closed
    // Iterate over existing open states to keep them, then override cancelled ones
    // Start with current open nodes
    // We'll reconstruct based on previous state to avoid accidental full closure
    setOpenNodes(prev => {
      const updated = { ...prev };
      for (const [id] of byId) {
        const eff = effective.get(id);
        if (eff && eff.status === 'cancelled') {
          updated[id] = false;
        }
      }
      return updated;
    });
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={() => createNode('GIVEN')}>New Given</button>
      <button onClick={() => createNode('WHEN')}>New When</button>
      <button onClick={() => createNode('WHEN_GROUP')}>New When Group</button>
      <button onClick={expandAll} title="Expand selected subtree (or all if none selected)">Expand All</button>
      <button onClick={collapseAll} title="Collapse selected subtree (or all if none selected)">Collapse All</button>
      <button onClick={collapseCancelled} title="Collapse all nodes with effective status 'cancelled'">Collapse Cancelled</button>
      <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input
          value={filterTag}
          onChange={e => setFilterTag(e.target.value)}
          placeholder="Filter tags… e.g. tag1, tag2"
          title="Show nodes having any of these tags (effective). Parents of matches are kept."
          style={{ fontSize: 12, padding: '4px 6px', width: 200 }}
        />
        {filterTag && (
          <button onClick={() => setFilterTag("")} title="Clear tag filter">Clear</button>
        )}
        <select
          multiple
          value={statusValues}
          onChange={e => {
            const vals = Array.from(e.target.selectedOptions).map(o => o.value);
            setFilterStatus(vals.join(", "));
          }}
          title="Filter by effective status (multi-select). Parents of matches are kept."
          style={{ fontSize: 12, padding: '4px 6px', width: 220, height: 72 }}
        >
          {STATUS_OPTIONS.filter(o => o.value !== null).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {filterStatus && (
          <button onClick={() => setFilterStatus("")} title="Clear status filter">Clear</button>
        )}
      </div>
    </div>
  );
}

function NodeRow({ node, dragHandle, effective, isSelected, isOpen, onSelect, onToggle, reload, byId, onSetStatus, onAddTag, whenCount }) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(node.title);
  useEffect(() => setTitle(node.title), [node.title]);

  const renameNode = async (newTitle) => {
    if (newTitle === node.title) return;
    await api(`/nodes/${node.id}`, { method: 'PATCH', body: JSON.stringify({ title: newTitle }) });
    await reload();
  };

  const colorForType = node.type === "GIVEN" ? "#4c6ef5" : node.type === "WHEN_GROUP" ? "#845ef7" : "#339af0";
  const effStatus = effective?.status;

  return (
    <>
      <div {...dragHandle} style={{ cursor: "grab", padding: "0 4px", opacity: 0.6 }}>⋮⋮</div>
      <button onClick={onToggle} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, width: 24, textAlign: "center" }}>
        {node.children.length > 0 ? (isOpen ? '▾' : '▸') : ''}
      </button>
      {node.type !== 'WHEN' && whenCount > 0 && (
        <span title="Visible WHEN descendants" style={{
          marginLeft: 4,
          background: '#edf2ff',
          color: '#364fc7',
          border: '1px solid #bac8ff',
          borderRadius: 10,
          padding: '0 6px',
          fontSize: 11,
          lineHeight: '18px',
          height: 18,
          display: 'inline-flex',
          alignItems: 'center',
        }}>{whenCount}</span>
      )}
      <span style={{ color: colorForType, fontSize: 12, fontWeight: "bold", padding: "2px 6px", border: `1px solid ${colorForType}`, borderRadius: 4 }}>{node.type}</span>
      {isEditing ? (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { setIsEditing(false); renameNode(title); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { setIsEditing(false); renameNode(title); } if (e.key === 'Escape') setIsEditing(false); }}
          autoFocus
          style={{ flex: 1, fontSize: 14, padding: '4px 6px', border: '1px solid #ccc', borderRadius: 4 }}
        />
      ) : (
        <span onClick={onSelect} onDoubleClick={() => setIsEditing(true)} style={{ flex: 1, cursor: "pointer", textDecoration: effStatus === "done" ? "line-through" : "none", opacity: effStatus === "done" ? 0.6 : 1, fontWeight: isSelected ? "bold" : "normal" }}>
          {node.title}
        </span>
      )}
      <StatusPill status={effStatus} explicit={!!node.explicit_status} />
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <StatusSelect
          value={node.explicit_status ?? null}
          onChange={(v) => onSetStatus(node, v)}
        />
      </div>
    </>
  );
}

function StatusSelect({ value, onChange }) {
  return (
    <select
      value={value ?? ""}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={e => { e.stopPropagation(); onChange(e.target.value || null); }}
      title="Set explicit status (empty = inherit)"
    >
      {STATUS_OPTIONS.map(o => (
        <option key={String(o.value)} value={o.value ?? ""}>{o.label}</option>
      ))}
    </select>
  );
}

function TagAdder({ onAdd }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={e => { e.preventDefault(); const t = text.trim(); if (t) onAdd(t); setText(""); }}
      style={{ display: "inline-flex", gap: 6 }}
      title="Add a local 'add' tag here"
    >
      <input
        placeholder="add tag…"
        value={text}
        onChange={e => setText(e.target.value)}
        style={{ fontSize: 12, padding: "2px 6px", width: 120 }}
      />
    </form>
  );
}

function DetailsPanel({ node, effective, onSetStatus, onAddTag, removeEffectiveTagHere, reload, setSelectedId, byId }) {
  const [newTag, setNewTag] = useState("");

  if (!node) {
    return (
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "#f9f9f9" }}>
        <p style={{ textAlign: "center", color: "#666" }}>Select a node to see details</p>
      </div>
    );
  }

  const deleteNode = async () => {
    if (node.parent_id == null) {
      alert('Cannot delete the root node.');
      return;
    }
    const ok = window.confirm(`Delete "${node.title}" and all its children?`);
    if (!ok) return;
    await api(`/nodes/${node.id}`, { method: 'DELETE' });
    // Clear selection and reload data to reflect deletion
    try { setSelectedId(null); } catch {}
    await reload();
  };

  // Build statement lines from ancestor GIVEN nodes (one per line) and the current WHEN node (one line).
  // Ignore any WHEN_GROUP titles. Only show when the selected node is a WHEN.
  const buildStatementLines = () => {
    if (!node || node.type !== 'WHEN' || !byId) return null;
    const givens = [];
    let cur = node;
    // Traverse ancestors to collect GIVEN titles
    while (cur && cur.parent_id) {
      const p = byId.get(cur.parent_id);
      if (!p) break;
      if (p.type === 'GIVEN') {
        // Strip leading keyword if present for cleaner output
        const t = String(p.title || '').replace(/^\s*GIVEN\s*/i, '').trim();
        givens.push(t || String(p.title || ''));
      }
      // Explicitly ignore WHEN_GROUP nodes (do not collect their titles)
      cur = p;
    }
    // Ancestors were collected from child up; reverse to top-down order
    givens.reverse();
    const whenText = String(node.title || '').replace(/^\s*WHEN\s*/i, '').trim() || String(node.title || '');
    const lines = [
      ...givens.map(g => ({ type: 'GIVEN', text: g })),
      { type: 'WHEN', text: whenText },
    ];
    return lines;
  };
  const statementLines = buildStatementLines();

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "#f9f9f9" }}>
      <h3 style={{ marginTop: 0 }}>{node.title}</h3>
      <p>ID: {node.id}, v{node.version}</p>
      {statementLines && (
        <div style={{ margin: '12px 0', padding: '8px 10px', background: '#fff', border: '1px solid #eee', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>scenario</div>
          <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {statementLines.map((ln, idx) => {
              const color = ln.type === 'GIVEN' ? '#1c7ed6' : ln.type === 'WHEN' ? '#f08c00' : '#495057';
              return (
                <div key={idx}>
                  <span style={{
                    fontWeight: 700,
                    color,
                    marginRight: 6,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji"'
                  }}>{ln.type}</span>
                  <span>{ln.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>Status</label>
        <select value={node.explicit_status ?? ""} onChange={(e) => onSetStatus(node, e.target.value || null)} style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}>
          {STATUS_OPTIONS.map(opt => <option key={opt.label} value={opt.value ?? ""}>{opt.label}</option>)}
        </select>
        {node.explicit_status == null && <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Inheriting: <StatusPill status={effective?.status} explicit={false} /></p>}
      </div>
      <div>
        <label style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>Tags</label>
        <div style={{ fontSize: 12, color: "#666" }}>Local Tags</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {(node.tags || []).map(t => <Tag key={t} text={t} isLocal />)}
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 12 }}>Effective Tags</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {(effective?.tags || []).map(t => <Tag key={t} text={t} onRemove={() => removeEffectiveTagHere(node, t)} />)}
        </div>
        <div style={{ marginTop: 6 }}>
          <form onSubmit={e => { e.preventDefault(); onAddTag(node, newTag); setNewTag(""); }}>
            <input
              placeholder="add tag…"
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              style={{ fontSize: 12, padding: "2px 6px", width: 120 }}
            />
          </form>
        </div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={deleteNode} title="Delete node" style={{ border: '1px solid #e03131', background: '#fff5f5', color: '#e03131', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}>Delete Node</button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status, explicit }) {
  const color = {
    'to do': '#f03e3e',
    'in progress': '#f59f00',
    'done': '#40c057',
    'cancelled': '#868e96',
  }[status] || '#ced4da';

  return (
    <span style={{
      background: color,
      color: 'white',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 'bold',
      opacity: explicit ? 1 : 0.5,
      marginLeft: 8,
    }}>
      {status || 'none'}
    </span>
  );
}

function Tag({ text, isLocal, onRemove }) {
  // Deterministic color per tag text using a simple hash -> hue mapping
  const hash = Array.from(text).reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0) >>> 0;
  const hue = hash % 360;
  const bg = `hsl(${hue} 85% ${isLocal ? 92 : 88}% / 1)`; // slightly lighter for local
  const border = `hsl(${hue} 70% 70% / 1)`;
  const fg = `hsl(${hue} 45% 30% / 1)`;

  return (
    <div style={{
      background: bg,
      color: fg,
      padding: '2px 8px',
      borderRadius: 12,
      border: `1px solid ${border}`,
      fontSize: 12,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
    }}>
      {text}
      {onRemove && <button onClick={onRemove} style={{ border: 'none', background: 'transparent', color: '#495057', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>}
    </div>
  );
}
