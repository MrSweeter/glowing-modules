// URL ⇄ state. Pure functions.
//
//   ?from=17.0&to=18.0&q=account+repository:enterprise&tests=1&m=hr_payroll
// Defaults are omitted so the default view keeps a clean URL. Legacy `?compare` and `?lts` are accepted and dropped.

import { previousVersion } from '../domain/versions.js';
import { initialSelection } from './selection.js';

const OWN_PARAMS = ['from', 'to', 'q', 'lts', 'tests', 'm', 'compare'];

/**
 * @param {string} search location.search
 * @param {string[]} sorted all versions, sorted
 * @returns {{ patch: object, warnings: string[] }}
 */
export function readUrl(search, sorted) {
    const params = new URLSearchParams(search);
    const warnings = [];
    const patch = {};
    patch.showTests = params.get('tests') === '1';
    patch.query = params.get('q') ?? '';
    patch.module = params.get('m') || null;

    const check = (name) => {
        const value = params.get(name);
        if (value === null) return undefined;
        if (sorted.includes(value)) return value;
        warnings.push(`Version "${value}" does not exist.`);
        return undefined;
    };
    const from = check('from');
    const to = check('to');
    if (to) {
        patch.to = to;
        patch.from = from ?? previousVersion(sorted, to);
    } else if (from) {
        const def = initialSelection(sorted);
        patch.from = from;
        patch.to = def.to;
    }
    return { patch, warnings };
}

/**
 * @param {{ from?: string, to: string, query: string, showTests: boolean, module: string|null }} state
 * @param {string[]} sorted
 * @param {string} [currentSearch] keeps unrelated params (utm_*, data, …)
 * @returns {string} query string including `?`, or '' when everything is default
 */
export function writeUrl(state, sorted, currentSearch = '') {
    const params = new URLSearchParams(currentSearch);
    for (const p of OWN_PARAMS) params.delete(p);
    const def = initialSelection(sorted);
    const isDefault = state.from === def.from && state.to === def.to;
    if (!isDefault) {
        params.set('to', state.to);
        const linkedFrom = previousVersion(sorted, state.to);
        if (state.from !== linkedFrom && state.from) params.set('from', state.from);
    }
    if (state.query.trim()) params.set('q', state.query.trim());
    if (state.showTests) params.set('tests', '1');
    if (state.module) params.set('m', state.module);
    const str = params.toString().replace(/%3A/gi, ':').replace(/%2F/gi, '/');
    return str ? `?${str}` : '';
}
