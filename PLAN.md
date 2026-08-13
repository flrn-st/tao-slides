# Plan: ship the slides editor as a git-installable TAO UI plugin

Goal: package the React slides/pptx editor in this repo (`~/repos/tao-slides`) as a
plugin for the-agentic-office (`~/repos/the-agentic-office`, "TAO"), restyled to fit
TAO's paper/ink design system exactly, push it to a public git repo, and install it
through TAO's `POST /api/v1/apps/install-from-git`.

The user has said: the slides app may be changed however we want, improvements welcome.

---

## 0. Current state — what is ALREADY DONE (do not redo)

TAO's plugin system was declarative-only (`app.json` + SQL + JSON views; the platform
never executed plugin code). "Phase 6" (plugin-shipped UI in a sandboxed iframe,
sketched in `docs/plans/plugin-system.md:227`) has now been **implemented** in this
session. All changes below exist in the TAO working tree, compile (`go build ./...`
passes, `go test ./internal/app/...` passes), and typecheck clean (filtered to these
files). **The whole plugin system in TAO (`internal/app/`, migrations 0048–0051) is
UNTRACKED, uncommitted work — as is everything below. Do not commit or revert
anything in the TAO repo unless the user asks.**

### 0.1 TAO backend (Go) — done

- `db/migrations/0051_app_ui.sql` (new): table `workspace_app_ui (workspace_id,
  app_id, path, body bytea, updated_at, PK(workspace_id, app_id, path))` with the
  standard RLS policy + `app_runtime` grants. UI bundles live here because the file
  library is text-only with a **1 MB per-file cap** (`internal/file/library.go`,
  `maxTextBytes`).
- `internal/app/manifest.go`: new manifest key `"ui"` (string, e.g.
  `"ui": "ui/index.html"`), validated: must match `ui/*.html`, no `..`. Field
  `Manifest.UI`. It is a "hot" section like views — NOT part of the capability hash,
  so bundle updates don't need re-approval. Compensating control: CSP (below).
- `internal/app/git.go`:
  - `GitInstallRequest` gained `Update bool` — `{url, ref?, update?}`. With
    `update: true` an existing `/Plugins/<id>` is overwritten instead of a 409.
  - `collectRepoFiles` now returns `(textFiles map[string]string, uiFiles
    map[string][]byte, err)`: `app.json` + `views/*.json` + `migrations/*.sql` go to
    the file library as before; `ui/**` (binary-safe) goes to `workspace_app_ui`
    (delete-all-then-insert inside the same install transaction).
  - Install validates that `manifest.UI`, when set, exists in the cloned repo.
  - Still: public **https** URLs only, `git clone --depth 1`, optional `--branch <ref>`,
    50 MB / 500 file caps, app lands `pending_approval`.
- `internal/app/files.go`: new `upsertPluginFiles` (update-in-place via
  `library.Update` with version check opted out, create-if-missing) used by the
  update path.
- `internal/app/ui.go` (new): `Service.UIDocument(ctx, identity, appID)` —
  `requirePlugin` (member read), looks up `loaded.Manifest.UI`, reads the row from
  `workspace_app_ui`, and **injects a CSP `<meta>` right after `<head>`**:
  `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
  img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none';
  form-action 'none'; base-uri 'none'`.
  Consequence for the slides app: **no network access at all inside the iframe** —
  no Google Fonts `<link>`, no fetch; everything must be inlined in the bundle, and
  all host communication goes over the postMessage bridge.
- `internal/app/storage.go` (new): host-managed KV storage inside the app's own
  SQLite file (`$root/<workspace>/<app>.db`), table
  `kv (key TEXT PRIMARY KEY, value BLOB NOT NULL, updated_at INTEGER NOT NULL)`,
  created lazily (`CREATE TABLE IF NOT EXISTS`). Service methods
  `StorageList/Get/Put/Delete`. Keys `^[a-zA-Z0-9._-]{1,200}$`, values ≤ **32 MiB**.
  Why it exists: the declarative view path uses `httpx.DecodeJSON` which caps request
  bodies at **1 MiB** — a deck with inlined images cannot travel that path. Writes
  publish an app event `storage.changed {key}`. Plugin SQL (agent tools) can still
  `SELECT` from `kv`.
