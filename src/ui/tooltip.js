// Styled tooltips for elements whose hint is more than a word or two (short ones keep a native `title`).
//
// An element opts in with data attributes, set through setTip(): `data-tip` (main text), `data-tip-code` (shown as
// code) and `data-tip-hint` (muted last line), plus an optional list of code + text rows. One shared [popover]
// element shows them on mouse hover and keyboard focus; it lives in the top layer, so it is not clipped by dialogs.
// A `data-tip-toggle` element (a help button) also opens its tooltip on click / tap and keeps it open until the next
// click, Escape or a click elsewhere: that is the only way to reach it on touch screens. Screen readers get the same
// text through `aria-description`.

import { el } from './dom.js';

const SHOW_DELAY_MS = 250;
/** Hovering another target within this delay after a tooltip closed shows the next one at once. */
const SWITCH_WINDOW_MS = 300;
const GAP = 8;
const MARGIN = 8;

let tip = null;
let current = null;
let timer = 0;
let hiddenAt = 0;
/** Opened by a click on a `data-tip-toggle` target: stays open when the pointer leaves. */
let pinned = false;
/** @type {WeakMap<HTMLElement, TipItem[]>} */
const itemsOf = new WeakMap();

/** @typedef {{ code: string, text: string }} TipItem */

/**
 * Set (or update) the tooltip of `node`.
 * @param {HTMLElement} node
 * @param {{ text?: string|null, code?: string|null, hint?: string|null, items?: TipItem[]|null, toggle?: boolean }} content
 *   `items`: code + text rows after the main text; `toggle`: a click / tap opens the tooltip and keeps it open
 */
export function setTip(node, { text = null, code = null, hint = null, items = null, toggle = false }) {
    node.dataset.tip = text ?? '';
    for (const [key, value] of [
        ['tipCode', code],
        ['tipHint', hint],
    ]) {
        if (value) node.dataset[key] = value;
        else delete node.dataset[key];
    }
    if (toggle) node.dataset.tipToggle = '';
    else delete node.dataset.tipToggle;
    if (items?.length) itemsOf.set(node, items);
    else itemsOf.delete(node);
    const rows = (items ?? []).map((item) => `${item.code}: ${item.text}`);
    const parts = [text, code, ...rows, hint].filter(Boolean).map((p) => (/[.!?)]$/.test(p) ? p : `${p}.`));
    node.setAttribute('aria-description', parts.join(' '));
    if (node === current) render(node);
}

/** Create the shared tooltip and listen for hover / focus (once, at startup). */
export function initTooltips() {
    tip = el('div', { id: 'gm-tooltip', class: 'gm-tooltip', role: 'tooltip', popover: 'manual' });
    document.body.append(tip);

    document.addEventListener('pointerover', (e) => {
        if (e.pointerType !== 'mouse') return;
        const target = targetOf(e.target);
        if (!target || target === current) return;
        clearTimeout(timer);
        if (current || performance.now() - hiddenAt < SWITCH_WINDOW_MS) show(target);
        else timer = setTimeout(() => show(target), SHOW_DELAY_MS);
    });
    document.addEventListener('pointerout', (e) => {
        const target = targetOf(e.target);
        if (!target || target.contains(/** @type {Node} */ (e.relatedTarget))) return;
        clearTimeout(timer);
        if (target === current && !pinned) hide();
    });
    document.addEventListener('focusin', (e) => {
        const target = targetOf(e.target);
        if (target?.matches(':focus-visible')) show(target);
    });
    document.addEventListener('focusout', (e) => {
        if (targetOf(e.target) === current) hide();
    });
    document.addEventListener('click', (e) => {
        const target = targetOf(e.target);
        clearTimeout(timer);
        if (target && 'tipToggle' in target.dataset) {
            // A help button: open and keep open, or close on the second click.
            if (target === current && pinned) hide();
            else {
                show(target);
                pinned = true;
            }
        } else if (target || pinned) {
            // A click changes the state (and so the hint): hide until the next hover. A click elsewhere closes a
            // pinned tooltip.
            hide();
        }
    });
    document.addEventListener('keydown', (e) => e.key === 'Escape' && hide());
    document.addEventListener('scroll', () => hide(), { capture: true, passive: true });
    document.addEventListener('close', () => hide(), true); // a dialog closed (does not bubble: capture)
    addEventListener('resize', () => hide());
}

function targetOf(node) {
    return node instanceof Element ? /** @type {HTMLElement|null} */ (node.closest('[data-tip]')) : null;
}

function show(target) {
    if (!tip || !target.isConnected) return;
    // Inside a modal dialog, the rest of the page is inert: keep the tooltip in the same dialog.
    const host = target.closest('dialog[open]') ?? document.body;
    if (tip.parentElement !== host) {
        if (tip.matches(':popover-open')) tip.hidePopover();
        host.append(tip);
    }
    current = target;
    pinned = false;
    render(target);
    if (!tip.matches(':popover-open')) tip.showPopover();
    place(target);
}

function hide() {
    if (!current) return;
    current = null;
    pinned = false;
    hiddenAt = performance.now();
    if (tip?.matches(':popover-open')) tip.hidePopover();
}

function render(target) {
    const { tip: text, tipCode: code, tipHint: hint } = target.dataset;
    const items = itemsOf.get(target);
    tip.classList.toggle('gm-tooltip--wide', Boolean(items));
    tip.replaceChildren(
        ...[
            text ? el('span', { class: 'gm-tooltip__text' }, text) : null,
            code ? el('code', { class: 'gm-tooltip__code' }, code) : null,
            items
                ? el(
                      'ul',
                      { class: 'gm-tooltip__list' },
                      items.map((item) =>
                          el('li', {}, el('code', { class: 'gm-tooltip__code' }, item.code), ` ${item.text}`)
                      )
                  )
                : null,
            hint ? el('span', { class: 'gm-tooltip__hint' }, hint) : null,
        ].filter(Boolean)
    );
}

/** Above the target (below when there is no room), centred, kept inside the viewport. */
function place(target) {
    const r = target.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    let side = 'top';
    let top = r.top - GAP - t.height;
    if (top < MARGIN) {
        side = 'bottom';
        top = r.bottom + GAP;
    }
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(center - t.width / 2, MARGIN), width - MARGIN - t.width);
    tip.dataset.side = side;
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.setProperty('--gm-tip-arrow-x', `${Math.round(center - left)}px`);
}
