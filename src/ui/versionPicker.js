// Version picker dialog (native <dialog>: focus trap, Esc and inert background for free).

import { compareVersions, groupByMajor, isMajor, previousVersion } from '../domain/versions.js';
import { $, el } from './dom.js';
import { setTip } from './tooltip.js';

/**
 * @param {{ sorted: string[], onPick: (end: 'from'|'to', version: string|undefined) => void }} options
 */
export function createVersionPicker({ sorted, onPick }) {
    const dialog = /** @type {HTMLDialogElement} */ ($('#version-dialog'));
    const body = $('#version-picker');
    let opener = null;

    dialog.addEventListener('click', (e) => {
        if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
    });
    dialog.addEventListener('close', () => opener?.focus());

    /**
     * @param {'from'|'to'} end
     * @param {{ from?: string, to: string }} selection
     * @param {Map<string, number>} matchCounts
     * @param {HTMLElement} trigger
     */
    function open(end, selection, matchCounts, trigger) {
        opener = trigger;
        const current = end === 'from' ? selection.from : selection.to;
        $('#version-dialog-title').textContent = end === 'from' ? 'Compare from version' : 'Compare to version';

        const filter = el('input', {
            type: 'search',
            class: 'gm-version-picker__filter',
            placeholder: 'Filter versions (e.g. 17, saas-18)',
            'aria-label': 'Filter versions',
            autocomplete: 'off',
        });
        const groups = groupByMajor(sorted).map(({ major, versions }) =>
            el(
                'div',
                { class: 'gm-version-picker__group', dataset: { group: major } },
                el(
                    'span',
                    { class: 'gm-version-picker__group-label' },
                    major === 'master' ? 'master' : `Odoo ${major.replace('.0', '')}`
                ),
                el(
                    'div',
                    { class: 'gm-version-picker__list' },
                    ...versions.map((v) => {
                        const disabled = end === 'from' ? compareVersions(v, selection.to) >= 0 : false;
                        const count = matchCounts.get(v);
                        const item = el(
                            'button',
                            {
                                type: 'button',
                                class: `gm-version-picker__item${isMajor(v) ? ' gm-version-picker__item--major' : ''}`,
                                dataset: { version: v },
                                'aria-current': v === current ? 'true' : null,
                                disabled,
                                onclick: () => {
                                    dialog.close();
                                    onPick(end, v);
                                },
                            },
                            v,
                            count
                                ? el(
                                      'span',
                                      { class: 'gm-version-picker__badge', 'aria-label': `${count} matches` },
                                      String(count)
                                  )
                                : null
                        );
                        if (count) {
                            const modules = count === 1 ? '1 matching module' : `${count} matching modules`;
                            setTip(item, { text: `${modules} changed in ${v}` });
                        }
                        return item;
                    })
                )
            )
        );
        filter.addEventListener('input', () => {
            const term = filter.value.trim().toLowerCase();
            for (const g of groups) {
                let any = false;
                for (const b of g.querySelectorAll('[data-version]')) {
                    const show = !term || b.dataset.version.toLowerCase().includes(term);
                    b.hidden = !show;
                    any ||= show;
                }
                g.hidden = !any;
            }
        });

        const quick =
            end === 'from'
                ? el(
                      'div',
                      { class: 'gm-version-picker__quick gm-cluster' },
                      el(
                          'button',
                          {
                              type: 'button',
                              class: 'gm-btn gm-btn--sm',
                              onclick: () => {
                                  dialog.close();
                                  onPick('from', previousVersion(sorted, selection.to));
                              },
                          },
                          `Previous version (${previousVersion(sorted, selection.to) ?? 'none'})`
                      ),
                      matchCounts.size
                          ? el(
                                'span',
                                { class: 'gm-search__hint' },
                                'Badges: matching modules changed in that version.'
                            )
                          : null
                  )
                : matchCounts.size
                  ? el(
                        'p',
                        { class: 'gm-version-picker__quick gm-search__hint' },
                        'Badges: matching modules changed in that version.'
                    )
                  : null;

        body.replaceChildren(filter, quick ?? '', ...groups);
        dialog.showModal();
        (body.querySelector('[aria-current="true"]') ?? filter).focus();
    }

    return { open };
}
