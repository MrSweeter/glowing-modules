// Human-readable durations ("1 week and 2 days"). Pure.

const UNITS = [
    ['week', 7 * 24 * 3_600_000],
    ['day', 24 * 3_600_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
];

const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
const unitFormats = new Map(
    UNITS.map(([unit]) => [unit, new Intl.NumberFormat('en', { style: 'unit', unit, unitDisplay: 'long' })])
);

/**
 * @param {number} ms duration in milliseconds
 * @param {number} [maxParts] keep only the largest non-zero units (the remainder is rounded down)
 * @returns {string} e.g. "1 week and 2 days", "1 hour and 30 minutes", "0 seconds"
 */
export function formatDuration(ms, maxParts = 2) {
    let rest = Math.max(0, Math.floor(Number(ms) || 0));
    const parts = [];
    for (const [unit, size] of UNITS) {
        const count = Math.floor(rest / size);
        rest -= count * size;
        if (count) parts.push(unitFormats.get(unit).format(count));
        if (parts.length === maxParts) break;
    }
    return parts.length ? list.format(parts) : unitFormats.get('second').format(0);
}
