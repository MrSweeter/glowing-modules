import { readFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';

const read = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
export const EDGE = read('diff-edge-cases.json');
export const XSS = read('diff-xss.json');

const REMOTE = /gist\.githubusercontent\.com/;
const LOCAL = /\/data\/glowing-modules-diff\.json$/;

/**
 * `page` with stubbed data sources (default: the edge-case fixture as live data) and collected console errors.
 * Use `data.remote(...)` / `data.local(...)` before `page.goto` to change the stubs.
 */
export const test = base.extend({
    data: [
        async ({ page }, use) => {
            const state = { remote: { body: EDGE }, local: { body: EDGE }, requests: { remote: 0, local: 0 } };
            const handler = (kind) => async (route) => {
                state.requests[kind]++;
                const stub = state[kind];
                if (stub.abort) return route.abort('connectionrefused');
                return route.fulfill({ status: stub.status ?? 200, contentType: 'application/json', body: stub.body });
            };
            await page.route(REMOTE, handler('remote'));
            await page.route(LOCAL, handler('local'));
            await use({
                remote: (stub) => Object.assign(state.remote, stub),
                local: (stub) => Object.assign(state.local, stub),
                requests: state.requests,
            });
        },
        { auto: true },
    ],
    consoleErrors: async ({ page }, use) => {
        const errors = [];
        page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
        page.on('pageerror', (err) => errors.push(err.message));
        await use(errors);
    },
});

export { expect };

/** Wait for the app to be rendered with data. */
export async function ready(page) {
    await expect(page.locator('#app')).toBeVisible();
}

/** Column heading text, e.g. "2 added". */
export const heading = (page, kind) => page.locator(`#col-${kind}-title`);
