# Changelog

## 1.10.0 — 2026-08-20

Rewrote the chart renderer. The previous one was built to a deliberately
narrow scope — "how many by status, how many by month" — and delivered it.
The problem was that it could not be read: with no axis and no value labels,
the only way to get a number out of a chart was to hover a bar and wait for
the browser's native tooltip, which does not exist on a touch screen. For a
module used on a phone in the field, and for reports issued to a regulated
operator, that is not sufficient.

### The root cause

The old renderer drew into a fixed `100x40` viewBox and stretched it with
`preserveAspectRatio="none"`. At a typical 910x160 box that is a horizontal
scale of 9.1 against a vertical scale of 4.0, so **every circle rendered as an
ellipse 2.27 times wider than it was tall** — measured, not estimated — and
any text would have been distorted by the same factor. That is the real reason
there were no axis labels: the renderer could not have drawn them legibly.

Charts now render in real pixel units with the default `preserveAspectRatio`,
measured from the element, with a `ResizeObserver` re-rendering on width
change. Circles are circles, strokes are uniform, and text can be placed.

### Added

- **Axes** (`data-ui-axis`) — y-axis with round-number ticks chosen the way a
  person would (steps of 1, 2, 2.5 or 5 × a power of ten), gridlines, a
  baseline, and category labels that **thin rather than overlap** when there
  are more of them than there is room for.
- **Value labels** (`data-ui-value-labels`) printed on each bar or point.
- **Target line** (`data-ui-target`, `data-ui-target-label`) — dashed, because
  a target is not a measurement. Without one, "82%" is a number; with one it
  is a pass or a fail, which is the question the reader actually has.
- **Axis titles** (`data-ui-axis-x`, `data-ui-axis-y`) and a scale override
  (`data-ui-max`).
- **Category names on horizontal bars.** They previously existed only in the
  hidden data table and the hover tooltip, so a "coverage by region" chart
  showed four anonymous bars.
- **Empty state** (`data-ui-empty-text`). A chart with no values rendered
  *nothing at all* while its container still held 160px — a silent void,
  indistinguishable from a failure to load.
- **All-zero note.** Three bars of height zero used to look exactly like a
  broken chart; it now says so.
- **Minimum bar height.** Values of `1, 2, 4000` scaled to bar heights of
  `0.01, 0.02, 40` — the small ones were invisible, which is a value silently
  dropped from the chart. Non-zero values now have a 2px floor.
- **Framework-rendered tooltips**, working on hover, focus **and touch**, with
  `<title>` kept as the print and no-script fallback.
- **Links** (`data-ui-link-template`, `data-ui-links`, `data-ui-link-target`)
  — real `<a>` elements inside the SVG, so a clickable data point is keyboard
  focusable, middle-clickable, copyable and works without JavaScript. An
  interactive chart becomes `role="group"` with per-link labels rather than
  `role="img"`, which would have hidden every link inside it.
- **`ui:chart:select`**, cancellable, for single-page routing without giving
  up the underlying links.
- **Legend toggling** (`data-ui-legend-toggle`) with the switched-off series
  kept visible and struck through.
- **`UI.chart.refresh(target)`** and re-render on container resize.
- Print styles that darken gridlines and outline bars, since light grey
  disappears on a monochrome office printer.

### Fixed

- **Line and area x-labels were offset by half a slot.** A bar occupies a slot
  and its label belongs in the middle of it; a line's point sits *on* the
  boundary. Using the bar rule for a line shifted every label right and pushed
  the last one off the end of the axis — six months rendered five labels.
- **A dimmed legend item never dimmed.** The modifier class arrived as a
  second `class` attribute, which the HTML parser silently ignores.

### Compatibility

Existing markup is unchanged. `data-ui-height` below 60 is still read as the
old viewBox units and scaled to the size those charts already had, so a
`data-ui-height="40"` chart still renders 160px tall. No axis, value label or
link appears unless it is asked for.

New spec: `tests/chart.test.js`.

## 1.9.0 — 2026-08-20

Benchmarked the framework by rebuilding a real regulatory register and a
six-step planning wizard using nothing but `ui-` classes, then filled every
gap that forced hand-written CSS. Twelve were found; ten are addressed here,
one was already covered (`.ui-range`) and one is out of scope (evidence-file
upload queueing, deliberately left to the application).

The framework held up well: tables, stepper, tree select, modals, validation,
charts and print all did their jobs unchanged. What was missing was the layer
above them — the components that turn a set of controls into a screen someone
can make a decision on.

### Added

