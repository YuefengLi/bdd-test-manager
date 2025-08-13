// frontend/src/components/tree/NodeRow.jsx
import React, { useState, useEffect } from 'react';
import StatusPill from './parts/StatusPill';
import StatusSelect from './parts/StatusSelect';
import { api } from '../../api/client';

export default function NodeRow({ node, dragHandle, effective, isSelected, isOpen, onSelect, onToggle, reload, byId, onSetStatus, onAddTag, whenCount }) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(node.title);
  useEffect(() => setTitle(node.title), [node.title]);

  const colorForType = node.type === 'GIVEN' ? '#4c6ef5' : node.type === 'WHEN_GROUP' ? '#845ef7' : '#339af0';
  const effStatus = effective?.status;

  const renameNode = async (newTitle) => {
    if (newTitle === node.title) return;
    // PATCH title via centralized api helper
    await api(`/nodes/${node.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: newTitle })
    });
    await reload();
  };

  return (
    <>
      <div {...dragHandle} style={{ cursor: 'grab', padding: '0 4px', opacity: 0.6 }}>⋮⋮</div>
      <button onClick={onToggle} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, width: 24, textAlign: 'center' }}>
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
      <span style={{ color: colorForType, fontSize: 12, fontWeight: 'bold', padding: '2px 6px', border: `1px solid ${colorForType}`, borderRadius: 4 }}>{node.type}</span>
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
        <span onClick={onSelect} onDoubleClick={() => setIsEditing(true)} style={{ flex: 1, cursor: 'pointer', textDecoration: effStatus === 'done' ? 'line-through' : 'none', opacity: effStatus === 'done' ? 0.6 : 1, fontWeight: isSelected ? 'bold' : 'normal' }}>
          {node.title}
        </span>
      )}
      <StatusPill status={effStatus} explicit={!!node.explicit_status} />
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusSelect
          value={node.explicit_status ?? null}
          onChange={(v) => onSetStatus(node, v)}
        />
      </div>
    </>
  );
}
