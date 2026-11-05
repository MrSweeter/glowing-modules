#!/usr/bin/env node
// Download a Material Symbols Outlined font limited to the icons the app uses, and commit it.
// Google Fonts is contacted only here (dev time), never at runtime.
//
// When you use a new icon: add its name to ICONS, run `npm run icons:fetch`, commit the font.
// Icon names: https://fonts.google.com/icons (Material Symbols, Outlined).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ICONS = [
    'add',
    'check',
    'chevron_left',
    'chevron_right',
    'close',
    'deployed_code',
    'error',
    'expand_more',
    'filter_list',
    'help',
    'history',
    'info',
    'lock',
    'more_horiz',
    'open_in_new',
    'progress_activity',
    'refresh',
    'remove',
    'schedule',
    'search',
    'sync_alt',
    'warning',
].sort();

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'src/assets/fonts/material-symbols-outlined-subset.woff2');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const cssUrl =
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0' +
    `&icon_names=${ICONS.join(',')}&display=block`;

const css = await (await fetch(cssUrl, { headers: { 'User-Agent': UA } })).text();
const fontUrl = /url\((https:[^)]+)\)\s*format\('woff2'\)/.exec(css)?.[1];
if (!fontUrl) {
    console.error('✗ No woff2 URL in Google Fonts response:\n', css.slice(0, 500));
    process.exit(1);
}
const font = Buffer.from(await (await fetch(fontUrl, { headers: { 'User-Agent': UA } })).arrayBuffer());
await mkdir(dirname(out), { recursive: true });
await writeFile(out, font);
console.log(`✓ ${ICONS.length} icons, ${(font.length / 1024).toFixed(1)} KB → ${out}`);
