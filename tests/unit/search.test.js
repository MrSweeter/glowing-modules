import { describe, expect, it } from 'vitest';
import { hasToken, matches, matchRanges, parseQuery, toggleToken } from '../../src/domain/search.js';

describe('parseQuery', () => {
    it('parses text, repository and owner terms', () => {
        const q = parseQuery('  acc  repository:enterprise owner:odoo repo:design ');
        expect(q.text.map((t) => t.source)).toEqual(['acc']);
        expect(q.repository.map((t) => t.source)).toEqual(['enterprise', 'design']);
        expect(q.owner.map((t) => t.source)).toEqual(['odoo']);
        expect(q.active).toBe(true);
    });

    it('ignores short text terms but accepts short filters', () => {
        const q = parseQuery('ac repository:o');
        expect(q.text).toEqual([]);
        expect(q.ignored).toEqual(['ac']);
        expect(q.repository).toHaveLength(1);
    });

    it('falls back to literal text on invalid regex', () => {
        const q = parseQuery('l10n_(be');
        expect(q.errors).toHaveLength(1);
        expect(q.text[0].regex.test('l10n_(be_x')).toBe(true);
    });

    it('is inactive when empty', () => {
        expect(parseQuery('').active).toBe(false);
        expect(parseQuery('repository:').active).toBe(false);
    });
});

describe('matches', () => {
    it('ANDs text terms, ORs repository terms, case-insensitive', () => {
        const q = parseQuery('ACCOUNT edi repository:odoo repository:enterprise');
        expect(matches(q, 'odoo/odoo', 'account_edi_ubl')).toBe(true);
        expect(matches(q, 'odoo/enterprise', 'account_edi_x')).toBe(true);
        expect(matches(q, 'odoo/industry', 'account_edi_x')).toBe(false);
        expect(matches(q, 'odoo/odoo', 'account_peppol')).toBe(false);
    });

    it('supports regex', () => {
        const q = parseQuery('^l10n_(be|lu)_');
        expect(matches(q, 'odoo/odoo', 'l10n_be_pos')).toBe(true);
        expect(matches(q, 'odoo/odoo', 'l10n_fr_pos')).toBe(false);
    });

    it('filters owners', () => {
        const q = parseQuery('owner:oca');
        expect(matches(q, 'odoo/odoo', 'x')).toBe(false);
        expect(matches(q, 'oca/web', 'x')).toBe(true);
    });
});

describe('matchRanges', () => {
    it('merges overlapping ranges', () => {
        expect(matchRanges(parseQuery('account acc'), 'my_account')).toEqual([[3, 10]]);
        expect(matchRanges(parseQuery('sale stock'), 'sale_stock')).toEqual([
            [0, 4],
            [5, 10],
        ]);
    });
});

describe('toggleToken', () => {
    it('adds and removes a filter token without touching the rest', () => {
        expect(toggleToken('account', 'repository:odoo')).toBe('account repository:odoo');
        expect(toggleToken('account repository:odoo', 'repository:odoo')).toBe('account');
        expect(toggleToken('', 'repository:odoo')).toBe('repository:odoo');
        expect(hasToken('acc Repository:Odoo', 'repository:odoo')).toBe(true);
    });
});
