// "Your repositories" section of the Filters drawer: add, refresh and remove custom repositories.
// GitHub is only called on an explicit action (Add or Refresh), never on page load or in the background.

import { MAX_CUSTOM_REPOS } from '../config.js';
import { parseRepoInput } from '../domain/customRepo.js';
import { isOutdated } from '../state/customRepos.js';
import { $, el, formatCount, icon } from './dom.js';

/**
 * @param {{
 *   store: ReturnType<typeof import('../state/customRepos.js').createCustomRepoStore>,
 *   fetchRepository: typeof import('../data/github.js').fetchRepository,
 *   knownVersions: () => string[],
 *   onChange: () => void,
 * }} options
 */
export function createCustomRepos({ store, fetchRepository, knownVersions, onChange }) {
    const form = $('#custom-repo-form');
    const input = /** @type {HTMLInputElement} */ ($('#custom-repo-input'));
    const addButton = /** @type {HTMLButtonElement} */ ($('#custom-repo-add'));
    const status = $('#custom-repo-status');
    const list = $('#custom-repo-list');

    /** id → 'loading' while a fetch runs; id → message after a failed refresh */
    const loading = new Set();
    const errors = new Map();

    function say(message, kind = 'info') {
        status.textContent = message;
        status.dataset.kind = kind;
    }

    async function fetchAndSave(id, cached) {
        const data = await fetchRepository(id, { cached, knownVersions: knownVersions() });
        store.save(data);
        errors.delete(data.id);
        onChange();
        return data;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let id;
        try {
            id = parseRepoInput(input.value);
        } catch (error) {
            say(error.message, 'error');
            return;
        }
        if (store.has(id)) {
            say(`${id} is already in your repositories.`, 'error');
            return;
        }
        if (store.isFull()) {
            say(`You can add up to ${MAX_CUSTOM_REPOS} repositories. Remove one first.`, 'error');
            return;
        }
        addButton.disabled = true;
        say(`Reading ${id} from GitHub…`);
        try {
            const data = await fetchAndSave(id, null);
            input.value = '';
            const { versions, modules } = summary(data);
            say(`Added ${data.id}: ${plural(modules, 'module')} in ${plural(versions, 'version')}.`);
        } catch (error) {
            say(error.message ?? String(error), 'error');
        } finally {
            addButton.disabled = false;
            render();
        }
    });

    async function refresh(id) {
        if (loading.has(id)) return;
        loading.add(id);
        render();
        try {
            await fetchAndSave(id, store.get(id));
            say(`${id} is up to date.`);
        } catch (error) {
            errors.set(id, error.message ?? String(error));
            say(error.message ?? String(error), 'error');
        } finally {
            loading.delete(id);
            render();
        }
    }

    function remove(id) {
        store.remove(id);
        errors.delete(id);
        onChange();
        render();
        say(`Removed ${id}.`);
        input.focus();
    }

    /** Saved repositories whose copy is missing or older than a week (shown to the visitor, not refreshed). */
    function outdated() {
        return store.list().filter((id) => {
            const data = store.get(id);
            return !data || isOutdated(data);
        });
    }

    function render() {
        list.replaceChildren(
            ...store.list().map((id) => {
                const data = store.get(id);
                return el(
                    'li',
                    { class: 'gm-repo-list__item' },
                    el(
                        'div',
                        { class: 'gm-repo-list__text' },
                        el(
                            'a',
                            {
                                class: 'gm-repo-list__name',
                                href: `https://github.com/${id}`,
                                target: '_blank',
                                rel: 'noopener',
                            },
                            id
                        ),
                        el(
                            'span',
                            { class: 'gm-repo-list__meta', dataset: { kind: metaKind(id, data) } },
                            statusLine(id, data)
                        )
                    ),
                    el(
                        'button',
                        {
                            type: 'button',
                            class: 'gm-btn gm-btn--ghost gm-btn--icon gm-btn--sm',
                            'aria-label': `Refresh ${id}`,
                            title: 'Refresh',
                            disabled: loading.has(id),
                            onclick: () => refresh(id),
                        },
                        icon(loading.has(id) ? 'progress_activity' : 'refresh', 'sm')
                    ),
                    el(
                        'button',
                        {
                            type: 'button',
                            class: 'gm-btn gm-btn--ghost gm-btn--icon gm-btn--sm',
                            'aria-label': `Remove ${id}`,
                            title: 'Remove',
                            onclick: () => remove(id),
                        },
                        icon('close', 'sm')
                    )
                );
            })
        );
    }

    function metaKind(id, data) {
        if (errors.has(id)) return 'error';
        if (!loading.has(id) && (!data || isOutdated(data))) return 'warning';
        return 'info';
    }

    function statusLine(id, data) {
        if (loading.has(id)) return 'Loading…';
        if (errors.has(id)) return errors.get(id);
        if (!data) return 'Not loaded: use Refresh to read it from GitHub.';
        const { versions, modules } = summary(data);
        const parts = [plural(versions, 'version'), plural(modules, 'module'), `updated ${ago(data.fetchedAt)}`];
        if (data.ignored) parts.push(`${plural(data.ignored, 'other branch', 'other branches')} ignored`);
        if (Object.values(data.branches).some((b) => b.truncated)) parts.push('very large: may be incomplete');
        if (isOutdated(data)) parts.push('outdated: use Refresh to update');
        return parts.join(' · ');
    }

    return { render, outdated };
}

function plural(n, one, many = `${one}s`) {
    return `${formatCount(n)} ${n === 1 ? one : many}`;
}

function summary(data) {
    const modules = new Set(Object.values(data.branches).flatMap((b) => b.modules));
    return { versions: Object.keys(data.branches).length, modules: modules.size };
}

function ago(iso) {
    const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (!Number.isFinite(minutes)) return 'at an unknown time';
    if (minutes < 60) return format.format(-Math.max(minutes, 0), 'minute');
    if (minutes < 48 * 60) return format.format(-Math.round(minutes / 60), 'hour');
    return format.format(-Math.round(minutes / 1440), 'day');
}
