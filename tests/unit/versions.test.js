import { describe, expect, it } from 'vitest';
import {
    compareVersions,
    defaultSelection,
    groupByMajor,
    isMajor,
    latestMajor,
    previousVersion,
    sortVersions,
    versionKey,
} from '../../src/domain/versions.js';

const ALL = ['saas-11.1', 'master', '5.0', '11.0', '10.0', 'saas-17.4', '17.0', '18.0', 'saas-17.1', 'saas-11.10'];

describe('versions', () => {
    it('sorts majors, saas and master', () => {
        expect(sortVersions(ALL)).toEqual([
            '5.0',
            '10.0',
            '11.0',
            'saas-11.1',
            'saas-11.10',
            '17.0',
            'saas-17.1',
            'saas-17.4',
            '18.0',
            'master',
        ]);
    });

    it('uses integer parts (saas-11.10 after saas-11.9)', () => {
        expect(compareVersions('saas-11.10', 'saas-11.9')).toBeGreaterThan(0);
        expect(versionKey('master')[0]).toBe(Number.POSITIVE_INFINITY);
    });

    it('detects majors', () => {
        expect(isMajor('17.0')).toBe(true);
        expect(isMajor('saas-17.1')).toBe(false);
        expect(isMajor('master')).toBe(false);
    });

    it('finds the previous version', () => {
        const sorted = sortVersions(ALL);
        expect(previousVersion(sorted, '18.0')).toBe('saas-17.4');
        expect(previousVersion(sorted, '5.0')).toBeUndefined();
        expect(previousVersion(sorted, 'nope')).toBeUndefined();
    });

    it('defaults to latest major vs previous major', () => {
        const sorted = sortVersions(ALL);
        expect(latestMajor(sorted)).toBe('18.0');
        expect(defaultSelection(sorted)).toEqual({ from: '17.0', to: '18.0' });
        expect(defaultSelection(['saas-1.1', 'master'])).toEqual({ from: 'saas-1.1', to: 'master' });
    });

    it('groups by major, newest first', () => {
        const groups = groupByMajor(sortVersions(['17.0', 'saas-17.1', '18.0', 'master']));
        expect(groups).toEqual([
            { major: 'master', versions: ['master'] },
            { major: '18.0', versions: ['18.0'] },
            { major: '17.0', versions: ['17.0', 'saas-17.1'] },
        ]);
    });
});
