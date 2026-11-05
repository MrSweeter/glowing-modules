import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHistory } from '../../src/domain/history.js';
import { parseQuery } from '../../src/domain/search.js';
import { buildSnapshots } from '../../src/domain/snapshots.js';
import { buildView, changeCountsByVersion } from '../../src/state/view.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/diff-edge-cases.json', import.meta.url)));
const model = buildSnapshots(fixture);

describe('buildView', () => {
    it('hides test modules by default and counts them', () => {
        const v = buildView({ model, from: '16.0', to: '17.0', query: '', showTests: false });
        expect(v.hiddenTests).toBe(1);
        expect(v.added.groups.map((g) => g.repo)).toEqual(['odoo/industry']);
        expect(v.moved.items).toEqual([{ module: 'moved_mod', fromRepo: 'odoo/odoo', toRepo: 'odoo/enterprise' }]);
    });

    it('shows test modules when asked', () => {
        const v = buildView({ model, from: '16.0', to: '17.0', query: '', showTests: true });
        expect(v.hiddenTests).toBe(0);
        expect(v.added.groups.find((g) => g.repo === 'odoo/odoo').modules).toEqual(['test_lint']);
    });

    it('filters with the query but keeps totals', () => {
        const v = buildView({ model, from: '16.0', to: '18.0', query: 'ent_', showTests: false });
        expect(v.added.total).toBe(3);
        expect(v.added.visible).toBe(1);
        expect(v.added.groups.find((g) => g.repo === 'odoo/enterprise').modules).toEqual(['ent_18']);
        expect(v.moved.visible).toBe(0);
    });

    it('matches moved modules on either repository', () => {
        const v = buildView({ model, from: '16.0', to: '18.0', query: 'repository:enterprise', showTests: false });
        expect(v.moved.visible).toBe(1);
    });
});

describe('changeCountsByVersion', () => {
    it('counts matching modules that changed in each version', () => {
        const counts = changeCountsByVersion(buildHistory(fixture), parseQuery('osc'), false);
        expect(Object.fromEntries(counts)).toEqual({ '16.0': 1, 'saas-16.1': 1, 'saas-16.2': 1, '18.0': 1 });
        expect(changeCountsByVersion(buildHistory(fixture), parseQuery(''), false).size).toBe(0);
    });
});
