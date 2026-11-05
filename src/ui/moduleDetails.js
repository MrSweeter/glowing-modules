// Module details drawer: availability, timeline, history, links.

import { availability } from '../domain/history.js';
import { githubUrl } from '../domain/links.js';
import { isMajor } from '../domain/versions.js';
import { $, el, icon } from './dom.js';

/**
 * @param {{ model: import('../domain/snapshots.js').Snapshots, history: Map<string, import('../domain/history.js').HistoryEvent[]>, onClose: () => void }} options
 */
export function createModuleDetails({ model, history, onClose }) {
    const dialog = /** @type {HTMLDialogElement} */ ($('#module-dialog'));
    const body = $('#module-details');
    let opener = null;
    let current = null;

    dialog.addEventListener('click', (e) => {
        if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
    });
    dialog.addEventListener('close', () => {
        onClose();
        // The chip may have been re-rendered meanwhile: fall back to an equivalent one.
        const target = opener?.isConnected
            ? opener
            : document.querySelector(`#results-grid [data-module="${CSS.escape(current ?? '')}"]`);
        target?.focus?.();
    });

    /**
     * @param {string} module
     * @param {{ from?: string, to: string }} selection
     * @param {HTMLElement|null} trigger
     */
    function open(module, selection, trigger = null) {
        const events = history.get(module);
        if (!events) return false;
        opener = trigger;
        current = module;
        $('#module-dialog-title').textContent = module;

        const ranges = availability(model, module);
        const last = ranges.at(-1);
        const latest = model.versions.at(-1);
        const inLatest = last?.to === latest;
        const status = inLatest
            ? `Available in ${latest} (${last.repo}) since ${last.from}.`
            : last
              ? `Not in ${latest}. Last seen in ${last.to} (${last.repo}).`
              : 'Never available.';

        // Link to the selected "to" version when the module exists there, else to its last known version.
        const linkRange = ranges.find((r) => inRange(model.versions, selection.to, r)) ?? last;
        const linkVersion =
            linkRange && inRange(model.versions, selection.to, linkRange) ? selection.to : linkRange?.to;
        const gh = linkRange ? githubUrl(linkRange.repo, linkVersion, module) : null;

        const present = new Set(ranges.flatMap((r) => versionsBetween(model.versions, r.from, r.to)));
        const timeline = el(
            'div',
            { 'aria-hidden': 'true' },
            el(
                'div',
                { class: 'gm-timeline' },
                ...model.versions.map((v) =>
                    el('span', {
                        class: `gm-timeline__cell${isMajor(v) ? ' gm-timeline__cell--major' : ''}${present.has(v) ? ' is-present' : ''}${v === selection.to || v === selection.from ? ' is-selected' : ''}`,
                        title: `${v}: ${present.has(v) ? 'present' : 'absent'}`,
                    })
                )
            ),
            el('div', { class: 'gm-timeline__axis' }, el('span', {}, model.versions[0]), el('span', {}, latest))
        );

        body.replaceChildren(
            el(
                'div',
                { class: 'gm-module' },
                el(
                    'div',
                    { class: 'gm-stack' },
                    el('p', { class: 'gm-module__status' }, status),
                    el(
                        'div',
                        { class: 'gm-cluster' },
                        gh
                            ? el(
                                  'a',
                                  { class: 'gm-btn gm-btn--sm', href: gh.url, target: '_blank', rel: 'noopener' },
                                  icon(gh.private ? 'lock' : 'open_in_new', 'sm'),
                                  `Source on GitHub (${gh.branch})`,
                                  gh.private
                                      ? el(
                                            'span',
                                            { class: 'gm-visually-hidden' },
                                            ', requires access to odoo/enterprise'
                                        )
                                      : null
                              )
                            : null
                    ),
                    gh?.private
                        ? el(
                              'p',
                              { class: 'gm-search__hint' },
                              'odoo/enterprise is private: the GitHub link requires access.'
                          )
                        : null
                ),
                el(
                    'section',
                    {},
                    el('h3', { class: 'gm-module__section-title' }, 'Availability'),
                    timeline,
                    el(
                        'ul',
                        { class: 'gm-module__ranges' },
                        ...ranges.map((r) =>
                            el(
                                'li',
                                {},
                                el('strong', {}, r.from === r.to ? r.from : `${r.from} → ${r.to}`),
                                el('span', { class: 'gm-module__repo' }, r.repo)
                            )
                        )
                    )
                ),
                el(
                    'section',
                    {},
                    el('h3', { class: 'gm-module__section-title' }, 'History'),
                    el(
                        'ul',
                        { class: 'gm-module__events' },
                        ...events.map((e) =>
                            el(
                                'li',
                                {},
                                icon(e.action === '+' ? 'add' : 'remove', 'sm'),
                                el(
                                    'span',
                                    {},
                                    `${e.action === '+' ? 'Added' : 'Removed'} in `,
                                    el('strong', {}, e.version)
                                ),
                                el('span', { class: 'gm-module__repo' }, e.repo)
                            )
                        )
                    )
                )
            )
        );
        if (!dialog.open) dialog.showModal();
        return true;
    }

    function close() {
        if (dialog.open) dialog.close();
    }

    return { open, close, isOpen: () => dialog.open };
}

function versionsBetween(versions, from, to) {
    return versions.slice(versions.indexOf(from), versions.indexOf(to) + 1);
}

function inRange(versions, version, range) {
    const i = versions.indexOf(version);
    return i >= versions.indexOf(range.from) && i <= versions.indexOf(range.to);
}
