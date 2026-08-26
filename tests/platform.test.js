"use strict";

/**
 * Platform primitives: i18n, live-region announcements, teardown and
 * auto-initialisation.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { useHarness } = require("./harness");

const ui = useHarness();
const ROOT = join(__dirname, "..");

// --------------------------------------------------------------------------
// i18n
// --------------------------------------------------------------------------

test("UI.t interpolates placeholders and falls back to the key", async () => {
  await ui.page("", async (page) => {
    const result = await page.evaluate(() => ({
      plain: UI.t("confirm.cancel"),
      interpolated: UI.t("table.status", { visible: 12, total: 340 }),
      missingVar: UI.t("table.status", { visible: 12 }),
      unknownKey: UI.t("nope.not.a.key"),
    }));

    assert.equal(result.plain, "Cancel");
    assert.equal(result.interpolated, "12 of 340 records");
    assert.equal(result.missingVar, "12 of {total} records", "unfilled placeholders stay literal");
    assert.equal(result.unknownKey, "nope.not.a.key", "unknown keys return the key itself");
  });
});

test("a translated locale replaces framework-generated strings", async () => {
  await ui.page(
    `<div data-ui-table data-ui-page-size="2">
       <table class="ui-table">
         <thead><tr><th data-ui-sort="text">Company</th></tr></thead>
         <tbody><tr><td>Alpha</td></tr><tr><td>Beta</td></tr><tr><td>Gamma</td></tr></tbody>
       </table>
     </div>`,
    async (page) => {
      await page.evaluate(() => {
        UI.i18n.add("sw", {
          "table.search": "Tafuta",
          "table.empty": "Hakuna rekodi",
          "table.showPrefix": "Onyesha",
          "table.showSuffix": "kwa ukurasa",
        });
        UI.i18n.setLocale("sw");

        // Rebuild the table under the new locale.
        UI.destroy(document.querySelector("[data-ui-table]"));
        document.querySelector(".ui-table-toolbar").remove();
        document.querySelector(".ui-table-pagination").remove();
        UI.init(document);
      });

      assert.equal(await page.attr(".ui-table-search", "placeholder"), "Tafuta");
      assert.match(await page.text(".ui-table-page-size"), /^Onyesha/);
      assert.match(await page.text(".ui-table-page-size"), /kwa ukurasa$/);

      await page.type(".ui-table-search", "zzz");
      assert.equal(await page.text(".ui-table-empty-row"), "Hakuna rekodi");
    }
  );
});

test("per-element data attributes still beat the i18n table", async () => {
  await ui.page(
    `<div data-ui-table data-ui-empty-text="No records on file" data-ui-search-placeholder="Find company">
       <table class="ui-table">
         <thead><tr><th>Company</th></tr></thead>
         <tbody><tr><td>Alpha</td></tr></tbody>
       </table>
     </div>`,
    async (page) => {
      await page.evaluate(() => {
        UI.i18n.add("sw", { "table.empty": "Hakuna rekodi", "table.search": "Tafuta" });
        UI.i18n.setLocale("sw");
      });
      await page.type(".ui-table-search", "zzz");

      assert.equal(
        await page.attr(".ui-table-search", "placeholder"),
        "Find company",
        "existing markup must keep working after the i18n retrofit"
      );
      assert.equal(await page.text(".ui-table-empty-row"), "No records on file");
    }
  );
});

test("setLocale emits ui:locale:changed", async () => {
  await ui.page("", async (page) => {
    const detail = await page.evaluate(() => {
      let captured = null;
      document.addEventListener("ui:locale:changed", (e) => (captured = e.detail));
      UI.i18n.setLocale("sw");
      return captured;
    });
    assert.deepEqual(detail, { locale: "sw" });
  });
});

test("an unknown locale falls back to English rather than showing keys", async () => {
  await ui.page("", async (page) => {
    const value = await page.evaluate(() => {
      UI.i18n.setLocale("xx-not-a-locale");
      return UI.t("confirm.ok");
    });
    assert.equal(value, "Confirm");
  });
});

// --------------------------------------------------------------------------
// Announcements
// --------------------------------------------------------------------------

test("UI.announce writes into a polite live region", async () => {
  await ui.page("", async (page) => {
    await page.evaluate(() => UI.announce("12 records found"));
    await page.wait(120);

    assert.equal(await page.text("#ui-live-polite"), "12 records found");
    assert.equal(await page.attr("#ui-live-polite", "aria-live"), "polite");
    assert.equal(
      await page.evaluate(() =>
        document.getElementById("ui-live-polite").classList.contains("ui-sr-only")
      ),
      true,
      "the live region must not be visible on screen"
    );
  });
});

test("UI.announce re-announces an identical message", async () => {
  await ui.page("", async (page) => {
    // Setting the same textContent twice is a no-op for assistive tech, so the
    // region has to be cleared between announcements.
    const sawClear = await page.evaluate(async () => {
      UI.announce("Saved");
      await new Promise((r) => setTimeout(r, 120));

      let cleared = false;
      const region = document.getElementById("ui-live-polite");
      new MutationObserver(() => {
        if (region.textContent === "") cleared = true;
      }).observe(region, { childList: true, characterData: true, subtree: true });

      UI.announce("Saved");
      await new Promise((r) => setTimeout(r, 120));
      return { cleared, text: region.textContent };
    });

    assert.equal(sawClear.cleared, true, "region should be cleared before re-announcing");
    assert.equal(sawClear.text, "Saved");
  });
});

test("assertive announcements use a separate region", async () => {
  await ui.page("", async (page) => {
    await page.evaluate(() => {
      UI.announce("Just so you know", "polite");
      UI.announce("Submission failed", "assertive");
    });
    await page.wait(120);

    assert.equal(await page.attr("#ui-live-assertive", "aria-live"), "assertive");
    assert.equal(await page.text("#ui-live-assertive"), "Submission failed");
    assert.equal(await page.text("#ui-live-polite"), "Just so you know");
  });
});

// --------------------------------------------------------------------------
// Teardown
// --------------------------------------------------------------------------

test("UI.destroy runs cleanups and clears ready guards so markup re-inits", async () => {
  await ui.page(
    `<div id="host">
       <div data-ui-table data-ui-page-size="2">
         <table class="ui-table">
           <thead><tr><th data-ui-sort="text">Name</th></tr></thead>
           <tbody><tr><td>Alpha</td></tr><tr><td>Beta</td></tr><tr><td>Gamma</td></tr></tbody>
         </table>
       </div>
     </div>`,
    async (page) => {
      const result = await page.evaluate(() => {
        const wrapper = document.querySelector("[data-ui-table]");
        let cleanupRan = false;
        UI.cleanup(wrapper, () => (cleanupRan = true));

        // The guard is per-component (uiTableReady), not the generic uiReady
        // four modules once shared. UI.destroy()'s /^ui[A-Za-z]*Ready$/ is
        // what makes the name irrelevant to teardown -- but not to this test,
        // which read the old name and so compared undefined against undefined.
        const guardBefore = wrapper.dataset.uiTableReady;
        UI.destroy(document.getElementById("host"));

        return { cleanupRan, guardBefore, guardAfter: wrapper.dataset.uiTableReady };
      });

      assert.equal(result.guardBefore, "true");
      assert.equal(result.cleanupRan, true, "registered cleanup should run");
      assert.equal(result.guardAfter, undefined, "ready guard should be cleared");
    }
  );
});

test("UI.destroy releases floatPanel's global scroll listener", async () => {
  await ui.page(
    `<div id="host">
       <div class="ui-dropdown">
         <button id="dd" class="ui-btn" data-ui-dropdown>Menu</button>
         <div class="ui-dropdown-menu"><a class="ui-dropdown-item" href="#">One</a></div>
       </div>
     </div>`,
    async (page) => {
      const counts = await page.evaluate(() => {
        // Count live scroll listeners by instrumenting add/remove.
        let live = 0;
        const add = window.addEventListener.bind(window);
        const remove = window.removeEventListener.bind(window);
        window.addEventListener = function (type, fn, opts) {
          if (type === "scroll") live++;
          return add(type, fn, opts);
        };
        window.removeEventListener = function (type, fn, opts) {
          if (type === "scroll") live--;
          return remove(type, fn, opts);
        };

        document.querySelector("#dd").click();
        const whileOpen = live;

        // Tear out the subtree while the panel is still open -- the failure
        // mode this guards against.
        UI.destroy(document.getElementById("host"));
        document.getElementById("host").innerHTML = "";

        return { whileOpen, afterDestroy: live };
      });

      assert.equal(counts.whileOpen, 1, "an open panel registers a scroll listener");
      assert.equal(
        counts.afterDestroy,
        0,
        "destroying a subtree with an open panel must release the listener"
      );
    }
  );
});

test("UI.matchAll includes the root itself, in document order", async () => {
  await ui.page(
    `<div id="outer" data-thing>
       <span id="a" data-thing></span>
       <span id="b" data-thing></span>
     </div>
     <section id="plain"><span id="c" data-thing></span></section>`,
    async (page) => {
      const result = await page.evaluate(() => ({
        matchAll: UI.matchAll("[data-thing]", document.getElementById("outer")).map((e) => e.id),
        qa: UI.qa("[data-thing]", document.getElementById("outer")).map((e) => e.id),
        fromDocument: UI.matchAll("[data-thing]", document).map((e) => e.id),
        nonMatchingRoot: UI.matchAll("[data-thing]", document.getElementById("plain")).map((e) => e.id),
        leafRoot: UI.matchAll("[data-thing]", document.getElementById("a")).map((e) => e.id),
      }));

      assert.deepEqual(result.matchAll, ["outer", "a", "b"], "root comes first");
      assert.deepEqual(result.qa, ["a", "b"], "UI.qa must keep descendant-only semantics");
      assert.deepEqual(
        result.fromDocument,
        ["outer", "a", "b", "c"],
        "document is not an element, so only descendants are returned"
      );
      assert.deepEqual(
        result.nonMatchingRoot,
        ["c"],
        "a root that does not match contributes only its descendants"
      );
      assert.deepEqual(
        result.leafRoot,
        ["a"],
        "a matching root with no matching descendants returns just itself"
      );
    }
  );
});

test("destroy-then-init rebuilds a component whose attribute is on the root", async () => {
  // Regression: init() scanned with querySelectorAll, which returns only
  // descendants, so passing the component's own element silently did nothing.
  await ui.page(
    `<div data-ui-table data-ui-page-size="2" id="reg">
       <table class="ui-table">
         <thead><tr><th data-ui-sort="text">Name</th></tr></thead>
         <tbody><tr><td>Alpha</td></tr><tr><td>Beta</td></tr><tr><td>Gamma</td></tr></tbody>
       </table>
     </div>`,
    async (page) => {
      assert.equal(await page.count(".ui-table-toolbar"), 1);

      const rebuilt = await page.evaluate(() => {
        const table = document.getElementById("reg");
        UI.destroy(table);
        document.querySelector(".ui-table-toolbar").remove();
        document.querySelector(".ui-table-pagination").remove();

        UI.init(table); // the element itself, not its parent
        return {
          toolbars: document.querySelectorAll(".ui-table-toolbar").length,
          guard: table.dataset.uiTableReady,
          rows: document.querySelectorAll("tbody tr").length,
        };
      });

      assert.equal(rebuilt.toolbars, 1, "UI.init(el) should rebuild the component on el");
      assert.equal(rebuilt.guard, "true");
      assert.equal(rebuilt.rows, 2, "and re-apply paging");
    }
  );
});

test("destroy-then-init on the root works for every self-scanning module", async () => {
  const cases = [
    ["form", '<form data-ui-validate id="x"><input name="a" required></form>', "uiValidateReady"],
    ["form", '<form data-ui-draft id="x"><input name="a"></form>', "uiDraftReady"],
    ["form", '<form data-ui-save-next id="x"><input name="a"></form>', "uiSaveNextReady"],
    ["input", '<input data-ui-mask="999-999" id="x">', "uiMaskReady"],
    ["div", '<div data-ui-chart="bar" data-ui-values="1,2" id="x"></div>', "uiChartReady"],
    ["div", '<div data-ui-upload id="x"><input type="file"></div>', "uiUploadReady"],
  ];

  for (const [, markup, guard] of cases) {
    await ui.page(markup, async (page) => {
      const result = await page.evaluate(
        (key) => {
          const el = document.getElementById("x");
          const before = el.dataset[key];
          UI.destroy(el);
          const cleared = el.dataset[key];
          UI.init(el);
          return { before, cleared, after: el.dataset[key] };
        },
        guard
      );

      assert.equal(result.before, "true", guard + " should be set on load");
      assert.equal(result.cleared, undefined, guard + " should be cleared by destroy");
      assert.equal(result.after, "true", guard + " should be restored by UI.init(el)");
    });
  }
});

test("UI.focusable still excludes the root, so modal focus lands on a field", async () => {
  // UI.qa was deliberately left alone: UI.focusable(modal) including the root
  // would send initial focus to the dialog instead of its first control.
  await ui.page(
    `<button id="open" data-ui-modal-open="#m">Open</button>
     <div class="ui-modal" id="m" aria-hidden="true" tabindex="-1">
       <div class="ui-backdrop"></div>
       <div class="ui-modal-dialog" role="dialog">
         <input id="first" class="ui-control">
       </div>
     </div>`,
    async (page) => {
      await page.click("#open");
      assert.equal(
        (await page.activeElement()).id,
        "first",
        "focus should reach the first field, not the modal container"
      );
    }
  );
});

test("UI.destroy is safe on markup that was never initialised", async () => {
  await ui.page('<div id="plain"><p>nothing here</p></div>', async (page) => {
    await page.evaluate(() => UI.destroy(document.getElementById("plain")));
    // The harness fails the test on any uncaught exception, so reaching here
    // without throwing is the assertion.
    assert.equal(await page.$("#plain"), true);
  });
});

test("a throwing cleanup does not prevent the rest from running", async () => {
  await ui.page('<div id="host"><span id="a"></span><span id="b"></span></div>', async (page) => {
    const ran = await page.evaluate(() => {
      const order = [];
      UI.cleanup(document.getElementById("a"), () => {
        order.push("a");
        throw new Error("boom");
      });
      UI.cleanup(document.getElementById("b"), () => order.push("b"));
      UI.destroy(document.getElementById("host"));
      return order;
    });
    assert.deepEqual(ran, ["a", "b"], "one bad cleanup must not abort teardown");
  });
});

// --------------------------------------------------------------------------
// Auto-initialisation
// --------------------------------------------------------------------------

test("UI.observe initialises AJAX-inserted markup without a manual init call", async () => {
  await ui.page('<div id="host"></div>', async (page) => {
    await page.evaluate(() => {
      window.__stop = UI.observe(document.getElementById("host"));
      document.getElementById("host").innerHTML =
        '<div class="ui-dropdown">' +
        '<button id="dd" class="ui-btn" data-ui-dropdown>Menu</button>' +
        '<div class="ui-dropdown-menu"><a class="ui-dropdown-item" href="#">One</a></div>' +
        "</div>";
    });

    await page.waitFor(() => !!document.querySelector("#dd"));
    await page.raf();
    await page.click("#dd");

    assert.equal(
      await page.attr("#dd", "aria-expanded"),
      "true",
      "observed markup should be live without calling UI.init"
    );
  });
});

test("UI.observe tears down removed subtrees", async () => {
  await ui.page('<div id="host"></div>', async (page) => {
    const cleaned = await page.evaluate(async () => {
      UI.observe(document.getElementById("host"));
      const child = document.createElement("div");
      child.id = "child";
      document.getElementById("host").appendChild(child);

      let ran = false;
      UI.cleanup(child, () => (ran = true));

      child.remove();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return ran;
    });

    assert.equal(cleaned, true, "removing an observed node should run its cleanups");
  });
});

test("the observer's stop function detaches it", async () => {
  await ui.page('<div id="host"></div>', async (page) => {
    const expanded = await page.evaluate(async () => {
      const stop = UI.observe(document.getElementById("host"));
      stop();
      document.getElementById("host").innerHTML =
        '<div class="ui-dropdown"><button id="dd" data-ui-dropdown>Menu</button>' +
        '<div class="ui-dropdown-menu"></div></div>';
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return document.querySelector("#dd").getAttribute("aria-expanded");
    });

    assert.equal(expanded, null, "a stopped observer should not initialise new markup");
  });
});

// --------------------------------------------------------------------------
// Cascade layers
// --------------------------------------------------------------------------

test("the layered bundle declares its layer order up front", () => {
  const css = readFileSync(join(ROOT, "dist/ui-framework.layered.css"), "utf8");
  const declaration = css.match(/@layer ([^;{]+);/);

  assert.ok(declaration, "layered build must declare layer order before using it");
  assert.deepEqual(
    declaration[1].split(",").map((s) => s.trim()),
    ["ui-base", "ui-components", "ui-utilities"],
    "layer order determines base < components < utilities precedence"
  );

  for (const layer of ["ui-base", "ui-components", "ui-utilities"]) {
    assert.ok(css.includes("@layer " + layer + " {"), "missing layer block: " + layer);
  }
});

test("layered and flat bundles contain the same rules", () => {
  const flat = readFileSync(join(ROOT, "dist/ui-framework.css"), "utf8");
  const layered = readFileSync(join(ROOT, "dist/ui-framework.layered.css"), "utf8");

  // Every selector in the flat build must survive into the layered one.
  const selectors = [...flat.matchAll(/^\.(ui-[a-z0-9-]+)/gm)].map((m) => m[1]);
  const unique = [...new Set(selectors)];
  assert.ok(unique.length > 100, "sanity: expected plenty of selectors, got " + unique.length);

  const missing = unique.filter((sel) => !layered.includes("." + sel));
  assert.deepEqual(missing, [], "layered build dropped selectors: " + missing.slice(0, 10));
});

test("layered CSS actually applies in the browser", async () => {
  await ui.page(
    '<button class="ui-btn ui-btn-primary" id="b">Save</button>',
    async (page) => {
      const styles = await page.styles("#b", ["background-color", "border-radius", "color"]);
      assert.notEqual(styles["background-color"], "rgba(0, 0, 0, 0)", "button should be filled");
      assert.equal(styles.color, "rgb(255, 255, 255)");
    },
    { bare: true, styles: ["/dist/ui-framework.layered.css"] }
  );
});
