import { describe, expect, it } from 'vitest';
import {
    isForbidden,
    isStandardBranch,
    mergeVersionDiffs,
    modulesFromTree,
    parseRepoInput,
    RepoInputError,
    toVersionDiff,
} from '../../src/domain/customRepo.js';
import { githubUrl } from '../../src/domain/links.js';
import { buildSnapshots, snapshotOf } from '../../src/domain/snapshots.js';
import { createCustomRepoStore, isOutdated, modulesByVersion } from '../../src/state/customRepos.js';

describe('parseRepoInput', () => {
    it.each([
        ['OCA/sale-workflow', 'OCA/sale-workflow'],
        ['  OCA/sale-workflow  ', 'OCA/sale-workflow'],
        ['https://github.com/OCA/sale-workflow', 'OCA/sale-workflow'],
        ['https://github.com/OCA/sale-workflow/', 'OCA/sale-workflow'],
        ['https://github.com/OCA/sale-workflow.git', 'OCA/sale-workflow'],
        ['https://github.com/OCA/sale-workflow/tree/17.0/sale_order_type', 'OCA/sale-workflow'],
        ['github.com/OCA/sale-workflow', 'OCA/sale-workflow'],
        ['www.github.com/acme/my.addons', 'acme/my.addons'],
    ])('accepts %s', (input, expected) => {
        expect(parseRepoInput(input)).toBe(expected);
    });

    it.each([
        ['', 'empty'],
        ['sale-workflow', 'shape'],
        ['https://gitlab.com/OCA/sale-workflow', 'host'],
        ['OCA/sale workflow', 'shape'],
        ['odoo/odoo', 'forbidden-odoo'],
        ['Odoo/design-themes', 'forbidden-odoo'],
        ['https://github.com/odoo/enterprise', 'forbidden-odoo'],
    ])('rejects %j (%s)', (input, kind) => {
        expect(() => parseRepoInput(input)).toThrow(RepoInputError);
        try {
            parseRepoInput(input);
        } catch (error) {
            expect(error.kind).toBe(kind);
        }
    });
});

describe('isForbidden', () => {
    it('refuses the odoo organisation and forks of its repositories', () => {
        expect(isForbidden({ owner: { login: 'odoo' } })).toBe(true);
        expect(isForbidden({ owner: { login: 'acme' }, fork: true, parent: { owner: { login: 'odoo' } } })).toBe(true);
        expect(isForbidden({ owner: { login: 'acme' }, fork: true, source: { owner: { login: 'Odoo' } } })).toBe(true);
        expect(isForbidden({ owner: { login: 'acme' }, fork: true, parent: { owner: { login: 'OCA' } } })).toBe(false);
        expect(isForbidden({ owner: { login: 'OCA' }, fork: false })).toBe(false);
    });
});

describe('isStandardBranch', () => {
    it('keeps Odoo version branches only', () => {
        for (const ok of ['17.0', 'saas-17.2', 'master', '8.0']) expect(isStandardBranch(ok)).toBe(true);
        for (const ko of ['17.0-dev', 'main', '17.1', 'saas-17', 'feature/x', '17.0.1']) {
            expect(isStandardBranch(ko)).toBe(false);
        }
    });
});

describe('modulesFromTree', () => {
    it('keeps top-level folders with a manifest', () => {
        const tree = {
            tree: [
                { path: 'sale_order_type/__manifest__.py', type: 'blob' },
                { path: 'old_module/__openerp__.py', type: 'blob' },
                { path: 'setup/sale_order_type/setup.py', type: 'blob' },
                { path: 'setup', type: 'tree' },
                { path: 'nested/inner/__manifest__.py', type: 'blob' },
                { path: '__manifest__.py', type: 'blob' },
                { path: 'bad-name/__manifest__.py', type: 'blob' },
                { path: 'sale_order_type/models/__init__.py', type: 'blob' },
            ],
        };
        expect(modulesFromTree(tree)).toEqual(['old_module', 'sale_order_type']);
        expect(modulesFromTree({})).toEqual([]);
    });
});

