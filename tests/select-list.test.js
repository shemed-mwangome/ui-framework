"use strict";

/**
 * Select list: the decision layer over .ui-tree -- aligned numeric columns,
 * per-group counts and actions, an explanation for a legitimately empty
 * group, and a search. Selection itself belongs to tree-select.test.js.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

const LIST = `
  <div class="ui-tree" id="regions" data-ui-tree
       data-ui-tree-columns="Operators,Premises"
       data-ui-tree-search="Search regions">

    <div class="ui-tree-node" id="east">
      <div class="ui-tree-row">
        <button type="button" class="ui-tree-toggle"></button>
        <input type="checkbox" class="ui-tree-check">
        <span class="ui-tree-label"><span class="ui-tree-name">Eastern Zone</span></span>
        <span class="ui-tree-actions">
          <button type="button" class="ui-tree-action" data-ui-tree-all>Select all</button>
          <button type="button" class="ui-tree-action" data-ui-tree-none>Clear</button>
        </span>
        <span class="ui-tree-nums">
          <span class="ui-tree-num" data-ui-tree-total></span>
          <span class="ui-tree-num" data-ui-tree-total></span>
        </span>
        <span class="ui-tree-count" data-ui-tree-selected></span>
      </div>
      <div class="ui-tree-children">
        <div class="ui-tree-node" data-ui-tree-value="DSM">
          <div class="ui-tree-row">
            <input type="checkbox" class="ui-tree-check" checked>
            <span class="ui-tree-label"><span class="ui-tree-name">Dar es Salaam</span></span>
            <span class="ui-tree-nums"><span class="ui-tree-num">14</span><span class="ui-tree-num">86</span></span>
          </div>
        </div>
        <div class="ui-tree-node" data-ui-tree-value="PWA">
          <div class="ui-tree-row">
            <input type="checkbox" class="ui-tree-check">
            <span class="ui-tree-label"><span class="ui-tree-name">Pwani</span></span>
            <span class="ui-tree-nums"><span class="ui-tree-num">3</span><span class="ui-tree-num">19</span></span>
          </div>
        </div>
        <div class="ui-tree-node" data-ui-tree-value="MOR">
          <div class="ui-tree-row">
            <input type="checkbox" class="ui-tree-check">
            <span class="ui-tree-label"><span class="ui-tree-name">Morogoro</span></span>
            <span class="ui-tree-nums"><span class="ui-tree-num">217</span><span class="ui-tree-num">0</span></span>
          </div>
        </div>
      </div>
    </div>

    <div class="ui-tree-node ui-collapsed" id="casino">
      <div class="ui-tree-row">
        <button type="button" class="ui-tree-toggle"></button>
        <input type="checkbox" class="ui-tree-check">
        <span class="ui-tree-label"><span class="ui-tree-name">Casino</span></span>
        <span class="ui-tree-count" data-ui-tree-selected></span>
      </div>
      <div class="ui-tree-children"></div>
      <div class="ui-tree-empty">Operation types for Casino have not been defined yet.</div>
    </div>
  </div>`;

test("numeric columns align across every row", async () => {
  await ui.page(LIST, async (page) => {
    const lefts = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#east .ui-tree-leaf .ui-tree-num"))
        .map((cell) => Math.round(cell.getBoundingClientRect().left)));

    // Three rows, two columns each. A count of 14 and a count of 217 must
    // start at the same x or the column cannot be read down.
    const firstColumn = [lefts[0], lefts[2], lefts[4]];
    const secondColumn = [lefts[1], lefts[3], lefts[5]];
    assert.equal(new Set(firstColumn).size, 1, "first column is aligned");
    assert.equal(new Set(secondColumn).size, 1, "second column is aligned");
  });
});

test("group header shows selected over total", async () => {
  await ui.page(LIST, async (page) => {
    assert.equal(await page.text("#east [data-ui-tree-selected]"), "1 / 3");
  });
});

test("group header sums each column across its children", async () => {
  await ui.page(LIST, async (page) => {
    const totals = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#east > .ui-tree-row [data-ui-tree-total]"))
        .map((cell) => cell.textContent));
    assert.deepEqual(totals, ["234", "105"]);
  });
});

test("select all fills the group without collapsing it", async () => {
  await ui.page(LIST, async (page) => {
    await page.click("#east [data-ui-tree-all]");
    assert.equal(await page.text("#east [data-ui-tree-selected]"), "3 / 3");

    // The regression this guards: .ui-tree-row is a collapse target, so a
    // button inside it used to fold the group shut the moment it filled it.
    const collapsed = await page.evaluate(() =>
      document.getElementById("east").classList.contains("ui-collapsed"));
    assert.equal(collapsed, false, "the group stays open");
  });
});

test("clear empties only its own group", async () => {
  await ui.page(LIST, async (page) => {
    await page.click("#east [data-ui-tree-all]");
    await page.click("#east [data-ui-tree-none]");
    assert.equal(await page.text("#east [data-ui-tree-selected]"), "0 / 3");
  });
});

test("group actions are disabled when they would do nothing", async () => {
  await ui.page(LIST, async (page) => {
    await page.click("#east [data-ui-tree-none]");
    const states = await page.evaluate(() => ({
      all: document.querySelector("#east [data-ui-tree-all]").disabled,
      none: document.querySelector("#east [data-ui-tree-none]").disabled
    }));
    assert.equal(states.none, true, "nothing selected, so Clear is inert");
    assert.equal(states.all, false, "Select all still has work to do");
  });
});

test("clicking the row label still toggles the group", async () => {
  await ui.page(LIST, async (page) => {
    await page.click("#east .ui-tree-name");
    assert.equal(
      await page.evaluate(() => document.getElementById("east").classList.contains("ui-collapsed")),
      true
    );
  });
});

test("an empty group explains itself instead of expanding into nothing", async () => {
  await ui.page(LIST, async (page) => {
    await page.click("#casino .ui-tree-name");
    const empty = await page.evaluate(() => {
      const row = document.querySelector("#casino .ui-tree-empty");
      return { hidden: row.hidden, height: Math.round(row.getBoundingClientRect().height) };
    });
    assert.equal(empty.hidden, false);
    assert.ok(empty.height > 0, "the explanation is actually visible");
  });
});

test("a column head is generated from data-ui-tree-columns", async () => {
  await ui.page(LIST, async (page) => {
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".ui-tree-colhead .ui-tree-num"))
        .map((cell) => cell.textContent));
    assert.deepEqual(labels, ["Operators", "Premises"]);
  });
});

test("search hides non-matching leaves and their empty groups", async () => {
  await ui.page(LIST, async (page) => {
    await page.evaluate(() => window.UI.selectList.search("#regions", "morogoro"));
    const result = await page.evaluate(() => ({
      visible: document.querySelectorAll("#regions .ui-tree-leaf:not([data-ui-filtered])").length,
      casinoHidden: document.getElementById("casino").hasAttribute("data-ui-filtered"),
      counter: document.querySelector(".ui-tree-search-count").textContent
    }));
    assert.equal(result.visible, 1);
    assert.equal(result.casinoHidden, true, "a group with no match drops out while searching");
    assert.equal(result.counter, "1 of 3");
  });
});

test("clearing the search restores every row", async () => {
  await ui.page(LIST, async (page) => {
    await page.evaluate(() => window.UI.selectList.search("#regions", "morogoro"));
    await page.evaluate(() => window.UI.selectList.search("#regions", ""));
    assert.equal(
      await page.count("#regions .ui-tree-leaf:not([data-ui-filtered])"),
      3
    );
  });
});

test("a search with no matches says so", async () => {
  await ui.page(LIST, async (page) => {
    await page.evaluate(() => window.UI.selectList.search("#regions", "zzzz"));
    assert.equal(
      await page.evaluate(() => document.querySelector(".ui-tree-noresults").hidden),
      false
    );
  });
});

test("counts follow selection made through the tree", async () => {
  await ui.page(LIST, async (page) => {
    await page.click('[data-ui-tree-value="PWA"] .ui-tree-check');
    assert.equal(await page.text("#east [data-ui-tree-selected]"), "2 / 3");
  });
});
