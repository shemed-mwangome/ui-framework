"use strict";

/**
 * Overlay layering invariants.
 *
 * The framework has no central overlay stack -- each module registers its own
 * document-level Escape handler and relies on `stopImmediatePropagation()` plus
 * a deliberate load order in build.py's JS_ORDER to close only the topmost
 * layer. That is a real invariant held together by a comment, and 1.1.0 already
 * shipped a bug where Escape closed every layer at once. These tests pin it.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

const MODAL = `
  <button id="open" class="ui-btn" data-ui-modal-open="#demo">Open modal</button>
  <div class="ui-modal" id="demo" aria-hidden="true">
    <div class="ui-backdrop"></div>
    <div class="ui-modal-dialog" role="dialog" aria-modal="true">
      <div class="ui-modal-header">
        <h3 class="ui-modal-title">Record details</h3>
        <button class="ui-modal-close" data-ui-modal-close aria-label="Close">&times;</button>
      </div>
      <div class="ui-modal-body">
        <input id="first" class="ui-control" placeholder="First">
        <div class="ui-dropdown">
          <button id="dd" class="ui-btn" data-ui-dropdown>Menu</button>
          <div class="ui-dropdown-menu"><a class="ui-dropdown-item" href="#">One</a></div>
        </div>
        <input id="last" class="ui-control" placeholder="Last">
      </div>
    </div>
  </div>`;

test("modal opens, traps focus, and restores it on close", async () => {
  await ui.page(MODAL, async (page) => {
    await page.focus("#open");
    await page.click("#open");

    assert.equal(await page.isVisible("#demo"), true, "modal should be visible");
    assert.equal(await page.attr("#demo", "aria-hidden"), "false");
    assert.equal(
      await page.evaluate(() => document.body.classList.contains("ui-overlay-open")),
      true,
      "body should be marked to lock scroll"
    );

    // Focus should have moved into the dialog.
    const focused = await page.activeElement();
    assert.ok(
      focused && (await page.evaluate(() => document.querySelector("#demo").contains(document.activeElement))),
      "focus should move inside the modal, got: " + JSON.stringify(focused)
    );

    await page.press("Escape");
    assert.equal(await page.isVisible("#demo"), false, "Escape should close the modal");
    assert.equal(
      (await page.activeElement()).id,
      "open",
      "focus should return to the element that opened the modal"
    );
  });
});

test("Escape closes only the topmost layer -- dropdown inside a modal", async () => {
  await ui.page(MODAL, async (page) => {
    await page.click("#open");
    await page.click("#dd");

    assert.equal(
      await page.evaluate(() => document.querySelector(".ui-dropdown").classList.contains("ui-open")),
      true,
      "dropdown should be open"
    );

    await page.press("Escape");

    assert.equal(
      await page.evaluate(() => document.querySelector(".ui-dropdown").classList.contains("ui-open")),
      false,
      "first Escape should close the dropdown"
    );
    assert.equal(
      await page.isVisible("#demo"),
      true,
      "first Escape must NOT also close the modal underneath the dropdown"
    );

    await page.press("Escape");
    assert.equal(await page.isVisible("#demo"), false, "second Escape should close the modal");
  });
});

test("backdrop click closes a normal modal but not a static one", async () => {
  await ui.page(MODAL, async (page) => {
    await page.click("#open");
    await page.click("#demo .ui-backdrop");
    assert.equal(await page.isVisible("#demo"), false, "backdrop click should close");

    await page.evaluate(() =>
      document.querySelector("#demo").setAttribute("data-ui-static", "true")
    );
    await page.click("#open");
    await page.click("#demo .ui-backdrop");
    assert.equal(
      await page.isVisible("#demo"),
      true,
      "data-ui-static should survive a backdrop click"
    );
  });
});

test("data-ui-keyboard=false opts a modal out of Escape", async () => {
  await ui.page(MODAL.replace('id="demo"', 'id="demo" data-ui-keyboard="false"'), async (page) => {
    await page.click("#open");
    await page.press("Escape");
    assert.equal(await page.isVisible("#demo"), true, "Escape should be ignored");
    await page.click("[data-ui-modal-close]");
    assert.equal(await page.isVisible("#demo"), false, "close button should still work");
  });
});

test("Tab wraps inside the modal instead of escaping to the page", async () => {
  await ui.page(
    '<button id="outside">Outside</button>' + MODAL,
    async (page) => {
      await page.click("#open");

      // Walk forward well past the number of focusable elements in the dialog.
      const seen = [];
      for (let i = 0; i < 8; i++) {
        await page.press("Tab");
        seen.push(
          await page.evaluate(() => {
            const el = document.activeElement;
            return { id: el.id || null, inside: document.querySelector("#demo").contains(el) };
          })
        );
      }

      assert.ok(
        seen.every((entry) => entry.inside),
        "focus escaped the modal: " + JSON.stringify(seen)
      );
      assert.ok(
        !seen.some((entry) => entry.id === "outside"),
        "focus reached an element behind the overlay"
      );
    }
  );
});

test("body scroll lock is released only when the last overlay closes", async () => {
  // Driven through the JS API rather than clicks: a modal covers the viewport,
  // so a real mouse click aimed at a trigger behind it lands on the backdrop
  // instead. The invariant under test is the scroll-lock release condition,
  // which is shared between modal.js and offcanvas.js.
  await ui.page(
    MODAL +
      `<div class="ui-offcanvas-root" id="oc" aria-hidden="true">
         <div class="ui-backdrop"></div>
         <aside class="ui-offcanvas ui-offcanvas-end">
           <button data-ui-offcanvas-close class="ui-btn">Close</button>
         </aside>
       </div>`,
    async (page) => {
      const locked = () =>
        page.evaluate(() => document.body.classList.contains("ui-overlay-open"));

      await page.evaluate(() => window.UI.modal.open(document.querySelector("#demo")));
      assert.equal(await locked(), true);

      await page.evaluate(() => window.UI.offcanvas.open(document.querySelector("#oc")));
      assert.equal(await locked(), true, "still locked with two overlays open");

      await page.evaluate(() => window.UI.offcanvas.close(document.querySelector("#oc")));
      assert.equal(
        await locked(),
        true,
        "closing the offcanvas must not unlock scroll while the modal is still open"
      );

      await page.evaluate(() => window.UI.modal.close(document.querySelector("#demo")));
      assert.equal(await locked(), false, "last overlay closing releases the lock");
    }
  );
});

test("a trigger behind an open modal is not clickable through the backdrop", async () => {
  await ui.page(
    '<button id="behind" data-ui-modal-open="#other">Behind</button>' +
      MODAL +
      '<div class="ui-modal" id="other" aria-hidden="true"><div class="ui-backdrop"></div>' +
      '<div class="ui-modal-dialog"><p>Other</p></div></div>',
    async (page) => {
      await page.click("#open");
      await page.click("#behind"); // lands on the backdrop, not the button

      assert.equal(await page.isVisible("#other"), false, "background trigger must not fire");
      assert.equal(await page.isVisible("#demo"), false, "backdrop click closed the open modal");
    }
  );
});

test("clicking outside closes an open dropdown", async () => {
  await ui.page(
    `<div class="ui-dropdown">
       <button id="dd" class="ui-btn" data-ui-dropdown>Menu</button>
       <div class="ui-dropdown-menu"><a class="ui-dropdown-item" href="#">One</a></div>
     </div>
     <div id="elsewhere" style="height:200px">elsewhere</div>`,
    async (page) => {
      await page.click("#dd");
      assert.equal(await page.attr("#dd", "aria-expanded"), "true");

      await page.click("#elsewhere");
      assert.equal(
        await page.attr("#dd", "aria-expanded"),
        "false",
        "outside click should close the dropdown and sync aria-expanded"
      );
    }
  );
});

test("dropdown panel flips above the trigger near the viewport bottom", async () => {
  await ui.page(
    `<div style="height:100vh"></div>
     <div class="ui-dropdown">
       <button id="dd" class="ui-btn" data-ui-dropdown>Menu</button>
       <div class="ui-dropdown-menu">
         <a class="ui-dropdown-item" href="#">One</a>
         <a class="ui-dropdown-item" href="#">Two</a>
         <a class="ui-dropdown-item" href="#">Three</a>
       </div>
     </div>
     <div style="height:20px"></div>`,
    async (page) => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.click("#dd");

      const placement = await page.evaluate(() => {
        const trigger = document.querySelector("#dd").getBoundingClientRect();
        const menu = document.querySelector(".ui-dropdown-menu").getBoundingClientRect();
        return {
          menuBottom: menu.bottom,
          triggerTop: trigger.top,
          withinViewport: menu.top >= 0 && menu.bottom <= window.innerHeight + 1,
        };
      });

      assert.equal(
        placement.withinViewport,
        true,
        "panel should stay inside the viewport, got " + JSON.stringify(placement)
      );
    }
  );
});

test("UI.confirm resolves true on confirm and false on cancel", async () => {
  await ui.page("<p>page</p>", async (page) => {
    const confirmed = await page.evaluate(async () => {
      const promise = window.UI.confirm({ title: "Revoke reference", variant: "danger" });
      await new Promise((r) => requestAnimationFrame(r));
      document.querySelector("[data-ui-confirm-ok]").click();
      return promise;
    });
    assert.equal(confirmed, true);

    const cancelled = await page.evaluate(async () => {
      const promise = window.UI.confirm({ title: "Revoke reference" });
      await new Promise((r) => requestAnimationFrame(r));
      document.querySelector("[data-ui-confirm-cancel]").click();
      return promise;
    });
    assert.equal(cancelled, false);

    assert.equal(
      await page.count(".ui-modal"),
      0,
      "confirm dialogs should remove themselves from the DOM after resolving"
    );
  });
});

test("toasts stack, auto-dismiss, and announce politely", async () => {
  await ui.page("<p>page</p>", async (page) => {
    await page.evaluate(() => {
      window.UI.toast.show({ title: "Saved", message: "Application saved", duration: 0 });
      window.UI.toast.show({ title: "Submitted", message: "Sent for review", duration: 0 });
    });

    assert.equal(await page.count(".ui-toast"), 2, "toasts should stack");
    assert.equal(
      await page.attr(".ui-toast-container", "aria-live"),
      "polite",
      "toast container must be a live region for screen readers"
    );

    await page.evaluate(() =>
      window.UI.toast.show({ type: "danger", title: "Failed", duration: 0 })
    );
    assert.equal(
      await page.attr(".ui-toast-danger", "role"),
      "alert",
      "danger toasts should interrupt with role=alert"
    );

    await page.evaluate(() => window.UI.toast.show({ title: "Gone", duration: 60 }));
    await page.wait(400);
    assert.equal(await page.count(".ui-toast"), 3, "timed toast should have removed itself");
  });
});