- **Select list** (`27-select-list.css`, `26-select-list.js`) — a decision
  layer over `.ui-tree`. The tree shows what you can pick; this shows what
  picking it costs. Aligned numeric columns (counts of 14, 3 and 217 now start
  at the same x, so a column can be read downwards — previously they landed up
  to 8px apart and could not be compared), a sub-line under each label,
  per-group `n / total`, per-group Select all / Clear that disable when they
  would do nothing, automatic column totals on group rows, an explanation row
  for a legitimately empty group, and a search. Opt in with
  `data-ui-tree-columns` on an existing tree; nothing else changes.
- **Filter bar** (`28-filter-bar.css`, `27-filter-bar.js`) — one compact button
  per filterable dimension, each opening a select list in a modal. Four
  dimensions as chip rows take four wrapped lines and push the table below the
  fold; as a filter bar they take one line, and a fifth dimension costs a
  button rather than a row. State is scoped per bar — narrowing a findings
  register must not silently narrow an inspections register — and optionally
  mirrored into the query string so a filtered list can be linked to.
  `data-ui-filter-src` fetches the picker from the server, which is where
  counts conditional on the other active filters have to be computed.
- **Segmented control** (`.ui-segmented`) — a scope switch with a real selected
  state, keyboard navigation and counts. `.ui-btn-group` has no selected state,
  so this was being hand-rolled.
- **Page header** (`.ui-page-head`) — `.ui-record-header` is for a record with a
  reference and a status; a list page has a different shape.
- **Severity scale** (`.ui-severity-*`) — Critical / Major / Moderate / Minor.
  The record-status lexicon answers "where is this in its life cycle"; severity
  answers "how bad is it", and the two are independent axes. Each level keeps
  its word and the ranking survives greyscale print.
- **Summary rail** (`.ui-rail`) — the running summary beside a wizard, with the
  third state `.ui-record-meta` lacks: not yet answered.
- **Disabled reasons** (`data-ui-disabled-reason`, `UI.blocker`) — a disabled
  control states why, wired to it with `aria-describedby`, kept in sync by a
  `MutationObserver` so application code only has to set `disabled`.
- **Offline work queue** (`30-offline.css`, `29-offline.js`, `UI.offline`) — a
  durable IndexedDB queue of writes that could not be sent, with a
  `localStorage` fallback, automatic flush on reconnect, and a sync-status
  strip. `data-ui-draft` protects the form you are on; this protects work you
  have finished. Responses are classified rather than blanket-retried: 5xx and
  network failures are transient and retried, other 4xx are marked failed and
  left alone (retrying them forever buries the one item that needs a person),
  and 409 is retained as a conflict with the server's detail attached rather
  than resolved by last-write-wins. Items send oldest-first and a blocked item
  stops the rest of its own group, so a later edit never lands before the
  create it depends on.
- **Neutral button** (`.ui-btn-default`) — a bare `.ui-btn` resolves to primary,
  which is right for the one button that submits a form and wrong for a
  toolbar, where it produced six primary buttons and therefore none.
  `.ui-btn-secondary` is a filled slate button, a colour rather than a neutral.
- **`xl` breakpoint** (`.ui-col-xl-*`, 80rem) — the grid stopped at lg, so a
  1920px monitor and a 1024px laptop resolved to the same layout.
- **Table stacking** (`.ui-table-stack`) — one card per row below 48rem, driven
  by `data-label`, for a table read on a phone in the field.
- **Touch sizing** (`.ui-touch`) — 44px targets, scoped to a region rather than
  applied globally, since the same components are used on a desk.

### Fixed

- **A control inside a tree row also collapsed the row.** `.ui-tree-row` is a
  collapse target, so the select list's per-group "Select all" folded the group
  shut the moment it filled it. The row handler previously excluded
  `.ui-tree-check` and `.ui-tree-meta` by name, which does not scale — it
  missed `.ui-tree-actions` as soon as that existed. The rule is now
  structural: a control that is not the toggle is not a collapse target. Opt an
  element out explicitly with `data-ui-tree-ignore`.

### Documentation

- `docs/components.html` gains four sections with live, working demos —
  **Select list**, **Filter bar**, **Register patterns** (page header, neutral
  button, segmented control, severity, summary rail, disabled reasons, table
  stacking) and **Offline work queue**, each with a markup reference and the
  reasoning behind the design.
- `docs/javascript.html` lists the new `UI.selectList`, `UI.filter`,
  `UI.segmented`, `UI.blocker` and `UI.offline` APIs and their events.
- `docs/layout.html` documents the `xl` breakpoint; `docs/index.html` lists the
  new capabilities. Version strings updated across the docs site.

### Note

`python3 build.py` must be run before `npm test` — the test harness serves
`dist/`, and the four new CSS and four new JS modules are only in the bundle
after a rebuild. The docs site loads `dist/` too, so the new demos stay inert
until it is rebuilt. New specs: `tests/select-list.test.js`,
`tests/filter-bar.test.js`, `tests/patterns.test.js`, `tests/offline.test.js`.

