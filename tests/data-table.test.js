"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

const ROWS = [
  ["Keystone Industries Ltd", "REG-0007", "2026-03-14", "Active"],
  ["Summit Trading", "REG-0002", "2025-11-02", "Expired"],
  ["Meridian Logistics", "REG-0021", "2026-07-01", "Active"],
  ["Zenith Holdings", "REG-0013", "2024-01-30", "Suspended"],
  ["Redwood Supplies", "REG-0004", "2026-01-15", "Active"],
  ["Apex Media", "REG-0018", "2025-06-20", "Under review"],
  ["Delta Partners", "REG-0011", "2026-05-05", "Active"],
];

function table(attributes) {
  return `
    <div data-ui-table ${attributes || ""}>
      <table class="ui-table">
        <thead>
          <tr>
            <th data-ui-sort="text">Company</th>
            <th data-ui-sort="text">Reference</th>
            <th data-ui-sort="date">Expires</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${ROWS.map(
            (r) =>
              "<tr>" +
              r.map((cell) => "<td>" + cell + "</td>").join("") +
              "</tr>"
          ).join("\n")}
        </tbody>
      </table>
    </div>`;
}

const visibleFirstColumn = () =>
  [...document.querySelectorAll("tbody tr:not(.ui-table-empty-row)")].map(
    (row) => row.children[0].textContent
  );

test("builds a toolbar and paginates to the requested page size", async () => {
  await ui.page(table('data-ui-page-size="3"'), async (page) => {
    assert.equal(await page.count(".ui-table-toolbar"), 1);
    assert.equal(await page.count(".ui-table-search"), 1);
    assert.equal(await page.count(".ui-table-page-size"), 1);

    assert.equal(
      await page.evaluate(visibleFirstColumn).then((r) => r.length),
      3,
      "should render only one page of rows"
    );
    assert.equal(await page.count(".ui-pagination li"), 5, "3 pages plus prev/next");
  });
});

test("search filters across all columns and resets to page 1", async () => {
  await ui.page(table('data-ui-page-size="3"'), async (page) => {
    await page.type(".ui-table-search", "Active");
    const rows = await page.evaluate(visibleFirstColumn);

    assert.equal(rows.length, 3, "4 Active rows, page size 3");
    assert.equal(
      await page.evaluate(
        () => document.querySelector(".ui-pagination .ui-active").textContent
      ),
      "1",
      "filtering should return to the first page"
    );

    await page.type(".ui-table-search", "Zenith");
    assert.deepEqual(await page.evaluate(visibleFirstColumn), ["Zenith Holdings"]);
  });
});

test("shows an empty row when nothing matches", async () => {
  await ui.page(table('data-ui-empty-text="No records found"'), async (page) => {
    await page.type(".ui-table-search", "zzzz-no-such-company");

    assert.equal(await page.count(".ui-table-empty-row"), 1);
    assert.equal(await page.text(".ui-table-empty-row"), "No records found");
    assert.equal(
      await page.evaluate(() => document.querySelector(".ui-table-empty-row td").colSpan),
      4,
      "empty row should span every column"
    );
    assert.equal(await page.count(".ui-pagination"), 0, "no pagination for a single empty page");
  });
});

test("text sorting toggles direction and syncs aria-sort", async () => {
  await ui.page(table('data-ui-page-size="10"'), async (page) => {
    await page.click("thead th:nth-child(1)");

    let rows = await page.evaluate(visibleFirstColumn);
    assert.equal(rows[0], "Apex Media", "ascending by company");
    assert.equal(await page.attr("thead th:nth-child(1)", "aria-sort"), "ascending");

    await page.click("thead th:nth-child(1)");
    rows = await page.evaluate(visibleFirstColumn);
    assert.equal(rows[0], "Zenith Holdings", "descending by company");
    assert.equal(await page.attr("thead th:nth-child(1)", "aria-sort"), "descending");
  });
});

