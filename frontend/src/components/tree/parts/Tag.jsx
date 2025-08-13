// frontend/src/components/tree/parts/Tag.jsx
import React from 'react';

export default function Tag({ text, isLocal, onRemove }) {
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
