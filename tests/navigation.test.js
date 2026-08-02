"use strict";

/**
 * Navigation: the generic data-ui-collapse trigger (accordion's own toggle
 * and now the sidebar submenu reuse it) and the accordion's single-open
 * behavior. Previously untested anywhere in the suite.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

test("a generic data-ui-collapse trigger toggles its target panel", async () => {
  await ui.page(
    `<button class="ui-sidebar-link" data-ui-collapse data-ui-target="#panel" aria-expanded="false">Compliance</button>
     <ul class="ui-sidebar-submenu ui-collapse" id="panel" hidden>
       <li><a class="ui-sidebar-link" href="#">Schedule Inspection</a></li>
     </ul>`,
    async (page) => {
      assert.equal(await page.isVisible("#panel"), false);
      await page.click("[data-ui-collapse]");
      assert.equal(await page.attr("[data-ui-collapse]", "aria-expanded"), "true");
      assert.equal(await page.isVisible("#panel"), true);

      await page.click("[data-ui-collapse]");
      assert.equal(await page.attr("[data-ui-collapse]", "aria-expanded"), "false");
      assert.equal(await page.isVisible("#panel"), false);
    }
  );
});

test("data-ui-collapse also matches aria-controls when data-ui-target is absent", async () => {
  await ui.page(
    `<a class="ui-sidebar-link" href="#" data-ui-collapse aria-controls="panel2" aria-expanded="false">Reports</a>
     <ul class="ui-sidebar-submenu ui-collapse" id="panel2" hidden><li>Row</li></ul>`,
    async (page) => {
      await page.click("[data-ui-collapse]");
      assert.equal(await page.isVisible("#panel2"), true);
    }
  );
});

const ACCORDION = `
  <div class="ui-accordion">
    <div class="ui-accordion-item">
      <button class="ui-accordion-button" aria-expanded="true" aria-controls="one">General</button>
      <div class="ui-accordion-panel ui-collapse ui-show" id="one">First</div>
    </div>
    <div class="ui-accordion-item">
      <button class="ui-accordion-button" aria-expanded="false" aria-controls="two">Details</button>
      <div class="ui-accordion-panel ui-collapse" id="two" hidden>Second</div>
    </div>
  </div>`;

test("opening one accordion item closes the other by default", async () => {
  await ui.page(ACCORDION, async (page) => {
    assert.equal(await page.isVisible("#one"), true);
    await page.click(".ui-accordion-button[aria-controls='two']");
    assert.equal(await page.isVisible("#two"), true);
    assert.equal(await page.isVisible("#one"), false, "opening the second item must close the first");
  });
});

test("data-ui-multiple keeps every accordion item independently open", async () => {
  await ui.page(
    `<div class="ui-accordion" data-ui-multiple="true">
       <div class="ui-accordion-item">
         <button class="ui-accordion-button" aria-expanded="true" aria-controls="a">A</button>
         <div class="ui-accordion-panel ui-collapse ui-show" id="a">First</div>
       </div>
       <div class="ui-accordion-item">
         <button class="ui-accordion-button" aria-expanded="false" aria-controls="b">B</button>
         <div class="ui-accordion-panel ui-collapse" id="b" hidden>Second</div>
       </div>
     </div>`,
    async (page) => {
      await page.click(".ui-accordion-button[aria-controls='b']");
      assert.equal(await page.isVisible("#a"), true, "the first item must stay open");
      assert.equal(await page.isVisible("#b"), true);
    }
  );
});
