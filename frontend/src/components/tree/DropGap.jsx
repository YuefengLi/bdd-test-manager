// frontend/src/components/tree/DropGap.jsx
import React from 'react';
import { useDroppable } from '@dnd-kit/core';

export default function DropGap({ id, depth }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  const height = 6; // thin gap line
  const indent = depth * 24 + 8;

  return (
    <div
      ref={setNodeRef}
      style={{
        height,
        marginLeft: indent,
        marginRight: 8,
        borderRadius: 3,
        background: isOver ? '#4da3ff' : 'transparent',
        border: '1px dashed #cfd8dc',
        transition: 'background 120ms',
      }}
    />
  );
}
