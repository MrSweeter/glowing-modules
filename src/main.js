// Glowing Modules: bootstrap. Loads data, owns the store, wires UI events, keeps the URL in sync.

import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import './styles/main.scss';

import { CUSTOM_REPO_OUTDATED_MS, NAME_FILTERS, REMOTE_DATA_PAGE } from './config.js';
import { fetchRepository } from './data/github.js';
import { loadData, resolveSource } from './data/source.js';
import { mergeVersionDiffs, toVersionDiff, unknownVersions } from './domain/customRepo.js';
import { formatDuration } from './domain/duration.js';
import { buildHistory } from './domain/history.js';
import { cycleNameFilter, parseQuery, removeFilterTokens, toggleToken } from './domain/search.js';
import { buildSnapshots } from './domain/snapshots.js';
import { createCustomRepoStore, modulesByVersion } from './state/customRepos.js';
import { initialSelection, normalize, setFrom, setTo } from './state/selection.js';
import { createStore } from './state/store.js';
import { readUrl, writeUrl } from './state/url.js';
import { buildView, changeCountsByVersion } from './state/view.js';
import {
    initSearchHelp,
    renderAppVersion,
    renderControls,
    renderDataInfo,
    renderNameChips,
    renderOwnerChips,
    renderRepoChips,
} from './ui/controls.js';
import { createCustomRepos } from './ui/customRepos.js';
import { $, debounce, el, icon, storage } from './ui/dom.js';
import { createModuleDetails } from './ui/moduleDetails.js';
import { renderResults } from './ui/results.js';
import { initTooltips } from './ui/tooltip.js';
import { createVersionPicker } from './ui/versionPicker.js';

const store = createStore({
    from: undefined,
    to: '',
    query: '',
    module: null,
    tab: 'added',
});

/** Rebuilt when custom repositories change (see buildData). */
let data = null; // { model, history, sorted, branches: Map<repo, string[]> }
/** Versions diff of the main data (gist or bundled snapshot). */
let baseVersions = null;
const customStore = createCustomRepoStore(storage);

renderAppVersion();
// Theme: follows the system unless the user picks light or dark (saved; applied early by theme-init.js).
const themeSelect = /** @type {HTMLSelectElement} */ ($('#theme-select'));
themeSelect.value = document.documentElement.dataset.theme ?? 'system';
themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    storage.set('gm.theme', theme === 'system' ? null : theme);
});
// Settings (theme, your repositories): usable before the data is loaded, or when it fails to load.
bindDrawer($('#settings-dialog'), $('#settings-toggle'));

start();

async function start() {
    const source = resolveSource({
        dev: import.meta.env.DEV,
        envValue: import.meta.env.VITE_DATA_SOURCE,
        search: location.search,
        baseUrl: import.meta.env.BASE_URL,
    });
    try {
        const result = await loadData(source);
        onData(result, source);
    } catch (error) {
        onError(error);
    }
}

// ─── Data ───────────────────────────────────────────────────────────────────────────────────────

function onData({ payload, lastModified, usedFallback, primaryError }, source) {
    baseVersions = payload.versions;
    buildData();

    renderDataInfo({ meta: payload.meta, lastModified, usedFallback, label: source.label });
    if (usedFallback) {
        notice(
            'warning',
            `Live data is unavailable (${primaryError?.message ?? 'network error'}). Showing the snapshot bundled with this release.`,
            {
                label: 'Retry',
                onClick: () => location.reload(),
            }
        );
    }

    const { state: initial, warnings } = stateFromUrl(location.search);
    for (const w of warnings) notice('warning', `${w} Showing the default comparison instead.`);
    store.set(initial);
    history.replaceState(null, '', urlFor(store.get()));

    bindEvents();

    $('#loading').hidden = true;
    document.documentElement.classList.add('gm-ready');
    store.subscribe((state, prev) => {
        // Opening/closing module details does not change the results.
        const changed = Object.keys(state).filter((k) => state[k] !== prev[k]);
        if (changed.length && changed.every((k) => k === 'module')) return;
        render(state);
    });
    render(store.get());
    if (initial.module) openModule(initial.module, null);
    updateOutdatedNotice();
}

/**
 * Custom repositories are never refreshed automatically: say when a saved copy is older than
 * CUSTOM_REPO_OUTDATED_MS. Updated on load and after every add / refresh / remove.
 */
