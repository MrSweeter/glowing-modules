#!/usr/bin/env node
// Generate optimised web assets from the source artwork in design/ (run once, commit the output).
//   design/banner.png  (2435×700, 2.1 MB) → public/logo.webp (header logo), public/og-image.png (1200×630)
//   design/favicon.png (612×612, 476 KB)  → public/favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png
// public/favicon.svg is hand-written.

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const design = (f) => resolve(root, 'design', f);
const pub = (f) => resolve(root, 'public', f);
const BRAND_DARK = { r: 36, g: 24, b: 34, alpha: 1 }; // #241822

await mkdir(resolve(root, 'public'), { recursive: true });

// Header logo: trimmed banner, 2× of the 40px display height.
await sharp(design('banner.png'))
    .trim()
    .resize({ height: 80 })
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(pub('logo.webp'));

// Icons
const cube = sharp(design('favicon.png')).trim();
const cubeBuffer = await cube.toBuffer();
await sharp(cubeBuffer)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(pub('favicon-32.png'));
for (const [file, size, pad] of [
    ['apple-touch-icon.png', 180, 22],
    ['icon-192.png', 192, 24],
    ['icon-512.png', 512, 64],
]) {
    const inner = await sharp(cubeBuffer)
        .resize(size - pad * 2, size - pad * 2, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: BRAND_DARK } })
        .composite([{ input: inner, gravity: 'center' }])
        .png({ compressionLevel: 9, palette: true })
        .toFile(pub(file));
}

// Open Graph image 1200×630
const bannerForOg = await sharp(design('banner.png')).trim().resize({ width: 820 }).toBuffer();
const text = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2b1a28"/><stop offset="1" stop-color="#0f2f33"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="600" y="470" text-anchor="middle" font-family="Poppins, DejaVu Sans, sans-serif" font-size="68" font-weight="700" fill="#ffffff">Glowing Modules</text>
  <text x="600" y="535" text-anchor="middle" font-family="Poppins, DejaVu Sans, sans-serif" font-size="30" fill="#e9dce6">Odoo modules added, removed &amp; moved between versions</text>
</svg>`);
await sharp(text)
    .composite([{ input: bannerForOg, top: 60, left: 190 }])
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(pub('og-image.png'));

console.log('✓ assets written to public/');
