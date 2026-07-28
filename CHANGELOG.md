# Changelog

## 1.3.0 — 2026-07-28

### Test suite

- Added a headless browser test suite (`npm test`) — 99 tests over a real Chrome, with **no npm dependencies**: the harness drives the browser over the DevTools Protocol using Node's built-in `WebSocket`, `node:test` and `node:http`, so `git clone && npm test` works with nothing to install. Fixtures are served over HTTP and load `dist/` exactly as a browser app does, so `DOMContentLoaded` auto-init is genuinely exercised, and any uncaught page exception fails the test. Input goes through real CDP mouse/keyboard events rather than `element.click()`, which is what makes click-outside-to-close, focus restoration and focus trapping testable at all. See [`tests/README.md`](tests/README.md)
- The suite targets invariants that isolated per-component demos cannot see: Escape closing only the *topmost* overlay layer (the 1.1.0 regression), `save-next`/`stepper-form`/`draft` composed on a single `<form>` (the 1.1.0 `dataset.uiReady` guard collision, now also enforced by a static check), and `dist/` being regenerated into a scratch directory and diffed against what is committed — editing `src/` without rebuilding previously shipped nothing, silently
- Fixed the smart table setting `aria-sort="none"` on **every** header once any column was sorted, including columns that opted out with no `data-ui-sort` — announcing non-sortable columns to screen readers as sortable. Found by the new suite on its first run
- Added a GitHub Actions workflow running the suite plus a `dist/` staleness check on every push and pull request

### Platform

- Added `UI.destroy(root)` and `UI.cleanup(element, fn)`. Modules guarded against double-initialisation but nothing released the listeners they attached, so a region swapped over AJAX leaked a listener per swap. `UI.floatPanel()` was the worst case: its scroll listener is capture-phase and global, so a panel torn out of the DOM while open left a handler firing on every scroll for the life of the page. `floatPanel` now registers its own teardown, so `UI.destroy()` releases it even if the owning component never gets to clean up
- Added `UI.observe(root)`, an opt-in `MutationObserver` that initialises inserted markup and tears down removed markup automatically, batched on an animation frame — AJAX fragments no longer each need a manual `UI.init()` call
- Added `UI.matchAll(selector, root)` and switched every module's `init(root)` to it, so **`UI.init(el)` now matches `el` itself** and not just its descendants. `querySelectorAll` returns descendants only, so `UI.destroy(table); UI.init(table)` previously did nothing at all and callers had to pass `table.parentNode` — a sharp edge on precisely the teardown-then-rebuild flow `UI.destroy()` invites. `UI.qa` keeps its descendant-only semantics on purpose: it also backs ordinary lookups like `UI.qa("tr", tbody)` and `UI.focusable()`, where including the root would send a modal's initial focus to the dialog instead of its first field
- Added `dist/ui-framework.layered.css` (and `.layered.min.css`), a `@layer`-wrapped build with `ui-base`, `ui-components` and `ui-utilities` sub-layers. Apps coexisting with Bootstrap, CoreUI or an existing `master.css` declare the order they want once — `@layer app-reset, ui-base, ui-components, ui-utilities, app-overrides;` — and their own rules then win regardless of selector specificity, with no `!important`

### Internationalisation and accessibility

- Added `UI.i18n` and `UI.t(key, vars)`. Every user-visible string the JavaScript generates now routes through the string table instead of being hardcoded English — previously `"Search"`, `"No matching records"`, `"Cancel"`, `"Select all"`, `"per page"` and the draft banner were unreachable for translation. Existing per-element `data-*` attributes still take precedence, so current markup is unaffected
- Draft timestamps now use `Intl.RelativeTimeFormat`, which applies each locale's plural rules — a string table cannot express that "2 minutes ago" pluralises differently in other languages
- Added `UI.announce(message, priority)`, a screen-reader live region for outcomes a sighted user sees but a screen-reader user would not

### Forms

