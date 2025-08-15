// frontend/src/components/tree/TreeNode.jsx
import React, { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import NodeRow from './NodeRow';

export default function TreeNode({ node, depth, effective, isSelected, isHighlighted, isOpen, onSelect, onToggle, reload, byId, onSetStatus, onAddTag, whenChildrenCount }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: node.id });
  const rowRef = useRef(null);

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
    background: isSelected ? '#e7f3ff' : isHighlighted ? '#fff6bf' : 'transparent',
    boxShadow: isHighlighted ? 'inset 0 0 0 2px #ffd43b' : undefined,
  };

  useEffect(() => {
    if ((isHighlighted || isSelected) && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted, isSelected]);

  return (
    <div ref={(el) => { setNodeRef(el); rowRef.current = el; }} style={style}>
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
        whenChildrenCount={whenChildrenCount}
      />
    </div>
  );
}
