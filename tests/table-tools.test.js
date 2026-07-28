"use strict";

/**
 * Server-mode tables, row selection, column visibility, CSV export, and the
 * hardened upload area.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

// --------------------------------------------------------------------------
// Server mode
// --------------------------------------------------------------------------

const SERVER_TABLE = `
  <div data-ui-table data-ui-url="/api/records" data-ui-page-size="3" id="reg">
    <table class="ui-table">
      <thead>
        <tr>
          <th data-ui-field="company" data-ui-sort="text">Company</th>
          <th data-ui-field="reference" data-ui-sort="text">Reference</th>
          <th data-ui-field="status">Status</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>`;

/** Installs a fetch stub that records calls and serves a fixed dataset. */
const STUB = `
  window.__calls = [];
  window.__dataset = [
    { id: 1, company: "Keystone Industries Ltd", reference: "REG-0007", status: "Active" },
    { id: 2, company: "Summit Trading", reference: "REG-0002", status: "Expired" },
    { id: 3, company: "Meridian Logistics", reference: "REG-0021", status: "Active" },
    { id: 4, company: "Zenith Holdings", reference: "REG-0013", status: "Suspended" },
    { id: 5, company: "Redwood Supplies", reference: "REG-0004", status: "Active" },
    { id: 6, company: "Apex Media", reference: "REG-0018", status: "Under review" },
    { id: 7, company: "Delta Partners", reference: "REG-0011", status: "Active" }
  ];
  window.fetch = function (url) {
    window.__calls.push(url);
    const params = new URL(url, location.origin).searchParams;
    const page = Number(params.get("page")) || 1;
    const size = Number(params.get("size")) || 10;
    const q = (params.get("q") || "").toLowerCase();
    const sort = params.get("sort");
    const dir = params.get("dir");

    let rows = window.__dataset.filter(function (r) {
      return !q || Object.values(r).join(" ").toLowerCase().includes(q);
    });
    if (sort) {
      rows = rows.slice().sort(function (a, b) {
        return String(a[sort]).localeCompare(String(b[sort]));
      });
      if (dir === "desc") rows.reverse();
    }
    const total = rows.length;
    rows = rows.slice((page - 1) * size, page * size);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ rows, total }) });
  };`;

const firstColumn = () =>
  [...document.querySelectorAll("tbody tr:not(.ui-table-empty-row)")].map(
    (row) => row.children[0].textContent
  );

test("server mode fetches the first page and maps fields to columns", async () => {
  await ui.page(SERVER_TABLE, async (page) => {
    await page.evaluate(STUB);
    await page.evaluate(() => UI.table.refresh("#reg"));
    await page.waitFor(() => document.querySelectorAll("tbody tr").length === 3);

    assert.deepEqual(await page.evaluate(firstColumn), [
      "Keystone Industries Ltd",
      "Summit Trading",
      "Meridian Logistics",
    ]);

    const calls = await page.evaluate(() => window.__calls);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^\/api\/records\?page=1&size=3$/);
  });
});

test("server mode paginates using the server's total, not the row count", async () => {
  await ui.page(SERVER_TABLE, async (page) => {
    await page.evaluate(STUB);
    await page.evaluate(() => UI.table.refresh("#reg"));
    await page.waitFor(() => document.querySelectorAll(".ui-pagination li").length > 0);

    // 7 records at 3 per page = 3 pages, plus prev/next.
    assert.equal(await page.count(".ui-pagination li"), 5);

    await page.click(".ui-pagination li:nth-child(3) .ui-page-link");
    await page.waitFor(() => window.__calls.length === 2);

    assert.match((await page.evaluate(() => window.__calls))[1], /page=2&size=3/);
    assert.deepEqual(await page.evaluate(firstColumn), [
      "Zenith Holdings",
      "Redwood Supplies",
      "Apex Media",
    ]);
  });
});

