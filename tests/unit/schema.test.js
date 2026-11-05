import { existsSync, readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { normalizePayload } from '../../src/data/validate.js';
import { sortVersions } from '../../src/domain/versions.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const schema = read('../../schema/glowing-modules-diff.schema.json');
const validate = new Ajv2020({ allErrors: true, validateFormats: false }).compile(schema);

const SNAPSHOT = new URL('../../public/data/glowing-modules-diff.json', import.meta.url);
const hasSnapshot = existsSync(SNAPSHOT);

describe('JSON schema', () => {
    it('accepts the fixtures (v1)', () => {
        expect(validate(read('../fixtures/diff-edge-cases.json')), JSON.stringify(validate.errors)).toBe(true);
    });

    it('rejects invalid module names like the app validator', () => {
        expect(validate(read('../fixtures/diff-xss.json'))).toBe(false);
        expect(() => normalizePayload(read('../fixtures/diff-xss.json'))).toThrow();
    });

    it.skipIf(!hasSnapshot)('accepts the bundled snapshot (v2)', () => {
        expect(validate(read('../../public/data/glowing-modules-diff.json')), JSON.stringify(validate.errors)).toBe(
            true
        );
    });
});

describe.skipIf(!hasSnapshot)('chain invariants (bundled snapshot)', () => {
    it('never re-adds a present module nor removes an absent one', () => {
        const { versions } = read('../../public/data/glowing-modules-diff.json');
        const current = new Map();
        const problems = [];
        for (const version of sortVersions(Object.keys(versions))) {
            for (const [repo, content] of Object.entries(versions[version])) {
                const set = current.get(repo) ?? new Set();
                for (const m of content['+'] ?? []) {
                    if (set.has(m)) problems.push(`${version} ${repo} re-adds ${m}`);
                    set.add(m);
                }
                for (const m of content['-'] ?? []) {
                    if (!set.has(m)) problems.push(`${version} ${repo} removes absent ${m}`);
                    set.delete(m);
                }
                current.set(repo, set);
            }
        }
        expect(problems).toEqual([]);
    });
});
