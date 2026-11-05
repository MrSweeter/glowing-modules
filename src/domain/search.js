// Search query parsing and matching. Pure functions.
//
// Syntax:
//   plain terms        case-insensitive regex on the module name, 3+ characters, all terms must match (AND)
//   repository:<re>    regex on the repository name (`odoo`, `enterprise`, …), 1+ character, alias `repo:`
//   owner:<re>         regex on the repository owner (`odoo`), 1+ character
// Several `repository:` (or `owner:`) terms are alternatives (OR). Invalid regexes fall back to literal text.

export const MIN_TEXT_LENGTH = 3;
const FILTER_RE = /^(repository|repo|owner):(.*)$/i;

/**
 * @typedef {{ source: string, regex: RegExp }} Term
 * @typedef {{ text: Term[], repository: Term[], owner: Term[], ignored: string[], errors: string[], active: boolean }} Query
 */

/**
 * @param {string} input
 * @returns {Query}
 */
export function parseQuery(input = '') {
    /** @type {Query} */
    const query = { text: [], repository: [], owner: [], ignored: [], errors: [], active: false };
    for (const token of tokenize(input)) {
        const filter = FILTER_RE.exec(token);
        if (filter) {
            const key = filter[1].toLowerCase() === 'owner' ? 'owner' : 'repository';
            if (filter[2]) query[key].push(compile(filter[2], query.errors));
            continue;
        }
        if (token.length < MIN_TEXT_LENGTH) {
            query.ignored.push(token);
            continue;
        }
        query.text.push(compile(token, query.errors));
    }
    query.active = query.text.length + query.repository.length + query.owner.length > 0;
    return query;
}

/** True when the module name matches every text term. */
export function matchesModule(query, name) {
    return query.text.every((t) => t.regex.test(name));
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

/** Remove every `repository:` / `repo:` / `owner:` token, keeping text terms in order. */
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
