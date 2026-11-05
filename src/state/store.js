// Minimal observable store.

/**
 * @template T
 * @param {T} initial
 */
export function createStore(initial) {
    let state = initial;
    const listeners = new Set();
    return {
        /** @returns {T} */
        get: () => state,
        /** @param {Partial<T> | ((s: T) => Partial<T>)} patch */
        set(patch) {
            const next = typeof patch === 'function' ? patch(state) : patch;
            const prev = state;
            state = { ...state, ...next };
            for (const listener of listeners) listener(state, prev);
        },
        /** @param {(state: T, prev: T) => void} listener */
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