test("server mode sends sort field and direction, not a client-side sort", async () => {
  await ui.page(SERVER_TABLE, async (page) => {
    await page.evaluate(STUB);
    await page.evaluate(() => UI.table.refresh("#reg"));
    await page.waitFor(() => document.querySelectorAll("tbody tr").length === 3);

    await page.click("thead th:nth-child(1)");
    await page.waitFor(() => window.__calls.length === 2);
    assert.match((await page.evaluate(() => window.__calls))[1], /sort=company&dir=asc/);

    await page.click("thead th:nth-child(1)");
    await page.waitFor(() => window.__calls.length === 3);
    assert.match((await page.evaluate(() => window.__calls))[2], /sort=company&dir=desc/);

    assert.equal(
      await page.attr("thead th:nth-child(1)", "aria-sort"),
      "descending",
      "aria-sort should still reflect the server-applied order"
    );
  });
});

test("server search is debounced into a single request", async () => {
  await ui.page(SERVER_TABLE, async (page) => {
    await page.evaluate(STUB);
    await page.evaluate(() => UI.table.refresh("#reg"));
    await page.waitFor(() => document.querySelectorAll("tbody tr").length === 3);
    await page.evaluate(() => (window.__calls.length = 0));

    // Three keystrokes in quick succession.
    await page.evaluate(() => {
      const box = document.querySelector(".ui-table-search");
      ["z", "ze", "zen"].forEach((value) => {
        box.value = value;
        box.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });

    await page.wait(500);
    const calls = await page.evaluate(() => window.__calls);
    assert.equal(calls.length, 1, "typing should produce one request, not one per keystroke");
    assert.match(calls[0], /q=zen/);
    assert.deepEqual(await page.evaluate(firstColumn), ["Zenith Holdings"]);
  });
});

test("a slow earlier page cannot overwrite a newer one", async () => {
  await ui.page(SERVER_TABLE, async (page) => {
    await page.evaluate(() => {
      window.__pending = [];
      window.fetch = (url) => new Promise((resolve) => window.__pending.push({ url, resolve }));
    });
    await page.evaluate(() => UI.table.refresh("#reg"));
    await page.waitFor(() => window.__pending.length === 1);

    await page.evaluate(() => {
      const box = document.querySelector(".ui-table-search");
      box.value = "x";
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitFor(() => window.__pending.length === 2, { timeout: 3000 });

    // Resolve newest first, then let the stale one land.
    await page.evaluate(async () => {
      const [stale, fresh] = window.__pending;
      fresh.resolve({
        ok: true,
        json: () => Promise.resolve({ rows: [{ id: 9, company: "FRESH", reference: "L", status: "A" }], total: 1 }),
      });
      await new Promise((r) => setTimeout(r, 50));
      stale.resolve({
        ok: true,
        json: () => Promise.resolve({ rows: [{ id: 8, company: "STALE", reference: "L", status: "A" }], total: 1 }),
      });
    });
    await page.wait(150);

    assert.deepEqual(await page.evaluate(firstColumn), ["FRESH"]);
  });
});

test("a failed request shows an error row instead of an empty table", async () => {
  await ui.page(SERVER_TABLE, async (page) => {
    await page.evaluate(() => {
      window.fetch = () => Promise.resolve({ ok: false, status: 500 });
    });
    await page.recordEvents(["ui:table:error"]);
    await page.evaluate(() => UI.table.refresh("#reg"));
    await page.waitFor(() => !!document.querySelector(".ui-table-error-row"));

    assert.equal(await page.text(".ui-table-error-row"), "Could not load records");
    assert.equal((await page.recordedEvents()).length, 1);
  });
});

test("server mode accepts a pre-rendered HTML fragment", async () => {
  await ui.page(SERVER_TABLE, async (page) => {
    await page.evaluate(() => {
      window.fetch = () =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              html: '<tr data-ui-row-id="42"><td>Server rendered</td><td>REG-1</td><td>Active</td></tr>',
              total: 1,
            }),
        });
    });
    await page.evaluate(() => UI.table.refresh("#reg"));
    await page.waitFor(() => document.querySelectorAll("tbody tr").length === 1);

    assert.deepEqual(await page.evaluate(firstColumn), ["Server rendered"]);
  });
});

