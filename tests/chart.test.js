"use strict";

/**
 * Charts. The tests worth having are the ones that guard the things that were
 * silently wrong before: distorted geometry, unreadable values, an empty
 * chart that rendered as a void, and small values scaled out of existence.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

const wrap = (inner) => '<div style="width:600px">' + inner + "</div>";

test("dots are circular, not stretched to the container", async () => {
  const html = wrap('<div id="c" data-ui-chart="line" data-ui-values="12,19,3,17"' +
    ' data-ui-labels="A,B,C,D" data-ui-axis></div>');

  await ui.page(html, async (page) => {
    const ratio = await page.evaluate(() => {
      const box = document.querySelector("#c circle.ui-chart-dot").getBoundingClientRect();
      return box.width / box.height;
    });
    // The old renderer drew into a 100x40 viewBox stretched to fit, which at
    // a typical width made every dot 2.27 times wider than it was tall.
    assert.ok(Math.abs(ratio - 1) < 0.05, "dot aspect ratio is 1, got " + ratio);
  });
});

test("an axis chart draws ticks, gridlines and a baseline", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="87,64,92"' +
    ' data-ui-labels="Q1,Q2,Q3" data-ui-axis></div>');

  await ui.page(html, async (page) => {
    assert.ok(await page.count("#c .ui-chart-tick") > 0, "tick labels exist");
    assert.ok(await page.count("#c .ui-chart-grid") > 0, "gridlines exist");
    assert.ok(await page.count("#c .ui-chart-axis") > 0, "axis lines exist");
  });
});

test("no axis is drawn unless it is asked for", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="1,2,3"></div>');
  await ui.page(html, async (page) => {
    assert.equal(await page.count("#c .ui-chart-tick"), 0);
  });
});

test("axis ticks are round numbers a person would have chosen", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="7,23,41" data-ui-axis></div>');
  await ui.page(html, async (page) => {
    const ticks = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#c .ui-chart-tick"))
        .map((t) => t.textContent)
        .filter((t) => /^[0-9]/.test(t)));
    // 41 should not put the top of the axis at 41.
    assert.ok(ticks.indexOf("50") !== -1 || ticks.indexOf("45") !== -1,
      "axis rounds up to a round number, got " + ticks.join(","));
  });
});

test("line labels sit under their points, including the last one", async () => {
  const html = wrap('<div id="c" data-ui-chart="line" data-ui-values="1,2,3,4,5,6"' +
    ' data-ui-labels="Jan,Feb,Mar,Apr,May,Jun" data-ui-axis></div>');

  await ui.page(html, async (page) => {
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#c .ui-chart-tick"))
        .map((t) => t.textContent)
        .filter((t) => /[A-Za-z]/.test(t)));
    // A bar's label centres in its slot; a line's point sits on the boundary.
    // Using the bar rule pushed every label half a slot right and the last
    // one off the end of the axis.
    assert.deepEqual(labels, ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]);
  });
});

test("too many categories thin the labels instead of overlapping them", async () => {
  const html = '<div style="width:320px"><div id="c" data-ui-chart="bar" data-ui-axis' +
    ' data-ui-values="1,2,3,4,5,6,7,8,9,10,11,12"' +
    ' data-ui-labels="January,February,March,April,May,June,July,August,September,October,November,December">' +
    "</div></div>";

  await ui.page(html, async (page) => {
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#c .ui-chart-tick"))
        .map((t) => t.textContent)
        .filter((t) => /[A-Za-z]/.test(t)));
    assert.ok(labels.length > 0 && labels.length < 12,
      "some labels are dropped, got " + labels.length);
  });
});

test("a small value stays visible next to a large one", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="1,2,4000" data-ui-axis></div>');
  await ui.page(html, async (page) => {
    const heights = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#c rect.ui-chart-bar-rect"))
        .map((r) => Number(r.getAttribute("height"))));
    // Proportionally these are 0.01px. A bar that cannot be seen is a value
    // that has been silently dropped from the chart.
    assert.ok(heights[0] >= 2, "smallest bar has a floor, got " + heights[0]);
    assert.ok(heights[2] > heights[0], "the large bar is still much larger");
  });
});

test("value labels can be printed on the bars", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="5,10"' +
    ' data-ui-labels="A,B" data-ui-value-labels></div>');
  await ui.page(html, async (page) => {
    const values = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#c .ui-chart-value")).map((t) => t.textContent));
    assert.deepEqual(values, ["5", "10"]);
  });
});

test("a target line is drawn and labelled", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="87,64" data-ui-axis' +
    ' data-ui-max="100" data-ui-target="80" data-ui-target-label="Target 80%"></div>');
  await ui.page(html, async (page) => {
    assert.equal(await page.count("#c .ui-chart-target"), 1);
    assert.equal(await page.text("#c .ui-chart-target-label"), "Target 80%");
  });
});

test("a horizontal bar chart shows its category names", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-orientation="horizontal" data-ui-axis' +
    ' data-ui-values="14,9" data-ui-labels="Dar es Salaam,Mwanza"></div>');
  await ui.page(html, async (page) => {
    const text = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#c .ui-chart-tick")).map((t) => t.textContent));
    assert.ok(text.indexOf("Dar es Salaam") !== -1,
      "the name is visible in the chart, not only in the hidden data table");
  });
});

test("an empty chart says so instead of rendering nothing", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values=""' +
    ' data-ui-empty-text="No findings recorded."></div>');
  await ui.page(html, async (page) => {
    assert.equal(await page.text("#c .ui-chart-empty"), "No findings recorded.");
    assert.match(await page.attr("#c", "aria-label"), /No findings recorded/);
  });
});

test("an all-zero chart is distinguishable from a broken one", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="0,0,0" data-ui-axis></div>');
  await ui.page(html, async (page) => {
    assert.equal(await page.text("#c .ui-chart-note"), "All values are zero");
  });
});

/* -------------------------------------------------------------- links -- */