- `internal/app/app.go`: `App` API struct gained `UI bool` (`"ui"`), set in
  `mergeLoaded` from `Serving.UI != ""`.
- `internal/api/apps.go`: new routes
  - `GET  /api/v1/apps/{id}/ui` → `text/html` (CSP-injected document), no-store.
  - `GET  /api/v1/apps/{id}/storage` → `{items: [{key, size, updatedAt}]}`
  - `GET  /api/v1/apps/{id}/storage/{key}` → raw bytes (octet-stream)
  - `PUT  /api/v1/apps/{id}/storage/{key}` ← raw body (MaxBytesReader 32 MiB) → 204
  - `DELETE /api/v1/apps/{id}/storage/{key}` → 204
  Storage write requires member (non-guest); agents need `app:<id>:read|write` scopes
  (enforced in `requirePlugin`).

### 0.2 TAO frontend (apps/web) — done

- `src/lib/types.ts`: `WorkspaceApp.ui?: boolean`; new `AppStorageEntry
  {key, size, updatedAt}`.
- `src/lib/api.ts`: `api.apps.ui(id)` (text), `api.apps.storageList/Get/Put/Delete`,
  `installFromGit(url, ref?, update?)`. New module-level `rawRequest` helper (raw
  body, text response, CSRF header, same error mapping).
- `src/lib/appBridge.ts` (new) — **the bridge protocol, host side.** This is the
  contract the slides app must speak:
  - iframe → host request: `{type: "aw:bridge", id: number, method: string,
    params?: object}` via `parent.postMessage(msg, "*")`.
  - host → iframe response: `{type: "aw:bridge:res", id, ok: true, data}` or
    `{ok: false, error: {code, message}}`.
  - host → iframe push: `{type: "aw:bridge:event", event: "theme", data: AppTheme}`
    sent on attach-ish timing (on `ready`) and on every light/dark flip.
  - Methods: `ready` and `theme.get` (both return `AppTheme`), `storage.list`,
    `storage.get {key}` (returns string), `storage.put {key, value: string}`,
    `storage.delete {key}`, `config.get`, `views.query {view, args}`,
    `views.submit {view, args}`. Unknown → error `unknown_method`.
  - `AppTheme = {mode: "light"|"dark", tokens: Record<string,string>}` where tokens
    is a curated ~70-entry map of TAO custom properties (`--paper`, `--surface*`,
    `--text-*`, `--border-*`, `--accent*`, `--danger*`, `--radius-*`, `--shadow-*`,
    `--font-serif/sans/mono`, `--text-xs..-xl`, etc.) read via `getComputedStyle` on
    the host `documentElement`, so workspace theming flows through.
  - The iframe is sandboxed WITHOUT `allow-same-origin` → opaque origin: the host
    validates `event.source === iframe.contentWindow` (not origin) and posts with
    targetOrigin `"*"`. The plugin client must do the same (accept messages where
    `event.source === window.parent`... actually just check `event.data?.type`).
- `src/components/apps/AppFrame.tsx` (new): fetches `api.apps.ui(appId)` via
  react-query, renders `<iframe sandbox="allow-scripts allow-forms allow-modals
  allow-downloads allow-popups" allow="fullscreen" srcDoc={doc}>`, attaches the
  bridge, re-pushes theme on `useResolvedTheme()` change. Skeleton/EmptyState for
  loading/error.
- `src/pages/AppPage.tsx`: when `app.data.ui` is true renders
  `<PageShell><AppFrame/></PageShell>` and skips the declarative view queries
  (passes `""` as view name to `useAppView`, which disables the query).
- `src/lib/appIcons.tsx`: added lucide `Presentation` under the name
  `"presentation"`.

### 0.3 Environment facts the executor must know

- **The TAO working tree is hot**: at last check ~5 other Claude sessions were
  editing it concurrently. Files owned by peers this session (do not touch):
  `apps/web/src/components/Sidebar.tsx`, `BotDock.tsx`, `lib/botDock.ts`,
  `pages/FilesPage.tsx`, `lib/filesBrowser.ts`, `lib/filesLayout.ts`,
  `components/Composer.tsx` + `components/composer/*`, `app/AppShell.tsx`,
  `styles/index.css` (one `.sidebar-row-inset` rule), `styles/tokens.css`
  (`--sidebar-rail-width` added). **Re-read any shared TAO file immediately before
  editing it** — a stale-buffer write already reverted someone's work once.
