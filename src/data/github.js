// Read a public repository from the GitHub REST API (anonymous: 60 requests per hour per IP).
//
// Requests for one repository: the repository (fork / visibility checks), its branches (paginated), and one
// git tree per Odoo version branch whose head moved since the cached copy. Conditional requests (ETag) answered
// with 304 do not count against the rate limit.

import { FETCH_TIMEOUT_MS, GITHUB_API } from '../config.js';
import { isForbidden, isStandardBranch, modulesFromTree } from '../domain/customRepo.js';

const MAX_BRANCH_PAGES = 3;
const TREE_CONCURRENCY = 4;

/**
 * @typedef {{ sha: string, modules: string[], truncated: boolean }} BranchData
 * @typedef {{ id: string, fetchedAt: string, etags: { repo?: string|null, branches?: string|null }, pages: number,
 *   ignored: number, branches: Record<string, BranchData> }} RepoData
 */

export class GitHubError extends Error {
    /**
     * @param {'not-found'|'private'|'forbidden-odoo'|'no-branches'|'no-modules'|'rate-limit'|'network'} kind
     * @param {string} message
     * @param {{ resetAt?: Date|null }} [extra]
     */
    constructor(kind, message, { resetAt = null } = {}) {
        super(message);
        this.name = 'GitHubError';
        this.kind = kind;
        this.resetAt = resetAt;
    }
}

/**
 * @param {string} id `owner/repo` (see parseRepoInput)
 * @param {{ cached?: RepoData|null, knownVersions?: Iterable<string>, fetchImpl?: typeof fetch, timeoutMs?: number, now?: Date }} [options]
 * @returns {Promise<RepoData>}
 */
export async function fetchRepository(
    id,
    { cached = null, knownVersions = null, fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS, now = new Date() } = {}
) {
    const known = knownVersions ? new Set(knownVersions) : null;
    let remaining = Number.POSITIVE_INFINITY;
    let resetAt = null;

    async function request(path, etag = null) {
        const headers = { Accept: 'application/vnd.github+json' };
        if (etag) headers['If-None-Match'] = etag;
        let response;
        try {
            response = await fetchImpl(`${GITHUB_API}${path}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
        } catch (error) {
            throw new GitHubError('network', `GitHub did not answer (${error?.message ?? 'network error'}).`);
        }
        const left = response.headers.get('x-ratelimit-remaining');
        const reset = response.headers.get('x-ratelimit-reset');
        if (left !== null) remaining = Number(left);
        if (reset !== null) resetAt = new Date(Number(reset) * 1000);
        if (response.status === 304) return { notModified: true, response };
        if (response.status === 404) {
            throw new GitHubError('not-found', `${id} was not found on GitHub, or it is not public.`);
        }
        if (response.status === 429 || (response.status === 403 && remaining === 0)) throw rateLimitError(resetAt);
        if (!response.ok) throw new GitHubError('network', `GitHub answered HTTP ${response.status} for ${id}.`);
        return { data: await response.json(), response };
    }

    // 1. Repository: visibility, fork of an Odoo repository, canonical name.
    const repo = await request(`/repos/${id}`);
    const meta = repo.data;
    const fullName = meta.full_name ?? id;
    if (meta.private || (meta.visibility && meta.visibility !== 'public')) {
        throw new GitHubError('private', `${fullName} is private. Only public repositories can be added.`);
    }
    if (isForbidden(meta)) {
        throw new GitHubError(
            'forbidden-odoo',
            `${fullName} is an Odoo repository (or a fork of one), which is already included.`
        );
    }

    // 2. Branches (first page conditional: a 304 reuses the cached branch heads).
    let heads = null;
    let ignored = 0;
    let pages = 1;
    const first = await request(
        `/repos/${fullName}/branches?per_page=100`,
        cached?.pages === 1 ? cached.etags?.branches : null
    );
    const branchesEtag = first.response.headers.get('etag');
    if (first.notModified && cached) {
        heads = Object.entries(cached.branches).map(([name, b]) => ({ name, sha: b.sha }));
        ignored = cached.ignored ?? 0;
    } else {
        const all = [...first.data];
        let next = nextLink(first.response);
        while (next && pages < MAX_BRANCH_PAGES) {
            const page = await request(next.replace(GITHUB_API, ''));
            all.push(...page.data);
            next = nextLink(page.response);
            pages++;
        }
        const kept = all.filter((b) => isStandardBranch(b.name) && (!known || known.has(b.name)));
        heads = kept.map((b) => ({ name: b.name, sha: b.commit?.sha }));
        ignored = all.length - kept.length;
    }
    if (!heads.length) {
        throw new GitHubError(
            'no-branches',
            `${fullName} has no branch named like an Odoo version (for example 17.0, saas-17.2 or master).`
        );
    }

    // 3. Trees of the branches that moved.
    const stale = heads.filter((h) => cached?.branches?.[h.name]?.sha !== h.sha);
    if (stale.length > remaining) throw rateLimitError(resetAt, stale.length, remaining);

    const branches = {};
    for (const h of heads) if (!stale.includes(h)) branches[h.name] = cached.branches[h.name];
    for (let i = 0; i < stale.length; i += TREE_CONCURRENCY) {
        await Promise.all(
            stale.slice(i, i + TREE_CONCURRENCY).map(async (h) => {
                const { data } = await request(`/repos/${fullName}/git/trees/${h.sha}?recursive=1`);
                branches[h.name] = { sha: h.sha, modules: modulesFromTree(data), truncated: Boolean(data.truncated) };
            })
        );
    }
    if (!Object.values(branches).some((b) => b.modules.length)) {
        throw new GitHubError(
            'no-modules',
            `No module (a folder with __manifest__.py) was found in the version branches of ${fullName}.`
        );
    }

    return {
        id: fullName,
        fetchedAt: now.toISOString(),
        etags: { repo: repo.response.headers.get('etag'), branches: branchesEtag ?? cached?.etags?.branches ?? null },
        pages,
        ignored,
        branches,
    };
}

function rateLimitError(resetAt, needed = null, remaining = null) {
    const when = resetAt
        ? ` Try again after ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(resetAt)}.`
        : ' Try again later.';
    const detail = needed !== null ? ` (${needed} requests needed, ${remaining} left)` : '';
    return new GitHubError('rate-limit', `GitHub's limit for anonymous requests is reached${detail}.${when}`, {
        resetAt,
    });
}

function nextLink(response) {
    const link = response.headers.get('link');
    return link ? (/<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null) : null;
}
