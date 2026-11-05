// DOM helpers. Text is always inserted as text nodes: data never goes through innerHTML.

/**
 * Create an element.
 * @param {string} tag
 * @param {Record<string, any>} [attrs] `class`, `dataset`, `on<event>` handlers, boolean/ARIA attributes…
 * @param {...(Node|string|number|null|undefined|false)} children
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else if (key === 'hidden') node.hidden = Boolean(value);
        else node.setAttribute(key, value === true ? '' : String(value));
    }
    append(node, children);
    return node;
}

function append(node, children) {
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
}

/** Material Symbols icon (decorative). */
export function icon(name, modifier = '') {
    return el('span', { class: `gm-icon${modifier ? ` gm-icon--${modifier}` : ''}`, 'aria-hidden': 'true' }, name);
}

/** Text with highlighted ranges ([start, end) pairs) as <mark>. */
export function highlighted(text, ranges) {
    if (!ranges.length) return document.createTextNode(text);
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const [start, end] of ranges) {
        if (start > cursor) fragment.append(text.slice(cursor, start));
        fragment.append(el('mark', {}, text.slice(start, end)));
        cursor = end;
    }
    if (cursor < text.length) fragment.append(text.slice(cursor));
    return fragment;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Format an integer with thin grouping (1 412). */
export const formatCount = (n) => new Intl.NumberFormat('en-US').format(n);

/** Debounce. */
export function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

/** localStorage access that never throws. */
export const storage = {
    get(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        } catch {
            // storage unavailable (private mode, blocked): ignore
        }
    },
};
