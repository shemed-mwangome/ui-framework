# Changelog

## Unreleased

- Added `UI.confirm()`, a promise-based confirmation modal replacing `window.confirm()`, with a `danger` variant for destructive actions
- Added a "Save & next" form toolbar (`data-ui-save-next`) for moving through a sequence of records, with an unsaved-changes guard, Ctrl/Cmd+Enter shortcut, and optional AJAX submit mode
- Added a multi-step form wizard (`data-ui-stepper-form`), composable with `data-ui-save-next` on the same form: per-step native validation gating, `.ui-stepper` progress sync, and a shared final submit button
- Added a date range picker (`data-ui-date-range`) with quick presets, a two-month view, full keyboard navigation, `data-min-date`/`data-max-date`/`data-disabled-dates`, and a clear button, built over two native `<input type="date">` fields
- Added `UI.floatPanel()`, a shared viewport-aware positioning helper (flips above the trigger, escapes ancestor clipping) now used by dropdown, multi-select, and date-range
- Added smart tables (`data-ui-table`): client-side search, column sorting (`data-ui-sort`, `data-ui-sort-value`), and pagination over a plain `.ui-table`
- Fixed a CSS specificity bug where `.ui-scope`'s base resets (`a`, `button`/`input`/`select`/`textarea`, `img`/`svg`) always overrode component-level color, font, and alignment styling regardless of load order
- Fixed the documented `docs` serving command (`python3 -m http.server 8080 -d docs`) 404ing on `../dist/...` references
- Fixed the docs/offcanvas losing focus-restore-to-trigger behavior present in the modal
- Fixed Escape closing every open overlay layer at once instead of just the topmost one (e.g. a dropdown open inside a modal)
- Fixed dropdown, multi-select, and date-range popovers getting clipped when opened near the bottom of a scrollable container (e.g. a `.ui-modal-body`)

## 1.0.0 — 2026-07-26

- Added single-file CSS and JavaScript bundles
- Added modular CSS and JavaScript source files
- Added documentation website with live examples
- Added dashboard, form workflow and login examples
- Added design tokens and light/dark themes
- Added responsive grid and utility classes
- Added complete component catalogue
- Added build script and package metadata
