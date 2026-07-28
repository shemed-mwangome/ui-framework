"use strict";

/**
 * Form-workflow composition.
 *
 * `data-ui-save-next`, `data-ui-stepper-form` and `data-ui-draft` are all
 * designed to sit on the *same* <form>. In 1.1.0 they all wrote the same
 * generic `dataset.uiReady` guard, so whichever module initialised first
 * silently blocked the other two. That class of bug is invisible in isolated
 * per-module demos and only shows up when the modules are combined -- so these
 * tests always compose them.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { useHarness } = require("./harness");

const ui = useHarness();
const SRC_JS = join(__dirname, "..", "src", "js");

const COMBINED_FORM = `
  <form id="app" method="post" action="/save"
        data-ui-stepper-form
        data-ui-save-next
        data-ui-draft
        data-ui-draft-key="test-application"
        data-ui-position="2" data-ui-total="5">

    <div data-ui-stepper>
      <div class="ui-step"><span class="ui-step-index">1</span></div>
      <div class="ui-step"><span class="ui-step-index">2</span></div>
    </div>

    <section data-ui-step>
      <label class="ui-label" for="applicant">Applicant</label>
      <input class="ui-control" id="applicant" name="applicant" required>
    </section>

    <section data-ui-step>
      <label class="ui-label" for="reference">Reference number</label>
      <input class="ui-control" id="reference" name="reference">
    </section>

    <div class="ui-save-next-progress"><div class="ui-progress"><div class="ui-progress-bar"></div></div></div>
    <button type="button" class="ui-btn" data-ui-step-back>Back</button>
    <button type="button" class="ui-btn ui-btn-primary" data-ui-step-next>Next</button>
    <button type="submit" class="ui-btn ui-btn-primary" data-ui-save-next-submit>Submit</button>
  </form>`;

test("every module uses a distinct dataset guard key", () => {
  // Static check: a new module reusing a neighbour's guard key on the same
  // element type reintroduces the 1.1.0 collision. Guard keys are cheap to
  // keep unique, so require it outright for form-level modules.
  const formLevel = ["11-save-next.js", "13-stepper-form.js", "17-draft.js"];
  const keys = new Map();

  for (const file of formLevel) {
    const source = readFileSync(join(SRC_JS, file), "utf8");
    // Dedupe within a file: each module reads its own guard then writes it.
    const found = new Set(
      [...source.matchAll(/dataset\.(ui[A-Za-z]*Ready)\b/g)].map((m) => m[1])
    );
    assert.ok(found.size > 0, file + " should guard against double-initialisation");
    for (const key of found) {
      if (keys.has(key)) {
        assert.fail(
          "Guard key collision: " + file + " and " + keys.get(key) + " both use dataset." + key +
            ". Both attach to <form>, so one will silently block the other."
        );
      }
      keys.set(key, file);
    }
  }
});

test("all JS modules are listed in build.py and manifest.json", () => {
  const onDisk = readdirSync(SRC_JS).filter((f) => f.endsWith(".js")).sort();
  const buildSource = readFileSync(join(__dirname, "..", "build.py"), "utf8");
  const manifest = require("../manifest.json");

  const jsOrder = buildSource.match(/JS_ORDER = \[([\s\S]*?)\]/)[1];
  const inBuild = [...jsOrder.matchAll(/"([^"]+\.js)"/g)].map((m) => m[1]);

  assert.deepEqual(
    inBuild.slice().sort(),
    onDisk,
    "src/js and build.py JS_ORDER are out of sync -- a module would be missing from dist/"
  );
  assert.deepEqual(
    manifest.jsModules.slice().sort(),
    onDisk,
    "manifest.json jsModules is out of sync with src/js"
  );
  assert.deepEqual(
    manifest.jsModules,
    inBuild,
    "manifest.json must list modules in the same load order as build.py"
  );
});

test("stepper, save-next and draft all initialise on one form", async () => {
  await ui.page(COMBINED_FORM, async (page) => {
    const state = await page.evaluate(() => {
      const form = document.getElementById("app");
      return {
        stepper: form.dataset.uiStepperReady === "true",
        saveNext: form.dataset.uiSaveNextReady === "true",
        draft: form.dataset.uiDraftReady === "true",
      };
    });

    assert.deepEqual(
      state,
      { stepper: true, saveNext: true, draft: true },
      "all three form modules must initialise -- none may block the others"
    );
  });
});

test("stepper shows one step at a time and gates Next on validation", async () => {
  await ui.page(COMBINED_FORM, async (page) => {
    const visibleSteps = () =>
      page.evaluate(
        () => [...document.querySelectorAll("[data-ui-step]")].filter((s) => !s.hidden).length
      );

    assert.equal(await visibleSteps(), 1, "only the current step should be visible");
    assert.equal(await page.isVisible("[data-ui-step-back]"), false, "Back hidden on first step");
    assert.equal(await page.isVisible("[data-ui-save-next-submit]"), false, "Submit hidden until last");

    // `applicant` is required and empty -- Next must not advance.
    await page.click("[data-ui-step-next]");
    assert.equal(
      await page.evaluate(() => document.querySelectorAll("[data-ui-step]")[0].hidden),
      false,
      "Next must not advance past an invalid required field"
    );

    await page.type("#applicant", "Keystone Industries Ltd");
    await page.click("[data-ui-step-next]");

    assert.equal(
      await page.evaluate(() => document.querySelectorAll("[data-ui-step]")[1].hidden),
      false,
      "second step should be showing"
    );
    assert.equal(await page.isVisible("[data-ui-step-back]"), true, "Back visible after advancing");
    assert.equal(
      await page.isVisible("[data-ui-save-next-submit]"),
      true,
      "Submit appears on the last step"
    );
  });
});

test("stepper marks completed steps and emits ui:stepper:change", async () => {
  await ui.page(COMBINED_FORM, async (page) => {
    await page.recordEvents(["ui:stepper:change"]);
    await page.type("#applicant", "Summit Ltd");
    await page.click("[data-ui-step-next]");

    const events = await page.recordedEvents();
    assert.ok(events.length >= 1, "advancing should emit ui:stepper:change");
    assert.deepEqual(events[events.length - 1].detail, { step: 1, total: 2 });

    const markers = await page.evaluate(() =>
      [...document.querySelectorAll("[data-ui-stepper] .ui-step")].map((m) => ({
        complete: m.classList.contains("ui-complete"),
        active: m.classList.contains("ui-active"),
      }))
    );
    assert.deepEqual(markers, [
      { complete: true, active: false },
      { complete: false, active: true },
    ]);
  });
});

test("save-next marks the form dirty on edit and syncs progress", async () => {
  await ui.page(COMBINED_FORM, async (page) => {
    assert.equal(
      await page.evaluate(() => document.getElementById("app").dataset.uiDirty),
      "false",
      "a pristine form should be explicitly marked clean"
    );

    await page.type("#applicant", "Redwood Ltd");

    assert.equal(
      await page.evaluate(() => document.getElementById("app").classList.contains("ui-dirty")),
      true,
      "editing a field should flag the form dirty for the unsaved-changes guard"
    );

    // data-ui-position=2 of 5 -> 40%
    assert.equal(
      await page.evaluate(() =>
        document.querySelector(".ui-save-next-progress .ui-progress-bar").className
      ),
      "ui-progress-bar ui-progress-w-40",
      "progress should be driven by a class, not an inline style (CSP-safe)"
    );
  });
});

test("draft autosaves to localStorage and offers a restore banner on reload", async () => {
  await ui.page(COMBINED_FORM, async (page) => {
    await page.type("#applicant", "Meridian Ltd");
    await page.wait(1200); // debounce is 800ms

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem("ui-draft:test-application");
      return raw ? JSON.parse(raw) : null;
    });

    assert.ok(stored, "draft should be persisted to localStorage");
    assert.deepEqual(stored.fields.applicant, ["Meridian Ltd"]);
    assert.ok(typeof stored.savedAt === "number", "draft should record savedAt for reconciliation");

    // Simulate a reload with the draft already present.
    await page.evaluate(() => {
      document.getElementById("applicant").value = "";
      document.getElementById("app").removeAttribute("data-ui-draft-ready");
      delete document.getElementById("app").dataset.uiDraftReady;
      window.UI.init(document);
    });

    assert.equal(
      await page.$("[data-ui-draft-restore], .ui-draft-banner"),
      true,
      "a restore affordance should appear when a saved draft exists"
    );
  });
});

test("no inline style attributes are emitted by JS modules (CSP safety)", async () => {
  await ui.page(COMBINED_FORM, async (page) => {
    await page.type("#applicant", "CSP Ltd");
    await page.click("[data-ui-step-next]");

    // floatPanel legitimately sets positioning styles on open panels; nothing
    // else in the framework should need `style-src 'unsafe-inline'`.
    const withInlineStyle = await page.evaluate(() =>
      [...document.querySelectorAll("#app [style]")].map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: el.className,
        style: el.getAttribute("style"),
      }))
    );

    assert.deepEqual(
      withInlineStyle,
      [],
      "form modules should drive visuals with classes, not inline styles"
    );
  });
});