## 1.8.8 — 2026-08-02

Closed out the pre-build audit from 1.8.7 by checking the two components it flagged as lower-priority: smart tables and charts.

### Checked, not changed

- **Smart tables**: a raw `.ui-table` looks genuinely fine before `data-ui-table` enhances it -- properly styled headers and striped rows, just without the toolbar/pagination chrome yet. Reserving space for that chrome isn't reliably possible from CSS alone (it depends on `data-ui-search`/`data-ui-page-size-selector`, and the row-count shrink from pagination is data-dependent, not something CSS can know) without risking an *empty* reserved gap on tables that opt out of both. Left as-is: unlike the other fixes, this was never "wrong-looking content," just a modest reflow when the toolbar appears.

### Fixed

- **Charts collapsed to zero height until fully built, then popped in at full size.** `build()` generates the whole SVG from script and only adds `.ui-chart`/`.ui-chart-{type}` once it does -- until then, `[data-ui-chart]` is a plain, empty `<div>` with no dimensions of its own. Unlike the multiselect/date-range/combobox/tree fixes this was never wrong-looking content, it was a card that looked empty and then suddenly grew by a chart's full height, shoving everything below it down -- arguably the most jarring of this whole family, since the jump is a chart's entire height rather than a few pixels of misalignment. `[data-ui-chart]:not(.ui-chart)` now reserves the same height its type's `.ui-chart-{type} .ui-chart-svg` rule resolves to once built (`10rem` for bar/line/area, `6rem × 1.75rem` for sparkline, `12rem` square for donut) -- keyed off the `.ui-chart` class both that rule and `build()` add, so it steps aside the moment the real SVG lands. Couldn't key off `:empty` the way the other fixes did: a multi-series chart's `<script type="application/json">` data island means the element already has a child before `build()` ever touches it

## 1.8.7 — 2026-08-02

Audited every JS-enhanced component for the same pre-build flash pattern fixed in 1.8.5/1.8.6 (multiselect, date range/picker). Most turned out already safe -- accordion/collapse, tabs, dropdown, popover, modal/offcanvas, upload, and the step-form wizard all hide their not-yet-relevant markup through plain CSS or the native `hidden` attribute, independent of JS timing. Two more had the same real gap:

### Fixed