test("the table is marked busy while loading", async () => {
  await ui.page(SERVER_TABLE, async (page) => {
    await page.evaluate(() => {
      window.__pending = [];
      window.fetch = (url) => new Promise((resolve) => window.__pending.push({ url, resolve }));
    });
    await page.evaluate(() => UI.table.refresh("#reg"));
    await page.waitFor(() => window.__pending.length === 1);

    assert.equal(await page.attr("#reg table", "aria-busy"), "true");
    assert.equal(
      await page.evaluate(() => document.getElementById("reg").classList.contains("ui-table-loading")),
      true
    );

    await page.evaluate(() =>
      window.__pending[0].resolve({ ok: true, json: () => Promise.resolve({ rows: [], total: 0 }) })
    );
    await page.waitFor(() => document.querySelector("#reg table").getAttribute("aria-busy") === "false");
  });
});

// --------------------------------------------------------------------------
// Row selection
// --------------------------------------------------------------------------

const SELECTABLE = `
  <div data-ui-table data-ui-select data-ui-page-size="3" id="reg">
    <div class="ui-table-selection" data-ui-table-selection>
      <button type="button" class="ui-btn ui-btn-sm ui-btn-danger" id="bulk">Revoke</button>
    </div>
    <table class="ui-table">
      <thead><tr><th data-ui-sort="text">Company</th><th>Status</th></tr></thead>
      <tbody>
        <tr data-ui-row-id="1"><td>Keystone Industries Ltd</td><td>Active</td></tr>
        <tr data-ui-row-id="2"><td>Summit Trading</td><td>Expired</td></tr>
        <tr data-ui-row-id="3"><td>Meridian Logistics</td><td>Active</td></tr>
        <tr data-ui-row-id="4"><td>Zenith Holdings</td><td>Suspended</td></tr>
      </tbody>
    </table>
  </div>`;

test("selection adds a checkbox column and reports chosen row ids", async () => {
  await ui.page(SELECTABLE, async (page) => {
    assert.equal(await page.count("thead .ui-table-select-cell"), 1);
    assert.equal(await page.count("tbody .ui-table-select-cell"), 3, "one per visible row");

    await page.recordEvents(["ui:table:select"]);
    await page.click("tbody tr:nth-child(1) .ui-table-select-cell input");
    await page.click("tbody tr:nth-child(3) .ui-table-select-cell input");

    assert.deepEqual(await page.evaluate(() => UI.table.selected("#reg")), ["1", "3"]);

    const events = await page.recordedEvents();
    assert.deepEqual(events[events.length - 1].detail, { selected: ["1", "3"], count: 2 });
  });
});

test("the selection bar appears only when something is selected", async () => {
  await ui.page(SELECTABLE, async (page) => {
    assert.equal(await page.isVisible("[data-ui-table-selection]"), false);

    await page.click("tbody tr:nth-child(1) .ui-table-select-cell input");
    assert.equal(await page.isVisible("[data-ui-table-selection]"), true);
    assert.equal(await page.text(".ui-table-selection-count"), "1 selected");

    await page.click("tbody tr:nth-child(1) .ui-table-select-cell input");
    assert.equal(await page.isVisible("[data-ui-table-selection]"), false);
  });
});

test("select-all covers the visible page and goes indeterminate on partial selection", async () => {
  await ui.page(SELECTABLE, async (page) => {
    await page.click("thead .ui-table-select-cell input");
    assert.deepEqual(await page.evaluate(() => UI.table.selected("#reg")), ["1", "2", "3"]);

    await page.click("tbody tr:nth-child(2) .ui-table-select-cell input");
    const state = await page.evaluate(() => {
      const box = document.querySelector("thead .ui-table-select-cell input");
      return { checked: box.checked, indeterminate: box.indeterminate };
    });
    assert.deepEqual(state, { checked: false, indeterminate: true });
  });
});

