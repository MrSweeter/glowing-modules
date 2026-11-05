# Architecture

Glowing Modules is a static page. What the browser downloads is `index.html`, one JavaScript bundle (vanilla
JS, no framework), one CSS file, fonts, icons, and at runtime one JSON file. Everything else in this
repository (Vite, Sass, linters, tests, scripts, workflows) is development and CI tooling that never reaches
users. Only **Vite** and **Sass** are needed to produce the page; the rest are guard rails.

## Runtime

### Modules

```
index.html              page shell: header, search bar, results grid, dialogs
src/main.js             bootstrap: loads data, owns the store, binds events, keeps the URL in sync
src/config.js           constants (data URLs, site URL, fetch timeout); plain ESM, also used by scripts/

src/data/               where the data comes from
  source.js             resolveSource (gist / local snapshot / custom), loadData (timeout, retry, fallback)
  validate.js           normalizePayload: accepts the v1 and v2 formats, rejects bad data (DataFormatError)

src/domain/             pure functions, no DOM, no state: the logic that is unit-tested
  versions.js           sort and classify versions (5.0 … saas-x … master), default selection
  snapshots.js          buildSnapshots: replay the diff chain into the full module set of every version
  compare.js            compare(from, to): set difference of two snapshots, plus modules moved between repos
  history.js            buildHistory: per-module timeline; availability ranges; isTestModule
  search.js             parseQuery (text, owner:, repository:), matching, highlight ranges, chip tokens
  links.js              GitHub URL of a module at a version

src/state/              application state
  store.js              20-line observable store
  selection.js          from/to rules (defaults, swap when reversed)
  url.js                state ⇄ query string (deep links)
  view.js               buildView: domain + state → what to render; per-version match counts

src/ui/                 DOM rendering, built with text nodes only (never innerHTML)
  dom.js                el(), $, icon(), debounce, storage
  controls.js           header controls, repository chips, data info, app version
  results.js            added / removed / moved lists
  versionPicker.js      version dialog
  moduleDetails.js      module dialog (history, availability, links)
```

Dependency rule (checked by reading the imports, not enforced by a tool):

```
            main.js  (the only module that knows every layer)
         ┌─────┼────────────┬──────────┐
       data/  state/ ──▶ domain/ ◀── ui/
         │
      config.js
```

- `domain/` imports nothing outside `domain/`.
- `data/` imports only `config.js`.
- `state/` and `ui/` import from `domain/`, never from each other.

### Flow

1. **Load.** `main.js` calls `resolveSource` then `loadData`. In production that means the gist, with
   `public/data/glowing-modules-diff.json` (the snapshot bundled with the release) as fallback. In development
   it uses the local snapshot (see `.env.development` and `?data=`).
2. **Precompute once.** `buildSnapshots` and `buildHistory` run on the loaded data; the result never changes.
3. **Initial state.** `readUrl` and `selection.js` turn the URL into
   `{ from, to, query, showTests, module, tab }`, which goes into the store.
4. **Render.** `render(state)` calls `buildView`, then `renderControls` and `renderResults`.
5. **User actions.** Every action calls `commit(patch)`: update the store, then `pushState` (version changes)
   or a debounced `replaceState` (search, toggles). The store subscription re-renders.
6. **Back/forward.** `popstate` reads the URL again and replaces the state.

### Why snapshots

The data is a chain of per-version diffs (see [data-format.md](data-format.md)). The previous `index.js`
compared two versions by adding up the raw `+`/`-` lists step by step. That gave wrong results:

- A module added, removed and re-added inside a range was counted wrongly (e.g. `17.0 → 18.0` showed
  +335 / −80 instead of +227 / −76).
- The LTS filter skipped the saas diffs.

The new code replays the chain **once** into the full module set of every version
([snapshots.js](../src/domain/snapshots.js)). Comparing any two versions is then a plain set difference
([compare.js](../src/domain/compare.js)), and hiding versions in the picker cannot lose a step.

### Styles

Custom SCSS, no CSS framework, compiled into one CSS file. Entry point: `src/styles/main.scss`.

- `abstracts/`: tokens, functions and mixins; produce no CSS on their own.
- `base/` → `layout/` → `components/` → `utilities/`, in that order.
- Classes follow BEM with a `gm-` prefix (`gm-block__element--modifier`); states use `is-*`.
- Colours are CSS custom properties (`--gm-*`), redefined for the light and dark themes.
- Fonts are self-hosted: Poppins comes from `@fontsource`, the icons are a committed subset of
  Material Symbols in `src/assets/fonts/`.

## Tooling

| Tool | What it brings | Used where | When it runs | Needed for the page? |
|---|---|---|---|---|
| **Vite** | Dev server with live reload; bundles and minifies with hashed file names; injects the version, commit and build date; chooses the data source per environment | `vite.config.js` (also adds a CSP meta tag and `sitemap.xml`) | dev, build, CI | **yes** |
| **Sass** | Compiles SCSS (partials, mixins, functions) into CSS | `src/styles/` | through Vite | **yes**, as long as styles are SCSS |
| **Biome** | Formats and lints JS, JSON and HTML | `biome.json` | `npm run lint` / `format`, CI | no |
| **Prettier** | Formats SCSS, which Biome cannot read | `.prettierrc.json` | `npm run format`, CI | no |
| **Stylelint** | Lints SCSS: invalid properties, duplicates, plus the `gm-` BEM naming rule | `.stylelintrc.json` | `npm run lint`, CI | no |
| **Vitest** | Unit tests and coverage (≥ 90 % lines on `src/domain/`) | `tests/unit/` | `npm test`, CI | no |
| **Playwright** | Drives real browsers (Chromium, mobile emulation, WebKit) against the production build: the user flows, fallbacks, filters, theme | `tests/e2e/`, `playwright.config.js` | `npm run test:e2e` (local only) | no |
| **axe** | Accessibility audit (WCAG 2.2 AA) inside the Playwright tests, light and dark themes | `tests/e2e/a11y.spec.js` | with Playwright | no |
| **ajv** | Validates JSON against the JSON Schema of the data format | `tests/unit/schema.test.js` | `npm test`, CI | no |
| **sharp** | Resizes and converts images | `scripts/build-assets.mjs` | one-off, when the artwork in `design/` changes | no |

### Scripts

| Script | Command | Purpose |
|---|---|---|
| `scripts/pull-data.mjs` | `npm run data:pull` (also before `npm run dev` if the snapshot is missing) | Fetch the gist, validate it, update `public/data/glowing-modules-diff.json` |
| `scripts/data-summary.mjs` | used by the refresh workflow | Summarise snapshot changes for the PR description |
| `scripts/fetch-icons.mjs` | `npm run icons:fetch` | Download the Material Symbols subset for the icons listed in the script |
| `scripts/build-assets.mjs` | `npm run assets:build` | Generate the logo, favicons and social image from `design/` |

### Workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | pull requests, pushes to other branches, called by deploy | Lint, unit tests with coverage, build |
| `deploy.yml` | push to `master`, manual | Pull the live data, build, publish `dist/` to GitHub Pages |
| `health.yml` | daily, manual | Check that the site answers and the live data is valid |
| `refresh-data.yml` | Mondays, manual | Open a PR that updates the committed data snapshot |

## Minimal contributor path

```sh
npm ci
npm run dev
```

This is enough to work on the page. Everything else is optional:

- Playwright browsers (`npx playwright install chromium webkit`) are only needed for `npm run test:e2e`.
- The icon and asset scripts are only needed when adding an icon or changing the artwork.
- Coverage (`npm run test:coverage`) is only needed when checking the domain threshold.

CI runs every check on each pull request.
