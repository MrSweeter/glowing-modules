import { expect, heading, ready, test, XSS } from './fixtures.js';

// Edge-case fixture (tests/fixtures/diff-edge-cases.json): default view is 17.0 → 18.0.
//   added: new_in_saas (odoo), ent_18 (enterprise) · removed: osc (odoo) · test_lint hidden (present in both anyway)

test.describe('comparison', () => {
    test('default view is the latest major vs the previous major', async ({ page, data, consoleErrors }) => {
        await page.goto('./');
        await ready(page);
        await expect(page.locator('[data-role="from"]')).toHaveText('17.0');
        await expect(page.locator('[data-role="to"]')).toHaveText('18.0');
        await expect(page.locator('#summary')).toContainText('+2 / −1');
        await expect(page).toHaveURL(/\/glowing-modules\/$/);
        await expect(page).toHaveTitle('17.0 → 18.0 · Glowing Modules');
        expect(data.requests.remote).toBe(1);
        expect(consoleErrors).toEqual([]);
    });

    test('a range ignores modules that came and went', async ({ page, isMobile }) => {
        await page.goto('./?from=16.0&to=17.0&tests=1');
        await ready(page);
        const results = page.locator('#results-grid');
        if (isMobile) await page.getByRole('tab', { name: /Moved/ }).click();
        await expect(results.locator('[data-module="osc"]')).toHaveCount(0);
        await expect(results.locator('[data-module="add_then_remove"]')).toHaveCount(0);
        await expect(results.locator('[data-module="remove_then_readd"]')).toHaveCount(0);
        await expect(results.locator('#col-moved [data-module="moved_mod"]')).toBeVisible();
    });

    test('picking versions updates the URL and history', async ({ page }) => {
        await page.goto('./');
        await ready(page);
        await page.locator('#from-toggle').click();
        const dialog = page.locator('#version-dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('[data-version="18.0"]')).toBeDisabled();
        await dialog.locator('[data-version="16.0"]').click();
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(/\?to=18\.0&from=16\.0$/);
        await expect(page.locator('#from-toggle')).toBeFocused();

        await page.goBack();
        await expect(page.locator('[data-role="from"]')).toHaveText('17.0');
        await page.goForward();
        await expect(page.locator('[data-role="from"]')).toHaveText('16.0');
    });

    test('lists every version and ignores the legacy lts parameter', async ({ page, data }) => {
        await page.goto('./?lts=1&from=saas-17.1&to=master');
        await ready(page);
        await expect(page).toHaveURL(/\?to=master&from=saas-17\.1$/);
        await expect(page.locator('#lts-filter, #range-prev, #range-next')).toHaveCount(0);
        await page.locator('#to-toggle').click();
        await expect(page.locator('#version-dialog [data-version^="saas-"]')).toHaveCount(3);
        await page.keyboard.press('Escape');
        expect(data.requests.remote).toBe(1);
    });

    test('shows the moved block before added and removed', async ({ page }) => {
        await page.goto('./?from=16.0&to=18.0');
        await ready(page);
        const order = await page
            .locator('#results-grid > [data-column]')
            .evaluateAll((cols) => cols.map((c) => c.dataset.column));
        expect(order).toEqual(['moved', 'added', 'removed']);
    });

    test('deep link restores the full state', async ({ page }) => {
        await page.goto('./?from=16.0&to=18.0&q=ent_&m=ent_18');
        await ready(page);
        await expect(page.locator('#search')).toHaveValue('ent_');
        await expect(page.locator('#module-dialog')).toBeVisible();
        await expect(page.locator('#module-dialog-title')).toHaveText('ent_18');
        await page.keyboard.press('Escape');
        await expect(page).not.toHaveURL(/[?&]m=/);
    });

    test('unknown versions in the URL fall back with a notice', async ({ page }) => {
        await page.goto('./?to=99.0');
        await ready(page);
        await expect(page.locator('#notices')).toContainText('Version "99.0" does not exist.');
        await expect(page.locator('[data-role="to"]')).toHaveText('18.0');
    });

    test('legacy ?compare still opens the app', async ({ page }) => {
        await page.goto('./?compare');
        await ready(page);
        await expect(page).toHaveURL(/\/glowing-modules\/$/);
    });
});

test.describe('search', () => {
    test('filters modules and counters, keeps text when toggling a repository chip', async ({ page }) => {
        await page.goto('./?from=16.0&to=18.0');
        await ready(page);
        await page.locator('#search').fill('ent_');
        await expect(heading(page, 'added')).toContainText('1 of 3 added');
        await expect(page.locator('#results-grid mark')).toHaveText(['ent_']);

        await page.locator('#filter-toggle').click();
        await page.locator('#repo-chips [data-token="repository:odoo"]').click();
        await expect(page.locator('#search')).toHaveValue('ent_ repository:odoo');
        await expect(page.locator('#repo-chips [data-token="repository:odoo"]')).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        await expect(page.locator('[data-role="filter-count"]')).toHaveText('1');
        await page.keyboard.press('Escape');
        await expect(page.locator('#filter-dialog')).toBeHidden();
        await expect(page.locator('#col-added .gm-empty')).toContainText('No module matches');

        await page.locator('#col-added [data-action="clear-search"]').click();
        await expect(page.locator('#search')).toHaveValue('');
        await expect(page).not.toHaveURL(/q=/);
    });

    test('shows test modules on demand', async ({ page }) => {
        await page.goto('./?from=16.0&to=17.0');
        await ready(page);
        await page.locator('#filter-toggle').click();
        await expect(page.locator('[data-role="tests-hidden"]')).toHaveText('(1 hidden)');
        await page.locator('#show-tests').check();
        await expect(page.locator('[data-module="test_lint"]')).toBeVisible();
        await expect(page).toHaveURL(/tests=1/);
    });

    test('filter panel counts active filters and resets them', async ({ page, isMobile }) => {
        await page.goto('./');
        await ready(page);
        const badge = page.locator('[data-role="filter-count"]');
        await expect(badge).toBeHidden();

        await page.goto('./?q=ent+repository:odoo&tests=1');
        await ready(page);
        await expect(badge).toHaveText('2');
        await expect(page.locator('#filter-toggle')).toHaveAccessibleName(/Filter.*2 active/);

        await page.locator('#filter-toggle').click();
        await expect(page.locator('#filter-dialog')).toBeVisible();
        await expect(page.locator('#show-tests')).toBeChecked();
        await page.locator('#filter-reset').click();
        await expect(page.locator('#search')).toHaveValue('ent');
        await expect(page.locator('#show-tests')).not.toBeChecked();
        await expect(badge).toBeHidden();
        await expect(page).not.toHaveURL(/tests=1/);

        await page.locator('#filter-dialog [data-close]').click();
        await expect(page.locator('#filter-dialog')).toBeHidden();
        if (!isMobile) await expect(page.locator('#filter-toggle')).toBeFocused();
    });

    test('owner chips', async ({ page }) => {
        await page.goto('./');
        await ready(page);
        const search = page.locator('#search');
        await page.locator('#filter-toggle').click();

        const owner = page.locator('#owner-chips [data-token="owner:odoo"]');
        await owner.click();
        await expect(search).toHaveValue('owner:odoo');
        await expect(owner).toHaveAttribute('aria-pressed', 'true');
        await owner.click();
        await expect(search).toHaveValue('');
    });

    test('reports invalid regexes and short terms', async ({ page }) => {
        await page.goto('./');
        await ready(page);
        await page.locator('#search').fill('l10n_( ab');
        await expect(page.locator('#search-errors')).toContainText('not a valid regular expression');
        await expect(page.locator('#search-errors')).toContainText('Ignored (fewer than 3 characters): "ab"');
    });
});

test.describe('module details', () => {
    test('opens from a chip and shows availability and links', async ({ page, isMobile }) => {
        await page.goto('./?from=16.0&to=18.0');
        await ready(page);
        if (isMobile) await page.getByRole('tab', { name: /Moved/ }).click();
        const chip = page.locator('#col-moved [data-module="moved_mod"]');
        await chip.click();
        const dialog = page.locator('#module-dialog');
        await expect(dialog).toBeVisible();
        await expect(page).toHaveURL(/m=moved_mod/);
        await expect(dialog.locator('.gm-module__ranges')).toContainText('16.0 → saas-16.2');
        await expect(dialog.locator('.gm-module__ranges')).toContainText('17.0 → master');
        await expect(dialog.getByRole('link', { name: /Source on GitHub/ })).toHaveAttribute(
            'href',
            'https://github.com/odoo/enterprise/tree/18.0/moved_mod'
        );
        await expect(dialog.getByText('Odoo Apps')).toHaveCount(0);
        await expect(dialog.getByText('Copy name')).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Close' }).click();
        await expect(dialog).toBeHidden();
        await expect(chip).toBeFocused();
    });
});

test.describe('data loading', () => {
    test('falls back to the bundled snapshot when the live source fails', async ({ page, data }) => {
        data.remote({ abort: true });
        await page.goto('./');
        await ready(page);
        await expect(page.locator('#notices')).toContainText('Live data is unavailable');
        await expect(page.locator('#data-info')).toContainText('bundled snapshot');
    });

    test('falls back when the live data is invalid', async ({ page, data }) => {
        data.remote({ body: XSS });
        await page.goto('./');
        await ready(page);
        await expect(page.locator('#notices')).toContainText('Invalid module name');
        await expect(page.locator('img[src="x"]')).toHaveCount(0);
    });

    test('shows an error with retry when every source fails', async ({ page, data }) => {
        data.remote({ abort: true });
        data.local({ status: 500, body: '' });
        await page.goto('./');
        await expect(page.getByRole('alert')).toContainText('Could not load module data');
        await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    });

    test('rejects malicious data instead of rendering it', async ({ page, data }) => {
        let dialogs = 0;
        page.on('dialog', (d) => {
            dialogs++;
            d.dismiss();
        });
        data.remote({ body: XSS });
        data.local({ body: XSS });
        await page.goto('./');
        await expect(page.getByRole('alert')).toContainText('Invalid module name');
        await expect(page.locator('img[src="x"]')).toHaveCount(0);
        expect(dialogs).toBe(0);
    });
});

test.describe('theme', () => {
    test('follows the system by default and remembers a chosen theme', async ({ page }) => {
        const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? 'system');
        const select = page.locator('#theme-select');
        await page.goto('./');
        await ready(page);
        await expect(select).toHaveValue('system');
        expect(await theme()).toBe('system');

        await select.selectOption('dark');
        expect(await theme()).toBe('dark');
        await page.reload();
        await ready(page);
        await expect(select).toHaveValue('dark');
        expect(await theme()).toBe('dark');

        await select.selectOption('system');
        await page.reload();
        await ready(page);
        await expect(select).toHaveValue('system');
        expect(await theme()).toBe('system');
    });
});