test("selection survives paging and clearSelection resets it", async () => {
  await ui.page(SELECTABLE, async (page) => {
    await page.click("tbody tr:nth-child(1) .ui-table-select-cell input");
    await page.click(".ui-pagination li:nth-child(3) .ui-page-link");

    assert.deepEqual(
      await page.evaluate(() => UI.table.selected("#reg")),
      ["1"],
      "a selection made on page 1 should still count on page 2"
    );

    await page.evaluate(() => UI.table.clearSelection("#reg"));
    assert.deepEqual(await page.evaluate(() => UI.table.selected("#reg")), []);
    assert.equal(await page.isVisible("[data-ui-table-selection]"), false);
  });
});

test("selected rows are visually marked", async () => {
  await ui.page(SELECTABLE, async (page) => {
    await page.click("tbody tr:nth-child(2) .ui-table-select-cell input");
    assert.equal(
      await page.evaluate(() =>
        document.querySelectorAll("tbody tr")[1].classList.contains("ui-selected")
      ),
      true
    );
  });
});

test("the empty row spans the selection column too", async () => {
  await ui.page(SELECTABLE, async (page) => {
    await page.type(".ui-table-search", "zzz-nothing");
    assert.equal(
      await page.evaluate(() => document.querySelector(".ui-table-empty-row td").colSpan),
      3,
      "2 data columns + the checkbox column"
    );
  });
});

// --------------------------------------------------------------------------
// Column visibility
// --------------------------------------------------------------------------

test("column menu hides and restores a column across header and body", async () => {
  await ui.page(
    `<div data-ui-table data-ui-columns data-ui-page-size="5" id="reg">
       <table class="ui-table">
         <thead><tr><th>Company</th><th>Reference</th><th>Fee</th></tr></thead>
         <tbody>
           <tr><td>Keystone</td><td>REG-0007</td><td>1,500,000</td></tr>
           <tr><td>Summit</td><td>REG-0002</td><td>9,000,000</td></tr>
         </tbody>
       </table>
     </div>`,
    async (page) => {
      assert.equal(await page.count(".ui-table-column-option"), 3);

      await page.click(".ui-table-columns [data-ui-dropdown]");
      await page.click(".ui-table-column-option:nth-child(3) input");

      const hidden = await page.evaluate(() => ({
        header: document.querySelectorAll("thead th")[2].hidden,
        cells: [...document.querySelectorAll("tbody tr")].map((r) => r.children[2].hidden),
      }));
      assert.deepEqual(hidden, { header: true, cells: [true, true] });

      await page.click(".ui-table-column-option:nth-child(3) input");
      assert.equal(
        await page.evaluate(() => document.querySelectorAll("thead th")[2].hidden),
        false
      );
    }
  );
});

test("a column hidden in markup starts hidden and unchecked", async () => {
  await ui.page(
    `<div data-ui-table data-ui-columns id="reg">
       <table class="ui-table">
         <thead><tr><th>Company</th><th data-ui-hidden>Internal note</th></tr></thead>
         <tbody><tr><td>Keystone</td><td>secret</td></tr></tbody>
       </table>
     </div>`,
    async (page) => {
      assert.equal(await page.evaluate(() => document.querySelectorAll("thead th")[1].hidden), true);
      assert.equal(
        await page.evaluate(
          () => document.querySelectorAll(".ui-table-column-option input")[1].checked
        ),
        false
      );
    }
  );
});

// --------------------------------------------------------------------------
// CSV export
// --------------------------------------------------------------------------

const EXPORTABLE = `
  <div data-ui-table data-ui-export="records" data-ui-page-size="2" id="reg">
    <table class="ui-table">
      <thead><tr><th data-ui-sort="text">Company</th><th>Fee</th></tr></thead>
      <tbody>
        <tr><td>Keystone Industries Ltd</td><td data-ui-export-value="1500000">USD 1,500,000</td></tr>
        <tr><td>Summit "Casino"</td><td data-ui-export-value="9000000">USD 9,000,000</td></tr>
        <tr><td>Meridian Logistics</td><td data-ui-export-value="250000">USD 250,000</td></tr>
      </tbody>
    </table>
  </div>`;

/**
 * Intercepts the generated blob rather than actually downloading it.
 * Captures the raw bytes as well as the text: Blob.text() performs a UTF-8
 * decode, which strips a leading BOM, so the text alone cannot prove the BOM
 * was written.
 */
