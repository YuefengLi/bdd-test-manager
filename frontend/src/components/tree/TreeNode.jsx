// frontend/src/components/tree/TreeNode.jsx
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import NodeRow from './NodeRow';

export default function TreeNode({ node, depth, effective, isSelected, isOpen, onSelect, onToggle, reload, byId, onSetStatus, onAddTag, whenCount }) {
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
