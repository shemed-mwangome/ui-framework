"use strict";

/**
 * Register patterns: the segmented scope switch, and the rule that a
 * disabled control says why it is disabled.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

const SEGMENTED = `
  <div class="ui-segmented" id="scope">
    <button class="ui-segment ui-active" data-ui-value="MINE">Assigned to me
      <span class="ui-segment-count">4</span></button>
    <button class="ui-segment" data-ui-value="REGION">My region
      <span class="ui-segment-count">9</span></button>
    <button class="ui-segment" data-ui-value="ALL">All
      <span class="ui-segment-count">15</span></button>
  </div>`;

const BLOCKED = `
  <button class="ui-btn ui-btn-primary" id="next" disabled
          data-ui-disabled-reason="Select at least one region to continue.">Continue</button>`;

test("exactly one segment is selected, and it is announced", async () => {
  await ui.page(SEGMENTED, async (page) => {
    const pressed = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".ui-segment"))
        .map((segment) => segment.getAttribute("aria-pressed")));
    assert.deepEqual(pressed, ["true", "false", "false"]);
  });
});

test("clicking a segment moves the selection", async () => {
  await ui.page(SEGMENTED, async (page) => {
    await page.click('[data-ui-value="ALL"]');
    assert.equal(await page.evaluate(() => window.UI.segmented.value("#scope")), "ALL");
    assert.equal(await page.count(".ui-segment.ui-active"), 1);
  });
});

test("ui:segment:change carries the value", async () => {
  await ui.page(SEGMENTED, async (page) => {
    await page.recordEvents(["ui:segment:change"]);
    await page.click('[data-ui-value="REGION"]');
    const events = await page.recordedEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].detail.value, "REGION");
  });
});

test("arrow keys move between segments", async () => {
  await ui.page(SEGMENTED, async (page) => {
    await page.focus('[data-ui-value="MINE"]');
    await page.press("ArrowRight");
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute("data-ui-value")),
      "REGION"
    );
  });
});

test("segments buttons default to type=button", async () => {
  // A segment inside a form must not submit it.
  await ui.page("<form>" + SEGMENTED + "</form>", async (page) => {
    const types = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".ui-segment")).map((s) => s.type));
    assert.deepEqual(types, ["button", "button", "button"]);
  });
});

test("a disabled control states why", async () => {
  await ui.page(BLOCKED, async (page) => {
    const note = await page.evaluate(() => {
      const el = document.querySelector(".ui-blocker");
      return { text: el.textContent, hidden: el.hidden };
    });
    assert.equal(note.text, "Select at least one region to continue.");
    assert.equal(note.hidden, false);
  });
});

test("the reason is associated with the control for screen readers", async () => {
  await ui.page(BLOCKED, async (page) => {
    const linked = await page.evaluate(() => {
      const button = document.getElementById("next");
      const note = document.querySelector(".ui-blocker");
      return (button.getAttribute("aria-describedby") || "").split(" ").indexOf(note.id) !== -1;
    });
    assert.equal(linked, true);
  });
});

test("the reason disappears when the control becomes usable", async () => {
  await ui.page(BLOCKED, async (page) => {
    await page.evaluate(() => { document.getElementById("next").disabled = false; });
    await page.wait(30); // the observer fires on a microtask
    assert.equal(await page.evaluate(() => document.querySelector(".ui-blocker").hidden), true);
  });
});

test("UI.blocker.set disables and explains in one call", async () => {
  await ui.page('<button class="ui-btn" id="save">Save</button>', async (page) => {
    await page.evaluate(() => window.UI.blocker.set("#save", "Add at least one team member."));
    await page.wait(30);
    const state = await page.evaluate(() => ({
      disabled: document.getElementById("save").disabled,
      text: (document.querySelector(".ui-blocker") || {}).textContent
    }));
    assert.equal(state.disabled, true);
    assert.equal(state.text, "Add at least one team member.");
  });
});

test("UI.blocker.clear re-enables and removes the reason", async () => {
  await ui.page(BLOCKED, async (page) => {
    await page.evaluate(() => window.UI.blocker.clear("#next"));
    await page.wait(30);
    const state = await page.evaluate(() => ({
      disabled: document.getElementById("next").disabled,
      hidden: document.querySelector(".ui-blocker").hidden
    }));
    assert.equal(state.disabled, false);
    assert.equal(state.hidden, true);
  });
});