- **Tree select: a leaf authored without a toggle button sat shallower than it should, before `build()` ever ran.** `ensureToggleSlot()` (1.8.2) only inserts a leaf's hidden placeholder toggle once `build()` reaches it -- before that, an author-omitted leaf really is missing the element, and for however long the page takes to load, its checkbox sits one toggle-width-plus-gap shallower than its siblings. `.ui-tree-row:not(:has(> .ui-tree-toggle)) > .ui-tree-check` now applies that same offset as a `margin-left` purely via CSS, so it's correct from first paint. This has to be a margin on the checkbox rather than `padding-left` on the row: the row's own `padding-left` is already set per nesting depth by the `.ui-tree-children .ui-tree-children...` chain, each level one selector longer (and higher-specificity) than the last, so a flat `padding-left` here would only ever win at the shallowest depth. Margin stacks on top of whatever that depth-based padding already resolved to instead of replacing it, correcting every level uniformly -- and needs `!important` to beat `.ui-tree-check`'s own `margin: 0 !important` (1.8.1's Bootstrap-checkbox-reset guard)
- **Combobox: the raw `<select>` rendered tiny and inline instead of filling its row.** Same root cause as the multiselect/date-range fixes -- a `<select>` is a real, painted element the instant the parser reaches it, sized to its longest option and `inline-block`, not the full-width block control it's about to become. `select[data-ui-combobox]:not(.ui-combobox-native)` now clamps it the same way, keyed off the `.ui-combobox-native` class `build()` already adds

## 1.8.6 — 2026-08-02

### Fixed

- **Same pre-build flash as 1.8.5's multiselect fix, now for date range/picker.** An `<input type="date">`/`<input type="text">` is a real, painted element from the moment the parser reaches it, browser-default sized -- visibly smaller and plainer than the `.ui-date-range-trigger` button it's about to become for however long build() takes to get there. `.ui-date-range > input:not(.ui-date-range-native)` and `.ui-date-picker > input:not(.ui-date-range-native)` now clamp the raw input(s) to `--ui-control-md` height and control-like padding/border, same as the multiselect fix and keyed off the same already-added `.ui-date-range-native` class -- no separate readiness flag needed. Two-input range mode stacks its pair with a small gap instead of showing two tiny native date fields side by side

## 1.8.5 — 2026-08-02

### Fixed

- **A `data-ui-multiselect` field visibly rendered as a raw, expanded multi-row listbox before JS enhanced it.** A `<select multiple>` is a real, painted element the instant the HTML parser reaches it — browsers default it to showing several options at once absent a `size` attribute, not a compact single-line control. Deferring/preloading the script (1.8.4's fix for the same underlying symptom, applied to the script's own load timing) narrows that window but can't close it: there is always some gap between "parsed" and "enhanced." `select[multiple][data-ui-multiselect]:not(.ui-multiselect-native)` now clamps the raw element to `--ui-control-md` height with `overflow: hidden`, so whatever's visible during that gap reads as a normal-sized loading control instead of a jarring multi-row listbox parked over the label below it. The clamp is keyed off `.ui-multiselect-native` — the class `build()` already adds — so it needs no separate readiness flag and gets out of the way the instant the real widget takes over

## 1.8.4 — 2026-08-02

### Fixed

- **`--ui-font-sans` now matches Bootstrap 4's native stack exactly**, not just approximately: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif` plus the emoji fallbacks, byte-for-byte Bootstrap's own `--font-family-sans-serif`. 1.8.3 already switched off the unloaded `Inter` webfont onto a native-stack approximation; this closes the small remaining gap so a Bootstrap 4 app gets pixel-identical font rendering with zero token override needed
- **`.ui-date-range-trigger`'s text rendered centered under a left-aligned `.ui-label`.** It's a `<button>`, and a browser's default UA stylesheet centers button text; `.ui-multiselect-trigger` (the same "looks like a form field" pattern) already guarded against this with `text-align: left`, but the date-range/date-picker trigger never got the same guard

### Added

- **Smart tables now show a persistent "N of M records" status line** (`.ui-table-status`, reusing the existing `table.status` i18n string) instead of only announcing the count to screen readers via `UI.announce()`. Previously, once a result set was small enough that pagination itself had nothing to render, sighted users saw no indication of the row count at all — DataTables' equivalent info text is always visible regardless of page count. Opt out with `data-ui-status="false"`

## 1.8.3 — 2026-08-02

### Changed

- **`--ui-font-sans` defaults to the OS's own UI font instead of "Inter".** `Inter` is a webfont this framework has never bundled or loaded — every consumer got the fallback chain (`"Segoe UI", Roboto, Helvetica, Arial`) regardless, which starts one link short of Bootstrap 4's own native-font-stack default (`-apple-system, BlinkMacSystemFont` first). Dropped into a Bootstrap app, that one-link gap was a visible font mismatch inside `.ui-scope` versus the surrounding chrome on Mac/Chrome, fixable only with a per-app token override. Now defaults to the same native stack Bootstrap uses: renders instantly (no font file to wait on), looks correct on every OS out of the box, and needs no override to coexist with a Bootstrap shell. Still just a token — override `--ui-font-sans` for a brand webfont same as before

## 1.8.2 — 2026-08-02

Rendering that same tree in the app it was built for surfaced two more bugs, both invisible until a leaf actually needed to line up next to a branch.

### Fixed

- **A leaf sat one indent level shallower than it actually was.** `.ui-tree-row` is a flex row with the toggle button as its first item — but the documented (and, until now, only demonstrated) way to author a leaf omits that button entirely, since there's nothing to expand. A leaf missing the element outright sits roughly one toggle-width closer to the row's edge than a branch at the same depth, so every leaf in a tree read as shallower than its actual nesting — most visibly, a leaf sibling of a branch (e.g. a standalone site next to a multi-site company under the same region) landed at its *parent's* indent instead of its own. `initNodeStates()` now inserts a hidden, unfocusable placeholder toggle for any leaf that doesn't already have one, so every row at a given depth reserves identical space regardless of how it was authored
- **The CSS that's supposed to hide a leaf's toggle checked the wrong class.** `.ui-tree-node.ui-leaf > .ui-tree-row .ui-tree-toggle { visibility: hidden; }` has never matched anything — the class the JS actually applies is `.ui-tree-leaf`, not `.ui-leaf`. Silent as long as leaves never had a toggle element at all (nothing to hide), but exposed the moment the fix above started giving every leaf a placeholder: it rendered as a small stray arrow on every leaf row. Selector corrected

## 1.8.1 — 2026-08-02

Same regulatory-admin screen again, deployed for real this time: the layered CSS bundle turned out to be actively unsafe for Bootstrap 4 coexistence, and one more component was missing the defensive CSS that lets it survive Bootstrap's global form-control resets.

### Fixed

- **The layered CSS bundle loses fights it should win.** CSS cascade layers guarantee an *unlayered* rule always beats a *layered* one, regardless of specificity — that's the whole mechanism the layered bundle relies on to stay predictable. But it cuts both ways: Bootstrap 4's own `label{display:inline-block;margin-bottom:.5rem}` is unlayered too, so it silently overrode the layered bundle's `.ui-multiselect-option{display:flex}` (every multiselect option row is a `<label>`), turning a scrollable single-column checklist into text that wraps like a paragraph. The flat bundle doesn't have this failure mode — `.ui-multiselect-option` (a class selector) legitimately beats `label` (an element selector) under ordinary cascade specificity, which is what should have happened either way. Recommending the layered bundle specifically *for* Bootstrap coexistence, when it loses to Bootstrap's own low-specificity element resets more readily than the flat bundle would have, was backwards; docs and examples now default to the flat bundle, with the layered one repositioned for the narrower case of apps that need to guarantee a win against a legacy stylesheet with *higher*-specificity rules than the framework's own
- **`.ui-tree-check` had no defense against Bootstrap's global checkbox reset.** Bootstrap 4 ships `input[type=checkbox]{position:absolute;clip:rect(0,0,0,0);pointer-events:none}` unconditionally, assuming every checkbox gets restyled through its own `.custom-control` wrapper. `.ui-multiselect-option input` already guarded against exactly this with `!important`; `.ui-tree-check` — added in the same 1.7.0 release — never got the same treatment, so a tree dropped into a Bootstrap 4 app rendered with every checkbox invisibly clipped to nothing. Now guarded identically

## 1.8.0 — 2026-08-02

Same regulatory-admin screen as 1.7.0's tree-select, one layer deeper: wiring the tree and its sibling filters up to *live* data (an AJAX-driven region → operator cascade, a Reset button) surfaced two components that only supported a one-shot build.

### Added

- **`UI.multiselect.refresh(select)`:** `build()` is a one-shot init guarded by `data-ui-ready` — calling it again on an already-built `<select>` silently no-ops, so a multiselect whose options are replaced after init (e.g. an operator field repopulated by AJAX once its region/department changes) never picked up the new list. `refresh()` unwraps back to the plain `<select>` and rebuilds the widget from its current `<option>`s
- **`UI.dateRange.clear(container)`** and **`UI.datePicker.clear(container)`:** clearing either widget previously required clicking its own in-panel "Clear" button — there was no way to reset one from outside, which a filter form's Reset button needs. Both accept a selector or element and mirror the existing `.close()` methods' shape

## 1.7.0 — 2026-08-02

Found while rebuilding a real regulatory-admin screen (a filtered, bulk-schedulable region → operator → premises hierarchy) directly on the framework: the date range/picker didn't behave like a form control when dropped into a foreign grid, and there was no first-class way to build a checkbox tree at all.

### Fixed

- **Date range and date picker:** `.ui-date-range` was `display: inline-block` with no explicit width, so it sized to its own content instead of filling its column — harmless in the framework's own grid, where sibling utility classes size children for you, but it silently refused to stretch to match `.ui-select`/`.ui-control` when dropped into a foreign grid (e.g. Bootstrap's `.col-md-4`), the way every other form field in that row did. Both now render `display: block; width: 100%`, matching `.ui-control`/`.ui-select` sizing exactly, plus new `.ui-date-range-sm`/`.ui-date-range-lg` modifiers for the same two control-height variants those already have. That default doesn't fit every placement — a standalone toolbar filter or a compact "as of" date has no grid row to line up with — so a new `.ui-date-range-inline` modifier opts back out to content width. The docs demo for both components was itself sitting in an unconstrained `.docs-demo` div, so once the trigger correctly started filling its container it stretched across the full page width there and made the popover look mismatched against it (reported as the popover "exceeding" the field) — the demo markup now shows the default at a realistic field width alongside the new inline example, matching the pattern the multi-select demo already used

