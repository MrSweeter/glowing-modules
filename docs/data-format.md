# Data format

The app reads one JSON document describing, for every Odoo version, which modules were added (`+`) and
removed (`-`) in each repository **compared to the previous version** (versions sorted oldest → newest:
`5.0 … 11.0, saas-11.1 … saas-11.5, 12.0, …, 20.0, master`).

JSON Schema: [`schema/glowing-modules-diff.schema.json`](../schema/glowing-modules-diff.schema.json).
Validation in the app and scripts: [`src/data/validate.js`](../src/data/validate.js).

## v1 (legacy, still accepted)

The format the checker published before November 2026: a bare object keyed by version.

```json
{
    "17.0": {
        "odoo/odoo": { "+": ["account_peppol", "…"], "-": ["…"] },
        "odoo/enterprise": { "+": ["…"] },
        "odoo/design-themes": {}
    },
    "saas-17.1": { "…": {} }
}
```

## v2 (published by the checker)

The same `versions` object wrapped with metadata, written to the gist by the checker (`src/payload.js` in
`MrSweeter/glowing-modules-checker`). The app accepts both formats. The bundled snapshot
(`public/data/glowing-modules-diff.json`) is written as v2 by `npm run data:pull`.

```json
{
    "meta": {
        "schemaVersion": 2,
        "generatedAt": "2026-11-03T06:00:00Z",
        "source": "https://github.com/…/checker",
        "branches": { "18.0": { "odoo/odoo": "<commit sha>", "odoo/enterprise": "<commit sha>" } }
    },
    "versions": { "17.0": { "odoo/odoo": { "+": ["…"], "-": ["…"] } } }
}
```

| Field | Meaning |
|---|---|
| `meta.generatedAt` | When the checker last published a change (it only writes the gist when the data changed). Shown in the footer as "Data updated …". Without it, the app falls back to the HTTP `Last-Modified` header, then to `meta.pulledAt`. |
| `meta.source` | URL of the checker repository. |
| `meta.branches` | Optional: commit of each repository branch the checker read (`{ version: { "owner/repo": sha } }`), for traceability. Versions the checker has not fetched since this field was added have no entry. |
| `meta.pulledAt`, `meta.sourceSchemaVersion` | Written by `scripts/pull-data.mjs` for the bundled snapshot. |
| `meta.renames` | Reserved for a future rename mapping (`{ "17.0": { "old_name": "new_name" } }`). |

## Rules (checked by the validator)

- Version keys: `X.Y`, `saas-X.Y` or `master`.
- Repository keys: `owner/name`.
- Actions: only `+` and `-`, each an array of module technical names matching `^[A-Za-z0-9_]+$`.
- Invariants of the chain (checked by the regression tests on the real snapshot): replaying the versions in
  order never adds a module that is already present nor removes one that is absent.

## How the app uses it

Replaying the chain rebuilds the exact module set of every version (`src/domain/snapshots.js`). Any
comparison is then a set difference between two versions (`src/domain/compare.js`), which stays correct even
though stable branches receive backports after the next saas branch forks (modules can be added, removed and
re-added along the chain). A module removed from one repository and added to another in the compared range is
reported as **moved**.
