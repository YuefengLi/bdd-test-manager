// frontend/src/components/tree/parts/TagAdder.jsx
import React, { useState } from 'react';

export default function TagAdder({ onAdd, placeholder = 'add tag…', width = 120 }) {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={e => { e.preventDefault(); const t = text.trim(); if (t) onAdd(t); setText(''); }}
      style={{ display: 'inline-flex', gap: 6 }}
      title="Add a local 'add' tag here"
    >
      <input
        placeholder={placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
        style={{ fontSize: 12, padding: '2px 6px', width }}
      />
    </form>
  );
}