### Added

- **Tree select (`data-ui-tree`):** a hierarchical checkbox list — region → operator → premises, category → team → member, anywhere a bulk-select tree is needed — where checking a parent row cascades to every descendant, and checking or unchecking a descendant rolls back up to a tri-state (checked/unchecked/indeterminate) ancestor checkbox. Expand/collapse is independent of selection. `UI.treeSelect.selected(target)` returns the checked leaves' `data-ui-tree-value`s. An opt-in `.ui-tree-header` modifier styles a top-level row (e.g. a region bar) to stand out from lighter nested rows — defaults to `--ui-dark`, or add `.ui-tree-header-primary`/`-success`/`-warning`/`-danger`/`-info` for a different preset, or override `--ui-tree-header-bg`/`--ui-tree-header-color` inline for a fully custom one-off colour
- **Status lexicon theming:** the under-review/active/suspended pills' text colours and suspended's accent were hardcoded hex, independent of `--ui-warning`/`--ui-success`. Broken out into `--ui-status-under-review-text`, `--ui-status-active-text`, `--ui-status-suspended-text` and `--ui-status-suspended-accent` (defaults unchanged) so a full brand reskin can retune contrast from tokens alone instead of patching `25-status-document.css`. Dark theme now gets its values from the same tokens rather than separate `[data-ui-theme="dark"] .ui-status-*` rules

