// Results: summary line, mobile tabs, added / removed / moved columns.

import { matchRanges } from '../domain/search.js';
import { stats } from '../domain/snapshots.js';
import { $, el, formatCount, highlighted, icon } from './dom.js';
import { setTip } from './tooltip.js';

const COLUMNS = {
    added: {
        title: 'added',
        icon: 'add',
        empty: 'No module added',
        note: (v) =>
            `Behold the newcomers: Odoo ${v.to} rolls out the red carpet for these modules, absent from Odoo ${v.from ?? 'the start'}.`,
    },
    removed: {
        title: 'removed',
        icon: 'remove',
        empty: 'No module removed',
        note: (v) =>
            `Uh-oh! These modules pulled a disappearing act: present in Odoo ${v.from ?? 'the start'}, gone in Odoo ${v.to}. Did they join a secret module society?`,
    },
    moved: {
        title: 'moved',
        icon: 'sync_alt',
        empty: '',
        note: () => 'Same module name, different repository (e.g. moved from Community to Enterprise).',
    },
};

/**
 * @param {import('../state/view.js').View} view
 * @param {{ model: import('../domain/snapshots.js').Snapshots, tab: string, onTab: (t: string) => void }} ctx
 */
export function renderResults(view, { model, tab, onTab }) {
    renderSummary(view, model);
    const kinds = [...(view.moved.total ? ['moved'] : []), 'added', 'removed'];
    const activeTab = kinds.includes(tab) ? tab : 'added';
    renderTabs(view, kinds, activeTab, onTab);
    const grid = $('#results-grid');
    grid.dataset.tab = activeTab;
    grid.replaceChildren(...kinds.map((kind) => renderColumn(view, kind)));
}

function renderSummary(view, model) {
    const to = stats(model, view.to);
    const parts = [
        el('strong', {}, view.from ? `${view.from} → ${view.to}` : `Up to ${view.to}`),
        ` · Odoo ${view.to} has ${formatCount(to.total)} modules · `,
        countText(view.added, '+'),
        ' / ',
        countText(view.removed, '−'),
    ];
    if (view.moved.total) parts.push(' / ', countText(view.moved, '⇄'));
    if (view.query.active) parts.push(' (filtered)');
    if (view.unknown?.length) parts.push(' · ', unknownText(view.unknown));
    $('#summary').replaceChildren(...parts);
}

/** Repositories left out of the comparison: no branch for one of the two versions, so their state is unknown. */
function unknownText(unknown) {
    const list = unknown.map((u) => `${u.repo} (no ${u.versions.join(' / ')} branch)`).join(', ');
    const note = el('span', { class: 'gm-results__unknown' }, `Not compared: ${list}`);
    setTip(note, {
        text: 'These repositories have no branch for this version: their modules there are unknown.',
    });
    return note;
}

function countText(column, sign) {
    const label = column === undefined ? '' : `${sign}${formatCount(column.visible)}`;
    return el('span', { class: 'gm-results__count' }, label);
}

function renderTabs(view, kinds, active, onTab) {
    const tabs = $('#result-tabs');
    tabs.replaceChildren(
        ...kinds.map((kind) =>
            el(
                'button',
                {
                    type: 'button',
                    role: 'tab',
                    class: 'gm-tabs__tab',
                    id: `tab-${kind}`,
                    'aria-selected': String(kind === active),
                    'aria-controls': `col-${kind}`,
                    tabindex: kind === active ? '0' : '-1',
                    onclick: () => onTab(kind),
                    onkeydown: (e) => {
                        const i = kinds.indexOf(kind);
                        const next =
                            e.key === 'ArrowRight'
                                ? kinds[(i + 1) % kinds.length]
                                : e.key === 'ArrowLeft'
                                  ? kinds.at(i - 1)
                                  : null;
                        if (next) {
                            onTab(next);
                            requestAnimationFrame(() => $(`#tab-${next}`)?.focus());
                        }
                    },
                },
                `${kind[0].toUpperCase()}${kind.slice(1)} (${formatCount(view[kind].visible)})`
            )
        )
    );
}

function renderColumn(view, kind) {
    const meta = COLUMNS[kind];
    const column = view[kind];
    const heading = el(
        'h2',
        { class: `gm-results__heading gm-results__heading--${kind}`, id: `col-${kind}-title` },
        icon(meta.icon),
        el(
            'span',
            {},
            el('span', { class: 'gm-results__count' }, formatCount(column.visible)),
            view.query.active && column.visible !== column.total ? ` of ${formatCount(column.total)}` : '',
            ` ${kind === 'moved' ? 'moved' : meta.title}`
        )
    );
    const section = el(
        'section',
        {
            class: `gm-results__col gm-results__col--${kind}`,
            id: `col-${kind}`,
            dataset: { column: kind },
            role: 'tabpanel',
            'aria-labelledby': `col-${kind}-title`,
        },
        heading,
        el('p', { class: 'gm-results__note' }, meta.note(view))
    );

    if (kind === 'moved') {
        section.append(renderMoved(view));
        return section;
    }
    const groups = column.groups.filter((g) => g.modules.length);
    if (!groups.length) {
        section.append(emptyState(view, meta.empty, column.total));
        return section;
    }
    const uniqueOwner = new Set(groups.map((g) => g.repo.split('/')[0])).size === 1;
    for (const g of groups) {
        const name = uniqueOwner ? g.repo.split('/')[1] : g.repo;
        section.append(
            el(
                'details',
                { class: 'gm-repo-group', open: true },
                el(
                    'summary',
                    { class: 'gm-repo-group__summary' },
                    icon('expand_more', 'sm'),
                    name,
                    el(
                        'span',
                        { class: 'gm-repo-group__count' },
                        view.query.active && g.modules.length !== g.total
                            ? `${g.modules.length} of ${g.total}`
                            : String(g.total)
                    )
                ),
                el(
                    'ul',
                    { class: 'gm-chip-list', 'aria-label': `${meta.title} in ${name}` },
                    ...g.modules.map((m) => el('li', {}, chip(m, g.repo, kind, view.query)))
                )
            )
        );
    }
    return section;
}

function renderMoved(view) {
    if (!view.moved.items.length) return emptyState(view, 'No module moved', view.moved.total);
    return el(
        'ul',
        { class: 'gm-moved-list', 'aria-label': 'Modules moved between repositories' },
        ...view.moved.items.map((mv) =>
            el(
                'li',
                { class: 'gm-moved-list__item' },
                chip(mv.module, mv.toRepo, 'moved', view.query),
                el('span', { class: 'gm-moved-list__repos' }, `${mv.fromRepo} → ${mv.toRepo}`)
            )
        )
    );
}

function chip(module, repo, kind, query) {
    return el(
        'button',
        {
            type: 'button',
            class: `gm-chip gm-chip--${kind}`,
            dataset: { module, repo },
            title: `${module} (${repo}): show details`,
        },
        icon(COLUMNS[kind].icon, 'sm'),
        el('span', { class: 'gm-chip__label' }, highlighted(module, matchRanges(query, module)))
    );
}

function emptyState(view, message, total) {
    const filtered = view.query.active && total > 0;
    return el(
        'div',
        { class: 'gm-empty' },
        icon(filtered ? 'search' : 'check'),
        el(
            'p',
            {},
            filtered ? `No module matches your search (${formatCount(total)} hidden by the filter).` : `${message}.`
        ),
        filtered
            ? el(
                  'button',
                  { type: 'button', class: 'gm-btn gm-btn--sm', dataset: { action: 'clear-search' } },
                  'Clear search'
              )
            : null
    );
}
