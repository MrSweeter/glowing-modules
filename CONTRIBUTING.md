# Contributing

Thanks for helping! Bug reports, data issues and suggestions are the most useful contributions:
use the [issue forms](https://github.com/MrSweeter/glowing-modules/issues/new/choose).

> **Licensing:** the project is currently not licensed for reuse (all rights reserved). Code contributions are
> welcome, but please open an issue first. By submitting a pull request you agree that the maintainer may
> relicense your contribution if the project adopts a license later.

## Setup

See [README → Development](README.md#development). In short: Node.js 24, `npm ci`, `npm run dev`.

## Workflow

1. Branch from `master`: `fix/short-description`, `imp/…`, `add/…`.
2. Make your change with tests:
   - domain logic (`src/domain`, `src/state`, `src/data`): unit tests in `tests/unit/`;
   - user-facing behaviour: Playwright tests in `tests/e2e/` (they run on the production build with stubbed data).
3. Run `npm run lint`, `npm test` and `npm run test:e2e` (`PW_WEBKIT=0` if WebKit is not installed).
4. Open a PR. CI runs lint, unit tests and the build (the Playwright tests are not run in CI).

## Commit messages

Odoo-style tags, as in the existing history:

```
[TAG] scope: short summary

Optional body explaining why.
```

| Tag | Use for |
|---|---|
| `[FIX]` | bug fixes |
| `[IMP]` | improvements of existing behaviour, dependency updates |
| `[ADD]` | new features or files |
| `[REF]` | refactoring, tooling, formatting |
| `[REM]` | removals |

Example: `[FIX] compare: ignore modules added and removed inside the range`.

## Code style

Start with [docs/architecture.md](docs/architecture.md): module layers, dependency rule and tooling overview.

- Formatting and linting: Biome (JS/JSON/HTML), Prettier + Stylelint (SCSS). `npm run format` fixes most issues.
- Never insert data with `innerHTML`: use the `el()` helper from `src/ui/dom.js` (text nodes only).
- SCSS: BEM classes with the `gm-` prefix, colours only through `color('token')` / `var(--gm-…)`, keep text
  contrast ≥ 4.5:1 in both themes (ratios are noted in `src/styles/abstracts/_tokens.scss`).
- New icons: add the name to `scripts/fetch-icons.mjs`, run `npm run icons:fetch`, commit the font.

## Data

The app reads the gist at runtime. `public/data/glowing-modules-diff.json` is a committed copy refreshed by a
weekly workflow. If a refresh changes the counts checked in `tests/unit/compare.test.js`, re-baseline them
in the refresh PR after checking the differences.

## Releases

1. Bump `version` in `package.json`.
2. Merge to `master` (this deploys), then tag `vX.Y.Z` and create a GitHub release describing the changes.