A second pass rebuilding that same screen's app shell (navbar + sidebar + status badges) entirely on the framework, to find what still forced a page to write its own CSS instead of just theming a component:

- **Sidebar (`.ui-sidebar-dark`):** `.ui-navbar` had a `-dark`/`-primary` variant; `.ui-sidebar` had neither, defaulting to a light panel no matter what. A colored admin-shell rail (the common case, not the exception) needed a hand-written override. Reads the same `--ui-dark` token `.ui-navbar-dark` already uses, so retheming one token colors both
- **Sidebar submenu (`.ui-sidebar-submenu`):** the only way to group related links was the non-interactive `.ui-sidebar-section` label — an expandable parent with its own sub-pages had no supported shape at all. A `.ui-sidebar-link` with `data-ui-collapse` (the same generic trigger `.ui-accordion` already used internally, now documented as public API in its own right) toggles a nested `.ui-sidebar-submenu`; no new JS needed, just CSS for the chevron and indentation. The generic collapse trigger itself had no test coverage anywhere in the suite despite backing the accordion — added
- **Card header accent (`--ui-card-header-accent`):** `.ui-card` already had a themeable top accent stripe (`.ui-card-border-*`), but a colored underline specifically beneath the header — a different, equally common flourish — had no equivalent and needed a page-level `border-bottom` override. Now a real custom property with `.ui-card-header-accent-primary`/`-success`/`-danger`/`-warning`/`-info` presets, defaulting to the card's own border so a plain header is unaffected
- **Badges:** `.ui-badge-soft-*` only covered primary/success/danger/warning, with plain `secondary`/`info` stuck solid-only and no `dark` at all — inconsistent with every other color family in the framework. Added `.ui-badge-soft-secondary`, `.ui-badge-soft-info`, `.ui-badge-dark`

## 1.6.0 — 2026-07-29

### Fixed

- **Charts:** a multi-series chart's data lives in a `<script type="application/json">` child, but `build()` set the chart element's `innerHTML` on every render, discarding that child along with the previous SVG. `UI.chart.update()` masked this by recreating the script fresh before every call, but any other way of re-rendering a chart — `UI.destroy()` + `UI.init()`, an AJAX-swapped region under `UI.observe()` — found no data left and silently rendered nothing on the second pass. `build()` now detaches the script before clearing the element and reattaches it after

### Added

- **Print:** `data-ui-print-target="#selector"` on a button (or `UI.print(target)` from script) prints one element instead of the whole page it sits on — a "Print certificate" button previously ran plain `window.print()`, which printed the surrounding dashboard, nav and tables right along with the certificate. Isolation is done with `visibility: hidden` on everything and `visibility: visible` back on the target and its descendants, not `display: none` — hiding an *ancestor* with `display: none` would have taken the target itself out of the render tree along with everything else. The record register example's print button now uses this instead of a hand-written `window.print()` call

## 1.5.1 — 2026-07-28

- **Docs sidebar:** 1.5.0's `overflow-x: hidden` fix for mobile's off-canvas sidebar was applied to `html` *and* `body`. Setting `overflow-x` on an element computes its `overflow-y` to `auto` instead of `visible` if not set explicitly, so `body` became a second, nested scroll container alongside `html`. With two scrollable ancestors instead of one, `.docs-sidebar`'s `position: sticky` stuck relative to the wrong one and stopped tracking the page scroll the user actually sees — the sidebar scrolled away instead of snapping to the top, breaking navigation on every docs page. Moved the rule to `html` only

## 1.5.0 — 2026-07-28

A responsive-layout pass: every docs and example page had a way to end up wider than its viewport on a narrow screen, several from the same root cause. Also rounds out charts (horizontal multi-series bars, a dedicated area/stacked-area type) and gives uploads a second, compact layout.

### Fixed

- **Every docs page:** below 56rem, `.docs-sidebar` becomes `position: fixed`, sitting off-screen at `transform: translateX(-100%)` until opened. Nothing clipped that box, so on a narrow viewport the page's scrollable area silently included its full width — the whole page could be dragged sideways to reveal a blank strip, even though the sidebar itself was never visible. `html`/`body` now clip horizontal overflow
- **`docs/assets/docs.css` and `docs.js`:** loaded with no cache-busting query string on any page, unlike `dist/*`, which has carried one since 1.3.1 for exactly this reason — a browser that had cached either file kept running it after this session's edits changed both, several times over. Both now load with the same `?v=` the bundle uses
- **Date range and date picker triggers:** squeezed by a narrow flex row (their most common home: a card header next to other actions), the trigger's label wrapped character-by-character into a multi-line stack instead of staying on one line. It now truncates with an ellipsis instead, the way a native `<select>` would
- **Navbar:** a brand plus several nav links has no fallback once it stops fitting a narrow screen — `.ui-navbar` now scrolls horizontally instead of silently clipping a link's text or forcing the whole page wider
- **Document sheet:** `.ui-document`'s `max-width: 100%` shrinks the sheet itself on a narrow screen, but a wide child (a multi-column table, most often) does not shrink with it and pushed past the sheet's edge, widening the whole page rather than scrolling within the sheet. Print is unaffected
- The dashboard and application-form examples had a card header / page header row that did not wrap, for the same reason as the date-range trigger above — narrow-screen actions had nowhere to go but overlap or squeeze. Both now wrap onto their own row

