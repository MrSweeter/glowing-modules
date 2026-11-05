// Per-module history and availability ranges.

import { sortVersions } from './versions.js';

/**
 * @typedef {{ version: string, repo: string, action: '+'|'-' }} HistoryEvent
 */

/**
 * Module name → chronological events (always built from the full, unfiltered data).
 * @param {import('../data/validate.js').VersionsDiff} diff
 * @returns {Map<string, HistoryEvent[]>}
 */
export function buildHistory(diff) {
    const history = new Map();
    for (const version of sortVersions(Object.keys(diff))) {
        for (const [repo, content] of Object.entries(diff[version] ?? {})) {
            for (const action of /** @type {const} */ (['-', '+'])) {
                for (const module of content[action] ?? []) {
                    if (!history.has(module)) history.set(module, []);
                    history.get(module).push({ version, repo, action });
                }
            }
        }
    }
    return history;
}

/**
 * Versions where `module` exists, merged into consecutive ranges, per repository.
 * @param {import('./snapshots.js').Snapshots} model
 * @param {string} module
 * @returns {{ repo: string, from: string, to: string }[]} chronological
 */
export function availability(model, module) {
    const ranges = [];
    let open = null;
    for (const version of model.versions) {
        const snapshot = model.snapshots.get(version);
        let repo = null;
        for (const [r, set] of snapshot) {
            if (set.has(module)) {
                repo = r;
                break;
            }
        }
        if (open && open.repo === repo) {
            open.to = version;
        } else {
            if (open) ranges.push(open);
            open = repo ? { repo, from: version, to: version } : null;
        }
    }
    if (open) ranges.push(open);
    return ranges;
}

/**
 * Versions in which `module` exists (any repository).
 * @param {import('./snapshots.js').Snapshots} model
 * @param {string} module
 */
export function versionsContaining(model, module) {
    return model.versions.filter((v) => [...model.snapshots.get(v).values()].some((set) => set.has(module)));
}
