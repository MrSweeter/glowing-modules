// Rebuild the full module set of every version from the chain of per-version diffs.
//
// The data is a chain: each version lists what was added/removed compared to the previous version
// (sorted oldest → newest). Replaying it gives the exact module set of every version, which makes any
// comparison a plain set difference (see compare.js).

import { sortVersions } from './versions.js';

/**
 * @typedef {Map<string, Set<string>>} RepoSets  repo → modules
 * @typedef {Map<string, Set<string>>} UnknownRepos  version → repos whose module set is unknown there
 * @typedef {{ versions: string[], repos: string[], snapshots: Map<string, RepoSets>, unknown: UnknownRepos }} Snapshots
 */

/**
 * @param {import('../data/validate.js').VersionsDiff} diff
 * @param {UnknownRepos} [unknown] repositories left out of a version's snapshot because their state there is
 *   unknown (a custom repository with no branch for that version): neither present nor removed
 * @returns {Snapshots}
 */
export function buildSnapshots(diff, unknown = new Map()) {
    const versions = sortVersions(Object.keys(diff));
    /** @type {RepoSets} */
    const current = new Map();
    const snapshots = new Map();

    for (const version of versions) {
        for (const [repo, content] of Object.entries(diff[version] ?? {})) {
            const set = current.get(repo) ?? new Set();
            for (const m of content['+'] ?? []) set.add(m);
            for (const m of content['-'] ?? []) set.delete(m);
            current.set(repo, set);
        }
        const skip = unknown.get(version);
        const known = [...current].filter(([repo]) => !skip?.has(repo));
        snapshots.set(version, new Map(known.map(([repo, set]) => [repo, new Set(set)])));
    }
    return { versions, repos: [...current.keys()], snapshots, unknown };
}

/**
 * Module set of one version (empty map for an unknown/undefined version, e.g. "before 5.0").
 * @param {Snapshots} model
 * @param {string|undefined} version
 * @returns {RepoSets}
 */
export function snapshotOf(model, version) {
    return (version && model.snapshots.get(version)) || new Map();
}

/**
 * Whether the module set of `repo` is unknown at `version` (see buildSnapshots).
 * @param {Snapshots} model
 * @param {string|undefined} version
 * @param {string} repo
 */
export function isUnknown(model, version, repo) {
    return Boolean(version && model.unknown?.get(version)?.has(repo));
}

/**
 * Total module count of a version, overall and per repository.
 * @param {Snapshots} model
 * @param {string} version
 */
export function stats(model, version) {
    const perRepo = {};
    let total = 0;
    for (const [repo, set] of snapshotOf(model, version)) {
        perRepo[repo] = set.size;
        total += set.size;
    }
    return { total, perRepo };
}
