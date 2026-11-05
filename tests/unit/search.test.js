import { describe, expect, it } from 'vitest';
import {
    cycleNameFilter,
    hasToken,
    matches,
    matchesModule,
    matchRanges,
    nameFilterState,
    parseQuery,
    removeFilterTokens,
    toggleToken,
} from '../../src/domain/search.js';

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

describe('removeFilterTokens', () => {
    it('drops repository, repo and owner tokens and keeps text terms in order', () => {
        expect(removeFilterTokens('sale repository:odoo stock Repo:enterprise owner:odoo')).toBe('sale stock');
        expect(removeFilterTokens('repository:odoo')).toBe('');
        expect(removeFilterTokens('')).toBe('');
        expect(removeFilterTokens('  account  ')).toBe('account');
    });
});

describe('module-name filters', () => {
    const names = ['l10n_be', 'pos_restaurant', 'website_sale', 'sale', 'l10n_be_pos'];
    const keep = (input) => names.filter((n) => matchesModule(parseQuery(input), n));

    it('parses name: and -name: terms', () => {
        const q = parseQuery('name:^pos_ -name:^l10n_ NAME:x');
        expect(q.name.map((t) => t.source)).toEqual(['^pos_', 'x']);
        expect(q.notName.map((t) => t.source)).toEqual(['^l10n_']);
        expect(q.text).toEqual([]);
        expect(q.active).toBe(true);
        expect(parseQuery('-repository:x').text.map((t) => t.source)).toEqual(['-repository:x']);
    });

    it('ORs name: terms, ANDs them with text terms and hides -name: matches', () => {
        expect(keep('name:^pos_ name:^website_')).toEqual(['pos_restaurant', 'website_sale']);
        expect(keep('name:^pos_ name:^website_ sale')).toEqual(['website_sale']);
        expect(keep('-name:^l10n_')).toEqual(['pos_restaurant', 'website_sale', 'sale']);
        expect(keep('name:pos -name:^l10n_')).toEqual(['pos_restaurant']);
        expect(keep('name:(')).toEqual([]);
        expect(parseQuery('name:(').errors).toHaveLength(1);
    });

    it('cycles a chip: off → include → exclude → off, keeping other tokens in order', () => {
        let q = 'acc repository:odoo';
        expect(nameFilterState(q, '^l10n_')).toBe('off');
        q = cycleNameFilter(q, '^l10n_');
        expect(q).toBe('acc repository:odoo name:^l10n_');
        expect(nameFilterState(q, '^l10n_')).toBe('include');
        q = cycleNameFilter(`${q} owner:odoo`, '^l10n_');
        expect(q).toBe('acc repository:odoo -name:^l10n_ owner:odoo');
        expect(nameFilterState(q, '^l10n_')).toBe('exclude');
        q = cycleNameFilter(q, '^l10n_');
        expect(q).toBe('acc repository:odoo owner:odoo');
        expect(nameFilterState(q, '^l10n_')).toBe('off');
    });

    it('are removed with the other filter tokens', () => {
        expect(removeFilterTokens('name:^pos_ acc -name:^l10n_ owner:odoo edi')).toBe('acc edi');
    });
});
