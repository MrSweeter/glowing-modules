// Version selection rules (from/to). Pure functions over the sorted version list.

import { compareVersions, defaultSelection, previousVersion } from '../domain/versions.js';

/**
 * @typedef {{ from: string|undefined, to: string }} Selection
 */

/** Initial selection (latest major vs previous major). */
export function initialSelection(sorted) {
    return normalize(sorted, defaultSelection(sorted));
}

/**
 * Make a selection valid: known versions, `from` strictly older than `to` (swapped if needed).
 * @param {string[]} sorted
 * @param {Partial<Selection>} sel
 * @returns {Selection}
 */
export function normalize(sorted, sel) {
    let to = sorted.includes(sel.to) ? sel.to : sorted.at(-1);
    let from = sel.from === undefined || sorted.includes(sel.from) ? sel.from : previousVersion(sorted, to);
    if (from && compareVersions(from, to) > 0) [from, to] = [to, from];
    if (from === to) from = previousVersion(sorted, to);
    return { from, to };
}

/** `from` is "linked" when it is the version right before `to`; it then follows `to` when `to` changes. */
export function isLinked(sorted, sel) {
    return sel.from === previousVersion(sorted, sel.to);
}

export function setTo(sorted, sel, to) {
    const from = isLinked(sorted, sel) ? previousVersion(sorted, to) : sel.from;
    if (from && compareVersions(from, to) >= 0) return normalize(sorted, { from: previousVersion(sorted, to), to });
    return normalize(sorted, { from, to });
}

export function setFrom(sorted, sel, from) {
    return normalize(sorted, { ...sel, from });
}
