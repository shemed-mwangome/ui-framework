"use strict";

/**
 * Security regressions.
 *
 * Each of these corresponds to something that was actually exploitable, or to
 * a guarantee SECURITY.md makes on the framework's behalf. They are cheap and
 * they fail loudly, which is the point: escaping bugs are invisible until
 * someone finds them.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

/* ------------------------------------------------------------ escaping -- */

test("UI.escape escapes both quote characters, not just angle brackets", async () => {
  await ui.page("<div></div>", async (page) => {
    const result = await page.evaluate(() => ({
      double: window.UI.escape('a"b'),
      single: window.UI.escape("a'b"),
      amp: window.UI.escape("a&b"),
      lt: window.UI.escape("a<b")
    }));
    // The old textContent/innerHTML trick returned a"b and a'b unchanged,
    // because quotes are not special in text content -- but every call site
    // interpolates into an attribute.
    assert.equal(result.double, "a&quot;b");
    assert.equal(result.single, "a&#39;b");
    assert.equal(result.amp, "a&amp;b");
    assert.equal(result.lt, "a&lt;b");
  });
});

test("an escaped value cannot break out of a double-quoted attribute", async () => {
  await ui.page('<div id="host"></div>', async (page) => {
    const injected = await page.evaluate(() => {
      const payload = 'x" onmouseover="window.__pwned=1';
      document.getElementById("host").innerHTML =
        '<span id="probe" title="' + window.UI.escape(payload) + '">t</span>';
      const probe = document.getElementById("probe");
      return { attrs: Array.from(probe.attributes).map((a) => a.name) };
    });
    assert.deepEqual(injected.attrs, ["id", "title"], "no extra attribute was created");
  });
});

/* ---------------------------------------------------------- URL schemes -- */

test("UI.safeUrl rejects executable schemes and keeps ordinary URLs", async () => {
  await ui.page("<div></div>", async (page) => {
    const r = await page.evaluate(() => {
      const s = window.UI.safeUrl;
      return {
        relative: s("/inspections?region=Dar"),
        hash: s("#section"),
        https: s("https://example.com/a"),
        mailto: s("mailto:a@b.c"),
        hyphens: s("/a-b/c-d"),
        js: s("javascript:alert(1)"),
        jsMixedCase: s("JaVaScRiPt:alert(1)"),
        jsTab: s("java\tscript:alert(1)"),
        jsNewline: s("java\nscript:alert(1)"),
        jsSpaced: s("   javascript:alert(1)"),
        data: s("data:text/html,<svg onload=alert(1)>"),
        vbscript: s("vbscript:msgbox(1)")
      };
    });

    assert.equal(r.relative, "/inspections?region=Dar");
    assert.equal(r.hash, "#section");
    assert.equal(r.https, "https://example.com/a");
    assert.equal(r.mailto, "mailto:a@b.c");
    assert.equal(r.hyphens, "/a-b/c-d", "stripping must not eat ordinary characters");

    // Browsers follow the whitespace-obfuscated forms as javascript:, so
    // testing the raw string would be trivially bypassed.
    [r.js, r.jsMixedCase, r.jsTab, r.jsNewline, r.jsSpaced, r.data, r.vbscript]
      .forEach(function (value) { assert.equal(value, null); });
  });
});

test("a hostile link in a chart response renders no anchor at all", async () => {
  const html = '<div style="width:600px"><div id="c" data-ui-chart="bar" data-ui-axis></div></div>';

  await ui.page(html, async (page) => {
    await page.evaluate(() => {
      window.UI.chart.update("#c", {
        labels: ["A", "B", "C"],
        series: [{
          name: "S",
          values: [5, 7, 9],
          links: ["javascript:alert(1)", "/safe/path", "data:text/html,x"]
        }]
      });
    });

    const marks = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#c .ui-chart-mark")).map((m) => ({
        tag: m.tagName.toLowerCase(),
        href: m.getAttribute("href")
      })));

    assert.equal(marks.length, 3);
    assert.equal(marks.filter((m) => m.tag === "a").length, 1, "only the safe URL becomes a link");
    assert.equal(marks[1].href, "/safe/path");
    // A rejected URL must not render a link at all -- not an <a> with no href,
    // which would still be focusable and look clickable.
    assert.equal(marks[0].tag, "g");
    assert.equal(marks[2].tag, "g");
  });
});