const CAPTURE_CSV = `
  window.__csv = null;
  window.__csvBytes = null;
  const realCreate = URL.createObjectURL;
  URL.createObjectURL = function (blob) {
    blob.text().then(function (text) { window.__csv = text; });
    blob.arrayBuffer().then(function (buffer) {
      window.__csvBytes = Array.from(new Uint8Array(buffer.slice(0, 3)));
    });
    return realCreate.call(URL, blob);
  };`;

test("export includes every filtered row, not just the visible page", async () => {
  await ui.page(EXPORTABLE, async (page) => {
    await page.evaluate(CAPTURE_CSV);
    await page.click(".ui-table-export");
    await page.waitFor(() => window.__csv !== null);

    const csv = await page.evaluate(() => window.__csv);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");

    assert.equal(lines.length, 4, "header + all 3 rows, though only 2 are on screen");
    assert.equal(lines[0], '"Company","Fee"');
    assert.equal(lines[1], '"Keystone Industries Ltd","1500000"');
  });
});

test("export quotes embedded quotes and uses data-ui-export-value", async () => {
  await ui.page(EXPORTABLE, async (page) => {
    await page.evaluate(CAPTURE_CSV);
    await page.click(".ui-table-export");
    await page.waitFor(() => window.__csv !== null);

    const csv = await page.evaluate(() => window.__csv);
    assert.ok(
      csv.includes('"Summit ""Casino""","9000000"'),
      "embedded quotes must be doubled per RFC 4180:\n" + csv
    );

    await page.waitFor(() => window.__csvBytes !== null);
    assert.deepEqual(
      await page.evaluate(() => window.__csvBytes),
      [0xef, 0xbb, 0xbf],
      "a UTF-8 BOM keeps Excel from mangling non-ASCII company names"
    );
  });
});

test("export respects the active search and sort", async () => {
  await ui.page(EXPORTABLE, async (page) => {
    await page.type(".ui-table-search", "Logistics");
    await page.evaluate(CAPTURE_CSV);
    await page.click(".ui-table-export");
    await page.waitFor(() => window.__csv !== null);

    const lines = (await page.evaluate(() => window.__csv))
      .replace(/^﻿/, "").trim().split("\r\n");
    assert.deepEqual(lines, ['"Company","Fee"', '"Meridian Logistics","250000"']);
  });
});

test("export omits hidden columns", async () => {
  await ui.page(EXPORTABLE.replace("data-ui-export=", "data-ui-columns data-ui-export="), async (page) => {
    await page.click(".ui-table-columns [data-ui-dropdown]");
    await page.click(".ui-table-column-option:nth-child(2) input");

    await page.evaluate(CAPTURE_CSV);
    await page.click(".ui-table-export");
    await page.waitFor(() => window.__csv !== null);

    const lines = (await page.evaluate(() => window.__csv))
      .replace(/^﻿/, "").trim().split("\r\n");
    assert.equal(lines[0], '"Company"', "the hidden Fee column should not be exported");
  });
});

// --------------------------------------------------------------------------
// Upload
// --------------------------------------------------------------------------

const UPLOAD = `
  <div data-ui-upload data-ui-max-size="1KB" data-ui-max-files="2" id="zone">
    <input type="file" id="docs" name="docs" multiple accept=".pdf,.png">
    <div class="ui-upload-preview"></div>
  </div>`;

// The dropzone must be the ONLY thing the file <input> overlaps. Earlier the
// input covered the entire .ui-upload box -- preview list included -- so a
// real click on a file's remove button actually hit the invisible input and
// reopened the file picker instead of removing the file. This markup matches
// exactly what the docs ship (class="ui-upload" + .ui-upload-dropzone), which
// is the only configuration that reproduces the CSS overlay; the minimal
// `UPLOAD` fixture above has no `ui-upload` class, so it never exercised the
// positioning at all.
const REALISTIC_UPLOAD = `
  <div class="ui-upload" data-ui-upload id="zone">
    <label class="ui-upload-dropzone">
      <input type="file" id="docs" name="docs" multiple>
      <span class="ui-upload-icon">&#8679;</span>
      <span class="ui-upload-title">Drop files here or click to browse</span>
    </label>
    <div class="ui-upload-preview"></div>
  </div>`;

