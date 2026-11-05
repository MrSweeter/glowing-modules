import { describe, expect, it, vi } from 'vitest';
import { sortVersions } from '../../src/domain/versions.js';
import { initialSelection, isLinked, normalize, setFrom, setTo } from '../../src/state/selection.js';
import { createStore } from '../../src/state/store.js';
import { readUrl, writeUrl } from '../../src/state/url.js';

const SORTED = sortVersions(['16.0', 'saas-16.1', 'saas-16.2', '17.0', 'saas-17.1', 'saas-17.2', '18.0', 'master']);

describe('selection', () => {
    it('starts at latest major vs previous major', () => {
        expect(initialSelection(SORTED)).toEqual({ from: '17.0', to: '18.0' });
    });

    it('normalises order and identical ends', () => {
        expect(normalize(SORTED, { from: '18.0', to: '16.0' })).toMatchObject({
            from: '16.0',
            to: '18.0',
        });
        expect(normalize(SORTED, { from: '18.0', to: '18.0' })).toMatchObject({ from: 'saas-17.2' });
    });

    it('keeps a linked "from" following "to"', () => {
        const sel = { from: 'saas-17.2', to: '18.0' };
        expect(isLinked(SORTED, sel)).toBe(true);
        expect(setTo(SORTED, sel, 'saas-16.2')).toMatchObject({ from: 'saas-16.1', to: 'saas-16.2' });
    });

    it('keeps an explicit "from" when "to" changes', () => {
        const sel = { from: '16.0', to: '18.0' };
        expect(setTo(SORTED, sel, 'master')).toMatchObject({ from: '16.0', to: 'master' });
        expect(setTo(SORTED, sel, '16.0')).toMatchObject({ from: undefined, to: '16.0' });
    });

    it('sets from', () => {
        const sel = { from: '17.0', to: '18.0' };
        expect(setFrom(SORTED, sel, 'master')).toMatchObject({ from: '18.0', to: 'master' });
        expect(setFrom(SORTED, sel, undefined)).toMatchObject({ from: undefined, to: '18.0' });
    });

    it('replaces unknown versions', () => {
        expect(normalize(SORTED, { from: 'nope', to: 'nope' })).toEqual({ from: '18.0', to: 'master' });
    });
});

describe('url', () => {
    const base = { from: '17.0', to: '18.0', query: '', showTests: false, module: null };

    it('omits defaults', () => {
        expect(writeUrl(base, SORTED)).toBe('');
    });

    it('round-trips a full state', () => {
        const state = {
            ...base,
            from: '16.0',
            to: 'master',
            query: 'account repository:enterprise',
            showTests: true,
            module: 'sale',
        };
        const search = writeUrl(state, SORTED);
        expect(search).toBe('?to=master&from=16.0&q=account+repository:enterprise&tests=1&m=sale');
        expect(readUrl(search, SORTED).patch).toEqual({ ...state });
    });

    it('omits a linked "from"', () => {
        expect(writeUrl({ ...base, from: 'saas-17.2', to: '18.0' }, SORTED)).toBe('?to=18.0');
        expect(readUrl('?to=18.0', SORTED).patch).toMatchObject({ from: 'saas-17.2', to: '18.0' });
        expect(readUrl('?to=18.0&lts=1', SORTED).patch).toMatchObject({ from: 'saas-17.2', to: '18.0' });
    });

    it('keeps unrelated params and drops legacy compare / lts', () => {
        expect(writeUrl(base, SORTED, '?compare&lts=1&utm_source=x')).toBe('?utm_source=x');
    });

    it('warns about unknown versions', () => {
        const { patch, warnings } = readUrl('?to=99.0&from=16.0', SORTED);
        expect(warnings).toEqual(['Version "99.0" does not exist.']);
        expect(patch).toMatchObject({ from: '16.0', to: '18.0' });
    });
});

describe('store', () => {
    it('notifies subscribers with next and previous state', () => {
        const store = createStore({ a: 1, b: 1 });
        const listener = vi.fn();
        const off = store.subscribe(listener);
        store.set({ a: 2 });
        store.set((s) => ({ b: s.a + 1 }));
        expect(store.get()).toEqual({ a: 2, b: 3 });
        expect(listener).toHaveBeenNthCalledWith(1, { a: 2, b: 1 }, { a: 1, b: 1 });
        off();
        store.set({ a: 5 });
        expect(listener).toHaveBeenCalledTimes(2);
    });
});
