# Changelog

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
