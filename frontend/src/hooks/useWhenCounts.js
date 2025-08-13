// frontend/src/hooks/useWhenCounts.js
import { useMemo } from 'react';

/**
 * Compute, for each node id, how many WHEN-type descendants it has.
 * Honors visibility filtering (visibleIds). Includes descendants across collapsed branches.
 * Returns a Map<nodeId, count>.
 */
export function useWhenCounts(roots, visibleIds) {
  return useMemo(() => {
    const counts = new Map();
    const allow = (id) => !visibleIds || visibleIds.has(id);

    const dfs = (node) => {
      if (!allow(node.id)) return 0; // Entire subtree filtered out
      let sum = node.type === 'WHEN' ? 1 : 0; // include self for intermediate calc
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          sum += dfs(child);
        }
      }
      // Store descendant-only count for this node
      const minusSelf = node.type === 'WHEN' ? sum - 1 : sum;
      counts.set(node.id, Math.max(0, minusSelf));
      return sum;
    };

    for (const r of roots) dfs(r);
    return counts;
  }, [roots, visibleIds]);
}
