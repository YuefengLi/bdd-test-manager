// frontend/src/components/tree/parts/StatusSelect.jsx
import React from 'react';
import { STATUS_OPTIONS } from '../../../constants';

export default function StatusSelect({ value, onChange }) {
  return (
    <select
      value={value ?? ''}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => { e.stopPropagation(); onChange(e.target.value || null); }}
      title="Set explicit status (empty = inherit)"
    >
      {STATUS_OPTIONS.map(o => (
        <option key={String(o.value)} value={o.value ?? ''}>{o.label}</option>
      ))}
    </select>
  );
}
