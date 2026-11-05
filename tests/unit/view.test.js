import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHistory } from '../../src/domain/history.js';
import { parseQuery } from '../../src/domain/search.js';
import { buildSnapshots } from '../../src/domain/snapshots.js';
import { buildView, changeCountsByVersion } from '../../src/state/view.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/diff-edge-cases.json', import.meta.url)));
const model = buildSnapshots(fixture);

describe('buildView', () => {
    it('lists added, removed and moved modules, test modules included', () => {
        const v = buildView({ model, from: '16.0', to: '17.0', query: '' });
        expect(v.added.groups.find((g) => g.repo === 'odoo/odoo').modules).toEqual(['test_lint']);
        expect(v.moved.items).toEqual([{ module: 'moved_mod', fromRepo: 'odoo/odoo', toRepo: 'odoo/enterprise' }]);
    });

    it('hides test modules with the Tests name filter', () => {
        const v = buildView({ model, from: '16.0', to: '17.0', query: '-name:(^|_)tests?(_|$)' });
        expect(v.added.groups.flatMap((g) => g.modules)).not.toContain('test_lint');
        const only = buildView({ model, from: '16.0', to: '17.0', query: 'name:(^|_)tests?(_|$)' });
        expect(only.added.groups.flatMap((g) => g.modules)).toEqual(['test_lint']);
    });

    it('filters with the query but keeps totals', () => {
        const v = buildView({ model, from: '16.0', to: '18.0', query: 'ent_' });
        expect(v.added.total).toBe(4); // ind_mod, test_lint, new_in_saas, ent_18
        expect(v.added.visible).toBe(1);
        expect(v.added.groups.find((g) => g.repo === 'odoo/enterprise').modules).toEqual(['ent_18']);
        expect(v.moved.visible).toBe(0);
    });

    it('hides modules with -name: and counts only what is left', () => {
        const all = buildView({ model, from: '16.0', to: '18.0', query: '' });
        const v = buildView({ model, from: '16.0', to: '18.0', query: '-name:^ent_' });
        const names = (col) => col.groups.flatMap((g) => g.modules);
        expect(names(all.added)).toContain('ent_18');
        expect(names(v.added)).not.toContain('ent_18');
        expect(v.added.visible).toBe(all.added.visible - 1);
    });

    it('matches moved modules on either repository', () => {
        const v = buildView({ model, from: '16.0', to: '18.0', query: 'repository:enterprise' });
        expect(v.moved.visible).toBe(1);
    });
});

describe('changeCountsByVersion', () => {
    it('counts matching modules that changed in each version', () => {
        const counts = changeCountsByVersion(buildHistory(fixture), parseQuery('osc'));
        expect(Object.fromEntries(counts)).toEqual({ '16.0': 1, 'saas-16.1': 1, 'saas-16.2': 1, '18.0': 1 });
        expect(changeCountsByVersion(buildHistory(fixture), parseQuery('')).size).toBe(0);
    });
});