### Added

- **Charts:** `data-ui-orientation="horizontal"` now works on grouped and stacked multi-series bars, not just the single-series form. `data-ui-chart="area"` is a new type — a line chart with a deliberate gradient fill rather than the existing line chart's incidental one — and stacks one band per series when given a multi-series data island, the way most dashboards' area charts do
- **Upload:** `data-ui-upload-layout="inline"` lists selected files as wrapping compact chips instead of one full-width row each, for a dropzone that regularly holds many small files (photos, scans) where a stacked list runs long fast

## 1.4.0 — 2026-07-28

Another hands-on pass, this time across the whole component catalogue rather than just what shipped in 1.3.0. Fixes a positioning bug shared by every popover-style component, redesigns the components that read as visually broken rather than just plain, and adds grouped/stacked multi-series charts.

### Fixed

- **Popovers, dropdowns, date pickers, combobox, multiselect:** `UI.floatPanel` clamped its position to stay inside the viewport on every scroll, so once its trigger scrolled off-screen the panel kept floating, pinned to the top or bottom edge, completely detached from the trigger it was supposedly anchored to. It now dismisses instead of clamping once the trigger is no longer visible, the same way a click outside would — every caller (`03-dropdown.js`, `08-multiselect.js`, `12-date-range.js`, `16-date-picker.js`, `20-combobox.js`, `22-popover.js`) now passes an `onDismiss` callback into `floatPanel`
- **Navbar:** `.ui-navbar-search input` used `color: inherit`, but neither `.ui-navbar-dark`/`-primary` nor `.ui-navbar-search` itself set a `color` — the input inherited the page's default dark text color and typed text was invisible against the dark background
- **Cards:** `.ui-card-border-*` used a `.25rem` `border-top`, four times thicker than the card's other three (`1px`) sides. Differing border widths at a rounded corner make browsers miter the curve unevenly, so the accent border's corners looked distorted rather than following the card's rounded shape. Replaced with an inset `box-shadow`, which clips cleanly to the existing `border-radius` regardless of width. Also added the `-warning` variant, already mentioned in the docs text but missing from the CSS
- **Multi-step form validation:** the "Next" button's native-fallback path (`reportValidity()`) ran even on forms that also had `data-ui-validate`, surfacing the browser's own unstyled tooltip bubble — unstyled, not read out on submit, and gone on scroll, the exact problems `data-ui-validate` exists to avoid — instead of the inline red-border-and-message pattern used everywhere else. The docs example now opts into `data-ui-validate` so its own stepper demonstrates the pattern it documents
- **Upload:** the selected-file list rendered as a separate block below the dashed dropzone rather than inside it, because the dashed border lived on `.ui-upload-dropzone` and the preview list is a sibling kept outside it (on purpose, since 1.3.1 — see below). Moved the border onto the outer `.ui-upload` wrapper instead, so the drop prompt and the file list now share one visual canvas without changing which element the file `<input>` covers
- **Smart tables in a card:** a table dropped straight into a `.ui-card` with no `.ui-card-body` of its own sat flush against the card's edges, while `.ui-card-header` above it kept its usual padding — the auto-inserted toolbar and pagination now match that inset; the table rows themselves stay edge-to-edge

### Added

- **Charts:** grouped and stacked multi-series bars, and multi-line comparisons. A flat `data-ui-values` list only ever held one series; give the chart element a `<script type="application/json">` child instead (`{labels, series: [{name, values}, ...]}`) and it renders as grouped bars by default, or stacked with `data-ui-stacked`. `UI.chart.update(target, data)` accepts the same shape for live updates, alongside its original `(target, values, labels)` form
- **Date range:** hovering a day while a start date is picked (but before an end date is chosen) previews the range that would be committed, the way flatpickr and similar pickers do — cells between the two are tinted and the hovered day gets a ring, purely visual until a day is actually clicked
- **Smart tables:** the "N selected" bulk-action bar's count doubles as a collapse control — click it to tuck the bulk-action buttons away without clearing the selection, click again to bring them back
- Alerts got an `.ui-alert-icon` chip (a tinted circle instead of a bare glyph, white-on-fill for `.ui-alert-solid`), and `.ui-tabs-vertical` got real hover/spacing treatment instead of reusing the horizontal tab's bare minimum

