import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
    testDir: 'tests/e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: `http://localhost:${PORT}/glowing-modules/`,
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile', use: { ...devices['Pixel 7'] } },
        ...(process.env.PW_WEBKIT === '0' ? [] : [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }]),
    ],
    webServer: {
        // Tests run against the production build (CSP, base path, hashed assets).
        command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/glowing-modules/`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
