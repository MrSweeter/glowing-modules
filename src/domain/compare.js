// Compare two versions using full snapshots (correct for any range).

import { isUnknown, snapshotOf } from './snapshots.js';
import { compareVersions } from './versions.js';

/**
 * @typedef {{ repo: string, module: string }} Entry
 * @typedef {{ module: string, fromRepo: string, toRepo: string }} Move
 * @typedef {{ repo: string, versions: string[] }} Unknown  a repository not compared: no branch for `versions`
 * @typedef {{ from: string|undefined, to: string, added: Record<string,string[]>, removed: Record<string,string[]>,
 *   moved: Move[], unknown: Unknown[] }} Comparison
 */

/**
 * Modules added (present in `to`, absent in `from`) and removed (present in `from`, absent in `to`), per repository.
 * Inputs are normalised so `from` is the older version. `from` may be undefined (compare against nothing).
 * A repository whose state is unknown at `from` or `to` (see buildSnapshots) is not compared: listed in `unknown`.
 * When `detectMoves` is true, a module removed from repo A and added to repo B is reported in `moved` instead.
 *
 * @param {import('./snapshots.js').Snapshots} model
 * @param {string|undefined} from
 * @param {string} to
 * @param {{ detectMoves?: boolean }} [options]
 * @returns {Comparison}
 */
export function compare(model, from, to, { detectMoves = false } = {}) {
    if (from && to && compareVersions(from, to) > 0) [from, to] = [to, from];
    const a = snapshotOf(model, from);
    const b = snapshotOf(model, to);
    const repos = orderRepos(model.repos, [...a.keys(), ...b.keys()]);
    const added = {};
    const removed = {};
    const unknown = [];
    for (const repo of repos) {
        const missing = [from, to].filter((v) => isUnknown(model, v, repo));
        if (missing.length) {
            unknown.push({ repo, versions: missing });
            continue;
        }
        const before = a.get(repo) ?? new Set();
        const after = b.get(repo) ?? new Set();
        added[repo] = [...after.difference(before)].sort();
        removed[repo] = [...before.difference(after)].sort();
    }
    const moved = detectMoves ? extractMoves(added, removed) : [];
    return { from, to, added, removed, moved, unknown };
}

/**
 * Remove modules that moved between repositories from `added`/`removed` (mutates) and return them.
 * @param {Record<string,string[]>} added
 * @param {Record<string,string[]>} removed
 * @returns {Move[]}
 */
export function extractMoves(added, removed) {
    const removedIn = new Map(); // module -> repo
    for (const [repo, modules] of Object.entries(removed)) for (const m of modules) removedIn.set(m, repo);
    const moves = [];
    for (const [toRepo, modules] of Object.entries(added)) {
        for (const module of modules) {
            const fromRepo = removedIn.get(module);
            if (fromRepo && fromRepo !== toRepo) moves.push({ module, fromRepo, toRepo });
        }
    }
    for (const { module, fromRepo, toRepo } of moves) {
        added[toRepo] = added[toRepo].filter((m) => m !== module);
        removed[fromRepo] = removed[fromRepo].filter((m) => m !== module);
    }
    return moves.sort((x, y) => x.module.localeCompare(y.module));
}

/** Count of entries in a `{ repo: modules[] }` record. */
export function countEntries(record) {
    return Object.values(record).reduce((sum, list) => sum + list.length, 0);
}

function orderRepos(known, extra) {
    const set = new Set(known);
    for (const r of extra) set.add(r);
    return [...set];
}
