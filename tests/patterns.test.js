"use strict";

/**
 * Register patterns: the segmented scope switch, the rule that a disabled
 * control says why it is disabled, and the touch sizing opt-in.
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

/**
 * The sizes .ui-touch is for. A stacked table is the shape that carries them
 * in the field, and .ui-control-sm is the size that would otherwise zoom: a
 * plain .ui-control already inherits 16px from the page.
 */
const TOUCH_TABLE = `
  <div class="ui-touch">
    <table class="ui-table ui-table-stack">
      <thead><tr><th>Premise</th><th>Devices</th><th>Condition</th></tr></thead>
      <tbody><tr>
        <td data-label="Premise">Kilimanjaro Bar</td>
        <td data-label="Devices"><input class="ui-control ui-control-sm" id="devices" value="6"></td>
        <td data-label="Condition"><select class="ui-select ui-select-sm" id="condition">
          <option>Working</option></select></td>
      </tr></tbody>
    </table>
    <button class="ui-btn ui-btn-sm" id="open">Open</button>
  </div>`;

test("a touch region's text fields are large enough not to zoom iOS Safari", async () => {
  await ui.page(TOUCH_TABLE, async (page) => {
    const sizes = await page.evaluate(() =>
      ["devices", "condition"].map((id) => {
        const style = getComputedStyle(document.getElementById(id));
        return { id, font: parseFloat(style.fontSize), height: parseFloat(style.minHeight) };
      }));

    sizes.forEach((size) => {
      // Below 16px iOS zooms the viewport on focus, which undoes the 44px
      // target this class exists to provide.
      assert.ok(size.font >= 16, size.id + " font-size must be >= 16px, got " + size.font);
      assert.ok(size.height >= 44, size.id + " min-height must be >= 44px, got " + size.height);
    });
  });
});

test("touch sizing leaves buttons at their own size", async () => {
  // Only a focusable text field triggers the zoom, and .ui-btn-sm is a
  // deliberate size a caller picked.
  await ui.page(TOUCH_TABLE, async (page) => {
    const button = await page.styles("#open", ["font-size", "min-height"]);
    assert.notEqual(button["font-size"], "16px");
    assert.equal(button["min-height"], "44px");
  });
});

test("outside .ui-touch a small control keeps its small size", async () => {
  // The opt-in is per region precisely because the same control sits on a
  // desk at 13px.
  await ui.page(TOUCH_TABLE.replace('class="ui-touch"', 'class="ui-desk"'), async (page) => {
    const styles = await page.styles("#devices", ["font-size"]);
    assert.equal(styles["font-size"], "13px");
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