function updateOutdatedNotice() {
    $('#notice-outdated-repos')?.remove();
    const ids = customRepos.outdated();
    if (!ids.length) return;
    const names = ids.join(', ');
    const since = `more than ${formatDuration(CUSTOM_REPO_OUTDATED_MS)} ago`;
    const message =
        ids.length === 1
            ? `Your repository ${names} was last read from GitHub ${since}. Its modules may be outdated.`
            : `Your repositories ${names} were last read from GitHub ${since}. Their modules may be outdated.`;
    notice(
        'warning',
        message,
        { label: 'Review', onClick: () => /** @type {HTMLDialogElement} */ ($('#settings-dialog')).showModal() },
        'notice-outdated-repos'
    );
}

/**
 * Main data + the custom repositories saved in this browser (cached copies: no network here).
 * Custom repositories only use versions of the main data, so the version list never changes.
 */
function buildData() {
    const known = Object.keys(baseVersions);
    const custom = customStore
        .list()
        .map((id) => customStore.get(id))
        .filter(Boolean);
    const versions = mergeVersionDiffs(
        baseVersions,
        ...custom.map((d) => toVersionDiff(d.id, modulesByVersion(d), known))
    );
    // Versions where a custom repository has no branch: its modules there are unknown.
    const unknown = new Map();
    for (const d of custom) {
        for (const v of unknownVersions(known, Object.keys(d.branches))) {
            if (!unknown.has(v)) unknown.set(v, new Set());
            unknown.get(v).add(d.id);
        }
    }
    const model = buildSnapshots(versions, unknown);
    data = {
        model,
        history: buildHistory(versions),
        sorted: model.versions,
        branches: new Map(custom.map((d) => [d.id, Object.keys(d.branches)])),
    };
    const toggle = (token) => commit({ query: toggleToken(store.get().query, token) }, { mode: 'replace' });
    renderOwnerChips(model.repos, toggle);
    renderRepoChips(model.repos, toggle);
}

function onError(error) {
    console.error(error);
    $('#loading').replaceWith(
        el(
            'div',
            { class: 'gm-error-card', role: 'alert' },
            icon('error', 'lg'),
            el('h2', {}, 'Could not load module data'),
            el(
                'p',
                {},
                error?.name === 'DataFormatError'
                    ? error.message
                    : `The data source did not answer (${error?.message ?? 'unknown error'}).`
            ),
            el(
                'div',
                { class: 'gm-cluster' },
                el(
                    'button',
                    { type: 'button', class: 'gm-btn gm-btn--primary', onclick: () => location.reload() },
                    icon('refresh', 'sm'),
                    'Retry'
                ),
                el('a', { class: 'gm-btn', href: REMOTE_DATA_PAGE }, 'Open the data source'),
                el(
                    'a',
                    {
                        class: 'gm-btn',
                        href: 'https://github.com/MrSweeter/glowing-modules/issues/new?template=bug_report.yml',
                    },
                    'Report a problem'
                )
            )
        )
    );
}

// ─── State ⇄ URL ────────────────────────────────────────────────────────────────────────────────

function stateFromUrl(search) {
    const { patch, warnings } = readUrl(search, data.sorted);
    const selection = patch.to
        ? normalize(data.sorted, { from: patch.from, to: patch.to })
        : initialSelection(data.sorted);
    const module = patch.module && data.history.has(patch.module) ? patch.module : null;
    if (patch.module && !module) warnings.push(`Module "${patch.module}" does not exist.`);
    return { state: { ...selection, query: patch.query, module }, warnings };
}

function urlFor(state) {
    return `${location.pathname}${writeUrl(state, data.sorted, location.search)}${location.hash}`;
}

const replaceUrlSoon = debounce(() => history.replaceState(null, '', urlFor(store.get())), 300);

/**
 * Apply a state change and sync the URL.
 * @param {object} patch
 * @param {{ mode?: 'push'|'replace'|'none' }} [options] push: new history entry (version changes); replace: debounced
 */
function commit(patch, { mode = 'push' } = {}) {
    store.set(patch);
    const state = store.get();
    if (mode === 'push') {
        const url = urlFor(state);
        if (url !== `${location.pathname}${location.search}${location.hash}`) history.pushState(null, '', url);
    } else if (mode === 'replace') {
        replaceUrlSoon();
    }
}