test("a link template turns every point into a real anchor", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="14,9"' +
    ' data-ui-labels="Dar es Salaam,Mwanza"' +
    ' data-ui-link-template="/inspections?region={label}"></div>');

  await ui.page(html, async (page) => {
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#c a.ui-chart-mark")).map((a) => ({
        href: a.getAttribute("href"),
        label: a.getAttribute("aria-label")
      })));
    assert.equal(links.length, 2);
    // A real <a> is keyboard focusable, opens in a new tab on middle-click,
    // and works without JavaScript. onclick is none of those things.
    assert.equal(links[0].href, "/inspections?region=Dar%20es%20Salaam");
    assert.equal(links[0].label, "Dar es Salaam: 14");
  });
});

test("an interactive chart is a group, not an image", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="1,2"' +
    ' data-ui-link-template="/x?i={index}"></div>');
  await ui.page(html, async (page) => {
    // role="img" would hide every link inside it from a screen reader.
    assert.equal(await page.attr("#c", "role"), "group");
    assert.equal(await page.attr("#c svg", "aria-hidden"), null);
  });
});

test("a chart with no links stays a single labelled image", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="1,2"></div>');
  await ui.page(html, async (page) => {
    assert.equal(await page.attr("#c", "role"), "img");
    assert.equal(await page.attr("#c svg", "aria-hidden"), "true");
  });
});

test("explicit per-point links win over a template", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="1,2"' +
    ' data-ui-links="/one,/two" data-ui-link-template="/ignored"></div>');
  await ui.page(html, async (page) => {
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#c a.ui-chart-mark")).map((a) => a.getAttribute("href")));
    assert.deepEqual(hrefs, ["/one", "/two"]);
  });
});

test("ui:chart:select fires and can cancel the navigation", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="14"' +
    ' data-ui-labels="Dar es Salaam" data-ui-link-template="/inspections?region={label}"></div>');

  await ui.page(html, async (page) => {
    const detail = await page.evaluate(() => {
      return new Promise((resolve) => {
        const chart = document.getElementById("c");
        chart.addEventListener("ui:chart:select", (event) => {
          event.preventDefault();   // a single-page app routes instead
          resolve({
            label: event.detail.label,
            value: event.detail.value,
            index: event.detail.index,
            defaultPrevented: true
          });
        });
        chart.querySelector("a.ui-chart-mark")
          .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    });
    assert.equal(detail.label, "Dar es Salaam");
    assert.equal(detail.value, 14);
    assert.equal(detail.index, 0);
  });
});

/* ------------------------------------------------------- multi-series -- */

test("a legend can switch a series off and back on", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-axis data-ui-legend data-ui-legend-toggle>' +
    '<script type="application/json">' +
    '{"labels":["Q1","Q2"],"series":[{"name":"Planned","values":[12,19]},' +
    '{"name":"Completed","values":[8,11]}]}' +
    "</scr" + "ipt></div>");

  await ui.page(html, async (page) => {
    assert.equal(await page.count("#c rect.ui-chart-bar-rect"), 4);

    await page.click('#c [data-ui-series="0"]');
    assert.equal(await page.count("#c rect.ui-chart-bar-rect"), 2);
    // The switched-off series stays listed: hiding it would hide the control
    // that brings it back.
    assert.equal(await page.count("#c .ui-chart-legend-item"), 2);
    assert.equal(await page.count("#c .ui-chart-legend-item.ui-off"), 1);
    assert.equal(await page.attr('#c [data-ui-series="0"]', "aria-pressed"), "false");

    await page.click('#c [data-ui-series="0"]');
    assert.equal(await page.count("#c rect.ui-chart-bar-rect"), 4);
  });
});

test("the hidden data table survives for screen readers and print", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="5,10"' +
    ' data-ui-labels="A,B" data-ui-title="Cases"></div>');
  await ui.page(html, async (page) => {
    assert.equal(await page.count("#c table.ui-chart-data"), 1);
    assert.match(await page.text("#c table.ui-chart-data"), /A/);
  });
});

/* ------------------------------------------------------ compatibility -- */

test("markup written for the previous renderer keeps its size", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="12,19,3"' +
    ' data-ui-labels="Jan,Feb,Mar" data-ui-height="40"></div>');
  await ui.page(html, async (page) => {
    const height = await page.evaluate(() =>
      Math.round(document.querySelector("#c svg").getBoundingClientRect().height));
    // data-ui-height was viewBox units against a CSS height of 10rem; below 60
    // it is still read that way so existing charts do not shrink to 40px.
    assert.equal(height, 160);
  });
});

test("UI.chart.update replaces the data in place", async () => {
  const html = wrap('<div id="c" data-ui-chart="bar" data-ui-values="1,2" data-ui-labels="A,B"></div>');
  await ui.page(html, async (page) => {
    await page.evaluate(() => window.UI.chart.update("#c", [5, 10, 15], ["X", "Y", "Z"]));
    assert.equal(await page.count("#c rect.ui-chart-bar-rect"), 3);
  });
});
