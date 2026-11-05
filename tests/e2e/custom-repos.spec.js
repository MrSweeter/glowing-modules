import { expect, ready, test } from './fixtures.js';

// Custom repositories (Filters drawer → "Your repositories"), with the GitHub API stubbed.
// Edge-case fixture: default comparison 17.0 → 18.0.

const API = 'https://api.github.com';

const tree = (...modules) => ({ tree: modules.map((m) => ({ path: `${m}/__manifest__.py`, type: 'blob' })) });
const ACME = {
    '/repos/acme/addons': { body: { full_name: 'acme/addons', owner: { login: 'acme' }, private: false, fork: false } },
    '/repos/acme/addons/branches': {
        body: [
            { name: '17.0', commit: { sha: 's17' } },
            { name: '18.0', commit: { sha: 's18' } },
            { name: 'main', commit: { sha: 'smain' } },
        ],
    },
    '/repos/acme/addons/git/trees/s17': { body: tree('acme_a', 'acme_b') },
    '/repos/acme/addons/git/trees/s18': { body: tree('acme_b', 'acme_c') },
};

/** Stub api.github.com with `routes` (path without query → { status, body, headers }); returns the request log. */
async function github(page, routes = ACME) {
    const calls = [];
    await page.route(`${API}/**`, (route) => {
        const { pathname } = new URL(route.request().url());
        calls.push(pathname);
        const stub = routes[pathname] ?? { status: 404, body: { message: 'Not Found' } };
        return route.fulfill({
            status: stub.status ?? 200,
            contentType: 'application/json',
            headers: {
                'access-control-allow-origin': '*',
                'access-control-expose-headers': 'ETag, Link, X-RateLimit-Remaining, X-RateLimit-Reset',
                'x-ratelimit-remaining': '55',
                'x-ratelimit-reset': '1793880000',
                ...stub.headers,
            },
            body: JSON.stringify(stub.body ?? {}),
        });
    });
    return calls;
}

async function addRepository(page, value) {
    await page.locator('#filter-toggle').click();
    await page.locator('#custom-repo-input').fill(value);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
}

test('adds a repository, keeps it after a reload and removes it', async ({ page, consoleErrors }) => {
    const calls = await github(page);
    await page.goto('./');
    await ready(page);

    await addRepository(page, 'https://github.com/acme/addons');
    await expect(page.locator('#custom-repo-status')).toHaveText('Added acme/addons: 3 modules in 2 versions.');
    await expect(page.locator('#custom-repo-list')).toContainText('2 versions · 3 modules');
    await expect(page.locator('#custom-repo-list')).toContainText('1 other branch ignored');
    await expect(page.locator('#repo-chips [data-token="repository:addons"]')).toBeVisible();
    expect(calls).toEqual([
        '/repos/acme/addons',
        '/repos/acme/addons/branches',
        '/repos/acme/addons/git/trees/s17',
        '/repos/acme/addons/git/trees/s18',
    ]);

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-module="acme_c"]')).toBeVisible(); // added in 18.0
    await expect(page.locator('[data-module="acme_a"]')).toHaveCount(1); // removed in 18.0
    await page.locator('[data-module="acme_c"]').click();
    await expect(page.getByRole('link', { name: /Source on GitHub \(18\.0\)/ })).toHaveAttribute(
        'href',
        'https://github.com/acme/addons/tree/18.0/acme_c'
    );
    await page.keyboard.press('Escape');

    // Reload: served from this browser's copy, no GitHub request.
    const before = calls.length;
    await page.reload();
    await ready(page);
    await expect(page.locator('[data-module="acme_c"]')).toBeVisible();
    expect(calls).toHaveLength(before);

    await page.locator('#filter-toggle').click();
    await page.getByRole('button', { name: 'Remove acme/addons' }).click();
    await expect(page.locator('#custom-repo-status')).toHaveText('Removed acme/addons.');
    await expect(page.locator('#repo-chips [data-token="repository:addons"]')).toHaveCount(0);
    await expect(page.locator('[data-module="acme_c"]')).toHaveCount(0);
    const stored = await page.evaluate(() => [
        localStorage.getItem('gm.repos'),
        localStorage.getItem('gm.repo:acme/addons'),
    ]);
    expect(stored).toEqual(['[]', null]);
    expect(consoleErrors).toEqual([]);
});

test('refuses Odoo repositories before calling GitHub', async ({ page }) => {
    const calls = await github(page);
    await page.goto('./');
    await ready(page);
    await addRepository(page, 'odoo/odoo');
    await expect(page.locator('#custom-repo-status')).toHaveText("Odoo's own repositories are already included.");
    expect(calls).toEqual([]);
});

test('explains GitHub errors', async ({ page }) => {
    const fork = {
        full_name: 'acme/odoo',
        owner: { login: 'acme' },
        private: false,
        fork: true,
        parent: { owner: { login: 'odoo' } },
    };
    await github(page, {
        '/repos/acme/odoo': { body: fork },
        '/repos/acme/limited': {
            status: 403,
            headers: { 'x-ratelimit-remaining': '0' },
            body: { message: 'rate limit' },
        },
    });
    await page.goto('./');
    await ready(page);
    const status = page.locator('#custom-repo-status');

    await addRepository(page, 'acme/missing');
    await expect(status).toContainText('acme/missing was not found on GitHub, or it is not public.');

    await page.locator('#custom-repo-input').fill('acme/odoo');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(status).toContainText('is an Odoo repository (or a fork of one)');

    await page.locator('#custom-repo-input').fill('acme/limited');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(status).toContainText("GitHub's limit for anonymous requests is reached");
    await expect(page.locator('#custom-repo-list li')).toHaveCount(0);
});

test('never calls GitHub on its own, flags copies older than a week and refreshes on demand', async ({ page }) => {
    const calls = await github(page);
    await page.addInitScript(() => {
        if (localStorage.getItem('gm.repos')) return; // seed once, keep what the test changes across reloads
        const repo = {
            id: 'acme/addons',
            fetchedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
            etags: {},
            pages: 1,
            ignored: 0,
            branches: { '17.0': { sha: 'old', modules: ['acme_a'], truncated: false } },
        };
        localStorage.setItem('gm.repos', JSON.stringify([repo.id]));
        localStorage.setItem(`gm.repo:${repo.id}`, JSON.stringify(repo));
    });
    await page.goto('./');
    await ready(page);
    await expect(page.locator('#notices')).toContainText(
        'Your repository acme/addons was last read from GitHub more than 1 week ago.'
    );
    await page.waitForTimeout(500);
    expect(calls).toEqual([]);

    await page.locator('#notices').getByRole('button', { name: 'Review' }).click();
    await expect(page.locator('#filter-dialog')).toBeVisible();
    const row = page.locator('#custom-repo-list li');
    await expect(row).toContainText('outdated: use Refresh to update');

    await page.getByRole('button', { name: 'Refresh acme/addons' }).click();
    await expect(page.locator('#custom-repo-status')).toHaveText('acme/addons is up to date.');
    await expect(row).not.toContainText('outdated');
    await expect(page.locator('#notices')).not.toContainText('was last read from GitHub'); // updated without a reload
    expect(calls).toContain('/repos/acme/addons/git/trees/s18');

    // Fresh copy: no warning and still no request after a reload.
    const before = calls.length;
    await page.reload();
    await ready(page);
    await expect(page.locator('#notices')).not.toContainText('was last read from GitHub');
    await page.waitForTimeout(500);
    expect(calls).toHaveLength(before);
});
