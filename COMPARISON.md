# Comparison and benchmark
## UI Framework 1.9.0 vs CoreUI 5, Bootstrap 5 and PrimeNG

**Date:** 20 August 2026
**Question asked:** can this framework build the GLICA Compliance module's screens, and how does it stand against the libraries we would otherwise buy or adopt?

---

## 1. Method

Two exercises, not one opinion.

1. **Inventory.** Every file in `src/css` and `src/js` read and catalogued — 26 CSS modules, 25 JS modules, 58 design tokens, a documented public API.
2. **Benchmark.** Three screens from the Compliance module prototype were rebuilt using *only* `ui-` classes: an inspections register with scope and filter controls, the six-step planning wizard's region selection, and a findings list. Every point where the markup had to fall back to a utility soup or an inline style was recorded as a gap.

The benchmark was run in a real browser with the actual `dist/` bundle. Twelve gaps were found. Ten are now closed in 1.9.0, one was a false positive, one is deliberately out of scope.

---

## 2. Headline

**The framework can build the module, and after 1.9.0 it can do so without a single line of page-level custom CSS.**

It was never a question of quality. Tables, stepper, tree select, modals, validation, charts, uploads and print all worked correctly and looked right on the first attempt. What was missing was the layer *above* the controls: the components that turn a set of inputs into a screen someone can make a decision on.

---

## 3. Scorecard

| | This framework 1.9.0 | CoreUI 5 (free) | CoreUI 5 PRO | Bootstrap 5 | PrimeNG |
|---|---|---|---|---|---|
| Dependencies | None | Bootstrap 5 | Bootstrap 5 | None | Angular |
| Build step | None | None | None | None | npm required |
| Works in JSP today | Yes | Yes | Yes | Yes | No |
| Survives the Angular migration | CSS yes, JS rewritten | Yes (`@coreui/angular`) | Yes | CSS only | Native |
| Data table with sort/search/paging/export | **Yes** | No | Yes (paid) | No | Yes |
| Multi-select | **Yes** | No | Yes (paid) | No | Yes |
| Date range picker | **Yes** | No | Yes (paid) | No | Yes |
| Stepper / wizard | **Yes** | No | Yes (paid) | No | Yes |
| Charts without a chart library | **Yes** | No | No | No | No |
| Offline work queue | **Yes** | No | No | No | No |
| Grouped select with count columns | **Yes** | No | No | No | Partial |
| Filter bar with conditional counts | **Yes** | No | No | No | No |
| Server-error binding into a form | **Yes** | No | No | No | Manual |
| Print a single element in isolation | **Yes** | No | No | No | No |
| Component count | ~40 | ~30 | 250+ | ~25 | 80+ |
| Licence | MIT | MIT | Commercial | MIT | MIT |

The row that matters commercially: **smart table, multi-select, date range picker and stepper are all CoreUI PRO — a paid licence.** This framework has equivalents of all four under MIT, already written and already tested.

---

## 4. What this framework does that none of them do

These are not gaps in the others so much as things a general-purpose library has no reason to build. They exist here because they were needed by a specific class of application — a regulatory back office with field officers — and they are the strongest argument for having built it.

- **Offline work queue.** No mainstream CSS/JS component library ships one. PrimeNG does not. CoreUI does not. It is normally assembled per-project from Workbox plus hand-written IndexedDB code. Field inspection is unbuildable without it.
- **Filter bar with conditional counts.** Every library gives you a multi-select. None gives you the pattern of one button per dimension whose picker shows how many rows each value would leave, scoped per screen and linkable by URL.
- **Grouped select with aligned numeric columns.** PrimeNG's `MultiSelect` with option grouping and a custom item template gets perhaps 70% of the way; the aligned count columns, per-group totals and the empty-group explanation are not there.
- **Charts with no charting library**, rendered with an accessible data table alongside.
- **Print a single element in isolation** — `window.print()` prints the page, which is not what a "Print certificate" button implies.
- **Server-error binding** (`UI.validate.showErrors()`), which is exactly the shape a Spring `BindingResult` arrives in.
- **A `@layer`-wrapped build**, for coexisting with the Bootstrap 4.6 and CoreUI 2 already in the admin application.

---

## 5. What the benchmark found, and what was done

