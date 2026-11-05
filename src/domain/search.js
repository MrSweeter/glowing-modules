// Search query parsing and matching. Pure functions.
//
// Syntax:
//   plain terms        case-insensitive regex on the module name, 3+ characters, all terms must match (AND)
//   repository:<re>    regex on the repository name (`odoo`, `enterprise`, …), 1+ character, alias `repo:`
//   owner:<re>         regex on the repository owner (`odoo`), 1+ character
//   name:<re>          regex on the module name, 1+ character (e.g. `name:^pos_`)
//   -name:<re>         hide modules whose name matches (e.g. `-name:^l10n_`)
// Several `repository:`, `owner:` or `name:` terms are alternatives (OR); text terms must all match (AND).
// Invalid regexes fall back to literal text.

export const MIN_TEXT_LENGTH = 3;
const FILTER_RE = /^(?:repository|repo|owner|-?name):/i;
const FILTER_KEYS = { repository: 'repository', repo: 'repository', owner: 'owner', name: 'name', '-name': 'notName' };

/**
 * @typedef {{ source: string, regex: RegExp }} Term
 * @typedef {{ text: Term[], repository: Term[], owner: Term[], name: Term[], notName: Term[], ignored: string[],
 *   errors: string[], active: boolean }} Query
 */

/**
 * @param {string} input
 * @returns {Query}
 */
export function parseQuery(input = '') {
    /** @type {Query} */
    const query = {
        text: [],
        repository: [],
        owner: [],
        name: [],
        notName: [],
        ignored: [],
        errors: [],
        active: false,
    };
    for (const token of tokenize(input)) {
        if (FILTER_RE.test(token)) {
            const at = token.indexOf(':');
            const key = FILTER_KEYS[token.slice(0, at).toLowerCase()];
            const source = token.slice(at + 1);
            if (source) query[key].push(compile(source, query.errors));
            continue;
        }
        if (token.length < MIN_TEXT_LENGTH) {
            query.ignored.push(token);
            continue;
        }
        query.text.push(compile(token, query.errors));
    }
    query.active =
        query.text.length + query.repository.length + query.owner.length + query.name.length + query.notName.length > 0;
    return query;
}

/** True when the module name matches every text term, one `name:` term (if any) and no `-name:` term. */
export function matchesModule(query, name) {
    return (
        query.text.every((t) => t.regex.test(name)) &&
        (!query.name.length || query.name.some((t) => t.regex.test(name))) &&
        !query.notName.some((t) => t.regex.test(name))
    );
}

/** True when `owner/repo` passes the owner and repository filters. */
export function matchesRepository(query, fullRepo) {
    const [owner, repo = ''] = fullRepo.split('/');
    const okOwner = !query.owner.length || query.owner.some((t) => t.regex.test(owner));
    const okRepo = !query.repository.length || query.repository.some((t) => t.regex.test(repo));
    return okOwner && okRepo;
}

/** Combined predicate. */
export function matches(query, fullRepo, name) {
    return matchesRepository(query, fullRepo) && matchesModule(query, name);
}

/**
 * Character ranges of `name` matched by text terms, merged, for <mark> highlighting.
 * @returns {[number, number][]}
 */
export function matchRanges(query, name) {
    const ranges = [];
    for (const { regex } of query.text) {
        const m = regex.exec(name);
        if (m?.[0].length) ranges.push([m.index, m.index + m[0].length]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of ranges) {
        const last = merged.at(-1);
        if (last !== undefined && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
        else merged.push([...r]);
    }
    return merged;
}

/** Whether `input` contains `token` as a whole token (case-insensitive). */
export function hasToken(input, token) {
    return tokenize(input).some((t) => t.toLowerCase() === token.toLowerCase());
}

/** Add `token` to `input` if missing, remove it if present. Other tokens are kept in order. */
export function toggleToken(input, token) {
    const tokens = tokenize(input);
    const lower = token.toLowerCase();
    const kept = tokens.filter((t) => t.toLowerCase() !== lower);
    if (kept.length === tokens.length) kept.push(token);
    return kept.join(' ');
}

/**
 * State of a module-name filter chip: `name:<source>` → include, `-name:<source>` → exclude.
 * @returns {'include'|'exclude'|'off'}
 */
export function nameFilterState(input, source) {
    if (hasToken(input, `name:${source}`)) return 'include';
    if (hasToken(input, `-name:${source}`)) return 'exclude';
    return 'off';
}

/** Next state of a module-name filter chip: off → include (appended) → exclude (in place) → off. */
export function cycleNameFilter(input, source) {
    const include = `name:${source}`.toLowerCase();
    const exclude = `-name:${source}`.toLowerCase();
    const tokens = tokenize(input);
    const state = nameFilterState(input, source);
    if (state === 'off') return [...tokens, `name:${source}`].join(' ');
    if (state === 'include') return tokens.map((t) => (t.toLowerCase() === include ? `-name:${source}` : t)).join(' ');
    return tokens.filter((t) => t.toLowerCase() !== exclude).join(' ');
}

/** Remove every filter token (`repository:` / `repo:` / `owner:` / `name:` / `-name:`), keeping text terms in order. */
export function removeFilterTokens(input) {
    return tokenize(input)
        .filter((t) => !FILTER_RE.test(t))
        .join(' ');
}

function tokenize(input) {
    return input.trim().split(/\s+/).filter(Boolean);
}

function compile(source, errors) {
    try {
        return { source, regex: new RegExp(source, 'i') };
    } catch {
        errors.push(`"${source}" is not a valid regular expression; searching it as plain text.`);
        return { source, regex: new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };
    }
}
