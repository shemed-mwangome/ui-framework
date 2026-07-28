"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

test("bundle loads and exposes the documented UI API", async () => {
  await ui.page("<p>hello</p>", async (page) => {
    const api = await page.evaluate(() => ({
      version: window.UI.version,
      methods: [
        "q",
        "qa",
        "closest",
        "emit",
        "escape",
        "uid",
        "register",
        "init",
        "focusable",
        "floatPanel",
        "trapFocus",
      ].filter((name) => typeof window.UI[name] === "function"),
      namespaces: ["modal", "toast", "confirm", "dropdown", "dateUtils"].filter(
        (name) => window.UI[name] !== undefined
      ),
    }));

    assert.match(api.version, /^\d+\.\d+\.\d+$/, "UI.version should be semver");
    assert.equal(api.methods.length, 11, "every documented UI.* helper should exist");
    assert.deepEqual(api.namespaces, ["modal", "toast", "confirm", "dropdown", "dateUtils"]);
  });
});

test("UI.version matches package.json", async () => {
  const pkg = require("../package.json");
  await ui.page("", async (page) => {
    assert.equal(
      await page.evaluate(() => window.UI.version),
      pkg.version,
      "UI.version drifted from package.json -- bump both"
    );
  });
});

test("UI.escape neutralises HTML", async () => {
  await ui.page("", async (page) => {
    const escaped = await page.evaluate(() => window.UI.escape('<img src=x onerror="boom()">'));
    assert.ok(!escaped.includes("<img"), "tags should be escaped");
    assert.ok(escaped.includes("&lt;img"), "should produce entities");
  });
});

test("UI.uid returns unique prefixed ids", async () => {
  await ui.page("", async (page) => {
    const ids = await page.evaluate(() =>
      Array.from({ length: 200 }, () => window.UI.uid("test"))
    );
    assert.equal(new Set(ids).size, ids.length, "ids should not collide");
    assert.ok(
      ids.every((id) => id.startsWith("test-")),
      "ids should carry the requested prefix"
    );
  });
});

test("UI.init is idempotent -- re-initialising does not double-bind", async () => {
  await ui.page(
    `<div data-ui-table>
      <table class="ui-table">
        <thead><tr><th data-ui-sort="text">Name</th></tr></thead>
        <tbody><tr><td>Alpha</td></tr><tr><td>Beta</td></tr></tbody>
      </table>
    </div>`,
    async (page) => {
      const before = await page.count(".ui-table-toolbar");
      await page.evaluate(() => {
        window.UI.init(document);
        window.UI.init(document);
      });
      const after = await page.count(".ui-table-toolbar");

      assert.equal(before, 1, "table should build its toolbar once on load");
      assert.equal(after, 1, "repeat UI.init() must not duplicate generated UI");
    }
  );
});

test("UI.init(root) picks up markup injected after page load", async () => {
  await ui.page('<div id="host"></div>', async (page) => {
    await page.evaluate(() => {
      const host = document.getElementById("host");
      host.innerHTML =
        '<div class="ui-dropdown">' +
        '<button data-ui-dropdown class="ui-btn">Menu</button>' +
        '<div class="ui-dropdown-menu"><a class="ui-dropdown-item" href="#">One</a></div>' +
        "</div>";
      window.UI.init(host);
    });

    await page.click("[data-ui-dropdown]");
    assert.equal(
      await page.evaluate(() => document.querySelector(".ui-dropdown").classList.contains("ui-open")),
      true,
      "AJAX-injected components should work after UI.init(root)"
    );
  });
});
