// Header controls, search bar and footer rendering (state → DOM).

import { hasToken } from '../domain/search.js';
import { $, el, formatCount } from './dom.js';

/**
 * @param {object} state store state
 * @param {{ view: import('../state/view.js').View }} ctx
 */
export function renderControls(state, { view }) {
    $('[data-role="from"]').textContent = state.from ?? 'start';
    $('[data-role="to"]').textContent = state.to;

    const input = /** @type {HTMLInputElement} */ ($('#search'));
    if (document.activeElement !== input && input.value !== state.query) input.value = state.query;
    $('#search-clear').hidden = !input.value;

    for (const chip of document.querySelectorAll('#repo-chips [data-token]')) {
        chip.setAttribute('aria-pressed', String(hasToken(state.query, chip.dataset.token)));
    }
    /** @type {HTMLInputElement} */ ($('#show-tests')).checked = state.showTests;
    $('[data-role="tests-hidden"]').textContent =
        !state.showTests && view.hiddenTests ? `(${formatCount(view.hiddenTests)} hidden)` : '';

    const messages = [...view.query.errors];
    if (view.query.ignored.length) {
        messages.push(`Ignored (fewer than 3 characters): ${view.query.ignored.map((t) => `"${t}"`).join(', ')}.`);
    }
    $('#search-errors').textContent = messages.join(' ');
}

/** Repository filter chips (built once from the data). */
export function renderRepoChips(repos, onToggle) {
    const container = $('#repo-chips');
    container.replaceChildren(
        container.querySelector('legend') ?? '',
        ...repos.map((full) => {
            const name = full.split('/')[1];
            const token = `repository:${name}`;
            return el(
                'button',
                {
                    type: 'button',
                    class: 'gm-filter-chip',
                    dataset: { token },
                    'aria-pressed': 'false',
                    title: `Only ${full}`,
                    onclick: () => onToggle(token),
                },
                name
            );
        })
    );
}

/** Theme toggle label reflects the theme it switches to. */
export function renderThemeToggle() {
    const dark = effectiveTheme() === 'dark';
    $('#theme-toggle').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}

export function effectiveTheme() {
    const explicit = document.documentElement.dataset.theme;
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * @param {{ meta: object, lastModified: string|null, usedFallback: boolean, label: string }} info
 */
export function renderDataInfo({ meta, lastModified, usedFallback, label }) {
    const raw = meta.generatedAt ?? lastModified ?? meta.pulledAt ?? null;
    const date = raw ? new Date(raw) : null;
    const when =
        date && !Number.isNaN(date.valueOf())
            ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date)
            : null;
    const origin = usedFallback ? 'bundled snapshot' : label === 'remote' ? 'live data' : `${label} data`;
    const node = $('#data-info');
    node.textContent = when ? `Data updated ${when} (${origin}).` : `Showing ${origin}.`;
}

export function renderAppVersion() {
    const built = new Date(__BUILD_DATE__);
    $('#app-version').textContent = `v${__APP_VERSION__} (${__APP_COMMIT__})`;
    $('#app-version').title = `Built ${built.toISOString()}`;
    $('[data-role="year"]').textContent = String(new Date().getFullYear());
}
