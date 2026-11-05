import { describe, expect, it } from 'vitest';
import { fetchRepository, GitHubError } from '../../src/data/github.js';

const API = 'https://api.github.com';
const NOW = new Date('2026-11-05T12:00:00Z');

/** Fake fetch: routes `path` (without the API prefix) to a handler returning { status, body, headers }. */
function fakeFetch(routes) {
    const calls = [];
    const impl = async (url, init) => {
        const path = url.replace(API, '');
        calls.push({ path, headers: init?.headers ?? {} });
        const route = Object.entries(routes).find(([p]) => p === path);
        const result = route ? route[1](init) : { status: 404, body: { message: 'Not Found' } };
        const headers = new Headers({
            'x-ratelimit-remaining': '50',
            'x-ratelimit-reset': '1793880000',
            ...result.headers,
        });
        return new Response(result.status === 304 ? null : JSON.stringify(result.body ?? {}), {
            status: result.status ?? 200,
            headers,
        });
    };
    return { impl, calls };
}

const repoMeta = (extra = {}) => ({
    full_name: 'acme/addons',
    owner: { login: 'acme' },
    private: false,
    visibility: 'public',
    fork: false,
    ...extra,
});
const tree = (...modules) => ({ tree: modules.map((m) => ({ path: `${m}/__manifest__.py`, type: 'blob' })) });

const basicRoutes = (overrides = {}) => ({
    '/repos/acme/addons': () => ({ body: repoMeta(), headers: { etag: '"r1"' } }),
    '/repos/acme/addons/branches?per_page=100': () => ({
        body: [
            { name: '16.0', commit: { sha: 'a16' } },
            { name: '17.0', commit: { sha: 'a17' } },
            { name: 'master', commit: { sha: 'am' } },
            { name: '17.0-fix-bug', commit: { sha: 'x' } },
            { name: '99.0', commit: { sha: 'y' } },
        ],
        headers: { etag: '"b1"' },
    }),
    '/repos/acme/addons/git/trees/a16?recursive=1': () => ({ body: tree('a', 'b') }),
    '/repos/acme/addons/git/trees/a17?recursive=1': () => ({ body: tree('b', 'c') }),
    '/repos/acme/addons/git/trees/am?recursive=1': () => ({ body: { ...tree('c'), truncated: true } }),
    ...overrides,
});
const KNOWN = ['16.0', '17.0', 'master'];

