// Custom repositories added by the visitor (e.g. OCA/sale-workflow). Pure functions.
//
// A custom repository is read from GitHub (src/data/github.js), turned into the same per-version diff chain as
// the gist (see docs/data-format.md) and merged with it, so the comparison, search and details work unchanged.

import { sortVersions } from './versions.js';

/** Branch names following Odoo's version naming (same rules as the checker). */
const STANDARD_BRANCH_RE = /^(?:master|\d+\.0|saas-\d+\.\d+)$/;
/** A top-level folder holding a manifest is a module. */
const MANIFEST_RE = /^([A-Za-z0-9_]+)\/__(?:manifest|openerp)__\.py$/;
const NAME_RE = /^[A-Za-z0-9_.-]+$/;
const FORBIDDEN_OWNER = 'odoo';

export class RepoInputError extends Error {
    /** @param {'empty'|'host'|'shape'|'forbidden-odoo'} kind */
    constructor(kind, message) {
        super(message);
        this.name = 'RepoInputError';
        this.kind = kind;
    }
}

/**
 * `owner/repo` from what the visitor typed: `owner/repo`, `github.com/owner/repo` or a GitHub URL (any page of the repo).
 * @param {string} text
 * @returns {string} `owner/repo`
 */
export function parseRepoInput(text) {
    let value = String(text ?? '').trim();
    if (!value) throw new RepoInputError('empty', 'Enter a GitHub repository, for example OCA/sale-workflow.');
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^(?:www\.)?github\.com\//i.test(value)) {
        let url;
        try {
            url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
        } catch {
            throw new RepoInputError('shape', 'This is not a valid GitHub repository link.');
        }
        if (!/^(?:www\.)?github\.com$/i.test(url.hostname)) {
            throw new RepoInputError('host', 'Only GitHub repositories are supported.');
        }
        value = url.pathname;
    }
    const [owner, rawName] = value.replace(/^\/+/, '').split('/');
    const name = rawName?.replace(/\.git$/i, '');
    if (!owner || !name || !NAME_RE.test(owner) || !NAME_RE.test(name)) {
        throw new RepoInputError('shape', 'Use the form owner/repository, for example OCA/sale-workflow.');
    }
    if (owner.toLowerCase() === FORBIDDEN_OWNER) {
        throw new RepoInputError('forbidden-odoo', "Odoo's own repositories are already included.");
    }
    return `${owner}/${name}`;
}

/**
 * Repositories of the odoo organisation, and forks of them, are refused (already covered by the main data).
 * @param {{ owner?: { login?: string }, fork?: boolean, parent?: { owner?: { login?: string } }, source?: { owner?: { login?: string } } }} meta
 *   GitHub `GET /repos/{owner}/{repo}` response
 */
export function isForbidden(meta) {
    const isOdoo = (o) => o?.owner?.login?.toLowerCase() === FORBIDDEN_OWNER;
    return isOdoo(meta) || Boolean(meta?.fork && (isOdoo(meta.parent) || isOdoo(meta.source)));
}

/** @param {string} name branch name */
export function isStandardBranch(name) {
    return STANDARD_BRANCH_RE.test(name);
}

/**
 * Module names from a GitHub git tree (`GET /git/trees/{sha}?recursive=1`): top-level folders with a manifest.
 * @param {{ tree?: { path: string, type: string }[] }} tree
 * @returns {string[]} sorted, unique
 */
export function modulesFromTree(tree) {
    const modules = new Set();
    for (const entry of tree?.tree ?? []) {
        if (entry.type !== 'blob') continue;
        const match = MANIFEST_RE.exec(entry.path);
        if (match) modules.add(match[1]);
    }
    return [...modules].sort();
}

/**
 * Module sets per branch → the per-version diff chain of the data format, for one repository.
 * Versions unknown to the main data are dropped. Each branch is diffed against the previous branch: a version
 * without a branch is not carried forward, its state is unknown (see unknownVersions).
 * @param {string} id `owner/repo`
 * @param {Record<string, string[]>} modulesByVersion
 * @param {Iterable<string>} knownVersions versions of the main data
 * @returns {Record<string, Record<string, { '+'?: string[], '-'?: string[] }>>}
 */
export function toVersionDiff(id, modulesByVersion, knownVersions) {
    const known = new Set(knownVersions);
    const diff = {};
    let previous = new Set();
    for (const version of sortVersions(Object.keys(modulesByVersion).filter((v) => known.has(v)))) {
        const current = new Set(modulesByVersion[version]);
        const added = [...current].filter((m) => !previous.has(m)).sort();
        const removed = [...previous].filter((m) => !current.has(m)).sort();
        const content = {};
        if (added.length) content['+'] = added;
        if (removed.length) content['-'] = removed;
        diff[version] = { [id]: content };
        previous = current;
    }
    return diff;
}

/**
 * Versions of the main data where a custom repository has no branch: its modules there are unknown (maybe
 * removed, maybe not), so the repository is left out of those versions instead of being shown present or removed.
 * @param {Iterable<string>} knownVersions versions of the main data
 * @param {Iterable<string>} branches branches of the repository
 * @returns {string[]}
 */
export function unknownVersions(knownVersions, branches) {
    const has = new Set(branches);
    return [...knownVersions].filter((v) => !has.has(v));
}

/**
 * Merge diff chains per version, without mutating the inputs.
 * @param {Record<string, Record<string, object>>} base
 * @param {...Record<string, Record<string, object>>} extras
 */
export function mergeVersionDiffs(base, ...extras) {
    const merged = {};
    for (const [version, repos] of Object.entries(base)) merged[version] = { ...repos };
    for (const extra of extras) {
        for (const [version, repos] of Object.entries(extra)) merged[version] = { ...merged[version], ...repos };
    }
    return merged;
}