- Added a validation module (`data-ui-validate`) covering native constraints plus `match`, `after`, `before`, `integer` and custom rules via `UI.validate.addRule()`. Messages render inline and translatably rather than in native browser bubbles, which cannot be styled, are not read on submit, and vanish on scroll
- Added `UI.validate.showErrors(form, errors)` — binds a failed POST's `{"field": "message"}` response onto the right controls, the summary and focus. Accepts `{field: message}`, `{field: [messages]}` and `[{field, message}]`. This is the piece that otherwise gets hand-rolled on every screen
- Added an error summary (`data-ui-validate-summary`) that lists every problem, links each entry to its field, takes focus on failure and announces assertively — the pattern accessibility audits expect
- Validation binds on the capture phase so it runs *before* `save-next`'s AJAX submit, and mirrors invalid state onto the visible trigger for components whose real control is hidden (date pickers, multi-select)
- Added input masking (`data-ui-mask`): pattern masks (`999-999-999`, `+99 999 999 999`, `AAA-9999`) plus `number` and `currency` modes with locale-aware grouping. Caret position is preserved across reformatting, including mid-string edits. `data-ui-mask-raw="true"` posts the unformatted value through a hidden field so the server receives digits while the user still sees the mask. `UI.mask.format()` renders the same formatting outside an input
- Added a combobox (`data-ui-combobox`) with type-ahead over either a local `<select>` or a remote endpoint via `data-ui-url`. Out-of-order responses are discarded so a slow earlier request cannot overwrite a newer one; uncommitted text reverts on blur so the visible text can never disagree with what will be posted; the backing `<select>` is kept in sync throughout, so the field posts normally and existing validation still sees it
- Fixed the multi-step wizard leaving the user **silently stuck**: `Next` gated on `reportValidity()`, but `data-ui-validate` sets `novalidate`, so a form using both refused to advance while showing nothing at all. The wizard now delegates to the validation module, scoped to the visible step, and falls back to native validation when used on its own

### Tables

- Added server mode (`data-ui-url`) to smart tables. The endpoint receives `?page=&size=&q=&sort=&dir=` and returns `{rows, total}` — rows as objects mapped through `<th data-ui-field>`, as arrays, or as a pre-rendered `{html}` fragment for stacks that would rather build them server-side. Search is debounced into one request per pause, out-of-order pages are discarded, and the table reports `aria-busy` while loading. Client mode is unchanged and still right up to a few thousand rows
- Added row selection (`data-ui-select`): a checkbox column, a select-all that goes indeterminate on partial selection, a bulk-action bar that appears only when something is selected, and a selection that survives paging. `UI.table.selected()` / `clearSelection()` and a `ui:table:select` event
- Added column visibility (`data-ui-columns`) and sticky columns/headers (`.ui-table-sticky-first`, `.ui-table-sticky-head`)
- Added CSV export (`data-ui-export`). Exports every row matching the current search and sort rather than just the page on screen, omits hidden columns, honours `data-ui-export-value` for raw values behind formatted cells, doubles embedded quotes per RFC 4180, and writes a UTF-8 BOM so Excel does not mangle non-ASCII names
- Added `UI.table.refresh()` for re-running the current query after a save

### Uploads

- Hardened the upload area: `data-ui-max-size` (accepts `5MB`-style values), `data-ui-max-files`, and `accept` matching by extension, MIME type or wildcard. Rejected files are **removed from the input's `FileList`**, so what the form posts always matches what the preview shows — client-side checks remain a courtesy the server must still enforce
- Added direct upload via `data-ui-url` with real per-file progress, using `XMLHttpRequest` because `fetch` still has no upload progress event and a bar that jumps 0→100 is worse than none on large document scans. Progress is driven by stepped classes, so no `style-src 'unsafe-inline'` exception is needed
- Added drag-and-drop that appends to the existing selection instead of replacing it

### Display

- Added dependency-free SVG charts (`data-ui-chart`): `bar` (with horizontal variant), `line`, `sparkline` and `donut`, with an optional legend and percentages. Every chart renders `role="img"` with a generated summary label **and** a visually-hidden data table, because a bare `<svg>` is invisible to a screen reader and to print. Scope is deliberately narrow — anything needing zoom, brushing or streaming still wants a charting library
- Added popovers (`data-ui-popover`, `data-ui-popover-target`) — richer than a tooltip, lighter than a modal, and able to hold interactive content. Content can come from a `<template>`. Focus moves in only when there is something to interact with. The Escape handler is ordered before `modal.js`, so dismissing a popover inside a modal does not also close the modal
- Added copy-to-clipboard (`data-ui-copy`, `data-ui-copy-target`) with a transient label swap plus a screen-reader announcement, and an `execCommand` fallback for the plain-HTTP internal deployments where `navigator.clipboard` is unavailable
- Added a status lexicon: `.ui-status-draft|submitted|under-review|approved|active|rejected|expired|suspended`. The value is the shared vocabulary, not the styling — without one, every screen invents its own and "Under review" ends up amber on one page and blue on the next. Expired and suspended are distinguished by marker and border rather than colour alone
- Added `.ui-record-header` (title, reference, status, actions) for the record-detail pattern repeated across every record-detail screen
- Added `.ui-document`, an A4 print sheet for certificates, statements and reports: portrait and landscape, running header/footer repeated per page, `thead` repeated across page breaks on long tables, page-break helpers, watermark, signature and QR slots, and `print-color-adjust: exact` so status colour survives printing

## 1.2.0 — 2026-07-27

