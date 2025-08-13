// frontend/src/components/tree/Toolbar.jsx
import React, { useMemo } from 'react';
import { STATUS_OPTIONS } from '../../constants';
import { api } from '../../api/client';

export default function Toolbar({ onNew, selectedId, byId, roots, setOpenNodes, effective, filterTag, setFilterTag, filterStatus, setFilterStatus }) {
  const statusValues = useMemo(
    () => (filterStatus || '')
      // Split ONLY by commas to preserve multi-word statuses like "to do"
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
    , [filterStatus]
  );

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
          <button onClick={() => setFilterTag('')} title="Clear tag filter">Clear</button>
        )}
        <select
          multiple
          value={statusValues}
          onChange={e => {
            const vals = Array.from(e.target.selectedOptions).map(o => o.value);
            setFilterStatus(vals.join(', '));
          }}
          title="Filter by effective status (multi-select). Parents of matches are kept."
          style={{ fontSize: 12, padding: '4px 6px', width: 220, height: 72 }}
        >
          {STATUS_OPTIONS.filter(o => o.value !== null).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {filterStatus && (
          <button onClick={() => setFilterStatus('')} title="Clear status filter">Clear</button>
        )}
      </div>
    </div>
  );
}
