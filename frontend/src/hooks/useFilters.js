// frontend/src/hooks/useFilters.js
import { useMemo } from 'react';

/**
 * Compute the set of node ids that should be visible given the current filters.
 * If no filters are set, returns null to signal "no restrictions".
 */
export function useVisibleIds(effective, byId, filterTag, filterStatus) {
  return useMemo(() => {
    // Helper to get base matches (without ancestors) for tag filter
    const matchByTags = () => {
      const raw = (filterTag || '').trim();
      if (!raw) return null;
      const tokens = raw
        .split(/[,\s]+/)
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

    const tagSet = matchByTags();
    const statusSet = matchByStatus();

    if (!tagSet && !statusSet) return null; // no filters

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
    return visible;
  }, [effective, byId, filterTag, filterStatus]);
}