| # | Gap found | Status in 1.9.0 |
|---|---|---|
| 1 | No neutral button — a bare `.ui-btn` is primary, so a toolbar rendered six primary buttons | `.ui-btn-default` |
| 2 | No page header for a list page | `.ui-page-head` |
| 3 | No segmented control with a selected state | `.ui-segmented` |
| 4 | No filter bar; four dimensions took four wrapped chip rows | `.ui-filter-bar` + picker |
| 5 | Tree counts did not align — 14, 3 and 217 started up to 8px apart | Fixed-width `.ui-tree-num`, verified aligned to the pixel |
| 6 | No sub-line under a tree label | `.ui-tree-sub` |
| 7 | No per-group Select all / Clear | `.ui-tree-actions` |
| 8 | An empty group expanded into nothing, indistinguishable from a bug | `.ui-tree-empty` |
| 9 | No convention for stating why a control is disabled | `data-ui-disabled-reason`, `UI.blocker` |
| 10 | No summary rail with a "not yet answered" state | `.ui-rail` |
| 11 | Status lexicon had no severity axis | `.ui-severity-*` |
| 12 | Nothing knew about connectivity or a queue of unsent work | `UI.offline`, `.ui-sync` |

One defect was found in existing code while building on it: **a control inside `.ui-tree-row` also collapsed the row**, so a per-group "Select all" folded the group shut the moment it filled it. The row handler excluded `.ui-tree-check` and `.ui-tree-meta` by name, which does not scale. It is now structural — a control that is not the toggle is not a collapse target.

Also added while in there: an `xl` breakpoint (the grid stopped at 1024px, so a 1920px monitor and a laptop resolved identically), `.ui-table-stack` for one-card-per-row on phones, and `.ui-touch` for 44px field targets.

---

## 6. Honest remaining gaps

Worth knowing before anyone claims parity.

| Gap | Severity | Comment |
|---|---|---|
| **Time picker** | Low | CoreUI PRO has one. Inspection times are captured as text today; add if a real need appears. |
| **Virtualised long lists** | Low | Tables paginate server-side, which is the right answer for 10,000 findings. Only bites on a single un-paged list of thousands. |
| **Evidence upload queueing** | Medium | The offline queue handles JSON writes. Binary evidence needs a separate resumable upload path — deliberately not folded in, because the two have different retry and storage-quota characteristics. |
| **No Angular components** | Medium | The CSS and the design tokens survive the migration; the JS modules would need Angular equivalents. CoreUI's dual Bootstrap/Angular packaging is its single strongest advantage over this framework. |
| **Breakpoint set** | Low | Now sm/md/lg/xl. No `xxl`. |
| **Carousel, rating, callout** | None | CoreUI has them; a regulatory back office does not need them. |
| ~~**Documentation for 1.9.0**~~ | Closed | README, `docs/components.html` (four new sections with live, working demos) and `docs/javascript.html` all cover the new components. |

---

## 7. Recommendation

**Use this framework for the Compliance module.** After 1.9.0 it covers every pattern the prototype needs, it carries four components that CoreUI charges for, and it already contains the one thing no library provides and the field module cannot do without.

Two conditions:

1. **Keep the tokens as the contract.** Screens should consume `--ui-*` custom properties, never hard-coded values. That is what makes the Angular migration a replacement of the JS layer rather than a redesign.
2. **Extend the framework, not the page.** Every gap in the table above was found because a screen worked around it locally. A pattern needed twice belongs in `src/`, with a test — which is how the framework stays worth having rather than becoming a second place to look for the same CSS.

For the Angular wave, revisit CoreUI: `@coreui/angular` tracks Angular 21+ and would let the visual language survive, with this framework's tokens driving its theme. That decision does not need making now, and nothing in 1.9.0 forecloses it.

---

## Sources

- [CoreUI free Bootstrap admin template](https://coreui.io/product/free-bootstrap-admin-template/)
- [CoreUI for Angular on npm](https://www.npmjs.com/package/@coreui/angular)
- [CoreUI Smart Table (PRO)](https://coreui.io/angular/docs/components/smart-table/)
- [CoreUI Date Range Picker (PRO)](https://coreui.io/react/docs/forms/date-range-picker/)
- [Angular Material or PrimeNG in 2026](https://www.syncfusion.com/blogs/post/angular-material-vs-primeng)