describe('fetchRepository', () => {
    it('reads version branches and their modules', async () => {
        const { impl, calls } = fakeFetch(basicRoutes());
        const data = await fetchRepository('acme/addons', { fetchImpl: impl, knownVersions: KNOWN, now: NOW });
        expect(data).toEqual({
            id: 'acme/addons',
            fetchedAt: '2026-11-05T12:00:00.000Z',
            etags: { repo: '"r1"', branches: '"b1"' },
            pages: 1,
            ignored: 2,
            branches: {
                '16.0': { sha: 'a16', modules: ['a', 'b'], truncated: false },
                '17.0': { sha: 'a17', modules: ['b', 'c'], truncated: false },
                master: { sha: 'am', modules: ['c'], truncated: true },
            },
        });
        expect(calls).toHaveLength(5);
    });

    it('reuses cached trees after a 304 on branches, and only refetches moved branches', async () => {
        const first = fakeFetch(basicRoutes());
        const cached = await fetchRepository('acme/addons', { fetchImpl: first.impl, knownVersions: KNOWN, now: NOW });

        const unchanged = fakeFetch(
            basicRoutes({
                '/repos/acme/addons/branches?per_page=100': (init) => {
                    expect(init.headers['If-None-Match']).toBe('"b1"');
                    return { status: 304 };
                },
            })
        );
        const again = await fetchRepository('acme/addons', { cached, fetchImpl: unchanged.impl, knownVersions: KNOWN });
        expect(again.branches).toEqual(cached.branches);
        expect(unchanged.calls.map((c) => c.path)).toEqual([
            '/repos/acme/addons',
            '/repos/acme/addons/branches?per_page=100',
        ]);

        const moved = fakeFetch(
            basicRoutes({
                '/repos/acme/addons/branches?per_page=100': () => ({
                    body: [
                        { name: '16.0', commit: { sha: 'a16' } },
                        { name: '17.0', commit: { sha: 'a17b' } },
                        { name: 'master', commit: { sha: 'am' } },
                    ],
                }),
                '/repos/acme/addons/git/trees/a17b?recursive=1': () => ({ body: tree('b', 'c', 'd') }),
            })
        );
        const updated = await fetchRepository('acme/addons', { cached, fetchImpl: moved.impl, knownVersions: KNOWN });
        expect(updated.branches['17.0']).toEqual({ sha: 'a17b', modules: ['b', 'c', 'd'], truncated: false });
        expect(moved.calls.filter((c) => c.path.includes('/git/trees/'))).toHaveLength(1);
    });

    it('follows pagination', async () => {
        const { impl } = fakeFetch(
            basicRoutes({
                '/repos/acme/addons/branches?per_page=100': () => ({
                    body: [{ name: '16.0', commit: { sha: 'a16' } }],
                    headers: { link: `<${API}/repositories/1/branches?per_page=100&page=2>; rel="next"` },
                }),
                '/repositories/1/branches?per_page=100&page=2': () => ({
                    body: [{ name: '17.0', commit: { sha: 'a17' } }],
                }),
            })
        );
        const data = await fetchRepository('acme/addons', { fetchImpl: impl, knownVersions: KNOWN });
        expect(Object.keys(data.branches)).toEqual(['16.0', '17.0']);
        expect(data.pages).toBe(2);
    });

    const failure = async (routes, kind) => {
        const { impl } = fakeFetch(routes);
        const promise = fetchRepository('acme/addons', { fetchImpl: impl, knownVersions: KNOWN });
        await expect(promise).rejects.toBeInstanceOf(GitHubError);
        await expect(promise).rejects.toMatchObject({ kind });
        return promise.catch((e) => e);
    };

    it('reports missing or non-public repositories', async () => {
        const error = await failure({}, 'not-found');
        expect(error.message).toContain('not found on GitHub, or it is not public');
        await failure(basicRoutes({ '/repos/acme/addons': () => ({ body: repoMeta({ private: true }) }) }), 'private');
    });

    it('refuses forks of Odoo repositories', async () => {
        const fork = repoMeta({
            fork: true,
            parent: { owner: { login: 'odoo' } },
            source: { owner: { login: 'odoo' } },
        });
        await failure(basicRoutes({ '/repos/acme/addons': () => ({ body: fork }) }), 'forbidden-odoo');
    });

    it('reports repositories without version branches or modules', async () => {
        await failure(
            basicRoutes({
                '/repos/acme/addons/branches?per_page=100': () => ({ body: [{ name: 'main', commit: { sha: 'm' } }] }),
            }),
            'no-branches'
        );
        await failure(
            basicRoutes({
                '/repos/acme/addons/git/trees/a16?recursive=1': () => ({ body: tree() }),
                '/repos/acme/addons/git/trees/a17?recursive=1': () => ({ body: tree() }),
                '/repos/acme/addons/git/trees/am?recursive=1': () => ({ body: tree() }),
            }),
            'no-modules'
        );
    });

    it('stops on the rate limit, before spending requests it does not have', async () => {
        const limited = await failure(
            basicRoutes({
                '/repos/acme/addons': () => ({ status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
            }),
            'rate-limit'
        );
        expect(limited.resetAt).toBeInstanceOf(Date);
        expect(limited.message).toMatch(/Try again after \d\d:\d\d/);

        const { impl, calls } = fakeFetch(
            basicRoutes({
                '/repos/acme/addons/branches?per_page=100': () => ({
                    body: [
                        { name: '16.0', commit: { sha: 'a16' } },
                        { name: '17.0', commit: { sha: 'a17' } },
                    ],
                    headers: { 'x-ratelimit-remaining': '1' },
                }),
            })
        );
        await expect(fetchRepository('acme/addons', { fetchImpl: impl, knownVersions: KNOWN })).rejects.toMatchObject({
            kind: 'rate-limit',
        });
        expect(calls.filter((c) => c.path.includes('/git/trees/'))).toHaveLength(0);
    });

    it('reports network errors', async () => {
        const impl = async () => {
            throw new TypeError('Failed to fetch');
        };
        await expect(fetchRepository('acme/addons', { fetchImpl: impl })).rejects.toMatchObject({ kind: 'network' });
    });
});
