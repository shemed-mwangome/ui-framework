"use strict";

/**
 * Test harness entry point.
 *
 * Usage inside a `*.test.js` file:
 *
 *   const { test } = require("node:test");
 *   const assert = require("node:assert/strict");
 *   const { useHarness } = require("./harness");
 *
 *   const ui = useHarness();
 *
 *   test("modal opens", async () => {
 *     await ui.page('<button data-ui-modal-open="m">Open</button>...', async (page) => {
 *       await page.click("[data-ui-modal-open]");
 *       assert.equal(await page.isVisible("#m"), true);
 *     });
 *   });
 *
 * `ui.page()` builds a real HTML document around the markup you pass, serves it
 * over HTTP, loads the framework the way a browser app would, and fails the
 * test if the page threw an uncaught exception -- so every spec doubles as a
 * smoke test for the modules it touches.
 */

const { before, after } = require("node:test");
const assert = require("node:assert/strict");

const { launchChrome } = require("./cdp");
const { start } = require("./server");
const { Page } = require("./page");

function useHarness(options) {
  options = options || {};
  const state = { browser: null, server: null };

  before(async () => {
    state.server = await start({ assets: process.env.UI_TEST_ASSETS || options.assets || "dist" });
    state.browser = await launchChrome();
  });

  after(async () => {
    if (state.browser) await state.browser.close();
    if (state.server) await state.server.close();
  });

  return {
    get server() {
      return state.server;
    },

    /** Opens `bodyHtml` in a fresh page, runs `fn(page)`, then tears down. */
    async page(bodyHtml, fn, fixtureOptions) {
      const page = await Page.create(state.browser.connection);
      try {
        await page.goto(state.server.fixture(bodyHtml, fixtureOptions));

        // Loading the bundle at all must be clean; a syntax error or a module
        // that throws on init would otherwise surface as a confusing
        // assertion failure much later in the test.
        assert.deepEqual(
          page.errors(),
          [],
          "Page threw during load:\n" + page.errors().join("\n")
        );

        await fn(page);

        assert.deepEqual(
          page.errors(),
          [],
          "Page threw an uncaught exception:\n" + page.errors().join("\n")
        );
      } finally {
        await page.close();
      }
    },

    /** Like `page()`, but without the framework bundle -- for load-order specs. */
    async bare(bodyHtml, fn, fixtureOptions) {
      return this.page(bodyHtml, fn, Object.assign({ bare: true }, fixtureOptions));
    },
  };
}

module.exports = { useHarness };
