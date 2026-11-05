// Custom repositories saved in this browser: the list of ids and a cached copy of each (module names per branch).

import { CUSTOM_REPO_OUTDATED_MS, MAX_CUSTOM_REPOS } from '../config.js';

const LIST_KEY = 'gm.repos';
const CACHE_PREFIX = 'gm.repo:';
const ID_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MODULE_RE = /^[A-Za-z0-9_]+$/;

/**
 * @param {{ get(key: string): string|null, set(key: string, value: string|null): void }} storage
 */
export function createCustomRepoStore(storage) {
    const readJson = (key) => {
        try {
            return JSON.parse(storage.get(key) ?? 'null');
        } catch {
            return null;
        }
    };

    function list() {
        const ids = readJson(LIST_KEY);
        return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && ID_RE.test(id)) : [];
    }

    /** @returns {import('../data/github.js').RepoData|null} the cached copy, or null when missing or corrupt */
    function get(id) {
        const data = readJson(CACHE_PREFIX + id);
        if (!isRepoData(data)) {
            if (data !== null) storage.set(CACHE_PREFIX + id, null);
            return null;
        }
        return data;
    }

    function has(id) {
        return list().some((x) => x.toLowerCase() === id.toLowerCase());
    }

    /** @param {import('../data/github.js').RepoData} data */
    function save(data) {
        const ids = list();
        const at = ids.findIndex((x) => x.toLowerCase() === data.id.toLowerCase());
        if (at === -1) ids.push(data.id);
        else {
            // Same repository with a different case (GitHub's canonical name wins): drop the old cache key.
            if (ids[at] !== data.id) storage.set(CACHE_PREFIX + ids[at], null);
            ids[at] = data.id;
        }
        storage.set(LIST_KEY, JSON.stringify(ids.slice(0, MAX_CUSTOM_REPOS)));
        storage.set(CACHE_PREFIX + data.id, JSON.stringify(data));
    }

    function remove(id) {
        storage.set(LIST_KEY, JSON.stringify(list().filter((x) => x !== id)));
        storage.set(CACHE_PREFIX + id, null);
    }

    return { list, get, has, save, remove, isFull: () => list().length >= MAX_CUSTOM_REPOS };
}

/** Whether a saved copy is old enough to tell the visitor (refreshing stays a manual action). */
export function isOutdated(data, now = Date.now(), limit = CUSTOM_REPO_OUTDATED_MS) {
    const at = Date.parse(data?.fetchedAt ?? '');
    return Number.isNaN(at) || now - at > limit;
}

/** Module sets per version of a cached repository (input of toVersionDiff). */
export function modulesByVersion(data) {
    return Object.fromEntries(Object.entries(data.branches).map(([version, b]) => [version, b.modules]));
}

function isRepoData(data) {
    if (!data || typeof data !== 'object' || typeof data.id !== 'string' || !ID_RE.test(data.id)) return false;
    if (!data.branches || typeof data.branches !== 'object') return false;
    return Object.values(data.branches).every(
        (b) => b && Array.isArray(b.modules) && b.modules.every((m) => typeof m === 'string' && MODULE_RE.test(m))
    );
}
