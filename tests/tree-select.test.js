"use strict";

/**
 * Tree select: a checkbox hierarchy where a parent's checkbox cascades to
 * every descendant, and a descendant's checkbox rolls back up to a tri-state
 * (checked/unchecked/indeterminate) ancestor. Expand/collapse is independent
 * of selection.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

const TREE = `
  <div class="ui-tree" id="regions" data-ui-tree>
    <div class="ui-tree-node">
      <div class="ui-tree-row">
        <button type="button" class="ui-tree-toggle" aria-expanded="true"></button>
        <input type="checkbox" class="ui-tree-check">
        <span class="ui-tree-label">Dar es Salaam</span>
      </div>
      <div class="ui-tree-children">
        <div class="ui-tree-node" data-ui-tree-value="apex">
          <div class="ui-tree-row">
            <input type="checkbox" class="ui-tree-check">
            <span class="ui-tree-label">Apex Gaming</span>
          </div>
        </div>
        <div class="ui-tree-node" data-ui-tree-value="redwood">
          <div class="ui-tree-row">
            <input type="checkbox" class="ui-tree-check">
            <span class="ui-tree-label">Redwood Leisure</span>
          </div>
        </div>
      </div>
    </div>
    <div class="ui-tree-node">
      <div class="ui-tree-row">
        <button type="button" class="ui-tree-toggle" aria-expanded="true"></button>
        <input type="checkbox" class="ui-tree-check">
        <span class="ui-tree-label">Mwanza</span>
      </div>
      <div class="ui-tree-children">
        <div class="ui-tree-node" data-ui-tree-value="summit">
          <div class="ui-tree-row">
            <input type="checkbox" class="ui-tree-check">
            <span class="ui-tree-label">Summit Games</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;

test("leaves without a .ui-tree-children wrapper are auto-marked as leaves", async () => {
  await ui.page(TREE, async (page) => {
    const leafCount = await page.evaluate(() => document.querySelectorAll(".ui-tree-leaf").length);
    assert.equal(leafCount, 3, "the three operator rows have no children of their own");
    const regionIsLeaf = await page.evaluate(() =>
      document.querySelector("#regions > .ui-tree-node").classList.contains("ui-tree-leaf")
    );
    assert.equal(regionIsLeaf, false, "a region with operators underneath is not a leaf");
  });
});

test("checking a parent row cascades the check to every descendant", async () => {
  await ui.page(TREE, async (page) => {
    const regionCheckbox = await page.evaluate(() => {
      const region = document.querySelector("#regions > .ui-tree-node");
      const cb = region.querySelector(":scope > .ui-tree-row > .ui-tree-check");
      cb.click();
      return true;
    });
    assert.ok(regionCheckbox);

    const leafStates = await page.evaluate(() =>
      [...document.querySelectorAll("#regions > .ui-tree-node:first-child .ui-tree-leaf .ui-tree-check")]
        .map((cb) => cb.checked)
    );
    assert.deepEqual(leafStates, [true, true], "both operators under Dar es Salaam must now be checked");

    // The sibling region is untouched.
    const mwanzaChecked = await page.evaluate(() =>
      document.querySelector('[data-ui-tree-value="summit"] .ui-tree-check').checked
    );
    assert.equal(mwanzaChecked, false);
  });
});

test("checking every leaf under a parent checks the parent; unchecking one makes it indeterminate", async () => {
  await ui.page(TREE, async (page) => {
    await page.click('[data-ui-tree-value="apex"] .ui-tree-check');
    await page.click('[data-ui-tree-value="redwood"] .ui-tree-check');

    let region = await page.evaluate(() => {
      const cb = document.querySelector("#regions > .ui-tree-node:first-child > .ui-tree-row > .ui-tree-check");
      return { checked: cb.checked, indeterminate: cb.indeterminate };
    });
    assert.deepEqual(region, { checked: true, indeterminate: false }, "all children checked -> parent checked");

    await page.click('[data-ui-tree-value="redwood"] .ui-tree-check');

    region = await page.evaluate(() => {
      const cb = document.querySelector("#regions > .ui-tree-node:first-child > .ui-tree-row > .ui-tree-check");
      return { checked: cb.checked, indeterminate: cb.indeterminate };
    });
    assert.deepEqual(region, { checked: false, indeterminate: true }, "one of two children checked -> indeterminate");
  });
});

test("unchecking a checked parent clears every descendant", async () => {
  await ui.page(TREE, async (page) => {
    const region = "#regions > .ui-tree-node:first-child > .ui-tree-row > .ui-tree-check";
    await page.click(region);
    await page.click(region);

    const leafStates = await page.evaluate(() =>
      [...document.querySelectorAll("#regions > .ui-tree-node:first-child .ui-tree-leaf .ui-tree-check")]
        .map((cb) => cb.checked)
    );
    assert.deepEqual(leafStates, [false, false]);
  });
});

test("UI.treeSelect.selected returns the checked leaves' data-ui-tree-value", async () => {
  await ui.page(TREE, async (page) => {
    await page.click('[data-ui-tree-value="apex"] .ui-tree-check');
    await page.click('[data-ui-tree-value="summit"] .ui-tree-check');

    const selected = await page.evaluate(() => UI.treeSelect.selected("#regions"));
    assert.deepEqual(selected.sort(), ["apex", "summit"]);
  });
});

test("clicking the row (not the checkbox) toggles expand/collapse without changing selection", async () => {
  await ui.page(TREE, async (page) => {
    const label = "#regions > .ui-tree-node:first-child .ui-tree-label";
    await page.click(label);

    const state = await page.evaluate(() => {
      const node = document.querySelector("#regions > .ui-tree-node:first-child");
      return {
        collapsed: node.classList.contains("ui-collapsed"),
        childrenHidden: getComputedStyle(node.querySelector(":scope > .ui-tree-children")).display === "none",
        checked: node.querySelector(":scope > .ui-tree-row > .ui-tree-check").checked,
      };
    });
    assert.deepEqual(state, { collapsed: true, childrenHidden: true, checked: false });
  });
});

test("checking a checkbox does not also toggle collapse", async () => {
  await ui.page(TREE, async (page) => {
    await page.click("#regions > .ui-tree-node:first-child > .ui-tree-row > .ui-tree-check");

    const collapsed = await page.evaluate(() =>
      document.querySelector("#regions > .ui-tree-node:first-child").classList.contains("ui-collapsed")
    );
    assert.equal(collapsed, false, "selecting must not accidentally collapse the branch");
  });
});

test("a disabled leaf is excluded from cascade-down and from its parent's tri-state", async () => {
  await ui.page(
    `<div class="ui-tree" id="t" data-ui-tree>
       <div class="ui-tree-node">
         <div class="ui-tree-row">
           <input type="checkbox" class="ui-tree-check">
           <span class="ui-tree-label">Operator</span>
         </div>
         <div class="ui-tree-children">
           <div class="ui-tree-node" data-ui-tree-value="blocked">
             <div class="ui-tree-row">
               <input type="checkbox" class="ui-tree-check" disabled>
               <span class="ui-tree-label">Blocked premise (already scheduled)</span>
             </div>
           </div>
           <div class="ui-tree-node" data-ui-tree-value="open">
             <div class="ui-tree-row">
               <input type="checkbox" class="ui-tree-check">
               <span class="ui-tree-label">Open premise</span>
             </div>
           </div>
         </div>
       </div>
     </div>`,
    async (page) => {
      await page.click('#t > .ui-tree-node > .ui-tree-row > .ui-tree-check');

      const state = await page.evaluate(() => ({
        blocked: document.querySelector('[data-ui-tree-value="blocked"] .ui-tree-check').checked,
        open: document.querySelector('[data-ui-tree-value="open"] .ui-tree-check').checked,
        parent: (() => {
          const cb = document.querySelector('#t > .ui-tree-node > .ui-tree-row > .ui-tree-check');
          return { checked: cb.checked, indeterminate: cb.indeterminate };
        })(),
      }));

      assert.equal(state.blocked, false, "cascade must not check a disabled leaf");
      assert.equal(state.open, true, "the selectable sibling is still cascaded");
      assert.deepEqual(
        state.parent,
        { checked: true, indeterminate: false },
        "the disabled leaf must not be counted against the parent -- every *selectable* child is checked"
      );
    }
  );
});

test("ui:tree:change fires with the current selection", async () => {
  await ui.page(TREE, async (page) => {
    await page.recordEvents(["ui:tree:change"]);
    await page.click('[data-ui-tree-value="apex"] .ui-tree-check');

    const events = await page.recordedEvents();
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].detail.values, ["apex"]);
  });
});

test(".ui-tree-header presets and a one-off inline override all read from the same two variables", async () => {
  await ui.page(
    `<div class="ui-tree" data-ui-tree>
       <div class="ui-tree-node ui-tree-header" id="dark-node">
         <div class="ui-tree-row"><input type="checkbox" class="ui-tree-check"><span class="ui-tree-label">Default</span></div>
       </div>
       <div class="ui-tree-node ui-tree-header ui-tree-header-primary" id="primary-node">
         <div class="ui-tree-row"><input type="checkbox" class="ui-tree-check"><span class="ui-tree-label">Primary</span></div>
       </div>
       <div class="ui-tree-node ui-tree-header" id="custom-node" style="--ui-tree-header-bg: rgb(124, 58, 237); --ui-tree-header-color: rgb(255, 255, 255);">
         <div class="ui-tree-row"><input type="checkbox" class="ui-tree-check"><span class="ui-tree-label">Custom</span></div>
       </div>
     </div>`,
    async (page) => {
      const colors = await page.evaluate(() => {
        function rowBg(id) {
          return getComputedStyle(document.querySelector("#" + id + " > .ui-tree-row")).backgroundColor;
        }
        return {
          dark: rowBg("dark-node"),
          primary: rowBg("primary-node"),
          custom: rowBg("custom-node"),
        };
      });
      assert.notEqual(colors.dark, colors.primary, "the primary preset must repaint the row, not just sit unused on the node");
      assert.equal(colors.custom, "rgb(124, 58, 237)", "an inline --ui-tree-header-bg override must win over the class-based default");
    }
  );
});
