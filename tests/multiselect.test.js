"use strict";

/**
 * Multiselect: build, selection, tags, and refresh() for cascading option lists
 * (e.g. an operator field repopulated by AJAX after its region changes).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

const REGION_MULTISELECT = `
  <div class="ui-field">
    <label class="ui-label" for="regionFilter">Region(s)</label>
    <select id="regionFilter" multiple data-ui-multiselect
            data-display="tags" data-placeholder="Select region(s)"
            data-search="true" data-select-all="true">
      <option value="1">Dar es Salaam</option>
      <option value="2">Arusha</option>
      <option value="3">Mwanza</option>
    </select>
  </div>`;

test("a multiselect builds a trigger and menu from the source select's options", async () => {
  await ui.page(REGION_MULTISELECT, async (page) => {
    assert.equal(await page.count(".ui-multiselect-trigger"), 1);
    assert.equal(await page.count(".ui-multiselect-option"), 3);
    assert.equal(await page.text(".ui-multiselect-summary"), "Select region(s)");
  });
});

test("checking an option selects it in the backing select and updates the tag summary", async () => {
  await ui.page(REGION_MULTISELECT, async (page) => {
    await page.click(".ui-multiselect-trigger");
    await page.click('.ui-multiselect-option input[value="2"]');

    const selected = await page.evaluate(() =>
      Array.from(document.getElementById("regionFilter").options)
        .filter((o) => o.selected)
        .map((o) => o.value)
    );
    assert.deepEqual(selected, ["2"], "backing <select> must carry the value for a normal form submit");
    assert.equal(await page.text(".ui-multiselect-tag-text"), "Arusha");
  });
});

test("UI.multiselect.refresh() rebuilds the widget from a fresh option list", async () => {
  // Mirrors the region -> operator cascade in the compliance scheduling page: the
  // operator <select> starts empty, gets populated by an AJAX callback that appends
  // fresh <option>s, then must call refresh() because build() is a one-shot init.
  await ui.page(
    `<select id="operatorFilter" multiple data-ui-multiselect
             data-display="tags" data-placeholder="All operators in region(s)"></select>`,
    async (page) => {
      assert.equal(await page.count(".ui-multiselect-option"), 0);

      await page.evaluate(() => {
        var select = document.getElementById("operatorFilter");
        select.appendChild(new Option("Acme Traders", "10", false, true));
        select.appendChild(new Option("Zenith Ltd", "11"));
        UI.multiselect.refresh(select);
      });

      assert.equal(await page.count(".ui-multiselect-option"), 2, "rebuilt menu must reflect the new options");
      assert.equal(
        await page.text(".ui-multiselect-tag-text"),
        "Acme Traders",
        "an option marked selected before refresh must still show as selected after rebuild"
      );

      const selected = await page.evaluate(() =>
        Array.from(document.getElementById("operatorFilter").options)
          .filter((o) => o.selected)
          .map((o) => o.value)
      );
      assert.deepEqual(selected, ["10"]);
    }
  );
});

test("UI.multiselect.refresh() on a never-built select just builds it", async () => {
  await ui.page(`<div id="host"></div>`, async (page) => {
    await page.evaluate(() => {
      var select = document.createElement("select");
      select.id = "lazy";
      select.multiple = true;
      select.setAttribute("data-ui-multiselect", "");
      select.appendChild(new Option("Only option", "1"));
      document.getElementById("host").appendChild(select);
      UI.multiselect.refresh(select);
    });
    assert.equal(await page.count(".ui-multiselect-trigger"), 1);
    assert.equal(await page.count(".ui-multiselect-option"), 1);
  });
});
