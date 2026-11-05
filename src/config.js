// Shared constants. Plain ESM without Vite-specific APIs so Node scripts can import it too.

/** Live data source (gist maintained by the private checker). */
export const REMOTE_DATA_URL =
    'https://gist.githubusercontent.com/GaetanVandenBergh/35a02a7148d9919a9aea76796d824d63/raw/glowing-modules-diff.json';

/** Human-facing page of the gist. */
export const REMOTE_DATA_PAGE = 'https://gist.github.com/GaetanVandenBergh/35a02a7148d9919a9aea76796d824d63';

/** Path (relative to the site base) of the bundled snapshot used in dev and as production fallback. */
export const LOCAL_DATA_PATH = 'data/glowing-modules-diff.json';

export const REPOSITORY_URL = 'https://github.com/MrSweeter/glowing-modules';
export const SITE_URL = 'https://mrsweeter.github.io/glowing-modules/';
export const UPSTREAM_DATA_CREDIT = 'https://github.com/mao-odoo/all_standard_odoo_apps_per_version';

/** Timeout (ms) for one data fetch attempt. */
export const FETCH_TIMEOUT_MS = 8000;

/** GitHub REST API, used only when a visitor adds a repository (anonymous: 60 requests per hour per IP). */
export const GITHUB_API = 'https://api.github.com';

/** Repositories a visitor can add. */
export const MAX_CUSTOM_REPOS = 5;
/** Saved copies are never refreshed automatically (refresh is manual); older than this, they are flagged as outdated. */
export const CUSTOM_REPO_OUTDATED_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Module-name filters of the Filter panel (regex on the module name; each chip cycles show only → hide → off).
 * Chosen from the most frequent name patterns of the data; a pattern must not contain whitespace (one search token).
 * The chip shows the label; its tooltip shows the description (when the label needs one) and the pattern.
 * @type {{ label: string, pattern: string, description?: string }[]}
 */
export const NAME_FILTERS = [
    { label: 'Tests', pattern: '(^|_)tests?(_|$)', description: 'Test modules and test helpers.' },
    { label: 'Localization', pattern: '^l10n_', description: 'Country-specific modules (l10n = localization).' },
    { label: 'Website', pattern: '^website_' },
    { label: 'Point of Sale', pattern: '^pos_' },
    { label: 'Sales', pattern: '^sale_' },
    { label: 'Accounting', pattern: '^account_' },
    { label: 'Employees', pattern: '^hr_', description: 'Human resources apps (hr = human resources).' },
    { label: 'AI', pattern: '^ai_' },
    { label: 'Themes', pattern: '^theme_', description: 'Website themes.' },
    { label: 'Spreadsheet', pattern: '^spreadsheet_', description: 'Spreadsheet integrations of other apps.' },
    { label: 'Project', pattern: '^project_' },
    { label: 'Payment', pattern: '^payment_', description: 'Payment providers.' },
    { label: 'Inventory', pattern: '^stock_', description: 'Inventory app (technical name: stock).' },
    {
        label: 'Manufacturing',
        pattern: '^mrp_',
        description: 'Manufacturing app (mrp = manufacturing resource planning).',
    },
    {
        label: 'EDI',
        pattern: '_edi(_|$)',
        description: 'Electronic data interchange: e-invoicing formats and connectors.',
    },
    {
        label: 'Reports',
        pattern: '_reports$',
        description: 'Reporting modules, mostly country-specific financial reports.',
    },
    {
        label: 'Enterprise bridges',
        pattern: '_enterprise$',
        description: 'Modules adding Enterprise features to a Community module.',
    },
];