- Pre-existing, unrelated `tsc --noEmit` failures exist in `apps/web` (reported in
  `AgentsPage.tsx`, possibly `FilesPage.tsx`, `AppMarketplace.tsx` — `toast.error`
  vs no `error` member on ToastContextValue). Filter typecheck output to your own
  paths; don't chase these. `npx vitest run` was green (≈195 tests) as a baseline.
- TAO stack: Go backend (chi/pgx/modernc-sqlite, single binary, `cmd/server`),
  Postgres with migrations in `db/migrations` , React 19 + Vite 8 + Tailwind 4 +
  TanStack Router/Query, pnpm workspaces. Per-app SQLite root comes from config
  (see `internal/platform/config/config.go`, look for the apps data dir setting —
  it's wired into `app.Store`).
- TAO design tokens: `apps/web/src/styles/tokens.css`. Light: `--paper #f4f4f2`,
  `--paper-2 #ffffff`, `--paper-3 #ebebe7`, `--ink #0f0f0e`, `--ink-2 #464642`,
  `--hairline #d9d9d4`, `--accent #eb6c36` (hover `#d55f2c`, subtle `#eb6c361a`,
  text `#b8501f`), `--danger oklch(47% 0.145 28)`, radii 2/4/6/8/10px (10px is the
  product-wide cap), fonts: Instrument Serif (headings), Geist Variable (UI), Geist
  Mono Variable (technical values). Dark mode = same token names re-pointed under
  `.dark` on `<html>` (`--paper #121211`, `--paper-2 #1a1a19`, `--accent #f0793f`…).
  Shadows: `--shadow-key*` (pressable controls), `--shadow-xs/sm/md/lg` (floating
  surfaces). Type scale via `--text-label 11px … --text-xl 22px`.
  House rules: semantic tokens only, no raw colors; hairline borders over shadows;
  `font-medium` is the heaviest weight; icons inherit `currentColor`; accent is
  scarce (one or two per screen).

### 0.4 Slides repo facts (this repo, `~/repos/tao-slides`)

- Vite 5 + React 18 + TypeScript strict + zustand 4 + fabric 5 + pptxgenjs +
  jszip + fast-xml-parser + nanoid + @fontsource/roboto-mono. `package.json` name
  `pptx-editor-react`. **Zero git commits yet** (branch `main`, everything
  untracked).
- Layout: `src/App.tsx` (shell: Toolbar / Sidebar / Canvas / PropertiesPanel /
  NotesPanel / Presentation / dialogs), `src/store.ts` (single zustand store,
  module-scope, snapshot undo/redo via `commit()`, `HISTORY_LIMIT=100`, `quiet`
  patches during drags), `src/types.ts` (pure-JSON `Deck/Slide/Shape/Paragraph/
  TextRun` model; `ImageShape.src` is a data URL — decks with images are BIG),
  `src/components/Canvas.tsx` (fabric canvas + reconcile loop; module singleton
  `sharedCanvas` + `getEditorCanvas()`; `window.__editorCanvas` debug global),
  `src/lib/importPptx.ts` (1,063-line OOXML importer), `src/lib/exportPptx.ts`
  (pptxgenjs + font re-embedding), `src/lib/render.ts` (thumbnail/present renderer),
  `src/lib/templates.ts` (`createDefaultDeck`, layouts, `THEME_COLORS`,
  `FONT_FAMILIES`).
- Styling: single global `src/styles.css` (761 lines, Google-blue `--accent
  #1a73e8`), generic class names, `html,body,#root` height rules, global `button`/
  `input` resets, webkit scrollbar styling. `index.html` has a Google Fonts `<link>`
  (Google Sans/Roboto) — **must go** (CSP blocks it; fonts must be bundled).
- No persistence of any kind. "Autosaved locally" label in App.tsx:82 is fake.
- Debug globals written on every render: `window.__useEditorState`,
  `window.__useEditorGetDeck` (App.tsx:20-21), `window.__editorCanvas`
  (Canvas.tsx:67). Puppeteer scripts in `test/` rely on them.
- `alert()` used for import errors (App.tsx, Toolbar.tsx).
- Tests: bare-node `.mjs` scripts under `test/`, five wired into npm scripts;
  `test:fixture`, `test:arbitrage-roundtrip` and `smoke.mjs` reference fixtures
  that don't exist in the repo (`Arbitrage.pptx`, `Extlst-test.pptx`); several
  `dump*.mjs` have hardcoded paths to another machine. `test:roundtrip` and
  `test:customer-*` work against `example-data/Customer Feedback Analysis _at
  Scale.pptx`.
- Since the app runs inside a sandboxed iframe, its worst embedding sins (global
  CSS, window-level key/drop handlers, fullscreen, singletons) are FINE as-is.
  Don't waste effort making it multi-instance.

---

## 1. Task: retheme the editor to TAO (styles.css rewrite)

Deliverable: the editor is visually indistinguishable from a native TAO surface, in
light AND dark mode, standalone (`npm run dev`) and embedded.

1. **Token foundation.** Replace the `:root` block of `src/styles.css` with a copy of
   the TAO semantic tokens the editor needs — both the light values in `:root` and
   the dark values under `.dark` — copied verbatim from
   `~/repos/the-agentic-office/apps/web/src/styles/tokens.css` (subset: papers, inks,
   hairlines, surfaces, text, borders, accent family, danger family, radii, shadows
   incl. key family, durations/eases, font stacks, type scale). These are the
   *defaults*; when embedded, the bridge overwrites them at runtime with the host's
   computed values via `documentElement.style.setProperty` (inline style beats the
   stylesheet), so host/workspace theming and dark mode flow through automatically.
   Keep editor-specific layout vars: `--toolbar-h` (set to 44px = TAO
   `--header-height`), `--sidebar-w: 220px`, `--props-w: 300px`.
2. **Mapping for the existing rules** (old var → new):
   - `--accent #1a73e8` → `var(--accent)`; `--accent-dark` → `var(--accent-hover)`;
     `#e8f0fe` active tints → `var(--accent-subtle)`; accent-on-text →
     `var(--accent-text)`.
   - `--line` → `var(--border-default)`; subtle separators → `var(--border-subtle)`.
   - `--ink` → `var(--text-primary)`; `--ink-2` → `var(--text-secondary)` for real
     text, `var(--text-muted)` only for mono/eyebrow captions (muted is blue-slate
     on purpose — don't use it for body text).
   - `--panel #fff` → `var(--surface)`; `--hover #f1f3f4` → `var(--surface-hover)`;
     `--bg-canvas #e8eaed` (the area behind the slide) → `var(--surface-sunken)`.
   - `#d93025` danger → `var(--danger)`, danger hover bg → `var(--danger-subtle)`.
   - Radii: cap everything at 10px. The pill shapes (`.btn-primary` 20px,
     `.file-btn`/`.sidebar-add` 18px, `.presentation-bar` 22px) become
     `var(--radius-md)`/`var(--radius-lg)` rectangles — TAO has no pills.
   - Shadows: `.menu-popup` → `var(--shadow-lg)` ("popover"), `.modal` →
     `var(--shadow-lg)`, `.slide-thumb` → `var(--shadow-xs)`, `.slide-frame` →
     `var(--shadow-md)`, pressable buttons (`.btn-primary`, `.mini-btn`, seg
     buttons) → `var(--shadow-key)` with `var(--shadow-key-press)` on :active.
     Notes panel top shadow → hairline border + `var(--shadow-md)`.
   - Typography: base font `var(--font-sans)` at `var(--text-base)` (14px). The
     toolbar logo/wordmark and modal `h3` → `var(--font-serif)` (Instrument Serif).
     `.menu-label-header` and similar eyebrows → `var(--font-mono)`,
     `var(--text-label)`, uppercase, `letter-spacing: 0.06em`,
     `color: var(--text-muted)`. `font-weight: 600/700` → 500 (`font-medium` max).
     `.color-hex`, slide numbers, zoom % → `var(--font-mono)`.
   - Grid overlay on `.slide-frame.with-grid` → derive from accent:
     `color-mix(in srgb, var(--accent) 8%, transparent)` (and 4%).
   - Focus: `outline: 2px solid var(--border-strong); outline-offset: 1px` — TAO
     rule: focus never takes the accent.
   - Scrollbars: thumb `var(--hairline-2)`, hover `var(--border-strong)`.
   - `.drop-overlay` / `.import-overlay`: `var(--scrim)`-style backdrop, accent
     dashed border, `var(--surface)` text card.
3. **Dark-mode correctness pass.** Everything must key off tokens; the only
   deliberately theme-independent surfaces are the slide canvas itself, its
   thumbnails, and presentation mode (slide content has its own background; keep
   `.slide-frame`/thumb canvas backgrounds white unless the deck sets one).
   Hardcoded whites/blacks in `styles.css` (`#fff`, `rgba(255…)`, `rgba(60,64,67…)`)
   must all be replaced except inside those slide surfaces and presentation mode
   (which stays black).
4. **Fonts.** Remove the Google Fonts `<link>` from `index.html`. Add
   `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`,
   `@fontsource/instrument-serif` and import them in `main.tsx` alongside the
   existing Roboto Mono imports (Roboto Mono stays — it's a deck content font used
   by fixtures). Keep the `document.fonts.load` warm-up and extend it to the deck
   default font if `templates.ts` defaults change.
5. **Chrome polish** (small, high-value):
   - Replace `alert()` with a minimal toast (fixed bottom-center card,
     `var(--surface-overlay)`, `var(--shadow-lg)`, `var(--radius-lg)`, danger tone
     for errors, auto-dismiss ~5s). One tiny module + one component; no dependency.
   - Gate debug globals behind `if (import.meta.env.DEV)` (App.tsx and Canvas.tsx).
     Keep them in dev — the puppeteer tests use them.
   - `Icon.tsx` icons: ensure `currentColor` inheritance (mostly already true).
6. **Do not** rename CSS classes wholesale or convert to Tailwind — mechanical
   restyle of the existing sheet is lower-risk and invisible from outside the
   iframe.

Verify: `npm run dev`, click through every surface (toolbar menus, shape grid,
properties sections, notes, modals, presentation bar) in light and dark (toggle by
adding/removing `dark` on `<html>` in devtools). `npm run typecheck` clean.
`npm run test:roundtrip` and `npm run test:customer-fixture` still pass.

---

## 2. Task: bridge client + real persistence

Deliverable: decks autosave to TAO app storage through the bridge; a deck list to
create/open/rename/delete decks; graceful standalone fallback.

1. **`src/lib/taoBridge.ts`** (new, plugin side of the protocol in §0.2):
   - `const embedded = window.parent !== window` (srcDoc iframe → always true when
     hosted; false under `npm run dev`).
   - Request plumbing: incrementing id, `window.parent.postMessage({type:
     "aw:bridge", id, method, params}, "*")`, pending-promise map resolved by a
     `message` listener that accepts only `aw:bridge:res` / `aw:bridge:event`
     shapes. 15s timeout → reject. Export typed helpers: `bridgeReady()` (sends
     `ready`, resolves to `AppTheme`), `themeGet()`, `storageList()`,
     `storageGet(key)`, `storagePut(key, value)`, `storageDelete(key)`,
     `onThemeChange(cb)` (from `aw:bridge:event` `theme`).
   - `applyTheme(theme)`: `document.documentElement.classList.toggle("dark",
     mode === "dark")` plus `setProperty(name, value)` for every token. Call before
     first render (in `main.tsx`, before the font warm-up resolves is fine) and on
     every theme event. Fabric canvas content is theme-independent — no re-render
     needed beyond CSS.
   - Standalone fallback: a `storage` interface with two implementations —
     bridge-backed when `embedded`, `localStorage`-backed otherwise (same keys;
     note: localStorage ~5 MB, so big imported decks may not persist standalone —
     acceptable, log a console warning on quota errors).
2. **Persistence model** (KV keys must match `^[a-zA-Z0-9._-]{1,200}$`):
   - Each deck: key `deck.<id>` (`nanoid()` id), value
     `JSON.stringify({schema: 1, deck})`.
   - Index: key `decks.index`, value `JSON.stringify([{id, title, slideCount,
     updatedAt}])` — needed because `storage.list` returns only key/size/updatedAt
     and the UI wants titles without fetching multi-MB values.
   - 32 MiB per-value cap: on save failure with a too-large error, toast a clear
     message ("Deck too large to sync — reduce image sizes") instead of crashing.
3. **Store wiring** (`src/store.ts`):
   - Add `deckId: string`, `saveState: "saved" | "saving" | "error" | "local"`.
   - Boot sequence (new `src/lib/persistence.ts` or inside store): read
     `decks.index` → open most-recently-updated deck (`deck.<id>` → `loadDeck`),
     else create default deck + first index entry.
   - Autosave: subscribe to the store; whenever `deck` changes (ignore `quiet`
     intermediate drags — subscribing to the committed deck reference is enough),
     debounce ~800 ms → `storagePut(deck.<id>)` then update `decks.index` entry
     (title, slideCount, updatedAt=Date.now()). Set `saveState` around it.
   - Deck ops: `newDeck()`, `openDeck(id)`, `deleteDeck(id)`, `duplicateDeck(id)` —
     each updates storage + index; imports (`loadDeck`) create a NEW deck id.
4. **UI**:
   - App.tsx status line: replace the fake "Autosaved locally" with the real
     `saveState` ("Saved to workspace" / "Saving…" / "Saved locally" standalone /
     error tone).
   - Toolbar File menu: add "New deck", "Open…" (modal listing index entries with
     title, slide count, relative updated time; click to open; hover reveals
     delete/duplicate), keep Import/Export. Reuse the existing `.modal` styling.
5. Keep everything working when the bridge is absent (standalone dev) — never
   hard-depend on `embedded`.

Verify standalone: create/edit → reload → deck restored from localStorage; deck
switcher works. Embedded verification happens in §4.

---

## 3. Task: plugin packaging + single-file build

Deliverable: this repo doubles as the installable plugin repo — `app.json` at root,
committed `ui/index.html` single-file bundle, migration for the `kv` table.

1. **`app.json`** (repo root):
   ```json
   {
     "id": "slides",
     "name": "Slides",
     "version": "0.1.0",
     "description": "Create, edit and present slide decks. Imports and exports PowerPoint (.pptx) files.",
     "icon": "presentation",
     "ui": "ui/index.html",
     "nav": { "label": "Slides" },
     "tools": [
       {
         "name": "list_decks",
         "description": "List saved slide decks with their storage keys and sizes",
         "kind": "query",
         "sql": "SELECT key, length(value) AS size, updated_at FROM kv WHERE key LIKE 'deck.%'"
       }
     ]
   }
   ```
   Notes: id `slides` obeys `^[a-z0-9-]{1,40}$` and isn't reserved
   (calendar/email/plugins are). `nav.view` omitted — the UI branch doesn't use it.
   Tool SQL: single SELECT, no forbidden keywords (validated by `sqlguard.go`).
2. **`migrations/0001_init.sql`**: create the `kv` table up-front so the
   `list_decks` tool works before the first save (must match the host's lazy schema
   exactly):
   ```sql
   CREATE TABLE IF NOT EXISTS kv (
     key TEXT PRIMARY KEY,
     value BLOB NOT NULL,
     updated_at INTEGER NOT NULL
   );
   ```
   (Migrations run raw via `ApplyMigrations` — CREATE is allowed there, and being in
   the capability hash it's part of what the admin approves.)
3. **Single-file build**: add dev-dep `vite-plugin-singlefile`. Either extend
   `vite.config.ts` with a mode or add `vite.plugin.config.ts`:
   `plugins: [react(), viteSingleFile()]`, `build.outDir: "ui"`,
   `build.assetsInlineLimit: 100_000_000`, `cssCodeSplit: false`, target es2020.
   Script: `"build:plugin": "tsc -b && vite build --config vite.plugin.config.ts"`.
   Everything (JS, CSS, woff2 fonts as data:) must inline into ONE `ui/index.html`
   — the CSP allows no external requests and the installer stores exactly this
   file. Check the output size (expect ~2.5–4 MB with fabric+pptxgenjs+fonts; cap
   is 50 MB, so fine). Confirm no `<link href=http…>`/`<script src=…>` remains
   (grep the artifact).
4. **Housekeeping**:
   - `.gitignore` (new): `node_modules/`, `dist/`, `tmp/`, `tsconfig.tsbuildinfo`,
     `.DS_Store`. Do NOT ignore `ui/` — the built artifact is committed (installer
     runs no build). Consider `example-data/*.pptx` LFS-free is fine (3.5 MB, under
     caps) but the pdf can be dropped from git if desired.
   - Optional cleanup while here: delete the dead `test/dump*.mjs`,
     `test/browser[1-4].mjs`, `test/bisect.mjs` scripts with hardcoded foreign
     paths, and remove the npm scripts that reference missing fixtures
     (`test:fixture`, `test:arbitrage-roundtrip`), or re-point them; keep
     `test:roundtrip` + `test:customer-*`.
   - Rename package to `tao-slides` in package.json (cosmetic).
5. **Initial commit** on `main`: full source + `app.json` + `migrations/` +
   built `ui/index.html`. Commit message ends with the Claude co-author trailer.

---

## 4. Task: push + install end-to-end

1. **Push**: `gh auth status` first. Create a **public** repo (installer accepts
   only public https): `gh repo create tao-slides --public --source .
   --description "Slides editor plugin for the-agentic-office" --push` (or the
   user's preferred name/org — if `gh` is unauthenticated or the user may want it
   private, STOP and ask; private needs an installer auth extension that doesn't
   exist).
2. **Run TAO locally**: check the TAO README / `internal/platform/config/config.go`
   for required env (Postgres DSN, apps data dir, secrets key). Postgres must be up
   and migrations applied (including the new `0051_app_ui.sql` — verify the server
   auto-migrates on boot via `db/migrate.go`; if not, apply manually). Start the Go
   server from the working tree (it contains all the Phase-6 changes) and the web
   dev server per repo convention (pnpm). You need an admin session in the web UI.
3. **Install**: from the Apps marketplace UI (it has an install-from-git affordance)
   or `POST /api/v1/apps/install-from-git {"url": "https://github.com/<user>/tao-slides"}`
   with an admin session (CSRF header required — using the web UI is easier).
   Expect: app row `slides` in `pending_approval`, files under `/Plugins/slides`
   in the file library (app.json + migrations only), UI rows in `workspace_app_ui`.
4. **Approve** (admin, Apps UI or `POST /apps/slides/approve`) — this also runs the
   kv migration into the app's SQLite.
5. **Verify** in the browser at `/apps/slides`:
   - Editor renders inside the iframe, styled paper/ink; flip the TAO theme toggle
     → editor follows light/dark live.
   - Create/edit a deck → status shows "Saving…/Saved"; reload the page → deck
     comes back (round-trips through `workspace_app_ui`... through
     `/apps/slides/storage`).
   - Import the fixture pptx from `example-data/` (drag-drop into the iframe) →
     renders; export downloads a .pptx (sandbox has `allow-downloads`).
   - Present-mode fullscreen works (`allow="fullscreen"`).
   - No CSP violations in the console (fonts/images all inlined).
   - `list_decks` tool visible on the workspace MCP server as `slides_list_decks`
     (optional check).
6. **Update flow**: bump `version` in app.json, rebuild `ui/index.html`, commit,
   push, then reinstall with `{"url": ..., "update": true}` — expect files
   replaced, UI rows replaced, status back to `pending_approval` only if
   capabilities/migrations changed (UI alone re-serves immediately).
7. If anything in TAO needs fixing during E2E, remember: hot tree, other sessions,
   re-read before write, never commit TAO.

---

## 5. Order of execution & verification gates

1. §1 retheme (standalone-verifiable) → gate: dev walkthrough light+dark, typecheck,
   roundtrip tests.
2. §2 bridge+persistence (standalone-verifiable via localStorage path) → gate:
   reload-restores-deck, deck switcher ops.
3. §3 packaging → gate: `build:plugin` emits one self-contained HTML; open
   `ui/index.html` via `file://` — it must boot (standalone mode) with zero network
   requests.
4. §4 E2E → gate: the checklist in §4.5.

Open decisions already made (don't relitigate): iframe+srcDoc over module
federation; storage KV over view submits (1 MiB cap); UI serves hot (no
re-approval) with no-egress CSP as the compensating control; single-file bundle
committed to git. Only genuinely open item: the public repo name/owner — ask the
user only if `gh` is set up for an unexpected account.
