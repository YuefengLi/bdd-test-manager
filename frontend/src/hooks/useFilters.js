// frontend/src/hooks/useFilters.js
import { useMemo } from 'react';

/**
 * Compute the set of node ids that should be visible given the current filters.
 * If no filters are set, returns null to signal "no restrictions".
 */
export function useVisibleIds(effective, byId, filterTag, filterStatus, options = {}) {
  const { hideCancelled = false, showOnlyToDo = false } = options;
  return useMemo(() => {
    // Small helpers ---------------------------------------------------------
    const isCancelled = (id) => (effective.get(id)?.status === 'cancelled');
    const collectSubtreeIds = (startIds) => {
      const result = new Set();
      const stack = Array.isArray(startIds) ? [...startIds] : [startIds];
      while (stack.length) {
        const id = stack.pop();
        if (id == null || result.has(id)) continue;
        result.add(id);
        const node = byId.get(id);
        if (node && Array.isArray(node.children)) {
          for (const c of node.children) stack.push(c.id);
        }
      }
      return result;
    };

    // Helper to get base matches (without ancestors) for tag filter
    const matchByTags = () => {
      const raw = (filterTag || '').trim();
      if (!raw) return null;
      const tokens = raw
        .split(/[\,\s]+/)
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
      if (tokens.length === 0) return null;
      const matches = new Set();
      for (const [id, eff] of effective.entries()) {
        const tags = (eff?.tags || []).map(t => String(t).toLowerCase());
        if (tokens.some(tok => tags.includes(tok))) matches.add(id);
      }
      return matches;
    };

    // Helper to get base matches (without ancestors) for status filter
    const matchByStatus = () => {
      const raw = (filterStatus || '').trim();
      if (!raw) return null;
      // IMPORTANT: statuses may contain spaces (e.g., "to do"), so split ONLY by commas
      const tokens = raw
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
      if (tokens.length === 0) return null;
      const matches = new Set();
      for (const [id, eff] of effective.entries()) {
        const st = (eff?.status ?? '').toLowerCase();
        if (tokens.includes(st)) matches.add(id);
      }
      return matches;
    };

    // Special mode: show only WHEN nodes with status 'to do' (plus ancestors)
    if (showOnlyToDo) {
      const base = new Set();
      for (const [id, node] of byId.entries()) {
        if (node?.type === 'WHEN') {
          const st = effective.get(id)?.status;
          if (st === 'to do') base.add(id);
        }
      }
      const visible = new Set(base);
      // include ancestors for context
      for (const id of base) {
        let cur = byId.get(id);
        while (cur && cur.parent_id) {
          visible.add(cur.parent_id);
          cur = byId.get(cur.parent_id);
        }
      }
      // Apply hideCancelled on top, if requested
      if (hideCancelled) {
        // remove any cancelled nodes and their descendants
        const cancelledRoots = [...byId.keys()].filter(isCancelled);
        const banned = collectSubtreeIds(cancelledRoots);
        for (const id of [...visible]) if (banned.has(id)) visible.delete(id);
      }
      return visible;
    }

    // Default mode: combine tag/status filters as before
    const tagSet = matchByTags();
    const statusSet = matchByStatus();

    // If no filter provided, either return null (no restriction) or apply hideCancelled-only
    if (!tagSet && !statusSet) {
      if (!hideCancelled) return null;
      // hideCancelled-only mode: all nodes except cancelled subtrees
      const visible = new Set();
      // Start from all ids, then remove banned
      const allIds = [...byId.keys()];
      const cancelledRoots = allIds.filter(isCancelled);
      const banned = collectSubtreeIds(cancelledRoots);
      for (const id of allIds) if (!banned.has(id)) visible.add(id);
      return visible;
    }

    // Decide base set: if both present, intersect; else the one that exists.
    let base = new Set();
    if (tagSet && statusSet) {
      for (const id of tagSet) if (statusSet.has(id)) base.add(id);
    } else if (tagSet) {
      base = tagSet;
    } else if (statusSet) {
      base = statusSet;
    }

    // If no matches, return empty set
    if (base.size === 0) return new Set();

    // Include all ancestors of matched nodes to preserve hierarchy
    const visible = new Set(base);
    for (const id of Array.from(base)) {
      let cur = byId.get(id);
      while (cur && cur.parent_id) {
        visible.add(cur.parent_id);
        cur = byId.get(cur.parent_id);
      }
    }

    // Apply hideCancelled on top
    if (hideCancelled) {
      const cancelledRoots = [...byId.keys()].filter(isCancelled);
      const banned = collectSubtreeIds(cancelledRoots);
      for (const id of [...visible]) if (banned.has(id)) visible.delete(id);
    }
    return visible;
  }, [effective, byId, filterTag, filterStatus, hideCancelled, showOnlyToDo]);
}