addEventListener('popstate', () => {
    if (!data) return;
    const { state } = stateFromUrl(location.search);
    store.set(state);
    if (state.module) openModule(state.module, null);
    else details?.close();
});

// ─── Rendering ──────────────────────────────────────────────────────────────────────────────────

function render(state) {
    const view = buildView({
        model: data.model,
        from: state.from,
        to: state.to,
        query: state.query,
    });
    renderControls(state, { view });
    renderResults(view, { model: data.model, tab: state.tab, onTab: (tab) => store.set({ tab }) });
    document.title = `${state.from ? `${state.from} → ` : ''}${state.to} · Glowing`;
}

// ─── Events ─────────────────────────────────────────────────────────────────────────────────────

let picker = null;
let details = null;
let customRepos = null;

function bindEvents() {
    initTooltips();
    initSearchHelp();
    picker = createVersionPicker({
        sorted: data.sorted,
        onPick: (end, version) => {
            const state = store.get();
            const next = end === 'to' ? setTo(data.sorted, state, version) : setFrom(data.sorted, state, version);
            commit(next);
        },
    });
    details = createModuleDetails({
        getData: () => ({ model: data.model, history: data.history, branchesOf: (repo) => data.branches.get(repo) }),
        onClose: () => {
            if (store.get().module) commit({ module: null }, { mode: 'replace' });
        },
    });
    customRepos = createCustomRepos({
        store: customStore,
        fetchRepository,
        knownVersions: () => Object.keys(baseVersions),
        onChange: () => {
            buildData();
            render(store.get());
            updateOutdatedNotice();
        },
    });
    customRepos.render();

    const openPicker = (end) => (e) => {
        const state = store.get();
        picker.open(end, state, changeCountsByVersion(data.history, parseQuery(state.query)), e.currentTarget);
    };
    $('#from-toggle').addEventListener('click', openPicker('from'));
    $('#to-toggle').addEventListener('click', openPicker('to'));

    const input = /** @type {HTMLInputElement} */ ($('#search'));
    const applySearch = debounce(() => commit({ query: input.value }, { mode: 'replace' }), 120);
    input.addEventListener('input', () => {
        $('#search-clear').hidden = !input.value;
        applySearch();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && input.value) {
            e.preventDefault();
            clearSearch();
        }
    });
    $('#search-clear').addEventListener('click', () => {
        clearSearch();
        input.focus();
    });
    renderNameChips(NAME_FILTERS, (pattern) =>
        commit({ query: cycleNameFilter(store.get().query, pattern) }, { mode: 'replace' })
    );

    bindDrawer($('#filter-dialog'), $('#filter-toggle'));
    $('#filter-reset').addEventListener('click', () =>
        commit({ query: removeFilterTokens(store.get().query) }, { mode: 'replace' })
    );

    $('#results-grid').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-module]');
        if (chip) {
            openModule(chip.dataset.module, chip);
            return;
        }
        if (e.target.closest('[data-action="clear-search"]')) clearSearch();
    });
}

/**
 * Drawer opened by a toggle button: closes on the backdrop or a [data-close] button, then gives focus back to the toggle.
 * @param {HTMLDialogElement} dialog
 * @param {HTMLElement} toggle
 */
function bindDrawer(dialog, toggle) {
    toggle.addEventListener('click', () => dialog.showModal());
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
    });
    dialog.addEventListener('close', () => toggle.focus());
}

function clearSearch() {
    $('#search').value = '';
    $('#search-clear').hidden = true;
    commit({ query: '' }, { mode: 'replace' });
}

function openModule(module, trigger) {
    const state = store.get();
    if (details.open(module, state, trigger) && state.module !== module) commit({ module }, { mode: 'replace' });
}

function notice(kind, message, action, id = undefined) {
    $('#notices').append(
        el(
            'div',
            { id, class: `gm-notice gm-notice--${kind}`, role: kind === 'error' ? 'alert' : 'status' },
            icon(kind === 'warning' ? 'warning' : 'info'),
            el('div', { class: 'gm-notice__body' }, message),
            action
                ? el('button', { type: 'button', class: 'gm-btn gm-btn--sm', onclick: action.onClick }, action.label)
                : null
        )
    );
}
