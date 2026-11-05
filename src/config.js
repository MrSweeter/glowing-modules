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