describe('toVersionDiff', () => {
    const known = ['14.0', 'saas-14.1', '15.0', '16.0', '17.0', 'master'];

    it('replays branches in order, drops unknown versions', () => {
        const diff = toVersionDiff('acme/addons', { '16.0': ['a', 'b'], '14.0': ['a'], '99.0': ['zzz'] }, known);
        expect(diff).toEqual({
            '14.0': { 'acme/addons': { '+': ['a'] } },
            '16.0': { 'acme/addons': { '+': ['b'] } },
        });
    });

    it('carries modules forward over versions without a branch', () => {
        const diff = toVersionDiff('acme/addons', { '14.0': ['a', 'b'], '17.0': ['b', 'c'] }, known);
        const model = buildSnapshots(mergeVersionDiffs({ 'saas-14.1': {}, '15.0': {}, '16.0': {} }, diff));
        expect([...snapshotOf(model, '15.0').get('acme/addons')]).toEqual(['a', 'b']);
        expect([...snapshotOf(model, '17.0').get('acme/addons')].sort()).toEqual(['b', 'c']);
        expect(diff['17.0']['acme/addons']).toEqual({ '+': ['c'], '-': ['a'] });
    });
});

describe('mergeVersionDiffs', () => {
    it('merges per version without mutating the inputs', () => {
        const base = { '17.0': { 'odoo/odoo': { '+': ['sale'] } } };
        const extra = { '17.0': { 'acme/addons': { '+': ['x'] } }, '18.0': { 'acme/addons': { '-': ['x'] } } };
        const merged = mergeVersionDiffs(base, extra);
        expect(Object.keys(merged['17.0'])).toEqual(['odoo/odoo', 'acme/addons']);
        expect(merged['18.0']).toEqual({ 'acme/addons': { '-': ['x'] } });
        expect(base).toEqual({ '17.0': { 'odoo/odoo': { '+': ['sale'] } } });
    });
});

describe('githubUrl for custom repositories', () => {
    it('links the latest branch at or before the version', () => {
        const branches = ['14.0', '16.0'];
        expect(githubUrl('acme/addons', '15.0', 'x', { branches })).toEqual({
            url: 'https://github.com/acme/addons/tree/14.0/x',
            branch: '14.0',
            private: false,
        });
        expect(githubUrl('acme/addons', '16.0', 'x', { branches })?.branch).toBe('16.0');
        expect(githubUrl('acme/addons', '13.0', 'x', { branches })).toBeNull();
        expect(githubUrl('acme/addons', '16.0', 'x')).toBeNull();
    });
});

describe('custom repository store', () => {
    const memory = () => {
        const map = new Map();
        return {
            map,
            get: (k) => map.get(k) ?? null,
            set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)),
        };
    };
    const repo = (id, fetchedAt = '2026-11-05T10:00:00Z') => ({
        id,
        fetchedAt,
        etags: {},
        pages: 1,
        ignored: 0,
        branches: { '17.0': { sha: 's1', modules: ['a'], truncated: false } },
    });

    it('saves, lists, replaces by case and removes', () => {
        const storage = memory();
        const store = createCustomRepoStore(storage);
        store.save(repo('acme/addons'));
        store.save(repo('OCA/sale-workflow'));
        expect(store.list()).toEqual(['acme/addons', 'OCA/sale-workflow']);
        expect(store.has('oca/SALE-workflow')).toBe(true);
        store.save(repo('Acme/Addons'));
        expect(store.list()).toEqual(['Acme/Addons', 'OCA/sale-workflow']);
        expect(storage.map.has('gm.repo:acme/addons')).toBe(false);
        store.remove('Acme/Addons');
        expect(store.list()).toEqual(['OCA/sale-workflow']);
        expect(storage.map.has('gm.repo:Acme/Addons')).toBe(false);
        expect(modulesByVersion(store.get('OCA/sale-workflow'))).toEqual({ '17.0': ['a'] });
    });

    it('drops corrupt entries and caps the list', () => {
        const storage = memory();
        storage.set('gm.repos', JSON.stringify(['acme/x', 42, 'not a repo']));
        storage.set('gm.repo:acme/x', JSON.stringify({ id: 'acme/x', branches: { '17.0': { modules: ['<b>'] } } }));
        const store = createCustomRepoStore(storage);
        expect(store.list()).toEqual(['acme/x']);
        expect(store.get('acme/x')).toBeNull();
        expect(storage.map.has('gm.repo:acme/x')).toBe(false);
        for (let i = 0; i < 7; i++) store.save(repo(`acme/r${i}`));
        expect(store.list()).toHaveLength(5);
        expect(store.isFull()).toBe(true);
    });

    it('flags copies older than a week as outdated', () => {
        const now = Date.parse('2026-11-12T12:00:00Z');
        expect(isOutdated(repo('a/b', '2026-11-06T12:00:00Z'), now)).toBe(false); // 6 days
        expect(isOutdated(repo('a/b', '2026-11-04T12:00:00Z'), now)).toBe(true); // 8 days
        expect(isOutdated({}, now)).toBe(true);
    });
});