- Fixed `.ui-btn-loading` making the button label fully transparent, leaving only a bare spinner with no indication of what's loading; the label now stays visible with the spinner shown alongside it (using `currentColor` so it reads correctly on solid, outline, and ghost variants alike)
- Documented previously-missing button classes (`ui-btn-secondary`, `ui-btn-info`, `ui-btn-dark`, `ui-btn-sm`/`ui-btn-lg`, `ui-btn-block`, `ui-btn-icon`) with a new "Sizes & layout" demo, and added a classes reference table at the end of the Buttons section
- Added a "classes reference" table to the end of every remaining section in the components doc (Typography, Forms, Selection, Multi-select, Date range, Date picker, Upload, Multi-step form, Save draft, Alerts and badges, Cards, Images, Tables, Smart tables, Navigation, Tabs, Dropdown, Accordion, Modal, Confirm, Offcanvas, Tooltips, Toast, Loaders, Workflow UI) for quick class lookup without reading every demo
- Fixed the Tabs demo: it was missing the second ("Security") tab panel entirely and never closed its `<section>` tag, so the Dropdown section was silently nested inside it in the DOM
- Fixed the Buttons demo's copy-paste code sample missing the `ui-btn-loading` line, even though the loading button was shown live
- Fixed `.ui-skeleton-circle` having no explicit width (only `aspect-ratio: 1`), so used alone as a flex item it would collapse to invisible; it now has a sensible default size and `flex: none`
- Fixed the last remaining inline `style="--ui-progress-value:...` / `style="width:...` in the Loaders demo that was missed in the earlier CSP-safety pass
- Rewrote the Alerts and badges section: all 4 colors shown against all 3 styles (soft/outline/solid) in one matrix, plus a dedicated badges-and-dots section covering every solid/soft badge color and all 4 status dot colors (previously only 2-3 of each were ever shown)
- Reorganized the components doc into grouped, logical flow: all form/input components now sit together (Forms → Selection → Multi-select → Date range → Date picker → Upload), followed by form workflows (Multi-step form, Save draft), then content display, navigation, overlays, and loaders — instead of date/multiselect/confirm being scattered near the end regardless of topic
- Added clear visual demarcation (borders, and a solid highlight on the fluid variant) to the Containers demo, where every size previously used the same faint background with no visible edge

## 1.1.0 — 2026-07-26

- Fixed the responsive flex grid only defining some column numbers at each breakpoint (e.g. no `.ui-col-md-5`, `.ui-col-lg-1`); `sm`/`md`/`lg` now each get the full `1`–`12` + `auto` range, matching the unprefixed set
- Documented a large set of classes that existed but had no live example anywhere: typography scale (new dedicated section: `ui-h1`–`ui-h6`, `ui-display-1/2`, `ui-blockquote`, `ui-mark`), button groups and outline-danger/success button variants, input groups, status dots, more card/list-group variants (`ui-card-img-top`, `ui-card-footer`, `ui-card-border-*`, `ui-list-group-flush`, `ui-list-group-item-action`), modal size variants (`sm`/`lg`/`xl`/`fullscreen`), the valid feedback state (`ui-is-valid`/`ui-feedback-valid`) alongside the existing invalid one, checkbox/radio/switch color and size completeness, the previously-undocumented explicit CSS grid (`ui-grid`/`ui-span-1`–`12`), and container sizes; expanded the Utilities page from a handful of examples to full reference tables for every utility category

