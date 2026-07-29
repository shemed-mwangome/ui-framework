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

test("grouped bar chart renders one rect per series per category", async () => {
  await ui.page(
    `<div id="c" data-ui-chart="bar">
       <script type="application/json">
         {"labels": ["Jan","Feb"], "series": [{"name":"North","values":[10,20]},{"name":"South","values":[5,15]}]}
       </script>
     </div>`,
    async (page) => {
      assert.equal(await page.count("#c rect"), 4, "2 categories x 2 series = 4 bars");
      assert.equal(await page.attr("#c", "role"), "img");
    }
  );
});

test("data-ui-stacked stacks series into one bar per category", async () => {
  await ui.page(
    `<div id="c" data-ui-chart="bar" data-ui-stacked>
       <script type="application/json">
         {"labels": ["Jan"], "series": [{"name":"North","values":[10]},{"name":"South","values":[20]}]}
       </script>
     </div>`,
    async (page) => {
      const heights = await page.evaluate(() =>
        [...document.querySelectorAll("#c rect")].map((r) => parseFloat(r.getAttribute("height")))
      );
      assert.equal(heights.length, 2, "one segment per series, not one bar per series");
      assert.ok(
        Math.abs(heights[0] + heights[1] - 40) < 0.01,
        "stacked segments should sum to the full chart height, the stack being the tallest"
      );
    }
  );
});

test("multi-series line chart draws one polyline per series", async () => {
  await ui.page(
    `<div id="c" data-ui-chart="line">
       <script type="application/json">
         {"labels": ["Jan","Feb","Mar"], "series": [{"name":"North","values":[1,2,3]},{"name":"South","values":[3,2,1]}]}
       </script>
     </div>`,
    async (page) => {
      assert.equal(await page.count("#c polyline"), 2);
    }
  );
});

test("multi-series legend lists series names, not category labels", async () => {
  await ui.page(
    `<div id="c" data-ui-chart="bar" data-ui-legend>
       <script type="application/json">
         {"labels": ["Jan"], "series": [{"name":"North","values":[1]},{"name":"South","values":[2]}]}
       </script>
     </div>`,
    async (page) => {
      const labels = await page.evaluate(() =>
        [...document.querySelectorAll("#c .ui-chart-legend-label")].map((el) => el.textContent)
      );
      assert.deepEqual(labels, ["North", "South"]);
    }
  );
});

test("UI.chart.update accepts a multi-series data object", async () => {
  await ui.page('<div id="c" data-ui-chart="bar" data-ui-values="1,2"></div>', async (page) => {
    await page.evaluate(() =>
      UI.chart.update("#c", {
        labels: ["Jan", "Feb"],
        series: [
          { name: "North", values: [4, 8] },
          { name: "South", values: [2, 6] }
        ]
      })
    );

    assert.equal(await page.count("#c rect"), 4);
    assert.equal(
      await page.count("#c .ui-chart-svg"),
      1,
      "updating to multi-series must replace the chart, not append a second one"
    );
  });
});

test("a multi-series chart's data island survives being reinitialised outside UI.chart.update", async () => {
  await ui.page(
    `<div id="c" data-ui-chart="bar">
       <script type="application/json">
         {"labels": ["Jan","Feb"], "series": [{"name":"North","values":[10,20]}]}
       </script>
     </div>`,
    async (page) => {
      const before = await page.count("#c rect");

      // Reinitialise the way UI.observe()/AJAX-swapped regions do -- through
      // UI.destroy()+UI.init(), not through UI.chart.update(). The <script>
      // data island must not have been silently discarded by the first
      // render, or this finds no data and renders nothing.
      await page.evaluate(() => {
        const el = document.getElementById("c");
        UI.destroy(el);
        UI.init(el);
      });

      assert.equal(await page.count('#c script[type="application/json"]'), 1, "the data island must still be in the DOM");
      assert.equal(await page.count("#c rect"), before, "re-render should reproduce the same chart, not an empty one");
    }
  );
});

test("a chart with unparsable JSON data falls back to attribute-based values", async () => {
  await ui.page(
    `<div id="c" data-ui-chart="bar" data-ui-values="1,2" data-ui-labels="A,B">
       <script type="application/json">not json</script>
     </div>`,
    async (page) => {
      assert.equal(await page.count("#c rect"), 2);
    }
  );
});

test("data-ui-orientation=\"horizontal\" lays out a grouped multi-series bar sideways", async () => {
  await ui.page(
    `<div id="c" data-ui-chart="bar" data-ui-orientation="horizontal">
       <script type="application/json">
         {"labels": ["Jan","Feb"], "series": [{"name":"North","values":[10,20]},{"name":"South","values":[5,15]}]}
       </script>
     </div>`,
    async (page) => {
      const rects = await page.evaluate(() =>
        [...document.querySelectorAll("#c rect")].map((r) => ({
          x: parseFloat(r.getAttribute("x")),
          width: parseFloat(r.getAttribute("width")),
        }))
      );
      assert.equal(rects.length, 4);
      // Horizontal bars grow from x=0 rightwards, not upwards from the foot.
      rects.forEach((r) => assert.equal(r.x, 0, "each horizontal bar should start at x=0"));
      assert.ok(rects.some((r) => r.width > 0), "bars should have non-zero width");
    }
  );
});

