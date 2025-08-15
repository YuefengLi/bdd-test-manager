// frontend/src/components/tree/DetailsPanel.jsx
import React, { useEffect, useState } from 'react';
import { STATUS_OPTIONS } from '../../constants';
import StatusPill from './parts/StatusPill';
import Tag from './parts/Tag';
import { api } from '../../api/client';

export default function DetailsPanel({ node, effective, onSetStatus, onAddTag, removeEffectiveTagHere, reload, setSelectedId, byId, navigateToNode }) {
  const [newTag, setNewTag] = useState("");
  const [localAdds, setLocalAdds] = useState([]);
  const popularTags = ['negative', 'swc'];
  // Local note editor state
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState(null);
  const removeLocalAdd = async (tag) => {
    if (!node || !tag) return;
    await api(`/nodes/${node.id}/tags`, {
      method: 'PATCH',
      body: JSON.stringify({ tag, op: 'add', action: 'delete' })
    });
    await reload();
  };

  // Load local tag ops when selection changes
  useEffect(() => {
    let ignore = false;
    async function load() {
      if (!node) { setLocalAdds([]); return; }
      try {
        const res = await api(`/nodes/${node.id}/tags`, { method: 'GET' });
        if (ignore) return;
        const adds = Array.isArray(res?.ops) ? res.ops.filter(o => o.op === 'add').map(o => o.tag) : [];
        setLocalAdds(adds);
      } catch (e) {
        console.error('Failed to load local tags', e);
        if (!ignore) setLocalAdds([]);
      }
    }
    load();
    return () => { ignore = true; };
  }, [node?.id, effective]);

  // Sync note from selected node
  useEffect(() => {
    if (node) {
      setNote(node.note || '');
      setNoteError(null);
    } else {
      setNote('');
      setNoteError(null);
    }
  }, [node?.id, node?.note]);

  const saveNote = async () => {
    if (!node) return;
    try {
      setSavingNote(true);
      setNoteError(null);
      await api(`/nodes/${node.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ note, version: node.version })
      });
      await reload();
    } catch (e) {
      console.error('Failed to save note', e);
      setNoteError('Failed to save. Try again.');
    } finally {
      setSavingNote(false);
    }
  };

  // Render a simple preview that linkifies #<id>
  const renderNotePreview = () => {
    if (!note) return null;
    const parts = String(note).split(/(#[0-9]+)/g);
    return (
      <div style={{ marginTop: 6, fontSize: 12, color: '#495057', textAlign: 'left', whiteSpace: 'pre-wrap' }}>
        {parts.map((part, idx) => {
          const m = /^#([0-9]+)$/.exec(part);
          if (m) {
            const id = Number(m[1]);
            const exists = byId?.has(id);
            return (
              <a
                key={idx}
                href={`#${id}`}
                onClick={(e) => { e.preventDefault(); if (exists && navigateToNode) navigateToNode(id); }}
                style={{ color: exists ? '#1c7ed6' : '#adb5bd', textDecoration: exists ? 'underline' : 'line-through', cursor: exists ? 'pointer' : 'not-allowed' }}
                title={exists ? `Go to node #${id}` : `Node #${id} not found`}
              >
                {part}
              </a>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </div>
    );
  };

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
        <div style={{ margin: '12px 0', padding: '8px 10px', background: '#fff', border: '1px solid #eee', borderRadius: 8, textAlign: 'left' }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4, textAlign: 'left' }}>scenario</div>
          <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
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
      {/* Note editor */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Note</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          onBlur={saveNote}
          placeholder="Explain why this node is cancelled, estimate duration, etc."
          rows={4}
          style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20, marginTop: 4 }}>
          {savingNote && <span style={{ fontSize: 12, color: '#666' }}>Saving…</span>}
          {noteError && <span style={{ fontSize: 12, color: '#e03131' }}>{noteError}</span>}
        </div>
      </div>
      {renderNotePreview()}
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
          {localAdds.map(t => (
            <Tag key={t} text={t} isLocal onRemove={() => removeLocalAdd(t)} />
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 12 }}>Effective Tags</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {(effective?.tags || []).map(t => <Tag key={t} text={t} onRemove={() => removeEffectiveTagHere(node, t)} />)}
        </div>
        {/* Quick-add popular tags */}
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {popularTags.map(t => {
            const disabled = localAdds.includes(t);
            return (
              <button
                key={t}
                onClick={() => onAddTag(node, t)}
                disabled={disabled}
                title={disabled ? 'Already added locally' : `Add '${t}' locally`}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 12,
                  border: '1px solid #ccc',
                  background: disabled ? '#f1f3f5' : '#fff',
                  color: '#495057',
                  cursor: disabled ? 'not-allowed' : 'pointer'
                }}
              >+ {t}</button>
            );
          })}
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