/* ----------------------------------------------------------------- CSRF -- */

const CSRF_PAGE = `
  <form id="f" data-ui-save-next data-ui-ajax="true" action="/api/save" method="post">
    <input class="ui-control" name="title" value="x">
    <button type="submit" data-ui-save-next-submit>Save</button>
  </form>`;

test("a write carries the CSRF token from the page's meta tags", async () => {
  await ui.page(CSRF_PAGE, async (page) => {
    const request = await page.evaluate(() => {
      // The harness fixture has no meta tags of its own; add them the way a
      // server-rendered layout would.
      const token = document.createElement("meta");
      token.name = "csrf-token";
      token.content = "TOKEN-abc123";
      document.head.appendChild(token);

      const header = document.createElement("meta");
      header.name = "csrf-header";
      header.content = "X-CSRF-TOKEN";
      document.head.appendChild(header);

      return new Promise((resolve) => {
        window.fetch = function (url, options) {
          resolve({
            method: options.method,
            token: options.headers["X-CSRF-TOKEN"],
            credentials: options.credentials
          });
          return Promise.resolve({ ok: true, status: 200 });
        };
        document.querySelector("#f button[type=submit]").click();
      });
    });

    assert.equal(request.method, "POST");
    assert.equal(request.token, "TOKEN-abc123");
    assert.equal(request.credentials, "same-origin");
  });
});

test("a safe method does not carry the token", async () => {
  await ui.page("<div></div>", async (page) => {
    const headers = await page.evaluate(() => {
      const token = document.createElement("meta");
      token.name = "csrf-token";
      token.content = "TOKEN-abc123";
      document.head.appendChild(token);

      let captured = null;
      window.fetch = function (url, options) {
        captured = options.headers;
        return Promise.resolve({ ok: true, status: 200 });
      };
      return window.UI.http.fetch("/api/thing").then(() => captured);
    });
    assert.equal("X-CSRF-TOKEN" in headers, false);
  });
});

test("UI.http.fetch rejects with the status attached", async () => {
  await ui.page("<div></div>", async (page) => {
    const status = await page.evaluate(() => {
      window.fetch = function () {
        return Promise.resolve({ ok: false, status: 403 });
      };
      return window.UI.http.fetch("/api/thing")
        .then(() => null)
        .catch((error) => error.status);
    });
    // Without this an application cannot tell a 403 from a 503, and so cannot
    // decide whether offering a retry makes any sense.
    assert.equal(status, 403);
  });
});

/* --------------------------------------------------- remote option lists -- */

test("a remote multi-select renders labels as text, never as markup", async () => {
  const html = '<select id="s" multiple data-ui-multiselect data-ui-url="/api/ops"' +
    ' data-ui-value-key="id" data-ui-label-key="name"></select>';

  await ui.page(html, async (page) => {
    await page.evaluate(() => {
      window.fetch = function () {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: function () {
            return Promise.resolve([
              { id: "1", name: "Simba Bet" },
              { id: "2", name: "<img src=x onerror=alert(1)>" }
            ]);
          }
        });
      };
    });

    await page.click(".ui-multiselect-trigger");
    await page.wait(80);

    const options = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#s option")).map((o) => ({
        text: o.textContent,
        children: o.children.length
      })));

    assert.equal(options.length, 2);
    assert.equal(options[1].text, "<img src=x onerror=alert(1)>");
    assert.equal(options[1].children, 0, "the label is text, not parsed markup");
  });
});

test("a remote multi-select does not fetch until it is opened", async () => {
  const html = '<select id="s" multiple data-ui-multiselect data-ui-url="/api/ops"></select>';

  await ui.page(html, async (page) => {
    const before = await page.evaluate(() => {
      window.__calls = 0;
      window.fetch = function () {
        window.__calls++;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      };
      return window.__calls;
    });
    assert.equal(before, 0, "a filter the user never touches costs no request");

    await page.click(".ui-multiselect-trigger");
    await page.wait(80);
    assert.equal(await page.evaluate(() => window.__calls), 1);
  });
});