- Added a real beginner path: `quick-start.html` (open directly in a browser, no server) is now linked from the README and the docs homepage instead of sitting undiscoverable at the repo root; added a plain-language "how it works" primer and a troubleshooting section (unstyled page, dead buttons, mismatched modal IDs, checkbox/floating-label markup order, dynamically-inserted content) to `docs/getting-started.html`
- Added `data-ui-draft-url` for save-draft: optionally syncs to a server endpoint (`GET`/`POST`/`DELETE`) in addition to `localStorage`, reconciling by whichever copy has the newer `savedAt` on load; sync failures are non-blocking and reported via `ui:draft:sync-error`
- Added `UI.confirm()`, a promise-based confirmation modal replacing `window.confirm()`, with a `danger` variant for destructive actions
- Added a "Save & next" form toolbar (`data-ui-save-next`) for moving through a sequence of records, with an unsaved-changes guard, Ctrl/Cmd+Enter shortcut, and optional AJAX submit mode
- Added a multi-step form wizard (`data-ui-stepper-form`), composable with `data-ui-save-next` on the same form: per-step native validation gating, `.ui-stepper` progress sync, and a shared final submit button
- Added a date range picker (`data-ui-date-range`) with quick presets, a two-month view, full keyboard navigation, `data-min-date`/`data-max-date`/`data-disabled-dates`, and a clear button, built over two native `<input type="date">` fields
- Added `UI.floatPanel()`, a shared viewport-aware positioning helper (flips above the trigger, escapes ancestor clipping) now used by dropdown, multi-select, and date-range
- Added smart tables (`data-ui-table`): client-side search, column sorting (`data-ui-sort`, `data-ui-sort-value`), and pagination over a plain `.ui-table`
- Added `data-max-tags` to multi-select's tags display mode: selections beyond the threshold (default 3) collapse into a single "+N" chip instead of growing the trigger unbounded
- Added a single-date picker (`data-ui-date-picker`), sharing the date range picker's keyboard navigation, positioning, and min/max/disabled-date support over one native `<input type="date">`; extracted the shared date math into `UI.dateUtils`
- Added single-input mode to the date range picker: wrap one `<input type="text">` instead of two to post the range as a single `YYYY-MM-DD - YYYY-MM-DD` value
- Added `.ui-floating-outline`, a Material-style floating label variant that floats onto the control's border (with a masked "notch") instead of shrinking into the top padding
- Added a page-size selector to smart tables (`data-ui-page-sizes`, `data-ui-page-size-selector`) and three new table designs: `.ui-table-minimal`, `.ui-table-dark-header`, `.ui-table-card-rows`
- Added navbar variants: `.ui-navbar-dark`, `.ui-navbar-primary`, `.ui-navbar-search`, `.ui-navbar-sticky`
- Added tab designs: `.ui-tabs-pill`, `.ui-tabs-boxed`, `.ui-tabs-vertical`
- Added save-draft (`data-ui-draft`): debounced `localStorage` autosave with a restore-on-reload banner, cleared on submit
- Documented avatar sizes/fallbacks/status and the media object (`.ui-media`), neither of which had a live example before
- Rewrote the JavaScript API docs: a complete `UI.*` method table (was missing most of the methods added this release), a full custom-events table, and "How to..." walkthroughs for toasts, alerts, confirm, and modals
- Changed the smart table toolbar to `justify-content: space-between` so the page-size selector sits on the left and search on the right, instead of both crowded together on the right
- Documented `.ui-table-bordered` (already existed, wasn't shown) alongside the other table designs
- Replaced all inline `style="--ui-progress-value:N%"` and `style="--ui-grid-min:..."` with static classes (`.ui-progress-w-0`&ndash;`.ui-progress-w-100`, `.ui-css-grid-xs/sm/lg/xl`) and switched `save-next`'s JS-driven progress update to the same classes instead of `style.setProperty()`, so nothing in the framework needs a `style-src 'unsafe-inline'` CSP exception
- Fixed a dataset-flag collision: `data-ui-save-next`, `data-ui-stepper-form`, and `data-ui-draft` on the same `<form>` all read/wrote the same generic `dataset.uiReady` guard, so whichever module initialized first silently blocked the others from running; each now uses its own key
- Fixed a silent validation dead-end in the date range/date picker: their backing `<input>`s are `display:none`, so a failed `reportValidity()` (e.g. from a stepper form's "Next" gating) had no visible field to anchor a bubble to and produced no feedback at all; the trigger now gets a red `.ui-is-invalid` border instead
- Rebuilt the "Form workflow" and "Dashboard" examples to actually exercise the new features together (multi-step form + save & next + save-draft + date range on one form; a real smart table + date-range filter + confirm-gated action on the dashboard) instead of showing a static, non-functional mockup of a stepper/table
- Added a remove ("×") button to each file in the upload preview list, rebuilding the input's `FileList` via `DataTransfer` so the removed file is actually excluded from what the form submits
- Reordered the components doc into a more logical flow (multi-step form and save-draft now follow Forms/Selection; confirm dialog follows Modal) instead of having every new feature appended at the end regardless of topic
- Fixed a CSS specificity bug where `.ui-scope`'s base resets (`a`, `button`/`input`/`select`/`textarea`, `img`/`svg`) always overrode component-level color, font, and alignment styling regardless of load order
- Fixed the documented `docs` serving command (`python3 -m http.server 8080 -d docs`) 404ing on `../dist/...` references
- Fixed the docs/offcanvas losing focus-restore-to-trigger behavior present in the modal
- Fixed Escape closing every open overlay layer at once instead of just the topmost one (e.g. a dropdown open inside a modal)
- Fixed dropdown, multi-select, and date-range popovers getting clipped when opened near the bottom of a scrollable container (e.g. a `.ui-modal-body`)
- Changed messaging to de-emphasize JSP as the framework's primary target — it works the same with any server-rendered stack; JSP is now one worked example among several rather than the headline framing

## 1.0.0 — 2026-07-26

- Added single-file CSS and JavaScript bundles
- Added modular CSS and JavaScript source files
- Added documentation website with live examples
- Added dashboard, form workflow and login examples
- Added design tokens and light/dark themes
- Added responsive grid and utility classes
- Added complete component catalogue
- Added build script and package metadata