test("area chart fills under the line with a gradient and keeps the polyline", async () => {
  await ui.page(
    '<div id="c" data-ui-chart="area" data-ui-values="5,10,5" data-ui-height="40"></div>',
    async (page) => {
      assert.equal(await page.count("#c polyline"), 1);
      assert.equal(await page.count("#c polygon"), 1);
      assert.equal(await page.count("#c linearGradient"), 1);
    }
  );
});

test("multi-series area chart stacks one polygon band per series", async () => {
  await ui.page(
    `<div id="c" data-ui-chart="area">
       <script type="application/json">
         {"labels": ["Jan","Feb","Mar"], "series": [{"name":"North","values":[10,20,15]},{"name":"South","values":[5,10,8]}]}
       </script>
     </div>`,
    async (page) => {
      assert.equal(await page.count("#c polygon"), 2);
      assert.equal(await page.count("#c polyline"), 2);
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

test("the status lexicon covers every documented state", () => {
  const css = readFileSync(join(ROOT, "src/css/25-status-document.css"), "utf8");
  const required = [
    "draft", "submitted", "under-review", "approved",
    "active", "rejected", "expired", "suspended",
  ];

  const missing = required.filter((name) => !css.includes(".ui-status-" + name));
  assert.deepEqual(missing, [], "missing status classes: " + missing.join(", "));
});

test("status pills are visually distinguishable, not just differently worded", async () => {
  const statuses = [
    "draft", "submitted", "under-review", "approved",
    "active", "rejected", "expired", "suspended",
  ];

  await ui.page(
    statuses.map((s) => `<span class="ui-status ui-status-${s}" id="s-${s}">${s}</span>`).join(""),
    async (page) => {
      const colors = await page.evaluate((names) =>
        names.map((s) => {
          const el = document.getElementById("s-" + s);
          const cs = getComputedStyle(el);
          return { s, color: cs.color, bg: cs.backgroundColor, border: cs.borderStyle };
        }), statuses
      );

      // Every status gets its own colour now (expired reads as a neutral
      // grey lapse rather than sharing rejected's red; suspended gets its
      // own burnt orange rather than sharing under-review's amber), so all
      // eight -- minus approved/active, which are intentionally the same
      // "good and in force" green -- should be pairwise distinguishable.
      const signatures = new Set(colors.map((c) => c.color + "|" + c.bg + "|" + c.border));
      assert.equal(
        signatures.size,
        statuses.length - 1,
        "expected exactly one shared signature (approved === active): " + JSON.stringify(colors)
      );

      const byStatus = Object.fromEntries(colors.map((c) => [c.s, c.color + "|" + c.bg + "|" + c.border]));
      assert.equal(byStatus.approved, byStatus.active, "approved and active are the same intentional state");
      assert.notEqual(byStatus.rejected, byStatus.expired, "expired must not look like rejected");
      assert.notEqual(byStatus["under-review"], byStatus.suspended, "suspended must not look like under-review");
      assert.notEqual(byStatus.draft, byStatus.expired, "expired must not look identical to draft either");
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

test("print isolation hides everything but the target, keyed off visibility not display", () => {
  const css = readFileSync(join(ROOT, "src/css/19-print.css"), "utf8");

  assert.match(
    css,
    /body\.ui-print-isolate \*\s*\{\s*visibility:\s*hidden/,
    "must use visibility, not display -- display:none on an ancestor would hide the target too"
  );
  assert.match(css, /\.ui-print-target[\s\S]*?visibility:\s*visible/);
  assert.match(
    css,
    /\.ui-print-target\s*\{[\s\S]*?position:\s*fixed/,
    "the target must leave normal flow or hidden siblings' reserved space leaves a blank gap above it"
  );
});

test("data-ui-print-target isolates one element instead of printing the whole page", async () => {
  await ui.page(
    `<nav>Site nav</nav>
     <button id="btn" data-ui-print-target="#doc">Print</button>
     <div class="ui-document" id="doc">Certificate</div>`,
    async (page) => {
      await page.evaluate(() => {
        window.__printCalled = false;
        window.print = () => { window.__printCalled = true; };
      });

      await page.click("#btn");

      const during = await page.evaluate(() => ({
        printCalled: window.__printCalled,
        bodyIsolating: document.body.classList.contains("ui-print-isolate"),
        targetMarked: document.getElementById("doc").classList.contains("ui-print-target"),
      }));
      assert.deepEqual(during, { printCalled: true, bodyIsolating: true, targetMarked: true });

      // The real dialog closing fires this; the stub above never does, so
      // dispatch it manually to check the cleanup path runs.
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

      const after = await page.evaluate(() => ({
        bodyIsolating: document.body.classList.contains("ui-print-isolate"),
        targetMarked: document.getElementById("doc").classList.contains("ui-print-target"),
      }));
      assert.deepEqual(after, { bodyIsolating: false, targetMarked: false });
    }
  );
});

test("UI.print() does the same thing from script, not just from a data attribute", async () => {
  await ui.page('<div class="ui-document" id="doc">Certificate</div>', async (page) => {
    await page.evaluate(() => {
      window.print = () => {};
      UI.print("#doc");
    });
    assert.equal(
      await page.evaluate(() => document.getElementById("doc").classList.contains("ui-print-target")),
      true
    );
  });
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