test("date sorting is chronological, not lexicographic", async () => {
  await ui.page(table('data-ui-page-size="10"'), async (page) => {
    await page.click("thead th:nth-child(3)");
    const dates = await page.evaluate(() =>
      [...document.querySelectorAll("tbody tr")].map((r) => r.children[2].textContent)
    );

    assert.equal(dates[0], "2024-01-30", "oldest first");
    assert.equal(dates[dates.length - 1], "2026-07-01", "newest last");

    const sorted = dates.slice().sort();
    assert.deepEqual(dates, sorted, "ISO dates should come out in order");
  });
});

test("only one column carries aria-sort at a time", async () => {
  await ui.page(table(""), async (page) => {
    await page.click("thead th:nth-child(1)");
    await page.click("thead th:nth-child(2)");

    const sorts = await page.evaluate(() =>
      [...document.querySelectorAll("thead th")].map((th) => th.getAttribute("aria-sort"))
    );
    assert.deepEqual(sorts, ["none", "ascending", "none", null]);
  });
});

test("columns without data-ui-sort are not made sortable", async () => {
  await ui.page(table(""), async (page) => {
    assert.equal(
      await page.evaluate(() =>
        document.querySelector("thead th:nth-child(4)").classList.contains("ui-table-sortable")
      ),
      false,
      "the Status column opted out of sorting"
    );
    assert.equal(await page.count("th.ui-table-sortable"), 3);
  });
});

