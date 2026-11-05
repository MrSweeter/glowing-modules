// External links for a module. Pure.

import { isSaas, versionKey } from './versions.js';

// design-themes has no branch for most saas versions before saas-14.1 (checked 2026-11-04).
const DESIGN_THEMES_OLD_SAAS = new Set(['saas-11.3', 'saas-12.3', 'saas-13.5']);

/**
 * GitHub tree URL of a module at a given version, or null when the repository/branch has no public layout.
 * @param {string} repo `owner/name`
 * @param {string} version
 * @param {string} module
 * @returns {{ url: string, branch: string, private: boolean } | null}
 */
export function githubUrl(repo, version, module) {
    const [owner, name] = repo.split('/');
    if (owner !== 'odoo') return null;
    let branch = version;
    if (
        name === 'design-themes' &&
        isSaas(version) &&
        versionKey(version)[0] < 14 &&
        !DESIGN_THEMES_OLD_SAAS.has(version)
    ) {
        branch = `${versionKey(version)[0]}.0`;
    }
    const path = name === 'odoo' ? `addons/${module}` : module;
    return {
        url: `https://github.com/${repo}/tree/${encodeURIComponent(branch)}/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
        branch,
        private: name === 'enterprise',
    };
}
