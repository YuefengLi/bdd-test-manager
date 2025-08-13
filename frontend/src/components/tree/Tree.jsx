// frontend/src/components/tree/Tree.jsx
import React, { useMemo } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import TreeNode from './TreeNode';
import { useDragCopyMode } from '../../hooks/useDragCopyMode';

export default function Tree({ nodes, byId, effective, visibleIds, selectedId, openNodes, setSelectedId, setOpenNodes, onMove, onCopy, reload, onSetStatus, onAddTag }) {
  const sensors = useSensors(useSensor(PointerSensor));
  const { copyMode, onDragStart, onDragEnd, onDragCancel } = useDragCopyMode();

  const flattenedTree = useMemo(() => {
    const result = [];
    function flatten(list, depth) {
      for (const node of list) {
        if (visibleIds && !visibleIds.has(node.id)) continue;
        result.push({ ...node, depth });
        if (openNodes[node.id]) flatten(node.children, depth + 1);
      }
    }
    flatten(nodes, 0);
    return result;
  }, [nodes, openNodes, visibleIds]);

  // Count WHEN descendants honoring visibleIds
  const whenCounts = useMemo(() => {
    const counts = new Map();
    const allow = (id) => !visibleIds || visibleIds.has(id);
    const dfs = (node) => {
      if (!allow(node.id)) return 0;
      let sum = node.type === 'WHEN' ? 1 : 0;
      if (Array.isArray(node.children)) {
        for (const child of node.children) sum += dfs(child);
      }
      const minusSelf = node.type === 'WHEN' ? sum - 1 : sum;
      counts.set(node.id, Math.max(0, minusSelf));
      return sum;
    };
    for (const r of nodes) dfs(r);
    return counts;
  }, [nodes, visibleIds]);

  const handleDragEnd = (event) => onDragEnd(event, {
    onCopy: ({ active, over }) => onCopy?.({ active, over }),
    onMove: ({ active, over }) => onMove?.({ active, over })
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={onDragCancel}
    >
      <div style={{ cursor: copyMode ? 'copy' : undefined }}>
        <SortableContext items={flattenedTree.map(n => n.id)} strategy={verticalListSortingStrategy}>
          {flattenedTree.map(node => (
            <TreeNode
              key={node.id}
              node={node}
              depth={node.depth}
              effective={effective.get(node.id)}
              isSelected={node.id === selectedId}
              isOpen={!!openNodes[node.id]}
              onSelect={() => setSelectedId(node.id)}
              onToggle={() => setOpenNodes(prev => ({ ...prev, [node.id]: !prev[node.id] }))}
              reload={reload}
              byId={byId}
              onSetStatus={onSetStatus}
              onAddTag={onAddTag}
              whenCount={whenCounts.get(node.id) || 0}
            />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}
