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

// --------------------------------------------------------------------------
// Application chrome
// --------------------------------------------------------------------------

test("the chrome is styled by the bundle alone, with no theme loaded", async () => {
  // 32-chrome.css draws the nav rail, the stage tag and the notice bar
  // entirely from tokens, but --ui-nav-*, --ui-stage-* and --ui-notice-*
  // existed only in the shipped themes. THEMING.md says a theme is optional
  // and the docs pages load none, so the bundle on its own produced a rail
  // with no background and text the colour of the page. This fixture loads
  // dist/ui-framework.css and nothing else, which is the broken condition.
  await ui.page(
    `<nav class="ui-sidebar ui-sidebar-brand" id="rail">
       <a class="ui-sidebar-link ui-active" href="#" id="active">Licences</a>
     </nav>
     <span class="ui-stage ui-stage-1" id="stage">Planning</span>
     <div class="ui-notice" id="notice">Scheduled maintenance on Sunday.</div>`,
    async (page) => {
      const transparent = (colour) =>
        colour === "transparent" || /rgba\(0,\s*0,\s*0,\s*0\)/.test(colour);

      const rail = await page.styles("#rail", ["background-color", "color"]);
      assert.ok(!transparent(rail["background-color"]), "the nav rail must have a background");

      const active = await page.styles("#active", ["background-color"]);
      assert.ok(
        !transparent(active["background-color"]),
        "the active nav item must be filled, not just bold"
      );

      const stage = await page.styles("#stage", ["background-color", "color"]);
      assert.ok(!transparent(stage["background-color"]), "a stage tag must have its fill");
      assert.notEqual(stage.color, rail.color, "and its own text colour");

      const notice = await page.styles("#notice", ["background-color"]);
      assert.ok(!transparent(notice["background-color"]), "the notice bar must have a background");
    }
  );
});

test("chrome tokens keep readable contrast in dark mode", async () => {
  // The dark stage colours are hand-picked, so this checks them rather than
  // trusting the eye: text on its own -soft fill, composited over the dark
  // page, must clear the WCAG AA 4.5:1 threshold for body text.
  await ui.page(
    `<div data-ui-theme="dark" style="background: var(--ui-surface);" id="shell">
       <span class="ui-stage ui-stage-1" id="s1">One</span>
       <span class="ui-stage ui-stage-2" id="s2">Two</span>
       <span class="ui-stage ui-stage-3" id="s3">Three</span>
       <span class="ui-stage ui-stage-4" id="s4">Four</span>
       <div class="ui-notice" id="notice">Notice</div>
     </div>`,
    async (page) => {
      const ratios = await page.evaluate(() => {
        const parse = (value) => value.match(/[\d.]+/g).map(Number);
        const channel = (c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        const luminance = ([r, g, b]) =>
          0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

        // Composite a possibly-translucent fill over the page behind it.
        const over = (fg, bg) => {
          const a = fg.length > 3 ? fg[3] : 1;
          return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
        };

        const page_ = parse(getComputedStyle(document.getElementById("shell")).backgroundColor);
        return ["s1", "s2", "s3", "s4", "notice"].map((id) => {
          const style = getComputedStyle(document.getElementById(id));
          const bg = over(parse(style.backgroundColor), page_);
          const fg = over(parse(style.color), bg);
          const light = Math.max(luminance(fg), luminance(bg));
          const dark = Math.min(luminance(fg), luminance(bg));
          return { id, ratio: (light + 0.05) / (dark + 0.05) };
        });
      });

      ratios.forEach(({ id, ratio }) =>
        assert.ok(ratio >= 4.5, id + " contrast is " + ratio.toFixed(2) + ":1, below AA 4.5:1")
      );
    }
  );
});
