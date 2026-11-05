import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { availability, buildHistory, isTestModule, versionsContaining } from '../../src/domain/history.js';
import { githubUrl } from '../../src/domain/links.js';
import { buildSnapshots } from '../../src/domain/snapshots.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/diff-edge-cases.json', import.meta.url)));
const model = buildSnapshots(fixture);

describe('history', () => {
    it('lists events chronologically from the full data', () => {
        const h = buildHistory(fixture);
        expect(h.get('osc')).toEqual([
            { version: '16.0', repo: 'odoo/odoo', action: '+' },
            { version: 'saas-16.1', repo: 'odoo/odoo', action: '-' },
            { version: 'saas-16.2', repo: 'odoo/odoo', action: '+' },
            { version: '18.0', repo: 'odoo/odoo', action: '-' },
        ]);
    });

    it('lists a removal before an addition within the same version (moves)', () => {
        const h = buildHistory(fixture).get('moved_mod');
        expect(h.map((e) => `${e.version}${e.action}${e.repo}`)).toEqual([
            '16.0+odoo/odoo',
            '17.0-odoo/odoo',
            '17.0+odoo/enterprise',
        ]);
    });
});

describe('availability', () => {
    it('merges consecutive versions into ranges', () => {
        expect(availability(model, 'osc')).toEqual([
            { repo: 'odoo/odoo', from: '16.0', to: '16.0' },
            { repo: 'odoo/odoo', from: 'saas-16.2', to: 'saas-17.1' },
        ]);
    });

    it('splits ranges when the repository changes', () => {
        expect(availability(model, 'moved_mod')).toEqual([
            { repo: 'odoo/odoo', from: '16.0', to: 'saas-16.2' },
            { repo: 'odoo/enterprise', from: '17.0', to: 'master' },
        ]);
        expect(versionsContaining(model, 'master_only')).toEqual(['master']);
    });
});

describe('isTestModule', () => {
    it.each([
        ['test_lint', true],
        ['account_test', true],
        ['web_tests', true],
        ['web_tests_demo', true],
        ['l10n_test_pos_qr_payment', true],
        ['tests', true],
        ['snippet_latest_posts', false],
        ['contest', false],
        ['account', false],
    ])('%s → %s', (name, expected) => {
        expect(isTestModule(name)).toBe(expected);
    });
});

describe('githubUrl', () => {
    it('builds odoo/odoo addons paths', () => {
        expect(githubUrl('odoo/odoo', '17.0', 'sale')).toEqual({
            url: 'https://github.com/odoo/odoo/tree/17.0/addons/sale',
            branch: '17.0',
            private: false,
        });
    });

    it('flags enterprise as private and uses root paths', () => {
        expect(githubUrl('odoo/enterprise', 'saas-17.2', 'sign')).toMatchObject({
            url: 'https://github.com/odoo/enterprise/tree/saas-17.2/sign',
            private: true,
        });
    });

    it('falls back to the major branch for missing design-themes saas branches', () => {
        expect(githubUrl('odoo/design-themes', 'saas-12.1', 'theme_x').branch).toBe('12.0');
        expect(githubUrl('odoo/design-themes', 'saas-12.3', 'theme_x').branch).toBe('saas-12.3');
        expect(githubUrl('odoo/design-themes', 'saas-15.2', 'theme_x').branch).toBe('saas-15.2');
    });

    it('returns null for non-odoo owners', () => {
        expect(githubUrl('oca/web', '17.0', 'x')).toBeNull();
    });
});
