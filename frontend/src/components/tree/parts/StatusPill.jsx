// frontend/src/components/tree/parts/StatusPill.jsx
import React from 'react';

export default function StatusPill({ status, explicit }) {
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
