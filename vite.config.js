import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const base = process.env.BASE_PATH ?? '/glowing-modules/';

function gitCommit() {
    try {
        return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return 'unknown';
    }
}

/**
 * Content-Security-Policy as a <meta> tag (GitHub Pages cannot send headers).
 * Build only: the dev server injects <style> tags for HMR, which this policy would block.
 */
function cspPlugin() {
    const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self' https://gist.githubusercontent.com",
        "manifest-src 'self'",
        "base-uri 'self'",
        "form-action 'none'",
        "object-src 'none'",
    ].join('; ');
    return {
        name: 'gm-csp',
        apply: 'build',
        transformIndexHtml: {
            order: 'post',
            // Right after <meta charset> so it precedes every script and stylesheet.
            handler: (html) =>
                html.replace(
                    /<meta charset="UTF-8"\s*\/?>/i,
                    `$&\n        <meta http-equiv="Content-Security-Policy" content="${policy}" />`
                ),
        },
    };
}

/** sitemap.xml with the build date as <lastmod>. */
function sitemapPlugin() {
    return {
        name: 'gm-sitemap',
        apply: 'build',
        generateBundle() {
            const today = new Date().toISOString().slice(0, 10);
            this.emitFile({
                type: 'asset',
                fileName: 'sitemap.xml',
                source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://mrsweeter.github.io/glowing-modules/</loc><lastmod>${today}</lastmod></url>
</urlset>
`,
            });
        },
    };
}

export default defineConfig({
    base,
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __APP_COMMIT__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? gitCommit()),
        __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [cspPlugin(), sitemapPlugin()],
    css: {
        devSourcemap: true,
    },
    build: {
        target: ['es2022', 'safari17'],
        sourcemap: true,
        assetsInlineLimit: 0,
    },
    server: { port: 5173, open: false, watch: { ignored: ['**/glowing-modules-checker/**'] } },
    preview: { port: 4173 },
    test: {
        include: ['tests/unit/**/*.test.js'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            include: ['src/domain/**', 'src/data/**', 'src/state/**'],
            thresholds: { 'src/domain/**': { lines: 90 } },
        },
    },
});
