import { describe, expect, it } from 'vitest';
import { formatDuration } from '../../src/domain/duration.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatDuration', () => {
    it.each([
        [0, '0 seconds'],
        [-5 * SECOND, '0 seconds'],
        [500, '0 seconds'],
        [SECOND, '1 second'],
        [59 * SECOND, '59 seconds'],
        [90 * MINUTE, '1 hour and 30 minutes'],
        [3 * DAY, '3 days'],
        [7 * DAY, '1 week'],
        [8 * DAY, '1 week and 1 day'],
        [15 * DAY, '2 weeks and 1 day'],
        [8 * DAY + 3 * HOUR, '1 week and 1 day'],
        [DAY + 59 * SECOND, '1 day and 59 seconds'],
    ])('%d ms → %s', (ms, expected) => {
        expect(formatDuration(ms)).toBe(expected);
    });

    it('can keep more units', () => {
        expect(formatDuration(8 * DAY + 3 * HOUR, 3)).toBe('1 week, 1 day, and 3 hours');
    });
});
