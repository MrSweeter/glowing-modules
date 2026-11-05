// Payload normalisation and validation. Pure: shared by the app and by Node scripts.
// See docs/data-format.md for the format description.

const VERSION_RE = /^(?:saas-)?\d+\.\d+$|^master$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const MODULE_RE = /^[A-Za-z0-9_]+$/;
const ACTIONS = new Set(['+', '-']);

/**
 * @typedef {{ '+'?: string[], '-'?: string[] }} RepoDiff
 * @typedef {Record<string, Record<string, RepoDiff>>} VersionsDiff
 * @typedef {{ schemaVersion: number, generatedAt?: string|null, pulledAt?: string|null, source?: string|null, branches?: object }} Meta
 * @typedef {{ meta: Meta, versions: VersionsDiff }} Payload
 */

/**
 * Accepts the v1 format (a bare `{ version: { repo: { '+': [], '-': [] } } }` object, as published in the gist)
 * and the v2 format (`{ meta, versions }`) and returns the v2 shape.
 * @param {unknown} raw
 * @returns {Payload}
 */
export function normalizePayload(raw) {
    if (!isPlainObject(raw)) throw new DataFormatError(['Payload is not a JSON object']);
    const isV2 = isPlainObject(raw.versions) && (raw.meta === undefined || isPlainObject(raw.meta));
    const versions = isV2 ? raw.versions : raw;
    const meta = isV2 && raw.meta ? { ...raw.meta } : {};
    const errors = validateVersions(versions);
    if (errors.length) throw new DataFormatError(errors);
    return { meta: { schemaVersion: isV2 ? 2 : 1, ...meta }, versions: /** @type {VersionsDiff} */ (versions) };
}

/**
 * @param {unknown} versions
 * @returns {string[]} human readable errors (max 20)
 */
export function validateVersions(versions) {
    const errors = [];
    const push = (msg) => errors.length < 20 && errors.push(msg);
    if (!isPlainObject(versions)) return ['`versions` is not an object'];
    const keys = Object.keys(versions);
    if (!keys.length) push('No version in payload');
    for (const version of keys) {
        if (!VERSION_RE.test(version)) push(`Invalid version key "${version}"`);
        const repos = versions[version];
        if (!isPlainObject(repos)) {
            push(`Version "${version}" is not an object`);
            continue;
        }
        for (const [repo, content] of Object.entries(repos)) {
            if (!REPO_RE.test(repo)) push(`Invalid repository "${repo}" in ${version}`);
            if (!isPlainObject(content)) {
                push(`Content of ${version}/${repo} is not an object`);
                continue;
            }
            for (const [action, modules] of Object.entries(content)) {
                if (!ACTIONS.has(action)) push(`Unknown action "${action}" in ${version}/${repo}`);
                if (!Array.isArray(modules)) {
                    push(`${version}/${repo}/${action} is not an array`);
                    continue;
                }
                for (const m of modules) {
                    if (typeof m !== 'string' || !MODULE_RE.test(m)) push(`Invalid module name ${JSON.stringify(m)}`);
                }
            }
        }
    }
    return errors;
}

export class DataFormatError extends Error {
    /** @param {string[]} errors */
    constructor(errors) {
        super(`Invalid module data: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}`);
        this.name = 'DataFormatError';
        this.errors = errors;
    }
}

function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
