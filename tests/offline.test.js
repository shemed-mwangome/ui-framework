"use strict";

/**
 * Offline work queue. The behaviours worth testing are the ones that decide
 * whether field data survives: durability across the caller returning, the
 * distinction between a transient failure and a permanent one, and that a
 * conflict is retained rather than resolved by last-write-wins.
 *
 * fetch is stubbed per test so the outcome is chosen by the URL.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

const PAGE = `
  <div class="ui-sync" data-ui-sync></div>
  <div class="ui-sync-queue" data-ui-sync-queue></div>`;

// Maps the last path segment to the status code the stub should return.
const STUB = `
  window.__calls = [];
  window.fetch = function (url, options) {
    window.__calls.push(String(url));
    var codes = { ok: 200, server: 500, bad: 422, conflict: 409 };
    var key = String(url).split("/").pop();
    var code = codes[key] || 200;
    return Promise.resolve({
      ok: code >= 200 && code < 300,
      status: code,
      text: function () { return Promise.resolve("detail " + code); }
    });
  };
  window.UI.offline.configure({ autoFlush: false });`;

async function setup(page) {
  await page.evaluate(new Function(STUB));
  await page.evaluate(() => window.UI.offline.clear());
}

test("a queued item is durable before the caller is told it was queued", async () => {
  await ui.page(PAGE, async (page) => {
    await setup(page);
    await page.evaluate(() => window.UI.offline.queue({ url: "/api/ok", label: "Premise visit" }));

    const pending = await page.evaluate(() =>
      window.UI.offline.pending().then((items) => items.map((item) => item.label)));
    assert.deepEqual(pending, ["Premise visit"]);
  });
});

test("the status strip reports what is waiting", async () => {
  await ui.page(PAGE, async (page) => {
    await setup(page);
    await page.evaluate(() => window.UI.offline.queue({ url: "/api/ok", label: "One" }));
    await page.evaluate(() => window.UI.offline.queue({ url: "/api/ok", label: "Two" }));

    assert.match(await page.text(".ui-sync-text"), /2 waiting to upload/);
    assert.equal(await page.count(".ui-sync-item"), 2);
  });
});

test("a successful send removes the item and announces it", async () => {
  await ui.page(PAGE, async (page) => {
    await setup(page);
    await page.recordEvents(["ui:offline:synced"]);
    await page.evaluate(() => window.UI.offline.queue({ url: "/api/ok", label: "Sent" }));
    await page.evaluate(() => window.UI.offline.flush());

    const remaining = await page.evaluate(() =>
      window.UI.offline.pending().then((items) => items.length));
    assert.equal(remaining, 0);
    assert.equal((await page.recordedEvents()).length, 1);
  });
});

test("a 5xx stays queued for another attempt", async () => {
  await ui.page(PAGE, async (page) => {
    await setup(page);
    await page.evaluate(() => window.UI.offline.queue({ url: "/api/server", label: "Retry me" }));
    await page.evaluate(() => window.UI.offline.flush());

    const item = await page.evaluate(() =>
      window.UI.offline.pending().then((items) => ({ status: items[0].status, attempts: items[0].attempts })));
    assert.equal(item.status, "pending", "the server's problem, not the payload's");
    assert.equal(item.attempts, 1);
  });
});

test("a 4xx fails permanently instead of retrying forever", async () => {
  await ui.page(PAGE, async (page) => {
    await setup(page);
    await page.evaluate(() => window.UI.offline.queue({ url: "/api/bad", label: "Rejected" }));
    await page.evaluate(() => window.UI.offline.flush());
    await page.evaluate(() => window.UI.offline.flush());

    const item = await page.evaluate(() =>
      window.UI.offline.pending().then((items) => ({ status: items[0].status, attempts: items[0].attempts })));
    assert.equal(item.status, "failed");
    assert.equal(item.attempts, 1, "a second flush must not keep hammering a request that cannot succeed");
  });
});

test("a 409 is retained as a conflict, never overwritten", async () => {
  await ui.page(PAGE, async (page) => {
    await setup(page);
    await page.recordEvents(["ui:offline:conflict"]);
    await page.evaluate(() => window.UI.offline.queue({ url: "/api/conflict", label: "Contested" }));
    await page.evaluate(() => window.UI.offline.flush());

    const item = await page.evaluate(() =>
      window.UI.offline.pending().then((items) => items[0]));
    assert.equal(item.status, "conflict");
    assert.equal((await page.recordedEvents()).length, 1);
    assert.match(await page.text(".ui-sync-text"), /needs your attention/);
  });
});

test("a blocked item stops the rest of its own group but not other groups", async () => {
  await ui.page(PAGE, async (page) => {
    await setup(page);
    await page.evaluate(() => window.UI.offline.queue({ url: "/api/conflict", label: "A1", group: "A" }));
    await page.evaluate(() => window.UI.offline.queue({ url: "/api/ok", label: "A2", group: "A" }));
    await page.evaluate(() => window.UI.offline.queue({ url: "/api/ok", label: "B1", group: "B" }));
    await page.evaluate(() => window.UI.offline.flush());

    const labels = await page.evaluate(() =>
      window.UI.offline.pending().then((items) => items.map((item) => item.label)));
    // A2 must not land ahead of the A1 it depends on; B1 is unrelated.
    assert.deepEqual(labels.sort(), ["A1", "A2"]);
  });
});

test("retrying a conflict puts it back in the queue", async () => {
  await ui.page(PAGE, async (page) => {
    await setup(page);
    await page.evaluate(() => window.UI.offline.queue({ url: "/api/ok", label: "Fixed", id: "fix-1" }));
    await page.evaluate(() => {
      return window.UI.offline.pending().then((items) => {
        items[0].status = "conflict";
        return window.UI.offline.resolve("fix-1", "retry");
      });
    });

    const remaining = await page.evaluate(() =>
      window.UI.offline.pending().then((items) => items.length));
    assert.equal(remaining, 0, "retry re-sends it, and it succeeds");
  });
});

test("discarding is the only path by which field data leaves unsent", async () => {
  await ui.page(PAGE, async (page) => {
    await setup(page);
    await page.evaluate(() => window.UI.offline.queue({ url: "/api/bad", label: "Give up", id: "drop-1" }));
    await page.evaluate(() => window.UI.offline.flush());
    await page.evaluate(() => window.UI.offline.resolve("drop-1", "discard"));

    const remaining = await page.evaluate(() =>
      window.UI.offline.pending().then((items) => items.length));
    assert.equal(remaining, 0);
  });
});

test("an offline form queues instead of posting", async () => {
  const form = `
    <form id="visit" data-ui-offline-form="always" data-ui-offline-url="/api/ok"
          data-ui-offline-label="Premise visit" action="/api/ok" method="post">
      <input name="premise" value="P-001">
      <button type="submit">Save</button>
    </form>` + PAGE;

  await ui.page(form, async (page) => {
    await setup(page);
    await page.click("#visit button[type=submit]");
    await page.wait(50);

    const queued = await page.evaluate(() =>
      window.UI.offline.pending().then((items) => items.map((item) => ({
        label: item.label, premise: item.body && item.body.premise
      }))));
    assert.equal(queued.length, 1);
    assert.equal(queued[0].premise, "P-001");
  });
});
