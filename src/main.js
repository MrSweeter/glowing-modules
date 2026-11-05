// Glowing Modules: bootstrap. Loads data, owns the store, wires UI events, keeps the URL in sync.

import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import './styles/main.scss';

import { REMOTE_DATA_PAGE } from './config.js';
import { loadData, resolveSource } from './data/source.js';
import { exportFileName, toCsv, toJson, toMarkdown, toNames } from './domain/export.js';
import { buildHistory } from './domain/history.js';
import { parseQuery, toggleToken } from './domain/search.js';
import { buildSnapshots } from './domain/snapshots.js';
import { initialSelection, normalize, setFrom, setTo } from './state/selection.js';
import { createStore } from './state/store.js';
import { readUrl, writeUrl } from './state/url.js';
import { buildView, changeCountsByVersion, exportRows } from './state/view.js';
import {
    effectiveTheme,
    renderAppVersion,
    renderControls,
    renderDataInfo,
    renderRepoChips,
    renderThemeToggle,
} from './ui/controls.js';
import { $, copyText, debounce, download, el, icon, storage } from './ui/dom.js';
import { createModuleDetails } from './ui/moduleDetails.js';
import { renderResults } from './ui/results.js';
import { toast } from './ui/toast.js';
import { createVersionPicker } from './ui/versionPicker.js';

const store = createStore({
    from: undefined,
    to: '',
    query: '',
    showTests: false,
    module: null,
    tab: 'added',
});

/** Immutable after load. */
let data = null; // { model, history, sorted }

renderAppVersion();
renderThemeToggle();
$('#theme-toggle').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    storage.set('gm.theme', next);
    renderThemeToggle();
});

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
    const model = buildSnapshots(payload.versions);
    data = { model, history: buildHistory(payload.versions), sorted: model.versions };

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

    const { state: initial, warnings } = stateFromUrl(location.search, { useStoredPrefs: true });
    for (const w of warnings) notice('warning', `${w} Showing the default comparison instead.`);
    store.set(initial);
    history.replaceState(null, '', urlFor(store.get()));

    renderRepoChips(model.repos, (token) =>
        commit({ query: toggleToken(store.get().query, token) }, { mode: 'replace' })
    );
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

function stateFromUrl(search, { useStoredPrefs }) {
    const params = new URLSearchParams(search);
    const { patch, warnings } = readUrl(search, data.sorted);
    const showTests = params.has('tests') || !useStoredPrefs ? patch.showTests : storage.get('gm.showTests') === '1';
    const selection = patch.to
        ? normalize(data.sorted, { from: patch.from, to: patch.to })
        : initialSelection(data.sorted);
    const module = patch.module && data.history.has(patch.module) ? patch.module : null;
    if (patch.module && !module) warnings.push(`Module "${patch.module}" does not exist.`);
    return { state: { ...selection, query: patch.query, showTests, module }, warnings };
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
    if ('showTests' in patch) storage.set('gm.showTests', state.showTests ? '1' : null);
    if (mode === 'push') {
        const url = urlFor(state);
        if (url !== `${location.pathname}${location.search}${location.hash}`) history.pushState(null, '', url);
    } else if (mode === 'replace') {
        replaceUrlSoon();
    }
}

addEventListener('popstate', () => {
    if (!data) return;
    const { state } = stateFromUrl(location.search, { useStoredPrefs: false });
    store.set(state);
    if (state.module) openModule(state.module, null);
    else details?.close();
});

// ─── Rendering ──────────────────────────────────────────────────────────────────────────────────

let lastView = null;

function render(state) {
    const view = buildView({
        model: data.model,
        from: state.from,
        to: state.to,
        query: state.query,
        showTests: state.showTests,
    });
    lastView = view;
    renderControls(state, { view });
    renderResults(view, { model: data.model, tab: state.tab, onTab: (tab) => store.set({ tab }) });
    document.title = `${state.from ? `${state.from} → ` : ''}${state.to} · Glowing Modules`;
}

// ─── Events ─────────────────────────────────────────────────────────────────────────────────────

let picker = null;
let details = null;

function bindEvents() {
    picker = createVersionPicker({
        sorted: data.sorted,
        onPick: (end, version) => {
            const state = store.get();
            const next = end === 'to' ? setTo(data.sorted, state, version) : setFrom(data.sorted, state, version);
            commit(next);
        },
    });
    details = createModuleDetails({
        model: data.model,
        history: data.history,
        onClose: () => {
            if (store.get().module) commit({ module: null }, { mode: 'replace' });
        },
    });

    const openPicker = (end) => (e) => {
        const state = store.get();
        picker.open(
            end,
            state,
            changeCountsByVersion(data.history, parseQuery(state.query), state.showTests),
            e.currentTarget
        );
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
    $('#show-tests').addEventListener('change', (e) => commit({ showTests: e.target.checked }, { mode: 'replace' }));

    $('#results-grid').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-module]');
        if (chip) {
            openModule(chip.dataset.module, chip);
            return;
        }
        if (e.target.closest('[data-action="clear-search"]')) clearSearch();
    });

    $('#copy-link').addEventListener('click', async () => {
        toast((await copyText(location.href)) ? 'Link copied' : 'Could not copy the link', 'link');
    });

    $('#export-menu').addEventListener('click', (e) => {
        const button = e.target.closest('[data-export]');
        if (button) exportVisible(button.dataset.export);
    });
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

async function exportVisible(format) {
    $('#export-menu').hidePopover();
    const state = store.get();
    const rows = exportRows(lastView);
    if (!rows.length) {
        toast('Nothing to export', 'info');
        return;
    }
    const context = {
        from: lastView.from ?? null,
        to: lastView.to,
        query: state.query,
        showTests: state.showTests,
        url: location.href,
    };
    const copy = async (text, what) =>
        toast((await copyText(text)) ? `${rows.length} modules copied as ${what}` : 'Copy failed', 'content_copy');
    if (format === 'text') await copy(toNames(rows), 'names');
    else if (format === 'csv-copy') await copy(toCsv(rows), 'CSV');
    else if (format === 'markdown') await copy(toMarkdown(rows), 'Markdown');
    else if (format === 'csv') download(exportFileName(lastView.from, lastView.to, 'csv'), toCsv(rows), 'text/csv');
    else if (format === 'json')
        download(exportFileName(lastView.from, lastView.to, 'json'), toJson(rows, context), 'application/json');
}

function notice(kind, message, action) {
    $('#notices').append(
        el(
            'div',
            { class: `gm-notice gm-notice--${kind}`, role: kind === 'error' ? 'alert' : 'status' },
            icon(kind === 'warning' ? 'warning' : 'info'),
            el('div', { class: 'gm-notice__body' }, message),
            action
                ? el('button', { type: 'button', class: 'gm-btn gm-btn--sm', onclick: action.onClick }, action.label)
                : null
        )
    );
}
