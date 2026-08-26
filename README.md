# UI Framework 1.14.0

A complete, dependency-free CSS and JavaScript UI framework designed for
server-rendered applications, static HTML, and legacy projects that already
use Bootstrap, CoreUI, or a custom `master.css`.

All framework classes use the `ui-` prefix. Interactive behavior uses
`data-ui-*` attributes.

New to the framework? Open [`quick-start.html`](quick-start.html) directly in
a browser (no server needed) to confirm it works, then read
[`docs/getting-started.html`](docs/getting-started.html): it includes a
plain-language "how it works" primer and a troubleshooting section for
common first-time issues.

## What is included

### Two delivery styles

1. **Single-file distribution**
   - `dist/ui-framework.css`
   - `dist/ui-framework.min.css`
   - `dist/ui-framework.layered.css` (and `.layered.min.css`): the same CSS
     wrapped in `@layer`, for apps that also load Bootstrap, CoreUI or an
     existing `master.css`. See [Cascade layers](#cascade-layers).
   - `dist/ui-framework.js`
   - `dist/ui-framework.min.js`

2. **Reusable modular components**
   - Individual CSS files under `src/css`
   - Individual JavaScript files under `src/js`
   - `build.py` to recreate the bundled distribution

### Component catalogue

- Design tokens and light/dark themes
- Typography
- Mobile-first 12-column flex grid
- Automatic CSS grid
- Utility classes
- Buttons and button groups
- Form controls, floating labels, validation, input groups and file inputs
- Checkboxes, radios and switches
- Images, figures, avatars and media objects
- Cards, list groups and dashboard statistics
- Alerts and badges
- Responsive tables
- Navbar (with dark, colored, search, and sticky variants), breadcrumb, pagination, tabs (underline, pill, boxed, vertical) and sidebar navigation
- Dropdowns
- Accordion and collapse
- Modal and offcanvas
- Toast notifications and tooltips
- Multi-select with checkboxes, search, select-all and tags
- Hierarchical tree select with cascading tri-state checkboxes, and a **select
  list** layer over it: aligned numeric columns, per-group counts and
  select-all/clear, an explanation row for a legitimately empty group, and a
  search
- **Filter bar**: one compact button per filterable dimension, each opening a
  grouped picker; state scoped per bar and optionally mirrored into the URL
- **Segmented control** for a scope switch, and a **page header** for list pages
- **Severity scale** (`.ui-severity-*`) alongside the record-status lexicon
- **Offline work queue**: a durable IndexedDB queue of writes that could not be
  sent, with automatic flush, retry classification, conflict retention, and a
  sync-status strip
- Progress bars, spinners, pulse and skeleton loading
- Empty states
- Stepper and timeline
- Print helpers, including printing a single element in isolation
  (`data-ui-print-target`, `UI.print()`) instead of the whole page
- Save & next form toolbar with an unsaved-changes guard, and a multi-step form wizard built on top of it
- Save draft: debounced `localStorage` autosave with a restore-on-reload banner
- Date range picker with quick presets, two-month view, and keyboard navigation, plus a single-date picker counterpart
- Promise-based confirmation dialog (`UI.confirm()`)
- Smart tables: client-side search, column sorting and pagination over a plain
  `.ui-table`, plus optional server mode (`data-ui-url`), row selection with
  a collapsible bulk-action bar, column visibility, sticky columns and CSV export
- Form validation with cross-field rules, an error summary, and server-error
  binding (`UI.validate.showErrors()`)
- Input masks and number/currency formatting (`data-ui-mask`, `UI.mask.format()`)
- Combobox with type-ahead over a local `<select>` or a remote endpoint
- Upload areas with size/type/count gating, per-file upload progress, and an
  optional compact chip layout for the selected-file list
- SVG charts without a charting library: bar (grouped/stacked, vertical or
  horizontal), line, area (single or stacked), sparkline and donut, single- or
  multi-series via a JSON data island
- Popovers, copy-to-clipboard, a record status lexicon, a record header, and
  an A4 print sheet for certificates and reports
- Internationalisation (`UI.i18n` / `UI.t()`) and a screen-reader announcer
  (`UI.announce()`)
- Teardown and auto-init for AJAX-swapped regions (`UI.destroy()`, `UI.observe()`)
- TypeScript definitions (`dist/ui-framework.d.ts`), for consuming the global
  `UI` from a typed application

## Use from Angular, React or Vue

`UI.observe(document.body)`, called once at startup, is the whole integration:
it initialises components as the framework inserts them and tears them down as
it removes them, which covers `*ngIf`, `*ngFor`, router swaps and lazy views
without a wrapper component per widget. Load the CSS and JS as global assets
(`angular.json` `styles` / `scripts`, or a `<script>` tag) rather than
importing them. The bundle is a plain script that assigns `window.UI`.

Two things to know before you build wrappers:

- Widgets keep the original `<select>` or `<input>` and announce every value
  they write with a native `input` **and** `change` (`UI.fireChange()`), so
  `formControlName` and `v-model` bind to framework markup directly.
- Components initialise when their node is inserted. If the host framework
  fills a `<select>`'s options or a table's rows from a later HTTP response,
  call `UI.multiselect.refresh()` / `UI.table.refresh()` once the data lands,
  or let the framework own the fetch (`data-ui-url`, remote option loading).

Styles that the JavaScript generates at runtime sit outside a component's
scoped CSS: under Angular's emulated encapsulation they carry no
`_ngcontent-*` attribute. Keep `ui-framework.css` global and override with
`ViewEncapsulation.None` or `::ng-deep`.

## Cascade layers

`dist/ui-framework.layered.css` wraps the framework in `@layer ui-base,
ui-components, ui-utilities`. Declare the order you want once, at the top of
your own stylesheet:

```css
@layer app-reset, ui-base, ui-components, ui-utilities, app-overrides;
```

Rules you put in `app-overrides` then beat the framework regardless of selector
specificity, with no `!important`. Note that an *unlayered* stylesheet always
outranks a layered one, so keep your overrides in a declared layer too.

## Tests

```bash
npm test
```

169+ tests against a real Chrome, with **no npm dependencies**: the harness
drives the browser over the DevTools Protocol using Node's built-in
`WebSocket`. You need Node 18+ and a Chrome/Chromium binary; set `CHROME_PATH`
if it lives somewhere unusual. See [`tests/README.md`](tests/README.md).

## Quick start: bundled files

Load the CSS after your existing theme and the JavaScript before `</body>`.

```html
<link rel="stylesheet" href="/static/ui-framework/dist/ui-framework.min.css">

<main class="ui-scope">
    <!-- New UI Framework components -->
</main>

<script src="/static/ui-framework/dist/ui-framework.min.js"></script>
```

The paths above are plain HTML. Swap them for whatever your server templates
use (JSTL's `<c:url>`, Thymeleaf, PHP includes, a Rails/Django asset helper,
and so on all just resolve to the same static file). See
[`examples/jsp-integration.jsp`](examples/jsp-integration.jsp) for one worked
example.

The optional `ui-scope` class applies the framework's base typography and box
sizing to a wrapper. Individual `ui-*` component classes work without it.

## Modular loading

Always load tokens first. Load `00-core.js` before interactive modules.

```html
<link rel="stylesheet" href="src/css/00-tokens.css">
<link rel="stylesheet" href="src/css/05-buttons.css">
<link rel="stylesheet" href="src/css/06-forms.css">
<link rel="stylesheet" href="src/css/14-modal-offcanvas.css">

<script src="src/js/00-core.js"></script>
<script src="src/js/05-modal.js"></script>
```

## Build

```bash
python3 build.py
```

## Documentation

Open `docs/index.html` directly, or run (from the project root, so
`../dist/...` references inside the docs resolve correctly):

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080/docs/`.

The documentation includes:

- Overview
- Installation and server-side integration
- Layout and grid guide
- Live examples for every major component
- Utility reference
- JavaScript API
- Worked examples: dashboard, form workflow, login, a combined
  application form, and a record register with charts and a print sheet

## Repeater

A table that grows a row at a time: the control behind "add a row for every
unlicensed premise / unregistered device / unlicensed employee".

```html
<div class="ui-repeater ui-repeater-stack" data-ui-repeater
     data-ui-name="unlicensedPremises" data-ui-min="1" data-ui-max="20">
  <table class="ui-repeater-table">
    <thead><tr><th class="ui-repeater-num">#</th><th>Premise</th><th></th></tr></thead>
    <tbody></tbody>
  </table>

  <template data-ui-repeater-row>
    <tr>
      <td class="ui-repeater-num"></td>
      <td data-label="Premise"><input class="ui-control" name="{name}[{i}].premise"></td>
      <td><button type="button" class="ui-repeater-remove" data-ui-repeater-remove
                  aria-label="Remove row">&times;</button></td>
    </tr>
  </template>

  <div class="ui-repeater-empty">No unlicensed premises recorded.</div>
  <div class="ui-repeater-foot">
    <button type="button" class="ui-btn ui-btn-sm" data-ui-repeater-add>Add premise</button>
    <span class="ui-repeater-count"></span>
  </div>
</div>
```

`{i}` and `{name}` are rewritten on every add and remove, so the collection
posts as `unlicensedPremises[0].premise`: the indexed form Spring binds to a
`List` without a custom binder. Removing the middle row re-indexes the
survivors contiguously.

`.ui-repeater-stack` turns each row into a card below 48rem, using the same
`data-label` mechanism as `.ui-table-stack`. At the minimum the remove buttons
are disabled rather than hidden. `UI.repeater.add()`, `.count()`, `.clear()`;
events `ui:repeater:add`, `:remove`, `:change`.

## Yes / No / N-A

Three states, not a checkbox. "Not applicable" is a real answer in a
compliance checklist and is materially different from "not answered": the
compliance rate excludes one and is blocked by the other.

```html
<div class="ui-yn" data-ui-yn>
  <input type="hidden" name="premiseLicensed" value="">
  <button type="button" data-ui-yn-value="YES">Yes</button>
  <button type="button" data-ui-yn-value="NO">No</button>
  <button type="button" data-ui-yn-value="NA">N/A</button>
</div>
```

Clicking the selected answer clears it, so a mis-tap on a phone is
recoverable. Read with `UI.yn.value(target)`; listen for `ui:yn:change`.

## Themes

Load the core stylesheet, then a theme:

```html
<link rel="stylesheet" href="/static/ui-framework/dist/ui-framework.min.css">
<link rel="stylesheet" href="/static/ui-framework/dist/themes/default.min.css">
```

Swapping one theme for another changes every screen: buttons, links, focus
rings, charts, badges, the navigation rail, the stage tags. **A theme is only
design tokens**: no component CSS is touched and nothing needs `!important`,
which is what makes adopting the framework in a new product a one-line change
rather than an afternoon of overrides.

Two ship, as worked examples rather than as anybody's house style:

| Theme | Looks like |
| --- | --- |
| `default` | Blue primary, comfortable sizing. Start here. |
| `forest` | Green primary, slate neutrals, dense back-office sizing. |

Themes are **not** in the core bundle. The framework is meant to be used by
more than one product, and baking one product's palette into the shared
artefact is how a shared framework stops being shareable.

To make your own: copy `src/themes/default.css`, change the values, add the
filename to `THEMES` in `build.py`. Getting the five `--ui-primary-*` values
right is most of the job.

**[THEMING.md](THEMING.md)** has the full token contract, dark mode,
per-region and per-tenant overrides, runtime switching, and the three things
worth knowing before picking colours. The docs site has a
[live theme switcher](docs/theming.html) you can click through.

## Application chrome

Token-driven, so these recolour with the theme:

| Class | Use |
| --- | --- |
| `.ui-stage` + `.ui-stage-1/2/3/4` | Phase tag above a page title |
| `.ui-sidebar-brand` | Branded navigation rail |
| `.ui-brandmark` | Square logo tile |
| `.ui-notice` | Full-width standing banner: reads as chrome, not as content to action |
| `.ui-badge-dot` | Adds a status dot to a badge |

## Custom tokens

To adjust a theme rather than replace it, override tokens after loading it:

```css
:root {
    --ui-primary: #143b6b;
    --ui-primary-hover: #0d2d55;
    --ui-success: #3cb371;
    --ui-radius-3: 8px;
    --ui-font-sans: "Open Sans", Arial, sans-serif;
}
```

Dark theme:

```html
<html data-ui-theme="dark">
```

Or use the built-in toggle:

```html
<button type="button" data-ui-theme-toggle>Change theme</button>
```

## Floating labels

The label starts as a placeholder and floats up on focus or once the field
has a value. The input needs `placeholder=" "` (a single space) so the
`:placeholder-shown` pseudo-class works, and the label must come *after*
the input in markup.

```html
<div class="ui-floating">
    <input class="ui-control" id="fullName" placeholder=" ">
    <label class="ui-label" for="fullName">Full name</label>
</div>
```

Add `ui-floating-outline` to float the label directly onto the border
(Material-style) instead of shrinking it into the top padding:

```html
<div class="ui-floating ui-floating-outline">
    <input class="ui-control" id="email" placeholder=" ">
    <label class="ui-label" for="email">Email address</label>
</div>
```

## Custom checkbox

The input must immediately precede its label:

```html
<input id="assignAll"
       type="checkbox"
       class="ui-checkbox ui-checkbox-lg ui-checkbox-success">

<label for="assignAll">Actions</label>
```

The component explicitly overrides legacy `display:none` checkbox rules while
keeping the real input visually hidden and keyboard-accessible.

## Form validation

Add `data-ui-validate` to a form. Native constraints (`required`, `type`,
`pattern`, `min`/`max`) are checked alongside cross-field rules, and messages
render inline: a red border on the control and a short message directly
beneath it: instead of in the browser's own bubble, which can't be styled,
isn't read out on submit, and disappears on scroll.

```html
<form data-ui-validate action="/save" method="post">
    <div data-ui-validate-summary></div>

    <div class="ui-field">
        <label class="ui-label" for="email">Email</label>
        <input class="ui-control" id="email" name="email" type="email" required>
    </div>

    <div class="ui-field">
        <label class="ui-label" for="end">End date</label>
        <input class="ui-control" id="end" name="end" type="date" data-ui-rule-after="start">
    </div>

    <button class="ui-btn ui-btn-primary" type="submit">Submit</button>
</form>
```

`data-ui-validate-summary` is optional. Add it only on longer forms where a
single at-a-glance list of problems genuinely helps; the field-level
highlighting works on its own without it. `data-ui-rule-after` /
`-before` compare two date fields by `id`; register further custom rules
with `UI.validate.addRule(name, fn)`, usable as `data-ui-rule-<name>`.
Override any rule's default message with `data-ui-message-<rule>`.

To bind errors that only the server can catch (a duplicate email, a
uniqueness constraint), call `UI.validate.showErrors(form, errors)` with
`errors` as `{ fieldName: "message" }`: it applies the same inline styling
and moves focus to the first invalid field.

## Security

See [`SECURITY.md`](SECURITY.md) for the escaping contract, the three places
server-supplied HTML is trusted by design, URL-scheme handling, CSRF, and what
`data-ui-draft` and `UI.offline` write to the device.

Two things worth knowing before you build anything:

- **CSRF is automatic** if the page carries the conventional meta tags. Add
  them once in your layout and every framework write: save-and-next, draft
  autosave, the offline queue, sends the token:

  ```html
  <meta name="csrf-token"  content="${_csrf.token}">
  <meta name="csrf-header" content="${_csrf.headerName}">
  ```

- **`data-ui-draft` and `UI.offline` persist form data unencrypted**, and do
  not exclude sensitive fields. Do not put `data-ui-draft` on a form
  containing anything you would not write to disk in plain text, and clear
  both on sign-out (`UI.offline.clear()` plus the `ui-draft:` keys).

## Multi-select

Use a native `<select multiple>`. It stays in the form and receives all selected
values. In `data-display="tags"` mode, once more than `data-max-tags` options
(default 3) are selected, the rest collapse into a single "+N" chip (hover it
to see the remaining labels) so the trigger doesn't grow unbounded.

```html
<select name="reviewerIds"
        multiple
        data-ui-multiselect
        data-display="tags"
        data-max-tags="3"
        data-placeholder="Select reviewers"
        data-search="true"
        data-select-all="true">
    <option value="1">Asha M.</option>
    <option value="2">Baraka J.</option>
</select>
```

## Select list

The tree select handles *selection*. A select list adds what someone needs in
order to *decide*: the numbers behind each option, per-group totals, and a
search. Add `data-ui-tree-columns` (and optionally `data-ui-tree-search`) to an
existing `.ui-tree` and it upgrades in place.

```html
<div class="ui-tree" data-ui-tree
     data-ui-tree-columns="Operators,Premises"
     data-ui-tree-search="Search 26 regions">

  <div class="ui-tree-node">
    <div class="ui-tree-row">
      <button type="button" class="ui-tree-toggle"></button>
      <input type="checkbox" class="ui-tree-check">
      <span class="ui-tree-label">
        <span class="ui-tree-name">Eastern Zone</span>
        <span class="ui-tree-sub">3 regions</span>
      </span>
      <span class="ui-tree-actions">
        <button type="button" class="ui-tree-action" data-ui-tree-all>Select all</button>
        <button type="button" class="ui-tree-action" data-ui-tree-none>Clear</button>
      </span>
      <span class="ui-tree-nums">
        <span class="ui-tree-num" data-ui-tree-total></span>
        <span class="ui-tree-num ui-tree-num-optional" data-ui-tree-total></span>
      </span>
      <span class="ui-tree-count" data-ui-tree-selected></span>
    </div>
    <div class="ui-tree-children">
      <div class="ui-tree-node" data-ui-tree-value="DSM">
        <div class="ui-tree-row">
          <input type="checkbox" class="ui-tree-check">
          <span class="ui-tree-label">
            <span class="ui-tree-name">Dar es Salaam</span>
            <span class="ui-tree-sub">HQ Dar es Salaam &middot; 5 districts</span>
          </span>
          <span class="ui-tree-nums">
            <span class="ui-tree-num">14</span>
            <span class="ui-tree-num ui-tree-num-optional">86</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Shown only when the group really has no rows. -->
    <div class="ui-tree-empty">
      Operation types for Casino have not been defined yet.
    </div>
  </div>
</div>
```

`[data-ui-tree-selected]` is filled with `n / total`; a `.ui-tree-num` marked
`data-ui-tree-total` on a group row is filled with the sum of that column
across the group's visible children. Columns are a fixed width so numbers of
different lengths line up. Override with `--ui-tree-num-width`. Mark any
column past the first `.ui-tree-num-optional` and it drops out below 36rem.

`UI.selectList.refresh(target)` recomputes after you replace rows;
`UI.selectList.search(target, term)` applies a search programmatically.

## Filter bar

One button per filterable dimension instead of a chip row per dimension. Each
opens a select list in a modal.

```html
<div class="ui-filter-bar" data-ui-filter-bar id="inspectionFilters"
     data-ui-filter-url="f_">
  <span class="ui-filter-bar-label">Filter</span>

  <button class="ui-filter-btn" data-ui-filter="region" data-ui-filter-title="Region"
          data-ui-filter-target="#regionPicker">Region:
    <span class="ui-filter-value">All</span></button>

  <button class="ui-filter-clear" hidden>Clear</button>
</div>

<template id="regionPicker"> ...a .ui-tree select list... </template>
```

Counts beside each option should be *conditional*: how many rows you would
see if you added this value to the filters already active. That is a server
calculation, so use `data-ui-filter-src="/inspections/filters/region"` instead
of a local template: it is fetched with the current state as query parameters
and must return the picker's HTML.

`data-ui-filter-url="f_"` mirrors the state into the query string with that
prefix, so a filtered list can be linked to, and arrives filtered.

State is scoped to the bar. Filtering a findings register does not narrow an
inspections register elsewhere on the site. Listen for `ui:filter:change`, or
read `UI.filter.state(bar)`; set with `UI.filter.set(bar, key, values)`.

## Segmented control

For a scope switch. The question the screen is answering, as opposed to a
filter that narrows it.

```html
<div class="ui-segmented" id="scope">
  <button class="ui-segment ui-active" data-ui-value="MINE">Assigned to me
    <span class="ui-segment-count">4</span></button>
  <button class="ui-segment" data-ui-value="ALL">All
    <span class="ui-segment-count">15</span></button>
</div>
```

Emits `ui:segment:change`. `UI.segmented.value(group)` reads the selection.

## Disabled reasons

A disabled control with nothing beside it makes the user hunt the screen for
what they missed.

```html
<button class="ui-btn ui-btn-primary" disabled
        data-ui-disabled-reason="Select at least one region to continue.">
  Continue
</button>
```

The reason renders next to the control, is wired to it with
`aria-describedby`, and disappears by itself when the control becomes usable.
From script: `UI.blocker.set(button, reason)` and `UI.blocker.clear(button)`.

## Offline work queue

`data-ui-draft` protects the form you are looking at. This protects work you
have finished but could not send: an inspector completing premise visits with
no signal, an officer in a district office on one bar.

```html
<form data-ui-offline-form data-ui-offline-url="/api/premise-visits"
      data-ui-offline-label="Premise visit: Kariakoo"
      data-ui-offline-group="INSP-2026-101"
      action="/api/premise-visits" method="post">
  ...fields...
</form>

<div class="ui-sync ui-sync-fixed" data-ui-sync></div>
<div class="ui-sync-queue" data-ui-sync-queue></div>
```

By default the form posts normally when online and queues when offline. Use
`data-ui-offline-form="always"` to queue every submission, so the offline path
is the same code path rather than a rarely-exercised branch.

From script:

```javascript
UI.offline.queue({
    url: "/api/premise-visits",
    body: { premiseId: "P-001", outcome: "COMPLETE" },
    label: "Premise visit: Kariakoo",
    group: "INSP-2026-101"   // ordering scope
});

UI.offline.status();   // { state, total, pending, conflict, failed, online }
UI.offline.flush();    // try now
UI.offline.resolve(id, "retry" | "discard");
```

How responses are treated, and why:

| Response | Treatment |
| --- | --- |
| 2xx | Removed from the queue; `ui:offline:synced` |
| Network failure, 408, 429, 5xx | Kept as `pending` and retried: transient |
| Other 4xx | Marked `failed` and **not** retried; it will fail identically forever, and a retry loop buries the one item that needs a person |
| 409 | Marked `conflict` and kept, with the server's detail attached; `ui:offline:conflict` |

Items are sent oldest-first, and a blocked item stops the rest of *its own
group* so a later edit never lands before the create it depends on. Storage is
IndexedDB with a `localStorage` fallback. `resolve(id, "discard")` is the only
path by which field data ever leaves the device unsent, deliberately a
separate, explicit act.

Evidence files are out of scope: queue the metadata and upload binaries
separately.

## Save & next forms

Works as a plain form post; add `data-ui-ajax="true"` to submit via `fetch()`
instead of a full page reload.

```html
<form data-ui-save-next
      data-ui-position="3" data-ui-total="12"
      data-ui-prev-url="/records/2/edit"
      data-ui-next-url="/records/4/edit"
      action="/records/3" method="post">
    ...fields...
    <div class="ui-save-next-bar">
        <div class="ui-save-next-info">
            <div class="ui-progress ui-save-next-progress"><div class="ui-progress-bar"></div></div>
            Record <span data-ui-save-next-position>3</span> of <span data-ui-save-next-total>12</span>
            <span class="ui-save-next-dirty">Unsaved</span>
        </div>
        <div class="ui-save-next-actions">
            <button type="button" data-ui-save-next-prev>‹ Previous</button>
            <button type="submit" name="uiSaveNextAction" value="save">Save</button>
            <button type="submit" name="uiSaveNextAction" value="save-next"
                    data-ui-save-next-submit>Save &amp; next ›</button>
        </div>
    </div>
</form>
```

Ctrl/Cmd+Enter triggers "Save & next" from anywhere in the form. Leaving the
page (or clicking Previous) with unsaved changes prompts for confirmation.

Add `data-ui-stepper-form` to the same `<form>` to turn it into a multi-step
wizard: wrap each step in `<fieldset data-ui-step>` (all but the first
`hidden`), add a `.ui-stepper` progress header, and give the wizard its own
`data-ui-step-back` / `data-ui-step-next` buttons alongside the existing
`data-ui-save-next-submit` button, which only appears on the last step.
"Next" validates the current step's fields before advancing; by default that
falls back to the browser's own `reportValidity()`, so nothing extra is
required beyond marking fields `required`: but that native bubble can't be
styled, isn't read out on submit, and disappears on scroll. Add
`data-ui-validate` to the same form and it renders those errors with the
same inline red-border-and-message pattern documented under
[Form validation](#form-validation) instead.

```html
<form data-ui-stepper-form data-ui-save-next data-ui-validate
      data-ui-position="4" data-ui-total="12"
      action="/applications/4" method="post">

    <div class="ui-stepper" data-ui-stepper>
        <div class="ui-step"><div class="ui-step-marker">1</div><div class="ui-step-label">Applicant</div></div>
        <div class="ui-step"><div class="ui-step-marker">2</div><div class="ui-step-label">Premises</div></div>
    </div>

    <fieldset data-ui-step>...step 1 fields...</fieldset>
    <fieldset data-ui-step hidden>...step 2 fields...</fieldset>

    <div class="ui-save-next-bar">
        <div class="ui-save-next-actions">
            <button type="button" data-ui-step-back hidden>‹ Back</button>
            <button type="button" data-ui-step-next>Next ›</button>
            <button type="submit" name="uiSaveNextAction" value="save-next"
                    data-ui-save-next-submit hidden>Save &amp; next ›</button>
        </div>
    </div>
</form>
```

## Save draft

Add `data-ui-draft` to a form to autosave its fields to `localStorage` as the
user types (debounced ~800ms). If a draft exists next time the page loads, a
banner is inserted before the form offering to restore or discard it. The
draft is cleared on submit.

```html
<form data-ui-draft data-ui-draft-key="application-form">
    <div class="ui-form-group">
        <label class="ui-label" for="notes">Review notes</label>
        <textarea class="ui-control" id="notes" name="notes"></textarea>
    </div>
    <button type="submit">Submit</button>
    <span data-ui-draft-status></span>
</form>
```

`data-ui-draft-key` is optional (falls back to the form's `id`, then its
`action` URL); `data-ui-draft-status` is an optional element the module
fills with "Draft saved HH:MM". Listen for `ui:draft:saved`,
`ui:draft:restored`, and `ui:draft:discarded` on the form.

By default this only writes to the browser's `localStorage`. Nothing is
sent to a server. Open devtools → Application → Local Storage to inspect it,
or from the console: `JSON.parse(localStorage.getItem("ui-draft:<key>"))`.

To also persist drafts server-side (so they survive a cleared browser or
follow the user to another device), add `data-ui-draft-url` pointing at an
endpoint that implements this contract:

```html
<form data-ui-draft data-ui-draft-key="application-form"
      data-ui-draft-url="/api/drafts/application-form">
```

| Method | Behavior |
| --- | --- |
| `GET <url>` | Return `200 {"fields": {...}, "savedAt": <ms epoch>}`, or `404` if there's no saved draft |
| `POST <url>` | Body is `{"fields": {...}, "savedAt": <ms epoch>}`; store it |
| `DELETE <url>` | Clear the stored draft |

`localStorage` is still used as an instant local cache: on load, whichever
of the local/server copy has the newer `savedAt` wins. Network or server
failures are swallowed (the local draft keeps working) and reported via
`ui:draft:sync-error` on the form, so you can surface a "saved locally only"
indicator if you want one.

## Date range picker

A two-month calendar popover with quick presets, built over two native
`<input type="date">` fields so the chosen range still posts with a plain
HTML form even without JavaScript. Supports full keyboard navigation (arrow
keys, Home/End, Page Up/Down, Enter), `data-min-date` / `data-max-date`
bounds, `data-disabled-dates` (comma-separated ISO dates), and a clear
button. The popover is positioned with `UI.floatPanel()` (see below), so it
flips above the field and escapes clipping automatically.

```html
<div class="ui-date-range" data-ui-date-range data-ui-placeholder="Select date range"
     data-min-date="2026-01-01" data-max-date="2026-12-31"
     data-disabled-dates="2026-12-25,2026-01-01">
    <input type="date" name="reportStart" aria-label="Start date">
    <input type="date" name="reportEnd" aria-label="End date">
</div>
```

```javascript
document.querySelector("[data-ui-date-range]")
    .addEventListener("ui:daterange:change", function (event) {
        console.log(event.detail.start, event.detail.end);
    });
```

Wrap a single `<input type="text">` instead of two to post the range as one
field. The component detects the input count and stores the combined value
as `YYYY-MM-DD - YYYY-MM-DD`. Don't use `type="date"` here. A native date
input can only hold one date and silently rejects the combined value.

```html
<div class="ui-date-range" data-ui-date-range>
    <input type="text" name="reportRange">
</div>
<!-- posts as reportRange=2026-07-20 - 2026-07-26 -->
```

## Date picker

The single-date counterpart, built over one native `<input type="date">`.
Same keyboard navigation, `data-min-date`/`data-max-date`/
`data-disabled-dates`, and clear button as the range picker, but with a
single month and simple Yesterday/Today/Tomorrow presets.

```html
<div class="ui-date-picker" data-ui-date-picker data-ui-placeholder="Select date">
    <input type="date" name="reviewDate" aria-label="Review date">
</div>
```

```javascript
document.querySelector("[data-ui-date-picker]")
    .addEventListener("ui:datepicker:change", function (event) {
        console.log(event.detail.value);
    });
```

## Floating panels

`UI.floatPanel(trigger, panel, options)` positions any popover (dropdown
menu, multi-select menu, date range panel) with `position: fixed` computed
from the trigger's live viewport coordinates, so it escapes clipping by a
scrollable ancestor (e.g. a `.ui-modal-body`) and flips above the trigger
when there isn't room below. Pass `{ align: "end" }` to right-align, or
`{ matchWidth: true }` to match the trigger's width. Returns a cleanup
function to call when the panel closes.

## Smart tables

Add `data-ui-table` to enhance any `.ui-table` with client-side search,
column sorting, and pagination. Mark sortable headers with
`data-ui-sort="text"|"number"|"date"` (omit or set to `"false"` for a
non-sortable column like an actions column); give a `<td>`
`data-ui-sort-value` when its sort key differs from its display text (e.g. a
raw ISO date behind a friendly display format).

```html
<div data-ui-table data-ui-page-size="10">
  <table class="ui-table ui-table-striped ui-table-hover">
    <thead>
      <tr>
        <th data-ui-sort="text">Premise</th>
        <th data-ui-sort="date">Applied</th>
        <th data-ui-sort="false">Action</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Premise One</td>
        <td data-ui-sort-value="2026-01-04">4 Jan 2026</td>
        <td><button>Open</button></td>
      </tr>
      ...
    </tbody>
  </table>
</div>
```

Search and sorting run against the full row set before paging, so results
stay correct across pages. Listen for `ui:table:change` on the wrapper for
the current page, total pages, and visible/total row counts.

A page-size selector ("Show N per page") is included by default, offering
`data-ui-page-sizes` (default `5,10,25,50`; the initial `data-ui-page-size`
is merged in if it isn't already one of them). Turn it off with
`data-ui-page-size-selector="false"`.

Additional table designs (independent of `data-ui-table`, just CSS):
`.ui-table-minimal` (no header fill), `.ui-table-dark-header`, and
`.ui-table-card-rows` (each row as its own rounded, shadowed card).

Add `data-ui-select` for a checkbox column and bulk-action bar
(`data-ui-table-selection`), `data-ui-columns` for a column-visibility menu,
and `data-ui-export="filename"` for a CSV export button that covers every
row matching the current search and sort, not just the page on screen. The
selection bar's count doubles as a collapse control: click it to tuck the
bulk-action buttons away without clearing the selection.

## Charts

Dependency-free SVG charts: `bar`, `line`, `area`, `sparkline`, and `donut`:
— each rendered with a generated `aria-label` and a visually-hidden data
table, so the numbers are available to screen readers and to print.

Charts render in real pixel units and re-render on resize. Add `data-ui-axis`
for a y-axis with round-number ticks, gridlines, category labels and a
baseline; `data-ui-value-labels` to print each value on its mark;
`data-ui-target="80"` with `data-ui-target-label` for a reference line;
`data-ui-max` to pin the scale; `data-ui-axis-x` / `data-ui-axis-y` for axis
titles. A chart with no data renders `data-ui-empty-text` rather than
nothing.

```html
<div data-ui-chart="bar" data-ui-values="12,19,3" data-ui-labels="Jan,Feb,Mar"
     data-ui-title="Value by month"></div>

<div data-ui-chart="donut" data-ui-values="4,1,1" data-ui-labels="Active,Expired,Suspended"
     data-ui-centre="6" data-ui-legend data-ui-legend-percent></div>
```

A flat `data-ui-values` list only ever holds one series. For grouped/stacked
bars, multi-line comparisons, or a stacked area chart, give the element a
JSON data island instead:

```html
<div data-ui-chart="bar" data-ui-stacked data-ui-legend>
    <script type="application/json">
        {"labels": ["Jan", "Feb", "Mar"],
         "series": [{"name": "North", "values": [12, 19, 7]},
                    {"name": "South", "values": [8, 11, 14]}]}
    </script>
</div>
```

Drop `data-ui-stacked` for side-by-side grouped bars instead; add
`data-ui-orientation="horizontal"` to either: a horizontal bar chart prints
its category names down the left, which is usually what a "by region" or "by
operator" breakdown wants. `data-ui-legend-toggle` lets the reader switch a
series off; it stays listed and struck through, because hiding it would also
hide the control that brings it back.

`UI.chart.update(target, data)` accepts the same `{labels, series}` shape (or
the plain `(values, labels)` form for a single series) to re-render a chart in
place, so one fed from an API response doesn't need to hand-build a
comma-separated string. `UI.chart.refresh(target)` re-renders without changing
the data.

### Charts from an endpoint

Smart tables have had `data-ui-url` since they were written; charts did not,
so every dashboard hand-rolled the same fetch-then-update.

```html
<div data-ui-chart="bar" data-ui-axis
     data-ui-url="/compliance/rates"
     data-ui-refresh-on="#inspectionFilters"
     data-ui-error-text="Rates could not be loaded."></div>
```

Accepted response shapes: the same ones `UI.chart.update()` takes:

```json
[1, 2, 3]
{ "values": [87, 64], "labels": ["Q1", "Q2"] }
{ "labels": ["Q1", "Q2"], "series": [{ "name": "Planned", "values": [12, 19] }] }
```

`data-ui-refresh-on` names an element whose changes re-query: usually a
filter bar, and it listens for `ui:filter:change`, `ui:segment:change` and
`ui:daterange:change`. The current filter state goes out as query parameters,
so one endpoint can serve the chart and the table beside it.

While loading, the chart shows a skeleton in its own shape (so the page does
not jump when the data lands) and sets `aria-busy`. A failed request renders
**an error state, not an empty one**: "No data to display" when the server is
down tells the reader there is nothing to see, which is false and is the kind
of thing that ends up in a report. Listen for `ui:chart:error` (carries the
HTTP status) or `ui:chart:loaded`. An in-flight request is aborted when a new
one starts, so rapid filter changes cannot let a stale response win.

`UI.chart.load(target)` re-queries on demand, after saving a record, say.

### Clickable charts

A data point that navigates should be a **link**, not a click handler. An
`<a>` inside SVG is keyboard focusable, shows its target in the status bar,
opens in a new tab on middle-click, can be copied from the context menu, and
still works if the script that would have handled the click fails to load.
None of that is true of `onclick`.

```html
<div data-ui-chart="bar" data-ui-axis
     data-ui-values="14,9,22,5"
     data-ui-labels="Dar es Salaam,Mwanza,Arusha,Tanga"
     data-ui-link-template="/inspections?region={label}"></div>
```

Placeholders: `{label}`, `{value}`, `{series}`, `{index}`, `{seriesIndex}`,
each URL-encoded. For links that don't follow a pattern, give
`data-ui-links="/a,/b,/c"` or a `links` array alongside `values` in the JSON
island. `data-ui-link-target="_blank"` opens in a new tab.

The chart's ARIA role changes to match: a static chart is `role="img"` with
one description, an interactive one is `role="group"` whose links are each
labelled: marking a group of links as an image would hide every one of them,
since an image has no interior.

For a single-page application that routes rather than navigates, listen for
`ui:chart:select` and cancel it. The `href` stays in the markup, so the chart
degrades to working links if the router never loads:

```javascript
chart.addEventListener("ui:chart:select", function (event) {
    event.preventDefault();
    router.go(event.detail.label);   // also: value, series, index, href
});
```

Tooltips are rendered by the framework rather than left to the browser's
native `<title>` behaviour: a native tooltip takes about a second to appear,
cannot be styled, and **never appears on a touch screen**: which meant a
value was simply unreachable on a phone. `<title>` is still emitted as a
fallback for print and for scripting-disabled contexts.

## Uploads

A drag-and-drop dropzone with client-side size/type/count gating (the
server must still enforce all three. This is a courtesy, not a control)
and, with `data-ui-url`, an immediate `XMLHttpRequest` upload with a real
per-file progress bar.

```html
<div class="ui-upload" data-ui-upload data-ui-max-size="5MB" data-ui-max-files="4"
     accept=".pdf,.png,.jpg">
    <label class="ui-upload-dropzone">
        <input type="file" multiple accept=".pdf,.png,.jpg">
        <span class="ui-upload-title">Drop files here or click to browse</span>
    </label>
    <div class="ui-upload-preview"></div>
</div>
```

Add `data-ui-upload-layout="inline"` to list selected files as wrapping
compact chips instead of one full-width row each: better for a dropzone
that regularly holds many small files (photos, scans).

## Printing a single element

Plain `window.print()` prints everything visible on the page, not just a
certificate or report sheet a "Print" button implies. Add
`data-ui-print-target` to the button instead, pointing at the element to
print in isolation:

```html
<button data-ui-print-target="#certificate">Print certificate</button>
<div class="ui-document" id="certificate">...</div>
```

`UI.print(target)` does the same thing from script, taking a selector or an
element reference.

## JavaScript examples

```javascript
UI.toast.show({
    type: "success",
    title: "Saved",
    message: "The record was saved successfully."
});

UI.alert.create({
    target: "#messageArea",
    type: "danger",
    title: "Validation failed",
    message: "Please correct the highlighted fields."
});

UI.modal.open(document.getElementById("assignModal"));

UI.confirm({
    title: "Revoke access",
    message: "This will immediately revoke the account's access.",
    variant: "danger",
    confirmText: "Revoke access"
}).then(function (confirmed) {
    if (confirmed) {
        // proceed with the revoke request
    }
});
```

## Design approach

The framework uses an original implementation with:

- Base component plus modifier classes
- Mobile-first responsive breakpoints
- A 12-column grid
- CSS custom-property design tokens
- Utility classes for common layout and spacing work
- Accessible data-attribute-driven JavaScript components
- A strict `ui-` prefix to minimize collisions

No Bootstrap, Tailwind, Material, jQuery, or third-party runtime is required.

## Browser support

Designed for current versions of Chrome, Edge, Firefox, and Safari. The
framework uses modern CSS custom properties, `color-mix()`, `closest()`,
`CustomEvent`, and standard DOM APIs.

## License

MIT
