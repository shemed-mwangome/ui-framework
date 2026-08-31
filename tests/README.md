# Tests

```bash
npm test              # run everything
npm run test:watch    # re-run on change
node --test "tests/overlays.test.js"                     # one file
node --test --test-name-pattern "Escape" "tests/*.test.js"  # one test
```

## No dependencies

There is no `node_modules` and nothing to install. The harness drives a real
Chrome over the DevTools Protocol using Node's built-in `WebSocket`, `node:test`
and `node:http`: the same constraint that keeps the framework itself
dependency-free, so `git clone && npm test` works on a locked-down build box.

You need **Node 18+** and a Chrome/Chromium binary. The harness looks in the
usual locations; override with `CHROME_PATH=/path/to/chrome npm test`.

## How a test works

```js
const { useHarness } = require("./harness");
const ui = useHarness();

test("modal closes on Escape", async () => {
  await ui.page('<div class="ui-modal" id="m">…</div>', async (page) => {
    await page.evaluate(() => UI.modal.open(document.querySelector("#m")));
    await page.press("Escape");
    assert.equal(await page.isVisible("#m"), false);
  });
});
```

`ui.page(html, fn)` wraps `html` in a full document, serves it over HTTP, loads
`dist/ui-framework.{css,js}` the way a real page does: so `DOMContentLoaded`
auto-init is genuinely exercised: and **fails the test if the page threw an
uncaught exception**. Every spec therefore doubles as a smoke test for the
modules it touches.

Input goes through real CDP mouse and keyboard events rather than
`element.click()`. That matters: click-outside-to-close, focus restoration and
focus trapping are all invisible to synthetic clicks. It also means a trigger
sitting behind an open modal genuinely isn't clickable, which is what you want.

### Page helpers

| Method | Purpose |
| --- | --- |
| `page.click(sel)` / `clickAt(x, y)` | Real mouse click |
| `page.press(key)` | Real key event (`Escape`, `Tab`, `Enter`, arrows, …) |
| `page.type(sel, text)` | Focus, replace value, fire `input`/`change` |
| `page.evaluate(fn, ...args)` | Run in the page; `fn` is serialised, so pass data via `args` |
| `page.waitFor(fn)` / `waitForSelector(sel)` | Poll on animation frames |
| `page.isVisible(sel)` | Computed style **and** non-zero box |
| `page.text/attr/value/count/styles` | Read the DOM |
| `page.activeElement()` | What has focus |
| `page.viewport(w, h, {mobile})` | Resize the layout viewport, so width media queries apply |
| `page.recordEvents([...])` / `recordedEvents()` | Capture `ui:*` custom events |

## What the suite protects

The specs deliberately target invariants that isolated per-component demos
cannot see:

- **`overlays.test.js`**, Escape closes only the *topmost* layer. There is no
  central overlay stack; each module registers its own document-level handler
  and relies on `stopImmediatePropagation()` plus the deliberate ordering in
  `build.py`'s `JS_ORDER`. 1.1.0 shipped a bug where Escape closed everything at
  once. Also covers focus trapping, focus restore, and the shared scroll-lock
  release condition.
- **`form-flow.test.js`**: `save-next`, `stepper-form` and `draft` composed on
  a *single* `<form>`, because that is the only configuration in which the 1.1.0
  `dataset.uiReady` guard collision was visible. Includes a static check that
  form-level modules never share a guard key.
- **`build.test.js`**: `dist/` is regenerated into a scratch directory and
  diffed against what is committed. Editing `src/` without rebuilding ships
  nothing, and the docs load `dist/`. Also pins the `JS_ORDER` overlay
  constraint, version consistency across five files, and the public design-token
  surface.
- **`data-table.test.js`**: search, sort, paginate and their compositions.
- **`capture.test.js`**: the stacked repeater's control sizing at 375px. A cell
  input under 16px makes iOS Safari zoom the viewport on focus, which is a
  defect no desk-width screenshot shows.

## Adding a test

Put it in the file matching the area you are changing, or add a new
`tests/<area>.test.js`. Files under `tests/harness/` are not test files and are
not picked up by the runner.

Prefer asserting on **behaviour a user could observe** (is it visible, what has
focus, what does the row say) over internal state. Where a test must reach for
internals, say why in a comment.
