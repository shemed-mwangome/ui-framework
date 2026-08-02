# UI Framework 1.8.1

A complete, dependency-free CSS and JavaScript UI framework designed for
server-rendered applications, static HTML, and legacy projects that already
use Bootstrap, CoreUI, or a custom `master.css`.

All framework classes use the `ui-` prefix. Interactive behavior uses
`data-ui-*` attributes.

New to the framework? Open [`quick-start.html`](quick-start.html) directly in
a browser (no server needed) to confirm it works, then read
[`docs/getting-started.html`](docs/getting-started.html) — it includes a
plain-language "how it works" primer and a troubleshooting section for
common first-time issues.

## What is included

### Two delivery styles

1. **Single-file distribution**
   - `dist/ui-framework.css`
   - `dist/ui-framework.min.css`
   - `dist/ui-framework.layered.css` (and `.layered.min.css`) — the same CSS
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

169+ tests against a real Chrome, with **no npm dependencies** — the harness
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

The paths above are plain HTML — swap them for whatever your server templates
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

## Custom theme

Override tokens after loading the framework:

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
render inline — a red border on the control and a short message directly
beneath it — instead of in the browser's own bubble, which can't be styled,
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

`data-ui-validate-summary` is optional — add it only on longer forms where a
single at-a-glance list of problems genuinely helps; the field-level
highlighting works on its own without it. `data-ui-rule-after` /
`-before` compare two date fields by `id`; register further custom rules
with `UI.validate.addRule(name, fn)`, usable as `data-ui-rule-<name>`.
Override any rule's default message with `data-ui-message-<rule>`.

To bind errors that only the server can catch (a duplicate email, a
uniqueness constraint), call `UI.validate.showErrors(form, errors)` with
`errors` as `{ fieldName: "message" }` — it applies the same inline styling
and moves focus to the first invalid field.

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
required beyond marking fields `required` — but that native bubble can't be
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

By default this only writes to the browser's `localStorage` — nothing is
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

`localStorage` is still used as an instant local cache — on load, whichever
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
as `YYYY-MM-DD - YYYY-MM-DD`. Don't use `type="date"` here — a native date
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
selection bar's count doubles as a collapse control — click it to tuck the
bulk-action buttons away without clearing the selection.

## Charts

Dependency-free SVG charts — `bar`, `line`, `area`, `sparkline`, and `donut`
— each rendered with `role="img"`, a generated `aria-label`, and a
visually-hidden data table, so the numbers are available to screen readers
and to print.

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
`data-ui-orientation="horizontal"` to either. `UI.chart.update(target,
data)` accepts the same `{labels, series}` shape (or the plain `(values,
labels)` form for a single series) to re-render a chart in place, so one fed
from an API response doesn't need to hand-build a comma-separated string.

## Uploads

A drag-and-drop dropzone with client-side size/type/count gating (the
server must still enforce all three — this is a courtesy, not a control)
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
compact chips instead of one full-width row each — better for a dropzone
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
