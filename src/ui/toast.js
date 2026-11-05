import { $, icon } from './dom.js';

let timer;

/** Short status message ("Copied"). Announced through role=status. */
export function toast(message, iconName = 'check') {
    const node = $('#toast');
    node.replaceChildren(icon(iconName, 'sm'), message);
    node.classList.add('is-visible');
    clearTimeout(timer);
    timer = setTimeout(() => node.classList.remove('is-visible'), 2200);
}
