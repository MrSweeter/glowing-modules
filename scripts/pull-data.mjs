#!/usr/bin/env node
// Fetch the live module data, validate it and write the local snapshot used for development,
// tests and as the production fallback.
//
// Usage: node scripts/pull-data.mjs [--if-missing] [--source <url>] [--out <path>]
// The file is only rewritten when the module data changed.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { LOCAL_DATA_PATH, REMOTE_DATA_URL } from '../src/config.js';
import { normalizePayload } from '../src/data/validate.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
    options: {
        'if-missing': { type: 'boolean', default: false },
        source: { type: 'string', default: REMOTE_DATA_URL },
        out: { type: 'string', default: resolve(root, 'public', LOCAL_DATA_PATH) },
    },
});

if (values['if-missing'] && existsSync(values.out)) process.exit(0);

const response = await fetch(values.source, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) {
    console.error(`✗ ${values.source} answered HTTP ${response.status}`);
    process.exit(1);
}

let payload;
try {
    payload = normalizePayload(await response.json());
} catch (error) {
    console.error(`✗ ${error.message}`);
    for (const e of error.errors ?? []) console.error(`  - ${e}`);
    process.exit(1);
}

const snapshot = {
    meta: {
        ...payload.meta,
        schemaVersion: 2,
        sourceSchemaVersion: payload.meta.schemaVersion,
        source: payload.meta.source ?? null,
        pulledFrom: values.source,
        pulledAt: new Date().toISOString(),
    },
    versions: payload.versions,
};

// Keep the file untouched when only `pulledAt` would change (avoids noise in refresh PRs).
if (existsSync(values.out)) {
    try {
        const previous = JSON.parse(await readFile(values.out, 'utf8'));
        if (JSON.stringify(previous.versions) === JSON.stringify(payload.versions)) {
            console.log(`✓ unchanged (${Object.keys(payload.versions).length} versions), ${values.out} kept`);
            process.exit(0);
        }
    } catch {
        // unreadable previous snapshot: overwrite it
    }
}

await mkdir(dirname(values.out), { recursive: true });
await writeFile(values.out, `${JSON.stringify(snapshot, null, 2)}\n`);
const versions = Object.keys(payload.versions);
console.log(`✓ ${versions.length} versions (${versions[0]} → ${versions.at(-1)}) written to ${values.out}`);
