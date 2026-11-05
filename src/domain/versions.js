// Odoo version helpers. Pure functions, no DOM.
//
// Odoo versions: major `X.0` releases, online `saas-X.Y` releases and `master`.

export const MASTER = 'master';

/**
 * Numeric sort key. Integer parts (not parseFloat) so a hypothetical `saas-17.10` sorts after `saas-17.9`.
 * @param {string} version
 * @returns {[number, number]}
 */
export function versionKey(version) {
    if (version === MASTER) return [Number.POSITIVE_INFINITY, 0];
    const [major, minor = '0'] = version.replace(/^saas-/, '').split('.');
    return [Number(major), Number(minor)];
}

/** Comparator for Array#sort: oldest first. */
export function compareVersions(a, b) {
    const [a1, a2] = versionKey(a);
    const [b1, b2] = versionKey(b);
    if (a1 !== b1) return a1 < b1 ? -1 : 1;
    return a2 - b2;
}

/** @param {Iterable<string>} versions */
export function sortVersions(versions) {
    return [...versions].sort(compareVersions);
}

/** Major release: `X.0`, neither saas nor master. */
export function isMajor(version) {
    return version !== MASTER && !version.startsWith('saas-');
}

export function isSaas(version) {
    return version.startsWith('saas-');
}

/**
 * The version right before `version` (undefined for the first one / unknown version).
 * @param {string[]} sorted
 * @param {string} version
 */
export function previousVersion(sorted, version) {
    const index = sorted.indexOf(version);
    return index > 0 ? sorted[index - 1] : undefined;
}

/** Latest major version, or the latest version when there is no major. */
export function latestMajor(sortedVersions) {
    return sortedVersions.filter(isMajor).at(-1) ?? sortedVersions.at(-1);
}

/**
 * Default comparison: latest major vs the previous major.
 * @param {string[]} sortedVersions
 * @returns {{ from: string|undefined, to: string|undefined }}
 */
export function defaultSelection(sortedVersions) {
    const majors = sortedVersions.filter(isMajor);
    if (majors.length >= 2) return { from: majors.at(-2), to: majors.at(-1) };
    const to = sortedVersions.at(-1);
    return { from: previousVersion(sortedVersions, to), to };
}

/**
 * Group versions by major for the picker: [{ major: '18.0', versions: ['18.0','saas-18.1',…] }], newest group first.
 * saas-X.Y belongs to the X.0 group; master gets its own group.
 * @param {string[]} sortedVersions
 */
export function groupByMajor(sortedVersions) {
    const groups = new Map();
    for (const v of sortedVersions) {
        const key = v === MASTER ? MASTER : `${versionKey(v)[0]}.0`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(v);
    }
    return [...groups.entries()].map(([major, versions]) => ({ major, versions })).reverse();
}
