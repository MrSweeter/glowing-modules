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

    for (const chip of document.querySelectorAll('#owner-chips [data-token], #repo-chips [data-token]')) {
        chip.setAttribute('aria-pressed', String(hasToken(state.query, chip.dataset.token)));
    }
    /** @type {HTMLInputElement} */ ($('#show-tests')).checked = state.showTests;
    const active = view.query.repository.length + view.query.owner.length + (state.showTests ? 1 : 0);
    const badge = $('[data-role="filter-count"]');
    badge.textContent = String(active);
    badge.hidden = !active;
    $('[data-role="filter-count-label"]').textContent = active ? ` (${active} active)` : '';
    $('[data-role="tests-hidden"]').textContent =
        !state.showTests && view.hiddenTests ? `(${formatCount(view.hiddenTests)} hidden)` : '';

    const messages = [...view.query.errors];
    if (view.query.ignored.length) {
        messages.push(`Ignored (fewer than 3 characters): ${view.query.ignored.map((t) => `"${t}"`).join(', ')}.`);
    }
    $('#search-errors').textContent = messages.join(' ');
}

/** Owner filter chips (`owner:` token), from the repositories of the data. */
export function renderOwnerChips(repos, onToggle) {
    const owners = [...new Set(repos.map((full) => full.split('/')[0]))];
    $('#owner-chips').replaceChildren(
        ...owners.map((owner) => tokenChip(`owner:${owner}`, owner, `Only repositories of ${owner}`, onToggle))
    );
}

/** Repository filter chips (`repository:` token), from the repositories of the data. */
export function renderRepoChips(repos, onToggle) {
    $('#repo-chips').replaceChildren(
        ...repos.map((full) => {
            const name = full.split('/')[1];
            return tokenChip(`repository:${name}`, name, `Only ${full}`, onToggle);
        })
    );
}

function tokenChip(token, label, title, onToggle) {
    return el(
        'button',
        {
            type: 'button',
            class: 'gm-filter-chip',
            dataset: { token },
            'aria-pressed': 'false',
            title,
            onclick: () => onToggle(token),
        },
        label
    );
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