/** Builds a real FileList on the input, which is the only way to set one. */
const putFiles = (specs) => `
  (() => {
    const transfer = new DataTransfer();
    ${JSON.stringify(specs)}.forEach(function (spec) {
      const blob = new Blob([new Uint8Array(spec.size)], { type: spec.type || "" });
      transfer.items.add(new File([blob], spec.name, { type: spec.type || "" }));
    });
    const input = document.getElementById("docs");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`;

test("files within the rules are accepted and previewed", async () => {
  await ui.page(UPLOAD, async (page) => {
    await page.evaluate(putFiles([{ name: "certificate.pdf", size: 500, type: "application/pdf" }]));

    assert.equal(await page.count(".ui-file-item"), 1);
    assert.equal(await page.text(".ui-file-item-name"), "certificate.pdf");
    assert.equal(await page.text(".ui-file-item-size"), "500 B");
    assert.equal(await page.count(".ui-upload-error"), 0);
  });
});

test("an oversized file is rejected and removed from what the form posts", async () => {
  await ui.page("<form id='f'>" + UPLOAD + "</form>", async (page) => {
    await page.recordEvents(["ui:upload:rejected"]);
    await page.evaluate(
      putFiles([
        { name: "small.pdf", size: 400, type: "application/pdf" },
        { name: "huge.pdf", size: 5000, type: "application/pdf" },
      ])
    );

    assert.equal(await page.text(".ui-upload-error"), "huge.pdf is larger than 1 KB");
    assert.equal(
      await page.evaluate(() => document.getElementById("docs").files.length),
      1,
      "the rejected file must be dropped from the FileList, not just hidden"
    );
    assert.equal(
      await page.evaluate(() => document.getElementById("docs").files[0].name),
      "small.pdf"
    );
    assert.equal((await page.recordedEvents()).length, 1);
  });
});

test("a disallowed file type is rejected by extension and by MIME wildcard", async () => {
  await ui.page(UPLOAD, async (page) => {
    await page.evaluate(putFiles([{ name: "notes.txt", size: 100, type: "text/plain" }]));
    assert.equal(await page.text(".ui-upload-error"), "notes.txt is not an accepted file type");
    assert.equal(await page.evaluate(() => document.getElementById("docs").files.length), 0);

    await page.evaluate(() => {
      document.getElementById("docs").setAttribute("accept", "image/*");
      document.getElementById("zone").setAttribute("accept", "image/*");
    });
    await page.evaluate(putFiles([{ name: "scan.png", size: 100, type: "image/png" }]));
    assert.equal(await page.count(".ui-upload-error"), 0, "image/* should accept image/png");
  });
});

test("too many files are truncated to the limit", async () => {
  await ui.page(UPLOAD, async (page) => {
    await page.evaluate(
      putFiles([
        { name: "a.pdf", size: 100, type: "application/pdf" },
        { name: "b.pdf", size: 100, type: "application/pdf" },
        { name: "c.pdf", size: 100, type: "application/pdf" },
      ])
    );

    assert.equal(await page.text(".ui-upload-error"), "You can upload at most 2 file(s)");
    assert.equal(await page.evaluate(() => document.getElementById("docs").files.length), 2);
    assert.equal(await page.count(".ui-file-item"), 2);
  });
});

test("removing a file rebuilds the FileList", async () => {
  await ui.page(UPLOAD, async (page) => {
    await page.evaluate(
      putFiles([
        { name: "first.pdf", size: 100, type: "application/pdf" },
        { name: "second.pdf", size: 100, type: "application/pdf" },
      ])
    );
    await page.click('.ui-file-item[data-ui-file-index="0"] .ui-file-item-remove');

    assert.equal(await page.count(".ui-file-item"), 1);
    assert.equal(
      await page.evaluate(() => document.getElementById("docs").files[0].name),
      "second.pdf"
    );
  });
});

