// Data source resolution and loading (timeout, retry, fallback).

import { FETCH_TIMEOUT_MS, LOCAL_DATA_PATH, REMOTE_DATA_URL } from '../config.js';
import { normalizePayload } from './validate.js';

/**
 * Decide where data comes from.
 * - production: the remote gist, with the bundled snapshot as fallback;
 * - development: `VITE_DATA_SOURCE` (`local` by default), overridable with `?data=local|remote|<path or url>`.
 *
 * @param {{ dev: boolean, envValue?: string, search?: string, baseUrl: string }} options
 * @returns {{ primary: string, fallback: string|null, label: string }}
 */
export function resolveSource({ dev, envValue, search = '', baseUrl }) {
    const local = `${baseUrl}${LOCAL_DATA_PATH}`;
    const override = dev ? new URLSearchParams(search).get('data') : null;
    const pick = override || envValue || (dev ? 'local' : 'remote');
    if (pick === 'local') return { primary: local, fallback: null, label: 'local' };
    if (pick === 'remote') return { primary: REMOTE_DATA_URL, fallback: local, label: 'remote' };
    return { primary: pick, fallback: null, label: 'custom' };
}

/**
 * Fetch + validate JSON with a timeout and retries.
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, retries?: number }} [options]
 */
export async function fetchPayload(url, { fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS, retries = 1 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
            if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
            const payload = normalizePayload(await response.json());
            const lastModified = response.headers?.get?.('last-modified') ?? null;
            return { payload, lastModified };
        } catch (error) {
            lastError = error;
            if (error?.name === 'DataFormatError') break; // retrying will not fix bad data
        }
    }
    throw lastError;
}

/**
 * Load data from the primary source, falling back to the bundled snapshot.
 * @param {{ primary: string, fallback: string|null }} source
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, retries?: number }} [options]
 * @returns {Promise<{ payload: import('./validate.js').Payload, lastModified: string|null, usedFallback: boolean, primaryError: Error|null }>}
 */
export async function loadData(source, options = {}) {
    try {
        const result = await fetchPayload(source.primary, options);
        return { ...result, usedFallback: false, primaryError: null };
    } catch (primaryError) {
        if (!source.fallback) throw primaryError;
        const result = await fetchPayload(source.fallback, { ...options, retries: 0 });
        return { ...result, usedFallback: true, primaryError };
    }
}
