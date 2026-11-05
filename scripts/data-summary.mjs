#!/usr/bin/env node
// Summarise changes between the committed data snapshot (git HEAD) and the working copy.
// Prints a GitHub Actions multi-line output (`markdown<<EOF … EOF`), used as the refresh PR body.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildSnapshots } from '../src/domain/snapshots.js';

const FILE = 'public/data/glowing-modules-diff.json';

function load(json) {
    const parsed = JSON.parse(json);
    return parsed.versions ?? parsed;
}

let before = {};
try {
    before = load(
        execFileSync('git', ['show', `HEAD:${FILE}`], {
            encoding: 'utf8',
            maxBuffer: 1 << 26,
            stdio: ['ignore', 'pipe', 'ignore'],
        })
    );
} catch {
    // first snapshot
}
const after = load(readFileSync(FILE, 'utf8'));

const a = buildSnapshots(before);
const b = buildSnapshots(after);
const lines = [];
const added = b.versions.filter((v) => !a.versions.includes(v));
if (added.length) lines.push(`- New versions: ${added.map((v) => `\`${v}\``).join(', ')}`);

for (const version of b.versions) {
    if (!a.snapshots.has(version)) continue;
    const changes = [];
    for (const [repo, set] of b.snapshots.get(version)) {
        const old = a.snapshots.get(version).get(repo) ?? new Set();
        const plus = [...set.difference(old)];
        const minus = [...old.difference(set)];
        if (plus.length || minus.length) changes.push(`${repo} +${plus.length}/−${minus.length}`);
    }
    if (changes.length) lines.push(`- \`${version}\`: ${changes.join(', ')}`);
}
if (!lines.length) lines.push('- No module change (metadata only).');

console.log(`markdown<<EOF\n### Changes\n\n${lines.join('\n')}\nEOF`);