test("a real click on remove deletes the file instead of reopening the file picker", async () => {
  // Regression test for the dropzone/preview overlap bug: uses the exact
  // markup the docs ship (see REALISTIC_UPLOAD above) and a real
  // coordinate-based mouse click -- synthetic .click() calls do not
  // reproduce this bug because they bypass hit-testing entirely.
  await ui.page(REALISTIC_UPLOAD, async (page) => {
    await page.evaluate(
      putFiles([
        { name: "first.pdf", size: 100, type: "application/pdf" },
        { name: "second.pdf", size: 100, type: "application/pdf" },
      ])
    );
    assert.equal(await page.count(".ui-file-item"), 2);

    await page.click('.ui-file-item[data-ui-file-index="0"] .ui-file-item-remove');

    assert.equal(
      await page.evaluate(() => document.getElementById("docs").files.length),
      1,
      "a real click on remove must delete the file, not fall through to the dropzone's file input"
    );
    assert.equal(await page.count(".ui-file-item"), 1);
    assert.equal(
      await page.evaluate(() => document.getElementById("docs").files[0].name),
      "second.pdf"
    );
  });
});

test("the file input only covers the dropzone, never the preview list", async () => {
  await ui.page(REALISTIC_UPLOAD, async (page) => {
    await page.evaluate(putFiles([{ name: "a.pdf", size: 100, type: "application/pdf" }]));

    const overlap = await page.evaluate(() => {
      const input = document.querySelector("#zone input[type=file]");
      const preview = document.querySelector(".ui-upload-preview");
      const a = input.getBoundingClientRect();
      const b = preview.getBoundingClientRect();
      // Standard axis-aligned rectangle overlap test.
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    });

    assert.equal(overlap, false, "the file input's box must never overlap the preview list");
  });
});

test("data-ui-url uploads immediately and reports progress", async () => {
  await ui.page(UPLOAD.replace("id=\"zone\"", 'id="zone" data-ui-url="/api/documents"'), async (page) => {
    // Stub XMLHttpRequest so no server is needed but the progress path still runs.
    await page.evaluate(() => {
      window.__sent = [];
      class FakeXHR {
        constructor() {
          this.upload = { listeners: {}, addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); } };
          this.listeners = {};
          this.status = 200;
          this.responseText = "{}";
        }
        open(method, url) { this.url = url; }
        setRequestHeader() {}
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
        send(body) {
          window.__sent.push(this.url);
          const fire = (target, type) => (target.listeners[type] || []).forEach((fn) => fn({
            lengthComputable: true, loaded: 50, total: 100,
          }));
          setTimeout(() => {
            fire(this.upload, "progress");
            setTimeout(() => (this.listeners.load || []).forEach((fn) => fn()), 10);
          }, 10);
        }
      }
      window.XMLHttpRequest = FakeXHR;
    });

    await page.recordEvents(["ui:upload:progress", "ui:upload:done"]);
    await page.evaluate(putFiles([{ name: "certificate.pdf", size: 400, type: "application/pdf" }]));
    await page.waitFor(() => document.querySelector(".ui-file-item.ui-uploaded") !== null);

    assert.deepEqual(await page.evaluate(() => window.__sent), ["/api/documents"]);

    const events = await page.recordedEvents();
    assert.ok(
      events.some((e) => e.name === "ui:upload:progress" && e.detail.percent === 50),
      "progress should be reported: " + JSON.stringify(events)
    );
    assert.ok(events.some((e) => e.name === "ui:upload:done"));
    assert.equal(
      await page.evaluate(() => document.querySelector(".ui-file-item .ui-progress-bar").className),
      "ui-progress-bar ui-progress-w-100"
    );
  });
});

test("progress is driven by classes, never an inline style (CSP safety)", async () => {
  await ui.page(UPLOAD, async (page) => {
    await page.evaluate(putFiles([{ name: "a.pdf", size: 100, type: "application/pdf" }]));
    assert.deepEqual(
      await page.evaluate(() => [...document.querySelectorAll("#zone [style]")].map((e) => e.tagName)),
      []
    );
  });
});
