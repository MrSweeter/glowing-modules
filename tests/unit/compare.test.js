import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compare, countEntries } from '../../src/domain/compare.js';
import { buildSnapshots, stats } from '../../src/domain/snapshots.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/diff-edge-cases.json', import.meta.url)));
const model = buildSnapshots(fixture);
const all = (record) => Object.values(record).flat();

describe('snapshots', () => {
    it('replays the chain', () => {
        const odoo17 = model.snapshots.get('17.0').get('odoo/odoo');
        expect([...odoo17].sort()).toEqual(['base', 'osc', 'remove_then_readd', 'test_lint']);
        expect(stats(model, '17.0')).toEqual({
            total: 7,
            perRepo: { 'odoo/odoo': 4, 'odoo/enterprise': 2, 'odoo/design-themes': 0, 'odoo/industry': 1 },
        });
    });
});

describe('compare', () => {
    it('ignores oscillations inside the range', () => {
        const r = compare(model, '16.0', '17.0');
        expect(all(r.added)).not.toContain('osc');
        expect(all(r.removed)).not.toContain('osc');
        expect(all(r.added)).not.toContain('remove_then_readd');
        expect(all(r.removed)).not.toContain('add_then_remove');
        expect(all(r.added)).not.toContain('add_then_remove');
        expect(r.added['odoo/odoo']).toEqual(['test_lint']);
        expect(r.added['odoo/industry']).toEqual(['ind_mod']);
    });

    it('is order independent', () => {
        expect(compare(model, '17.0', '16.0')).toEqual(compare(model, '16.0', '17.0'));
    });

    it('returns empty lists for the same version', () => {
        const r = compare(model, '17.0', '17.0');
        expect(countEntries(r.added) + countEntries(r.removed)).toBe(0);
    });

    it('compares the first version against nothing', () => {
        const r = compare(model, undefined, '16.0');
        expect(r.added['odoo/odoo']).toEqual(['base', 'moved_mod', 'osc', 'remove_then_readd']);
        expect(countEntries(r.removed)).toBe(0);
    });

    it('reports repository moves as add + remove by default', () => {
        const r = compare(model, '16.0', '17.0');
        expect(r.added['odoo/enterprise']).toContain('moved_mod');
        expect(r.removed['odoo/odoo']).toContain('moved_mod');
        expect(r.moved).toEqual([]);
    });

    it('extracts moves when asked', () => {
        const r = compare(model, '16.0', '17.0', { detectMoves: true });
        expect(r.moved).toEqual([{ module: 'moved_mod', fromRepo: 'odoo/odoo', toRepo: 'odoo/enterprise' }]);
        expect(all(r.added)).not.toContain('moved_mod');
        expect(all(r.removed)).not.toContain('moved_mod');
    });

    it('handles empty repository entries', () => {
        const r = compare(model, '16.0', '18.0');
        expect(r.added['odoo/design-themes']).toEqual([]);
    });
});

// Reference: the pre-2.0 algorithm, only correct for adjacent versions. Used to prove the single-version
// view is unchanged by the fix.
function legacyAdjacent(diff, version) {
    const added = {};
    const removed = {};
    for (const [repo, content] of Object.entries(diff[version])) {
        added[repo] = [...(content['+'] ?? [])].filter((m) => !(content['-'] ?? []).includes(m)).sort();
        removed[repo] = [...(content['-'] ?? [])].filter((m) => !(content['+'] ?? []).includes(m)).sort();
    }
    return { added, removed };
}

const DATA_URL = new URL('../../public/data/glowing-modules-diff.json', import.meta.url);
let real = null;
try {
    real = JSON.parse(readFileSync(DATA_URL)).versions;
} catch {
    // data snapshot not pulled: `npm run data:pull`
}

describe.skipIf(!real)('real data (public/data snapshot)', () => {
    const realModel = real && buildSnapshots(real);

    it('keeps the single-version view identical to the legacy algorithm', () => {
        for (let i = 1; i < realModel.versions.length; i++) {
            const from = realModel.versions[i - 1];
            const to = realModel.versions[i];
            const r = compare(realModel, from, to);
            const legacy = legacyAdjacent(real, to);
            for (const repo of Object.keys(legacy.added)) {
                expect(r.added[repo], `${to} ${repo} added`).toEqual(legacy.added[repo]);
                expect(r.removed[repo], `${to} ${repo} removed`).toEqual(legacy.removed[repo]);
            }
        }
    });

    // Baseline from the live gist on 2026-11-04. Re-baseline when stable branches change.
    it.each([
        ['17.0', '18.0', 227, 76],
        ['16.0', '18.0', 542, 124],
        ['12.0', '19.0', 1226, 175],
        ['saas-19.4', '20.0', 101, 46],
    ])('%s → %s = +%i / −%i', (from, to, plus, minus) => {
        const r = compare(realModel, from, to);
        expect(countEntries(r.added)).toBe(plus);
        expect(countEntries(r.removed)).toBe(minus);
    });

    it('no longer reports oscillating modules (17.0 → 18.0)', () => {
        const r = compare(realModel, '17.0', '18.0');
        expect(all(r.added)).not.toContain('hr_recruitment_sms');
        expect(all(r.removed)).not.toContain('web_tour_recorder');
    });
});