test("changing page size re-paginates from page 1", async () => {
  await ui.page(table('data-ui-page-size="3" data-ui-page-sizes="3,5,10"'), async (page) => {
    await page.click(".ui-pagination li:nth-child(3) .ui-page-link"); // page 2
    await page.evaluate(() => {
      const select = document.querySelector(".ui-table-page-size select");
      select.value = "5";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    assert.equal((await page.evaluate(visibleFirstColumn)).length, 5);
    assert.equal(
      await page.text(".ui-pagination .ui-active"),
      "1",
      "resizing should return to page 1"
    );
  });
});

test("emits ui:table:change with page and result counts", async () => {
  await ui.page(table('data-ui-page-size="3"'), async (page) => {
    await page.recordEvents(["ui:table:change"]);
    await page.type(".ui-table-search", "Active");

    const events = await page.recordedEvents();
    const last = events[events.length - 1];

    assert.equal(last.name, "ui:table:change");
    assert.deepEqual(last.detail, { page: 1, totalPages: 2, visible: 4, total: 7 });
  });
});

test("data-ui-sort-value overrides display text for sorting", async () => {
  await ui.page(
    `<div data-ui-table data-ui-page-size="10">
       <table class="ui-table">
         <thead><tr><th data-ui-sort="number">Fee</th></tr></thead>
         <tbody>
           <tr><td data-ui-sort-value="1500000">USD 1.5M</td></tr>
           <tr><td data-ui-sort-value="250000">USD 250K</td></tr>
           <tr><td data-ui-sort-value="9000000">USD 9M</td></tr>
         </tbody>
       </table>
     </div>`,
    async (page) => {
      await page.click("thead th");
      const cells = await page.evaluate(() =>
        [...document.querySelectorAll("tbody td")].map((td) => td.textContent)
      );
      assert.deepEqual(
        cells,
        ["USD 250K", "USD 1.5M", "USD 9M"],
        "should sort by the numeric data-ui-sort-value, not the formatted label"
      );
    }
  );
});

test("search and sort compose without losing rows", async () => {
  await ui.page(table('data-ui-page-size="10"'), async (page) => {
    await page.type(".ui-table-search", "Active");
    await page.click("thead th:nth-child(1)");

    const rows = await page.evaluate(visibleFirstColumn);
    assert.deepEqual(rows, [
      "Delta Partners",
      "Keystone Industries Ltd",
      "Meridian Logistics",
      "Redwood Supplies",
    ]);

    // Clearing the search must bring every row back, not just the sorted page.
    await page.type(".ui-table-search", "");
    assert.equal((await page.evaluate(visibleFirstColumn)).length, 7);
  });
});

test("data-ui-search=false and data-ui-page-size-selector=false suppress the toolbar", async () => {
  await ui.page(
    table('data-ui-search="false" data-ui-page-size-selector="false" data-ui-page-size="3"'),
    async (page) => {
      assert.equal(await page.count(".ui-table-toolbar"), 0, "no toolbar when both are off");
      assert.equal(await page.count(".ui-pagination"), 1, "pagination still renders");
    }
  );
});

test("pagination is omitted entirely when everything fits on one page", async () => {
  await ui.page(table('data-ui-page-size="50"'), async (page) => {
    assert.equal(
      await page.count(".ui-pagination"),
      0,
      "7 rows at page size 50 needs no pager"
    );
  });
});

test("a visible status line reports the row count even with nothing to paginate", async () => {
  // Previously only announced to screen readers (UI.announce) -- a sighted user
  // had no visible confirmation of how many records existed at all once the
  // result set was small enough that .ui-pagination itself rendered empty.
  await ui.page(table('data-ui-page-size="50"'), async (page) => {
    assert.equal(await page.text(".ui-table-status"), "7 of 7 records");
  });
});

test("the status line tracks a filtered result count, not just the total", async () => {
  await ui.page(table('data-ui-page-size="50"'), async (page) => {
    await page.type(".ui-table-search", "active");
    assert.equal(await page.text(".ui-table-status"), "4 of 7 records", "4 rows are literally 'Active'");
  });
});

test("data-ui-status=false suppresses the status line", async () => {
  await ui.page(table('data-ui-page-size="50" data-ui-status="false"'), async (page) => {
    assert.equal(await page.count(".ui-table-status"), 0);
  });
});

test("toolbar and pagination stay outside a .ui-table-responsive scroll wrapper", async () => {
  // Regression: both were inserted as siblings of the raw <table>, so when
  // the table sat inside the documented .ui-table-responsive scroll wrapper
  // (the pattern for wide tables on narrow screens), the toolbar and
  // pagination ended up *inside* that wrapper too -- meaning the search box,
  // column menu and export button could scroll out of view along with the
  // table instead of staying visible above/below it.
  await ui.page(
    `<div data-ui-table data-ui-page-size="2">
       <div class="ui-table-responsive">
         <table class="ui-table">
           <thead><tr><th data-ui-sort="text">Name</th></tr></thead>
           <tbody><tr><td>Alpha</td></tr><tr><td>Beta</td></tr><tr><td>Gamma</td></tr></tbody>
         </table>
       </div>
     </div>`,
    async (page) => {
      const placement = await page.evaluate(() => {
        const scrollBox = document.querySelector(".ui-table-responsive");
        const toolbar = document.querySelector(".ui-table-toolbar");
        const pagination = document.querySelector(".ui-table-pagination");
        return {
          toolbarInside: scrollBox.contains(toolbar),
          paginationInside: scrollBox.contains(pagination),
          toolbarBeforeScrollBox: toolbar.nextElementSibling === scrollBox,
        };
      });

      assert.equal(placement.toolbarInside, false, "toolbar must not be inside the scroll wrapper");
      assert.equal(placement.paginationInside, false, "pagination must not be inside the scroll wrapper");
      assert.equal(
        placement.toolbarBeforeScrollBox,
        true,
        "toolbar should sit immediately before the scroll wrapper"
      );
    }
  );
});

test("works when data-ui-table sits directly on the <table>", async () => {
  await ui.page(
    `<table class="ui-table" data-ui-table data-ui-page-size="2">
       <thead><tr><th data-ui-sort="text">Name</th></tr></thead>
       <tbody>
         <tr><td>Alpha</td></tr><tr><td>Beta</td></tr><tr><td>Gamma</td></tr>
       </tbody>
     </table>`,
    async (page) => {
      // A <nav> can't legally live inside a table, so the toolbar and
      // pagination must be inserted as siblings of the table element.
      assert.equal(await page.count(".ui-table-toolbar"), 1);
      assert.equal(
        await page.evaluate(
          () => document.querySelector(".ui-table-pagination").parentElement.tagName
        ),
        "BODY",
        "pagination must be a sibling of the table, not nested inside it"
      );
      assert.equal((await page.evaluate(visibleFirstColumn)).length, 2);
    }
  );
});
