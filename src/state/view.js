// View model for the results: comparison + search. Pure.

import { compare } from '../domain/compare.js';
import { matches, parseQuery } from '../domain/search.js';

/**
 * @typedef {{ repo: string, total: number, modules: string[] }} Group
 * @typedef {{ groups: Group[], total: number, visible: number }} Column
 * @typedef {{ items: import('../domain/compare.js').Move[], total: number, visible: number }} MovedColumn
 * @typedef {{ from: string|undefined, to: string, query: import('../domain/search.js').Query,
 *   added: Column, removed: Column, moved: MovedColumn, unknown: import('../domain/compare.js').Unknown[] }} View
 */

/**
 * @param {{ model: import('../domain/snapshots.js').Snapshots, from: string|undefined, to: string, query: string }} input
 * @returns {View}
 */
export function buildView({ model, from, to, query }) {
    const cmp = compare(model, from, to, { detectMoves: true });
    const q = parseQuery(query);

    const column = (record) => {
        const groups = [];
        let total = 0;
        let visible = 0;
        for (const [repo, base] of Object.entries(record)) {
            if (!base.length) continue;
            const modules = q.active ? base.filter((m) => matches(q, repo, m)) : base;
            groups.push({ repo, total: base.length, modules });
            total += base.length;
            visible += modules.length;
        }
        return { groups, total, visible };
    };

    const added = column(cmp.added);
    const removed = column(cmp.removed);
    const movedBase = cmp.moved;
    const movedItems = q.active
        ? movedBase.filter((mv) => matches(q, mv.fromRepo, mv.module) || matches(q, mv.toRepo, mv.module))
        : movedBase;

    return {
        from: cmp.from,
        to: cmp.to,
        query: q,
        added,
        removed,
        moved: { items: movedItems, total: movedBase.length, visible: movedItems.length },
        unknown: cmp.unknown,
    };
}

/**
 * Match counts per version: how many modules matching the query changed (added or removed) in each version.
 * @param {Map<string, import('../domain/history.js').HistoryEvent[]>} history
 * @param {import('../domain/search.js').Query} query
 * @returns {Map<string, number>}
 */
export function changeCountsByVersion(history, query) {
    const counts = new Map();
    if (!query.active) return counts;
    for (const [module, events] of history) {
        const seen = new Set();
        for (const e of events) {
            if (seen.has(e.version) || !matches(query, e.repo, module)) continue;
            seen.add(e.version);
            counts.set(e.version, (counts.get(e.version) ?? 0) + 1);
        }
    }
    return counts;
}
