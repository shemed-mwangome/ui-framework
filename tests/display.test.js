"use strict";

/**
 * Charts, popovers, clipboard, the status lexicon and the print sheet.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { useHarness } = require("./harness");

const ui = useHarness();
const ROOT = join(__dirname, "..");

// --------------------------------------------------------------------------
// Charts
// --------------------------------------------------------------------------

test("bar chart renders one rect per value, scaled to the maximum", async () => {
  await ui.page(
    '<div id="c" data-ui-chart="bar" data-ui-values="10,20,40" data-ui-labels="Jan,Feb,Mar"></div>',
    async (page) => {
      const bars = await page.evaluate(() =>
        [...document.querySelectorAll("#c rect")].map((r) => ({
          height: parseFloat(r.getAttribute("height")),
          title: r.querySelector("title").textContent,
        }))
      );

      assert.equal(bars.length, 3);
      assert.equal(bars[2].height, 40, "the largest value should fill the chart height");
      assert.equal(bars[0].height, 10, "10 of 40 is a quarter of the height");
      assert.equal(bars[1].title, "Feb: 20", "each bar should carry a title for hover");
    }
  );
});

test("bar charts are single-colour unless the data is categorical", async () => {
  await ui.page(
    `<div id="series" data-ui-chart="bar" data-ui-values="1,2,3,4"></div>
     <div id="cats" data-ui-chart="bar" data-ui-values="1,2,3,4" data-ui-multicolour></div>`,
    async (page) => {
      const fills = await page.evaluate(() => ({
        series: [...document.querySelectorAll("#series rect")].map((r) => r.getAttribute("fill")),
        cats: [...document.querySelectorAll("#cats rect")].map((r) => r.getAttribute("fill")),
      }));

      assert.equal(
        new Set(fills.series).size,
        1,
        "one series should be one colour -- varying it implies four categories"
      );
      assert.equal(new Set(fills.cats).size, 4, "data-ui-multicolour opts into the palette");
    }
  );
});

test("charts expose an accessible label and a hidden data table", async () => {
  await ui.page(
    '<div id="c" data-ui-chart="bar" data-ui-values="3,7" data-ui-labels="Active,Expired" data-ui-title="Records by status"></div>',
    async (page) => {
      assert.equal(await page.attr("#c", "role"), "img");
      assert.equal(
        await page.attr("#c", "aria-label"),
        "Records by status: Active 3, Expired 7",
        "the label should summarise the data, not just name the chart"
      );

      const table = await page.evaluate(() => {
        const t = document.querySelector("#c .ui-chart-data");
        return {
          hidden: t.classList.contains("ui-sr-only"),
          caption: t.querySelector("caption").textContent,
          rows: [...t.querySelectorAll("tr")].map((r) => r.textContent),
        };
      });

      assert.equal(table.hidden, true, "the table is for assistive tech, not the screen");
      assert.equal(table.caption, "Records by status");
      assert.deepEqual(table.rows, ["Active3", "Expired7"]);
    }
  );
});

test("the SVG itself is hidden from assistive tech to avoid double-reading", async () => {
  await ui.page('<div id="c" data-ui-chart="bar" data-ui-values="1,2"></div>', async (page) => {
    assert.equal(await page.attr("#c .ui-chart-svg", "aria-hidden"), "true");
  });
});

test("donut segments are sized as percentages of the total", async () => {
  await ui.page(
    '<div id="c" data-ui-chart="donut" data-ui-values="25,25,50" data-ui-labels="A,B,C"></div>',
    async (page) => {
      const dashes = await page.evaluate(() =>
        [...document.querySelectorAll("#c .ui-chart-segment")].map((c) =>
          c.getAttribute("stroke-dasharray")
        )
      );

      // Radius is chosen so the circumference is 100 and dashes read as percent.
      assert.deepEqual(dashes, ["25.00 75.00", "25.00 75.00", "50.00 50.00"]);
    }
  );
});

test("donut handles an all-zero dataset without dividing by zero", async () => {
  await ui.page('<div id="c" data-ui-chart="donut" data-ui-values="0,0"></div>', async (page) => {
    const dashes = await page.evaluate(() =>
      [...document.querySelectorAll("#c .ui-chart-segment")].map((c) =>
        c.getAttribute("stroke-dasharray")
      )
    );
    assert.deepEqual(dashes, ["0.00 100.00", "0.00 100.00"]);
  });
});

test("line chart plots a polyline across the full width", async () => {
  await ui.page(
    '<div id="c" data-ui-chart="line" data-ui-values="5,10,5" data-ui-height="40"></div>',
    async (page) => {
      const points = await page.evaluate(() =>
        document.querySelector("#c polyline").getAttribute("points")
      );
      const xs = points.split(" ").map((p) => parseFloat(p.split(",")[0]));

      assert.deepEqual(xs, [0, 50, 100], "points should span 0..100 evenly");
      assert.equal(await page.count("#c circle"), 3, "line charts get hoverable dots");
    }
  );
});

test("sparkline omits dots and stays inline", async () => {
  await ui.page(
    '<span id="c" data-ui-chart="sparkline" data-ui-values="1,5,2,8"></span>',
    async (page) => {
      assert.equal(await page.count("#c circle"), 0);
      assert.equal(await page.count("#c polyline"), 1);
      assert.equal(
        (await page.styles("#c", ["display"])).display,
        "inline-block",
        "a sparkline should sit inline with its label"
      );
    }
  );
});

test("legend renders swatches, values and optional percentages", async () => {
  await ui.page(
    '<div id="c" data-ui-chart="donut" data-ui-values="30,70" data-ui-labels="Active,Expired" data-ui-legend data-ui-legend-percent></div>',
    async (page) => {
      const items = await page.evaluate(() =>
        [...document.querySelectorAll("#c .ui-chart-legend-item")].map((li) => ({
          label: li.querySelector(".ui-chart-legend-label").textContent,
          value: li.querySelector(".ui-chart-legend-value").textContent,
          swatch: li.querySelector(".ui-chart-swatch").getAttribute("data-ui-swatch"),
        }))
      );

      assert.deepEqual(items, [
        { label: "Active", value: "30 (30%)", swatch: "0" },
        { label: "Expired", value: "70 (70%)", swatch: "1" },
      ]);
    }
  );
});

test("no legend is rendered unless asked for", async () => {
  await ui.page('<div id="c" data-ui-chart="bar" data-ui-values="1,2"></div>', async (page) => {
    assert.equal(await page.count("#c .ui-chart-legend"), 0);
  });
});

test("UI.chart.update re-renders in place", async () => {
  await ui.page(
    '<div id="c" data-ui-chart="bar" data-ui-values="1,2" data-ui-labels="A,B"></div>',
    async (page) => {
      await page.evaluate(() => UI.chart.update("#c", [5, 10, 15], ["X", "Y", "Z"]));

      assert.equal(await page.count("#c rect"), 3);
      assert.match(await page.attr("#c", "aria-label"), /X 5, Y 10, Z 15/);
      assert.equal(
        await page.count("#c .ui-chart-svg"),
        1,
        "updating must replace the chart, not append a second one"
      );
    }
  );
});

test("a chart with no values is left alone rather than rendering an empty frame", async () => {
  await ui.page('<div id="c" data-ui-chart="bar" data-ui-values=""></div>', async (page) => {
    assert.equal(await page.count("#c svg"), 0);
    assert.equal(await page.attr("#c", "role"), null);
  });
});

test("currency formatting flows into labels and the data table", async () => {
  await ui.page(
    '<div id="c" data-ui-chart="bar" data-ui-values="1500000" data-ui-labels="Fees" data-ui-format-currency="USD"></div>',
    async (page) => {
      assert.match(await page.attr("#c", "aria-label"), /Fees USD 1,500,000/);
    }
  );
});

// --------------------------------------------------------------------------
// Popover
// --------------------------------------------------------------------------

test("popover opens on click, closes on re-click, and wires ARIA", async () => {
  await ui.page(
    '<button id="t" class="ui-btn" data-ui-popover="Fees are set annually.">Why?</button>',
    async (page) => {
      assert.equal(await page.count(".ui-popover"), 0);

      await page.click("#t");
      assert.equal(await page.count(".ui-popover"), 1);
      assert.equal(await page.text(".ui-popover-body"), "Fees are set annually.");
      assert.equal(await page.attr("#t", "aria-expanded"), "true");

      const wired = await page.evaluate(() => {
        const id = document.getElementById("t").getAttribute("aria-controls");
        return !!id && !!document.getElementById(id);
      });
      assert.equal(wired, true, "aria-controls should point at the popover");

      await page.click("#t");
      assert.equal(await page.count(".ui-popover"), 0);
      assert.equal(await page.attr("#t", "aria-expanded"), "false");
    }
  );
});

test("popover content can come from a template", async () => {
  await ui.page(
    `<button id="t" data-ui-popover-target="#help" data-ui-popover-title="Account classes">Help</button>
     <template id="help"><p>Class A covers standard accounts.</p><a href="/guide" id="link">Read the guide</a></template>`,
    async (page) => {
      await page.click("#t");

      assert.equal(await page.text(".ui-popover-title"), "Account classes");
      assert.match(await page.text(".ui-popover-body"), /Class A covers standard accounts/);
      assert.equal(
        await page.count(".ui-popover #link"),
        1,
        "interactive content is the point of a popover over a tooltip"
      );
    }
  );
});

test("popover moves focus to its first interactive element", async () => {
  await ui.page(
    `<button id="t" data-ui-popover-target="#tpl">Open</button>
     <template id="tpl"><button id="inner">Do the thing</button></template>`,
    async (page) => {
      await page.click("#t");
      assert.equal((await page.activeElement()).id, "inner");
    }
  );
});

test("a text-only popover leaves focus on the trigger", async () => {
  await ui.page('<button id="t" data-ui-popover="Just some text.">Info</button>', async (page) => {
    await page.click("#t");
    assert.equal(
      (await page.activeElement()).id,
      "t",
      "stealing focus for non-interactive content would only confuse tab order"
    );
  });
});

test("Escape closes the popover and returns focus to the trigger", async () => {
  await ui.page('<button id="t" data-ui-popover="Text">Info</button>', async (page) => {
    await page.click("#t");
    await page.press("Escape");

    assert.equal(await page.count(".ui-popover"), 0);
    assert.equal((await page.activeElement()).id, "t");
  });
});

test("Escape closes only the popover, not a modal beneath it", async () => {
  await ui.page(
    `<div class="ui-modal" id="m" aria-hidden="true">
       <div class="ui-backdrop"></div>
       <div class="ui-modal-dialog" role="dialog">
         <div class="ui-modal-body">
           <button id="t" data-ui-popover="Explanatory text">Why?</button>
         </div>
       </div>
     </div>`,
    async (page) => {
      await page.evaluate(() => UI.modal.open(document.getElementById("m")));
      await page.click("#t");
      assert.equal(await page.count(".ui-popover"), 1);

      await page.press("Escape");
      assert.equal(await page.count(".ui-popover"), 0, "first Escape closes the popover");
      assert.equal(await page.isVisible("#m"), true, "...and must leave the modal open");

      await page.press("Escape");
      assert.equal(await page.isVisible("#m"), false);
    }
  );
});

test("clicking outside closes the popover", async () => {
  await ui.page(
    '<button id="t" data-ui-popover="Text">Info</button><div id="away" style="height:200px">away</div>',
    async (page) => {
      await page.click("#t");
      await page.click("#away");
      assert.equal(await page.count(".ui-popover"), 0);
    }
  );
});

test("opening a second popover closes the first", async () => {
  await ui.page(
    '<button id="a" data-ui-popover="First">A</button><button id="b" data-ui-popover="Second">B</button>',
    async (page) => {
      await page.click("#a");
      await page.click("#b");

      assert.equal(await page.count(".ui-popover"), 1);
      assert.equal(await page.text(".ui-popover-body"), "Second");
      assert.equal(await page.attr("#a", "aria-expanded"), "false");
    }
  );
});

test("popover content is escaped", async () => {
  await ui.page(
    `<button id="t" data-ui-popover="<img src=x onerror=alert(1)>">Info</button>`,
    async (page) => {
      await page.click("#t");
      assert.equal(await page.count(".ui-popover img"), 0, "inline text must not become markup");
      assert.match(await page.text(".ui-popover-body"), /<img/);
    }
  );
});

// --------------------------------------------------------------------------
// Clipboard
// --------------------------------------------------------------------------

test("copies a literal value and confirms", async () => {
  await ui.page('<button id="c" class="ui-btn" data-ui-copy="REF-2026-0184">Copy ref</button>', async (page) => {
    await page.evaluate(() => {
      window.__copied = null;
      navigator.clipboard.writeText = (text) => {
        window.__copied = text;
        return Promise.resolve();
      };
    });

    await page.recordEvents(["ui:copy"]);
    await page.click("#c");
    await page.waitFor(() => window.__copied !== null);

    assert.equal(await page.evaluate(() => window.__copied), "REF-2026-0184");
    assert.equal(await page.text("#c"), "Copied");
    assert.equal((await page.recordedEvents())[0].detail.text, "REF-2026-0184");
  });
});

test("copies from a target element and restores the label afterwards", async () => {
  await ui.page(
    '<input id="taxId" value="123-456-789"><button id="c" data-ui-copy-target="#taxId">Copy Tax ID</button>',
    async (page) => {
      await page.evaluate(() => {
        window.__copied = null;
        navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
      });

      await page.click("#c");
      await page.waitFor(() => window.__copied !== null);
      assert.equal(await page.evaluate(() => window.__copied), "123-456-789");

      // The confirmation is transient; the button must go back to its label.
      await page.waitFor(() => document.getElementById("c").textContent === "Copy Tax ID", {
        timeout: 3000,
      });
    }
  );
});

test("a failed copy reports failure rather than silently doing nothing", async () => {
  await ui.page('<button id="c" data-ui-copy="x">Copy</button>', async (page) => {
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
      document.execCommand = () => false;
    });

    await page.recordEvents(["ui:copy:failed"]);
    await page.click("#c");
    await page.waitFor(() => document.getElementById("c").textContent === "Could not copy");

    assert.equal((await page.recordedEvents()).length, 1);
  });
});

test("copy announces to screen readers", async () => {
  await ui.page('<button id="c" data-ui-copy="ref">Copy</button>', async (page) => {
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.resolve();
    });
    await page.click("#c");
    await page.wait(150);

    assert.equal(await page.text("#ui-live-polite"), "Copied");
  });
});

// --------------------------------------------------------------------------
// Status lexicon and document sheet
// --------------------------------------------------------------------------

test("the status lexicon covers every regulatory state", () => {
  const css = readFileSync(join(ROOT, "src/css/25-status-document.css"), "utf8");
  const required = [
    "draft", "submitted", "under-review", "approved",
    "active", "rejected", "expired", "suspended",
  ];

  const missing = required.filter((name) => !css.includes(".ui-status-" + name));
  assert.deepEqual(missing, [], "missing status classes: " + missing.join(", "));
});

test("status pills are visually distinguishable, not just differently worded", async () => {
  await ui.page(
    ["draft", "submitted", "under-review", "approved", "rejected", "expired", "suspended"]
      .map((s) => `<span class="ui-status ui-status-${s}" id="s-${s}">${s}</span>`)
      .join(""),
    async (page) => {
      const colors = await page.evaluate(() =>
        ["draft", "submitted", "under-review", "approved", "rejected", "expired", "suspended"].map(
          (s) => {
            const el = document.getElementById("s-" + s);
            const cs = getComputedStyle(el);
            return { s, color: cs.color, bg: cs.backgroundColor, border: cs.borderStyle };
          }
        )
      );

      // Expired and rejected share a colour by design, but expired uses a ring
      // marker and suspended a dashed border, so all seven remain distinct.
      const signatures = new Set(colors.map((c) => c.color + "|" + c.bg + "|" + c.border));
      assert.ok(
        signatures.size >= 6,
        "statuses should be distinguishable at a glance: " + JSON.stringify(colors)
      );
    }
  );
});

test("the A4 document sheet sets page size and repeats table headers in print", () => {
  const css = readFileSync(join(ROOT, "src/css/25-status-document.css"), "utf8");

  assert.match(css, /@page\s*\{[^}]*size:\s*A4/, "should declare an A4 page");
  assert.match(css, /\.ui-document\s*\{[\s\S]*?width:\s*210mm/, "portrait sheet should be 210mm");
  assert.match(css, /\.ui-document-landscape[\s\S]*?width:\s*297mm/);
  assert.match(
    css,
    /\.ui-document-table thead\s*\{\s*display:\s*table-header-group/,
    "long tables must repeat their header on each printed page"
  );
  assert.match(css, /print-color-adjust:\s*exact/, "status colour carries meaning in print");
});

test("document sheet renders at A4 width on screen", async () => {
  await ui.page(
    `<div class="ui-document" id="doc">
       <div class="ui-document-header"><span>Example Organisation</span><span>REF-2026-0184</span></div>
       <h1 class="ui-document-title">Certificate of Registration</h1>
       <div class="ui-document-body"><p>This certificate is granted to…</p></div>
     </div>`,
    async (page) => {
      const box = await page.box("#doc");
      // 210mm at 96dpi ≈ 793.7px
      assert.ok(
        Math.abs(box.width - 793.7) < 2,
        "expected an A4-width sheet, got " + box.width + "px"
      );
    }
  );
});

test("record header lays out title, meta and actions", async () => {
  await ui.page(
    `<header class="ui-record-header" id="h">
       <div>
         <h1 class="ui-record-title">Keystone Industries Ltd</h1>
         <dl class="ui-record-meta">
           <dt>Reference</dt><dd class="ui-record-ref">REF-2026-0184</dd>
           <dt>Status</dt><dd><span class="ui-status ui-status-under-review">Under review</span></dd>
         </dl>
       </div>
       <div class="ui-record-actions"><button class="ui-btn ui-btn-primary">Approve</button></div>
     </header>`,
    async (page) => {
      assert.equal((await page.styles("#h", ["display"])).display, "flex");
      assert.equal(await page.text(".ui-record-ref"), "REF-2026-0184");
      assert.equal(
        (await page.styles(".ui-record-ref", ["font-family"]))["font-family"].includes("Mono"),
        true,
        "a reference number should be monospaced so digits align"
      );
    }
  );
});
