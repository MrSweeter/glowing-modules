import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportFileName, toCsv, toJson, toMarkdown, toNames } from '../../src/domain/export.js';
import { buildHistory } from '../../src/domain/history.js';
import { parseQuery } from '../../src/domain/search.js';
import { buildSnapshots } from '../../src/domain/snapshots.js';
import { buildView, changeCountsByVersion, exportRows } from '../../src/state/view.js';

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

describe('exports', () => {
    const view = buildView({ model, from: '16.0', to: '18.0', query: '', showTests: false });
    const rows = exportRows(view);

    it('lists visible rows', () => {
        expect(rows).toContainEqual({
            change: 'moved',
            repository: 'odoo/enterprise',
            module: 'moved_mod',
            from_repository: 'odoo/odoo',
        });
        expect(rows).toContainEqual({ change: 'removed', repository: 'odoo/odoo', module: 'osc', from_repository: '' });
    });

    it('formats names, CSV, Markdown and JSON', () => {
        expect(toNames(rows).split('\n')).toContain('ent_18');
        expect(toCsv([{ change: 'added', repository: 'odoo/odoo', module: 'a,b' }])).toBe(
            'change,repository,module,from_repository\r\nadded,odoo/odoo,"a,b",'
        );
        expect(toMarkdown([{ change: 'added', repository: 'x|y', module: 'm' }]).split('\n')[2]).toBe(
            '| added | x\\|y | m |  |'
        );
        expect(JSON.parse(toJson(rows, { from: '16.0', to: '18.0' })).modules).toHaveLength(rows.length);
        expect(exportFileName('saas-17.1', 'master', 'csv')).toBe('glowing-modules_saas-17.1_master.csv');
        expect(exportFileName(undefined, '5.0', 'json')).toBe('glowing-modules_start_5.0.json');
    });
});

describe('changeCountsByVersion', () => {
    it('counts matching modules that changed in each version', () => {
        const counts = changeCountsByVersion(buildHistory(fixture), parseQuery('osc'), false);
        expect(Object.fromEntries(counts)).toEqual({ '16.0': 1, 'saas-16.1': 1, 'saas-16.2': 1, '18.0': 1 });
        expect(changeCountsByVersion(buildHistory(fixture), parseQuery(''), false).size).toBe(0);
    });
});
