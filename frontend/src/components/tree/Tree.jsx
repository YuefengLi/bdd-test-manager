// frontend/src/components/tree/Tree.jsx
import React, { useMemo } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import TreeNode from './TreeNode';
import { useDragCopyMode } from '../../hooks/useDragCopyMode';
import DropGap from './DropGap';

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

  // Immediate WHEN child counts per node: { todo, total }
  const whenChildrenCounts = useMemo(() => {
    const map = new Map();
    const dfs = (node) => {
      let todo = 0;
      let total = 0;
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          // recurse into child subtree first
          const sub = dfs(child);
          todo += sub.todo;
          total += sub.total;
          // then count the child itself if it is a WHEN
          if (child.type === 'WHEN') {
            total += 1;
            const eff = effective.get(child.id);
            if (eff?.status === 'to do') todo += 1;
          }
        }
      }
      // store counts for this node (descendants only)
      map.set(node.id, { todo, total });
      return { todo, total };
    };
    for (const r of nodes) dfs(r);
    return map;
  }, [nodes, effective]);

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
          {flattenedTree.map((node, idx) => (
            <React.Fragment key={node.id}>
              <DropGap id={`gap-before-${node.id}`} depth={node.depth} />
              <TreeNode
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
                whenChildrenCount={whenChildrenCounts.get(node.id) || { todo: 0, total: 0 }}
              />
              {idx === flattenedTree.length - 1 && (
                <DropGap id={`gap-after-${node.id}`} depth={node.depth} />
              )}
            </React.Fragment>
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}
