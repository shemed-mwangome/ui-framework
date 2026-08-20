"use strict";

/**
 * Filter bar: one button per filterable dimension, each opening a grouped
 * picker. The behaviours that matter are that state is per bar, that the
 * picker opens showing what is already filtered, and that Cancel really
 * cancels.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

const PICKER = `
  <template id="regionPicker">
    <div class="ui-tree" data-ui-tree data-ui-tree-columns="Inspections">
      <div class="ui-tree-node">
        <div class="ui-tree-row">
          <button type="button" class="ui-tree-toggle"></button>
          <input type="checkbox" class="ui-tree-check">
          <span class="ui-tree-label"><span class="ui-tree-name">Eastern Zone</span></span>
          <span class="ui-tree-count" data-ui-tree-selected></span>
        </div>
        <div class="ui-tree-children">
          <div class="ui-tree-node" data-ui-tree-value="DSM">
            <div class="ui-tree-row"><input type="checkbox" class="ui-tree-check">
              <span class="ui-tree-label"><span class="ui-tree-name">Dar es Salaam</span></span>
              <span class="ui-tree-nums"><span class="ui-tree-num">9</span></span></div>
          </div>
          <div class="ui-tree-node" data-ui-tree-value="PWA">
            <div class="ui-tree-row"><input type="checkbox" class="ui-tree-check">
              <span class="ui-tree-label"><span class="ui-tree-name">Pwani</span></span>
              <span class="ui-tree-nums"><span class="ui-tree-num">2</span></span></div>
          </div>
        </div>
      </div>
    </div>
  </template>`;

const BAR = `
  <div class="ui-filter-bar" data-ui-filter-bar id="bar">
    <span class="ui-filter-bar-label">Filter</span>
    <button class="ui-filter-btn" data-ui-filter="region" data-ui-filter-title="Region"
            data-ui-filter-target="#regionPicker">Region: <span class="ui-filter-value">All</span></button>
    <button class="ui-filter-clear" hidden>Clear</button>
  </div>
  ${PICKER}`;

const SECOND_BAR = `
  <div class="ui-filter-bar" data-ui-filter-bar id="findingsBar">
    <button class="ui-filter-btn" data-ui-filter="region" data-ui-filter-title="Region"
            data-ui-filter-target="#regionPicker">Region: <span class="ui-filter-value">All</span></button>
  </div>`;

test("a dimension with nothing selected reads All", async () => {
  await ui.page(BAR, async (page) => {
    assert.equal(await page.text('[data-ui-filter="region"] .ui-filter-value'), "All");
    assert.equal(
      await page.evaluate(() => document.querySelector('[data-ui-filter="region"]').hasAttribute("data-ui-active")),
      false
    );
  });
});

test("the picker opens with the dimension's options", async () => {
  await ui.page(BAR, async (page) => {
    await page.click('[data-ui-filter="region"]');
    assert.equal(await page.count(".ui-filter-picker .ui-tree-leaf"), 2);
    assert.equal(await page.text(".ui-filter-picker .ui-modal-title"), "Region");
  });
});

test("applying one value summarises it by name, not by id", async () => {
  await ui.page(BAR, async (page) => {
    await page.click('[data-ui-filter="region"]');
    await page.click('.ui-filter-picker [data-ui-tree-value="DSM"] .ui-tree-check');
    await page.click("[data-ui-filter-apply]");

    assert.equal(await page.text('[data-ui-filter="region"] .ui-filter-value'), "Dar es Salaam");
    assert.equal(
      await page.evaluate(() => document.querySelector('[data-ui-filter="region"]').hasAttribute("data-ui-active")),
      true
    );
  });
});

test("applying several values collapses to a count", async () => {
  await ui.page(BAR, async (page) => {
    await page.click('[data-ui-filter="region"]');
    await page.click('.ui-filter-picker [data-ui-tree-value="DSM"] .ui-tree-check');
    await page.click('.ui-filter-picker [data-ui-tree-value="PWA"] .ui-tree-check');
    await page.click("[data-ui-filter-apply]");
    assert.equal(await page.text('[data-ui-filter="region"] .ui-filter-value'), "2 selected");
  });
});

test("reopening the picker shows what is already filtered", async () => {
  await ui.page(BAR, async (page) => {
    await page.click('[data-ui-filter="region"]');
    await page.click('.ui-filter-picker [data-ui-tree-value="DSM"] .ui-tree-check');
    await page.click("[data-ui-filter-apply]");
    await page.click('[data-ui-filter="region"]');

    const ticked = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".ui-filter-picker .ui-tree-check"))
        .filter((cb) => cb.checked).length);
    // The leaf plus its now-complete-enough parent rolling up.
    assert.ok(ticked >= 1, "the applied value is pre-ticked");
  });
});

test("cancel discards changes made in the picker", async () => {
  await ui.page(BAR, async (page) => {
    await page.click('[data-ui-filter="region"]');
    await page.click('.ui-filter-picker [data-ui-tree-value="DSM"] .ui-tree-check');
    await page.click("[data-ui-filter-cancel]");
    assert.equal(await page.text('[data-ui-filter="region"] .ui-filter-value'), "All");
  });
});

test("the clear control appears only when something is filtered", async () => {
  await ui.page(BAR, async (page) => {
    assert.equal(await page.evaluate(() => document.querySelector(".ui-filter-clear").hidden), true);

    await page.click('[data-ui-filter="region"]');
    await page.click('.ui-filter-picker [data-ui-tree-value="DSM"] .ui-tree-check');
    await page.click("[data-ui-filter-apply]");

    const clear = await page.evaluate(() => ({
      hidden: document.querySelector(".ui-filter-clear").hidden,
      text: document.querySelector(".ui-filter-clear").textContent
    }));
    assert.equal(clear.hidden, false);
    assert.equal(clear.text, "Clear 1 filter");
  });
});

test("clear resets every dimension on the bar", async () => {
  await ui.page(BAR, async (page) => {
    await page.click('[data-ui-filter="region"]');
    await page.click('.ui-filter-picker [data-ui-tree-value="DSM"] .ui-tree-check');
    await page.click("[data-ui-filter-apply]");
    await page.click(".ui-filter-clear");

    assert.equal(await page.text('[data-ui-filter="region"] .ui-filter-value'), "All");
    assert.deepEqual(await page.evaluate(() => window.UI.filter.state("#bar")), {});
  });
});

test("filter state belongs to one bar, not to the page", async () => {
  await ui.page(BAR + SECOND_BAR, async (page) => {
    await page.evaluate(() => window.UI.filter.set("#bar", "region", ["DSM"]));

    // The regression this guards: narrowing a findings register used to
    // silently narrow the inspections register on the way back.
    assert.deepEqual(await page.evaluate(() => window.UI.filter.state("#bar")), { region: ["DSM"] });
    assert.deepEqual(await page.evaluate(() => window.UI.filter.state("#findingsBar")), {});
  });
});

test("ui:filter:change carries the whole state, not just the dimension touched", async () => {
  await ui.page(BAR, async (page) => {
    await page.recordEvents(["ui:filter:change"]);
    await page.evaluate(() => window.UI.filter.set("#bar", "region", ["DSM", "PWA"]));

    const events = await page.recordedEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].detail.count, 2);
    assert.deepEqual(events[0].detail.state, { region: ["DSM", "PWA"] });
  });
});

test("values already on the button are honoured without any JS handshake", async () => {
  const preset = BAR.replace(
    'data-ui-filter-target="#regionPicker"',
    'data-ui-filter-target="#regionPicker" data-ui-filter-values=\'["DSM"]\''
  );
  await ui.page(preset, async (page) => {
    // A server-rendered page arrives with filters applied; the bar must
    // reflect that on first paint.
    assert.equal(
      await page.evaluate(() => document.querySelector('[data-ui-filter="region"]').hasAttribute("data-ui-active")),
      true
    );
    assert.deepEqual(await page.evaluate(() => window.UI.filter.state("#bar")), { region: ["DSM"] });
  });
});