### Changed

- The docs demo canvas (`.docs-demo`) is a shade off the page's surface color instead of matching it exactly — white-background components (tables, cards, tab panels, form controls) were reading as borderless against an identically-colored canvas
- Reordered `docs/components.html` so its section order matches the sidebar navigation — `data-ui-validate`, input masks, combobox, table tools, charts, popovers and the status lexicon were appended at the end of the file as they were added across 1.1.0–1.3.0, long after the nav was written to group them near their thematic neighbours, so the nav and the page had drifted into two different orders
- `docs/javascript.html` now documents `UI.q`, `UI.closest`, `UI.uid`, `UI.version` and `UI.draft.save`/`.discard`, all of which existed but were missing from the API reference
- The record register example's print button now sits in a heading row next to "Certificate preview" instead of floating alone below the certificate; the multi-step form and form-controls docs demos got matching label/spacing treatment for their validation-state examples



A follow-up pass fixing real bugs surfaced by hands-on testing of every 1.3.0 component, plus a round of visual redesign on the ones that were merely under-polished rather than broken.

### Fixed

- **Upload:** the file `<input>` was absolutely positioned over the *entire* upload zone, including the rendered preview list, so clicking a file's remove (×) button actually hit the invisible input underneath and reopened the file picker instead of removing the file. The dropzone (click/drop target) and the preview list are now separate elements — the input only ever covers the dropzone — so the remove button is always clickable. Added `.ui-upload-dropzone`, `.ui-upload-icon`, `.ui-file-item-icon/-info/-size` for the restructured, clearer file rows
- **Validation:** the error summary used the generic `.ui-alert` icon│body│close grid, but only supplied two of its three children, so the "auto" icon column sized itself to the title's full text width and squeezed the list of problems into whatever was left — a couple of characters wide on a long title. The summary now has its own layout, independent of `.ui-alert`
- **Validation:** `data-ui-rule-after`/`-before` and focus/highlight handling mirrored invalid state onto a class, `.ui-date-trigger`, that does not exist anywhere in the codebase (the real class is `.ui-date-range-trigger`, shared by the date-range and single date-picker components) — an invalid date-picker field showed **no highlight at all**, since its real `<input>` is hidden. Also fixed the feedback message rendering above/beside a wrapped control instead of underneath it, for the same reason
- **Smart tables:** the toolbar and pagination were inserted as siblings of the raw `<table>`, so when the table sat inside the documented `.ui-table-responsive` scroll wrapper (the pattern for wide tables on narrow screens), the toolbar and pagination ended up trapped *inside* that scroll box too — the search field, column menu and export button could scroll out of view along with the table instead of staying in place. This was a latent, pre-existing gap (present since the original "Smart tables" example), only exposed by a wider table
- **Combobox:** clicking a field that already had focus — the common case right after picking a value — did not reopen the menu, since only the `focus` event was wired up. A click now reopens it, re-showing whatever was already fetched rather than firing a fresh remote query

### Changed

- **Validation:** the error summary is a supporting aid for forms with several problems, not the primary feedback mechanism — the red border and message under each field is. Restyled the summary to be quiet (a thin left accent, no filled colour block) rather than a loud alert banner
- **Combobox:** added a chevron indicator (flips when open, the way a native `<select>`'s platform arrow does) and a checkmark on the selected option, so the control reads as "this opens a list" at a glance instead of looking like a plain text input
- **Status lexicon:** `expired` and `suspended` previously shared their colour with `rejected` and `under-review` respectively, distinguished only by a couple of pixels of marker shape — effectively invisible at a glance. `expired` now reads as a neutral grey lapse and `suspended` gets its own burnt orange, so all eight states (minus `approved`/`active`, intentionally identical) are pairwise distinguishable by colour alone
- **Tabs:** thicker, rounded underline indicator; boxed variant now reads as a segmented control with a raised active pill; the docs demo shows all four variants (underline, boxed, pill, vertical) live side by side instead of only the default
- **Document sheet:** the docs demo was missing its own watermark, and the QR placeholder was an unlabelled blank square indistinguishable from a rendering glitch — it now has a dashed border and a "QR" label that disappears automatically once real content is placed inside it
- Docs and examples now use the framework's own date-picker instead of a native `<input type="date">` wherever a single labelled date field appears standalone (the "Review date" field in the dashboard example, and the start/end dates in the application-form example)
- All docs pages and examples now load `dist/ui-framework.*` with a `?v=1.3.1` query string, so a browser that cached an earlier version's bundle fetches the new one instead of silently running stale JS/CSS against new markup — the likely explanation for several of the above reading as "doesn't work at all" rather than "looks unfinished"

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
