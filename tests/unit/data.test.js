import { describe, expect, it, vi } from 'vitest';
import { REMOTE_DATA_URL } from '../../src/config.js';
import { fetchPayload, loadData, resolveSource } from '../../src/data/source.js';
import { DataFormatError, normalizePayload, validateVersions } from '../../src/data/validate.js';

const V1 = { '17.0': { 'odoo/odoo': { '+': ['base'] } }, '18.0': { 'odoo/odoo': { '-': ['base'] } } };

describe('normalizePayload', () => {
    it('accepts v1 (bare object)', () => {
        const p = normalizePayload(V1);
        expect(p.meta.schemaVersion).toBe(1);
        expect(p.versions).toBe(V1);
    });

    it('accepts v2 (meta + versions)', () => {
        const p = normalizePayload({ meta: { generatedAt: '2026-11-03T00:00:00Z' }, versions: V1 });
        expect(p.meta).toEqual({ schemaVersion: 2, generatedAt: '2026-11-03T00:00:00Z' });
    });

    it.each([
        [null, /not a JSON object/],
        [[], /not a JSON object/],
        [{}, /No version/],
        [{ banana: {} }, /Invalid version key/],
        [{ '17.0': { odoo: {} } }, /Invalid repository/],
        [{ '17.0': { 'odoo/odoo': { '*': [] } } }, /Unknown action/],
        [{ '17.0': { 'odoo/odoo': { '+': 'base' } } }, /not an array/],
        [{ '17.0': { 'odoo/odoo': { '+': ['<img src=x>'] } } }, /Invalid module name/],
    ])('rejects %j', (input, message) => {
        expect(() => normalizePayload(input)).toThrow(message);
    });

    it('caps the number of errors', () => {
        const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`x${i}`, {}]));
        expect(validateVersions(many)).toHaveLength(20);
    });
});

describe('resolveSource', () => {
    const baseUrl = '/glowing-modules/';
    it('uses remote + local fallback in production, ignoring ?data', () => {
        expect(resolveSource({ dev: false, search: '?data=evil', baseUrl })).toEqual({
            primary: REMOTE_DATA_URL,
            fallback: '/glowing-modules/data/glowing-modules-diff.json',
            label: 'remote',
        });
    });

    it('uses local data in dev, overridable by env and query', () => {
        expect(resolveSource({ dev: true, baseUrl }).primary).toBe('/glowing-modules/data/glowing-modules-diff.json');
        expect(resolveSource({ dev: true, envValue: 'remote', baseUrl }).primary).toBe(REMOTE_DATA_URL);
        expect(resolveSource({ dev: true, envValue: 'local', search: '?data=/x.json', baseUrl })).toEqual({
            primary: '/x.json',
            fallback: null,
            label: 'custom',
        });
    });
});

const ok = (body, headers = {}) => ({
    ok: true,
    status: 200,
    json: async () => body,
    headers: new Map(Object.entries(headers)),
});

describe('fetchPayload / loadData', () => {
    it('retries once on network errors', async () => {
        const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(ok(V1));
        const r = await fetchPayload('u', { fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(r.payload.versions).toBe(V1);
    });

    it('does not retry invalid data', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(ok({ banana: 1 }));
        await expect(fetchPayload('u', { fetchImpl })).rejects.toBeInstanceOf(DataFormatError);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('rejects HTTP errors', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
        await expect(fetchPayload('u', { fetchImpl, retries: 0 })).rejects.toThrow('HTTP 404');
    });

    it('falls back to the bundled snapshot', async () => {
        const fetchImpl = vi.fn(async (url) => {
            if (url === 'remote') throw new TypeError('blocked');
            return ok(V1, { 'last-modified': 'Tue, 03 Nov 2026 06:00:00 GMT' });
        });
        const r = await loadData({ primary: 'remote', fallback: 'local' }, { fetchImpl });
        expect(r.usedFallback).toBe(true);
        expect(r.primaryError).toBeInstanceOf(TypeError);
        expect(r.lastModified).toBe('Tue, 03 Nov 2026 06:00:00 GMT');
    });

    it('throws when there is no fallback', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('down'));
        await expect(loadData({ primary: 'p', fallback: null }, { fetchImpl })).rejects.toThrow('down');
    });
});
