import AxeBuilder from '@axe-core/playwright';
import { expect, ready, test } from './fixtures.js';

// No serious/critical axe violations on the main views, in both themes.

async function audit(page) {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    test.describe(`${scheme} theme`, () => {
        test.use({ colorScheme: scheme });

        test('results view', async ({ page }) => {
            await page.goto('./?from=16.0&to=18.0&q=ent');
            await ready(page);
            await audit(page);
        });

        test('version picker dialog', async ({ page }) => {
            await page.goto('./');
            await ready(page);
            await page.locator('#to-toggle').click();
            await expect(page.locator('#version-dialog')).toBeVisible();
            await audit(page);
        });

        test('filter panel', async ({ page }) => {
            await page.goto('./?q=repository:odoo');
            await ready(page);
            await page.locator('#filter-toggle').click();
            await expect(page.locator('#filter-dialog')).toBeVisible();
            await audit(page);
        });

        test('module details', async ({ page }) => {
            await page.goto('./?from=16.0&to=18.0&m=moved_mod');
            await ready(page);
            await expect(page.locator('#module-dialog')).toBeVisible();
            await audit(page);
        });
    });
}

test('keyboard: skip link and focus order', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard');
    await page.goto('./');
    await ready(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('.gm-skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#results')).toBeFocused();
});
