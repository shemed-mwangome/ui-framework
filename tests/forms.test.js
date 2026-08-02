"use strict";

/**
 * Validation, input masking and combobox.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

const APPLICATION_FORM = `
  <form id="app" data-ui-validate action="/save" method="post">
    <div data-ui-validate-summary></div>

    <div class="ui-field">
      <label class="ui-label" for="company">Company name</label>
      <input class="ui-control" id="company" name="company" required>
    </div>

    <div class="ui-field">
      <label class="ui-label" for="email">Email</label>
      <input class="ui-control" id="email" name="email" type="email" required>
    </div>

    <div class="ui-field">
      <label class="ui-label" for="taxId">Tax ID</label>
      <input class="ui-control" id="taxId" name="taxId" pattern="\\d{3}-\\d{3}-\\d{3}"
             data-ui-message-pattern="Tax ID must look like 123-456-789">
    </div>

    <div class="ui-field">
      <label class="ui-label" for="issued">Issued</label>
      <input class="ui-control" id="issued" name="issued" type="date">
    </div>

    <div class="ui-field">
      <label class="ui-label" for="expires">Expires</label>
      <input class="ui-control" id="expires" name="expires" type="date" data-ui-rule-after="issued">
    </div>

    <button type="submit" class="ui-btn ui-btn-primary" id="submit">Submit</button>
  </form>`;

test("submitting an invalid form is blocked and errors render inline", async () => {
  await ui.page(APPLICATION_FORM, async (page) => {
    let navigated = false;
    await page.evaluate(() => {
      window.__submitted = false;
      document.getElementById("app").addEventListener("submit", () => {
        window.__submitted = true;
      });
    });

    await page.click("#submit");

    assert.equal(
      await page.evaluate(() => window.__submitted),
      false,
      "submit must be blocked while the form is invalid"
    );
    assert.equal(await page.evaluate(() => document.querySelectorAll(".ui-is-invalid").length), 2);
    assert.equal(
      await page.text("#company ~ .ui-feedback-invalid"),
      "This field is required"
    );
  });
});

test("the error summary lists every problem and links to the field", async () => {
  await ui.page(APPLICATION_FORM, async (page) => {
    await page.click("#submit");

    assert.equal(await page.isVisible("[data-ui-validate-summary]"), true);
    assert.match(await page.text(".ui-validate-summary .ui-validate-summary-title"), /2 problem/);

    const links = await page.evaluate(() =>
      [...document.querySelectorAll(".ui-validate-summary-list a")].map((a) => ({
        target: a.getAttribute("data-ui-summary-link"),
        text: a.textContent,
      }))
    );
    assert.deepEqual(
      links.map((l) => l.target),
      ["company", "email"],
      "summary should link each invalid field by id"
    );
    assert.equal(links[0].text, "Company name", "link text should use the field's <label>");

    await page.click('[data-ui-summary-link="email"]');
    assert.equal(
      (await page.activeElement()).id,
      "email",
      "clicking a summary link should focus that field"
    );
  });
});

test("focus moves to the summary and the failure is announced", async () => {
  await ui.page(APPLICATION_FORM, async (page) => {
    await page.click("#submit");
    await page.wait(120);

    assert.equal(
      await page.evaluate(() =>
        document.activeElement.hasAttribute("data-ui-validate-summary")
      ),
      true,
      "focus should land on the summary so a screen reader reads it"
    );
    assert.match(
      await page.text("#ui-live-assertive"),
      /2 problem/,
      "the failure should be announced assertively"
    );
  });
});

test("type and pattern rules produce specific, overridable messages", async () => {
  await ui.page(APPLICATION_FORM, async (page) => {
    await page.type("#company", "Keystone Industries");
    await page.type("#email", "not-an-email");
    await page.type("#taxId", "12345");
    await page.click("#submit");

    assert.equal(await page.text("#email ~ .ui-feedback-invalid"), "Enter a valid email address");
    assert.equal(
      await page.text("#taxId ~ .ui-feedback-invalid"),
      "Tax ID must look like 123-456-789",
      "data-ui-message-pattern should override the default text"
    );
  });
});

test("cross-field date rule compares against the other field", async () => {
  await ui.page(APPLICATION_FORM, async (page) => {
    await page.type("#company", "Summit");
    await page.type("#email", "ops@summit.example");
    await page.evaluate(() => {
      document.getElementById("issued").value = "2026-06-01";
      document.getElementById("expires").value = "2026-01-01";
    });
    await page.click("#submit");

    assert.equal(
      await page.text("#expires ~ .ui-feedback-invalid"),
      "Must be after Issued",
      "message should name the field it was compared with"
    );

    await page.evaluate(() => {
      document.getElementById("expires").value = "2027-06-01";
      document.getElementById("expires").dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(
      await page.evaluate(() =>
        document.getElementById("expires").classList.contains("ui-is-invalid")
      ),
      false,
      "correcting the value should clear the error as you type"
    );
  });
});

test("an invalid date-picker field highlights the trigger, not the hidden input", async () => {
  // Regression: the module mirrored .ui-is-invalid onto a class
  // (".ui-date-trigger") that does not exist anywhere in the codebase -- the
  // real class is ".ui-date-range-trigger", shared by the date-range and
  // single date-picker components. An invalid wrapped date field previously
  // showed no highlight at all, since its real <input> is display:none.
  await ui.page(
    `<form id="f" data-ui-validate>
       <div class="ui-field">
         <label class="ui-label" for="issued">Issued</label>
         <div class="ui-date-picker" data-ui-date-picker>
           <input type="date" id="issued" name="issued">
         </div>
       </div>
       <div class="ui-field">
         <label class="ui-label" for="expires">Expires</label>
         <div class="ui-date-picker" data-ui-date-picker>
           <input type="date" id="expires" name="expires" data-ui-rule-after="issued">
         </div>
       </div>
       <button type="submit" id="go">Go</button>
     </form>`,
    async (page) => {
      await page.evaluate(() => {
        document.getElementById("issued").value = "2026-06-01";
        document.getElementById("expires").value = "2026-01-01";
      });
      await page.click("#go");

      const trigger = await page.evaluate(() => {
        const wrapper = document
          .getElementById("expires")
          .closest(".ui-date-picker");
        const button = wrapper.querySelector(".ui-date-range-trigger");
        return {
          invalidClass: button.classList.contains("ui-is-invalid"),
          borderColor: getComputedStyle(button).borderColor,
        };
      });

      assert.equal(
        trigger.invalidClass,
        true,
        "the visible trigger must carry ui-is-invalid, not just the hidden input"
      );
      assert.equal(trigger.borderColor, "rgb(220, 38, 38)", "the trigger border must turn red");

      // The message must render directly under the *visible* control, not
      // sandwiched between the hidden input and the trigger (which put it
      // visually above the control instead of below it).
      const order = await page.evaluate(() => {
        const field = document.getElementById("expires").closest(".ui-field");
        return [...field.children].map((el) => el.className || el.tagName);
      });
      const pickerIndex = order.findIndex((c) => String(c).includes("ui-date-picker"));
      const feedbackIndex = order.findIndex((c) => String(c).includes("ui-feedback-invalid"));
      assert.ok(
        feedbackIndex > pickerIndex,
        "the feedback message must come after the whole date-picker wrapper: " + JSON.stringify(order)
      );

      assert.match(
        await page.evaluate(() => document.getElementById("expires").closest(".ui-field").querySelector(".ui-feedback-invalid").textContent),
        /Must be after Issued/
      );
    }
  );
});

test("date-range and date-picker fill their container like .ui-control does", async () => {
  // Regression: .ui-date-range was display:inline-block with no explicit
  // width, so it sized to its own content instead of the column it sat in --
  // invisible in the framework's own grid (siblings size children for you),
  // but it silently refused to match .ui-select/.ui-control's width when
  // dropped into a foreign grid column, breaking alignment in a mixed row.
  await ui.page(
    `<div style="width: 400px;">
       <select id="type" class="ui-select"><option>Scheduled</option></select>
       <div class="ui-date-range" data-ui-date-range>
         <input type="date" name="start">
         <input type="date" name="end">
       </div>
       <div class="ui-date-picker" data-ui-date-picker>
         <input type="date" name="single">
       </div>
     </div>`,
    async (page) => {
      const widths = await page.evaluate(() => ({
        select: document.getElementById("type").getBoundingClientRect().width,
        range: document.querySelector(".ui-date-range").getBoundingClientRect().width,
        picker: document.querySelector(".ui-date-picker").getBoundingClientRect().width,
      }));
      assert.equal(widths.range, widths.select, "date range must fill its column exactly like .ui-select");
      assert.equal(widths.picker, widths.select, "date picker must fill its column exactly like .ui-select");
    }
  );
});

test(".ui-date-range-inline opts back out to content width for standalone placement", async () => {
  // The width:100% default is right for a form grid, wrong for a standalone
  // toolbar filter or a compact "as of" date -- .ui-date-range-inline must
  // size to its own content instead of stretching to fill an arbitrarily wide
  // parent (e.g. an unconstrained docs demo container).
  await ui.page(
    `<div style="width: 900px;">
       <div class="ui-date-range ui-date-range-inline" data-ui-date-range data-ui-placeholder="Select date range">
         <input type="date" name="start">
         <input type="date" name="end">
       </div>
     </div>`,
    async (page) => {
      const width = await page.evaluate(() =>
        document.querySelector(".ui-date-range").getBoundingClientRect().width
      );
      assert.ok(width < 300, "an inline trigger showing a placeholder must not stretch toward its 900px parent, got " + width);
    }
  );
});

test("errors clear as the user fixes them, and the form then submits", async () => {
  await ui.page(APPLICATION_FORM, async (page) => {
    await page.click("#submit");
    assert.equal(await page.count(".ui-is-invalid"), 2);

    await page.type("#company", "Meridian Logistics");
    assert.equal(await page.count(".ui-is-invalid"), 1, "fixing one field clears only that one");

    await page.type("#email", "ops@meridian.example");
    assert.equal(await page.count(".ui-is-invalid"), 0);

    const valid = await page.evaluate(
      () => UI.validate.form(document.getElementById("app"), { silent: true }).valid
    );
    assert.equal(valid, true);
    assert.equal(
      await page.isVisible("[data-ui-validate-summary]"),
      false,
      "summary should disappear once everything passes"
    );
  });
});

test("UI.validate.showErrors binds a server response onto the right fields", async () => {
  await ui.page(APPLICATION_FORM, async (page) => {
    await page.type("#company", "Zenith Holdings");
    await page.type("#email", "ops@zenith.example");

    // The shape a JSON API typically returns after a failed POST.
    await page.evaluate(() =>
      UI.validate.showErrors(document.getElementById("app"), {
        taxId: "This Tax ID is already registered to another company",
        company: ["An company with this name already exists"],
      })
    );

    assert.equal(
      await page.text("#taxId ~ .ui-feedback-invalid"),
      "This Tax ID is already registered to another company"
    );
    assert.equal(
      await page.text("#company ~ .ui-feedback-invalid"),
      "An company with this name already exists",
      "array-valued errors should use the first message"
    );
    assert.equal(
      await page.evaluate(() => document.getElementById("taxId").getAttribute("aria-invalid")),
      "true"
    );
    assert.match(await page.text(".ui-validate-summary"), /already registered/);
  });
});

test("showErrors accepts the array-of-objects shape too", async () => {
  await ui.page(APPLICATION_FORM, async (page) => {
    await page.evaluate(() =>
      UI.validate.showErrors("#app", [{ field: "email", message: "Domain not permitted" }])
    );
    assert.equal(await page.text("#email ~ .ui-feedback-invalid"), "Domain not permitted");
  });
});

test("each field is described by its error for screen readers", async () => {
  await ui.page(APPLICATION_FORM, async (page) => {
    await page.click("#submit");

    const wired = await page.evaluate(() => {
      const field = document.getElementById("company");
      const describedBy = field.getAttribute("aria-describedby");
      const target = describedBy && document.getElementById(describedBy);
      return { describedBy: !!describedBy, matches: !!target, text: target && target.textContent };
    });

    assert.equal(wired.describedBy, true, "invalid field should have aria-describedby");
    assert.equal(wired.matches, true, "aria-describedby must point at a real element");
    assert.equal(wired.text, "This field is required");
  });
});

test("custom rules can be registered", async () => {
  await ui.page(
    `<form id="f" data-ui-validate>
       <div class="ui-field">
         <label class="ui-label" for="lic">Reference</label>
         <input class="ui-control" id="lic" name="lic" data-ui-rule-prefix="REF">
       </div>
       <button type="submit" id="go">Go</button>
     </form>`,
    async (page) => {
      await page.evaluate(() => {
        UI.validate.addRule("prefix", function (value, field, prefix) {
          return value.indexOf(prefix) === 0 ? null : { key: "validate.pattern" };
        });
      });

      await page.type("#lic", "XYZ-123");
      await page.click("#go");
      assert.equal(await page.count(".ui-is-invalid"), 1);

      await page.type("#lic", "REF-123");
      assert.equal(await page.count(".ui-is-invalid"), 0);
    }
  );
});

test("radio groups validate once for the whole group", async () => {
  await ui.page(
    `<form id="f" data-ui-validate>
       <fieldset class="ui-field">
         <legend class="ui-label">Account class</legend>
         <label class="ui-radio"><input type="radio" name="cls" value="a" required><span>A</span></label>
         <label class="ui-radio"><input type="radio" name="cls" value="b" required><span>B</span></label>
       </fieldset>
       <button type="submit" id="go">Go</button>
     </form>`,
    async (page) => {
      await page.click("#go");
      const result = await page.evaluate(
        () => UI.validate.form(document.getElementById("f"), { silent: true }).errors.length
      );
      assert.equal(result, 1, "an unanswered radio group is one error, not one per option");

      await page.click('input[value="b"]');
      assert.equal(
        await page.evaluate(
          () => UI.validate.form(document.getElementById("f"), { silent: true }).valid
        ),
        true
      );
    }
  );
});

test("validation runs before the save-next submit handler", async () => {
  await ui.page(
    `<form id="f" data-ui-validate data-ui-save-next data-ui-position="1" data-ui-total="3"
           action="/save" method="post">
       <div class="ui-field">
         <label class="ui-label" for="a">Applicant</label>
         <input class="ui-control" id="a" name="a" required>
       </div>
       <button type="submit" id="go" data-ui-save-next-submit>Save</button>
     </form>`,
    async (page) => {
      await page.recordEvents(["ui:savenext:submit", "ui:validate"]);
      await page.click("#go");

      const events = await page.recordedEvents();
      assert.ok(
        events.some((e) => e.name === "ui:validate" && e.detail.valid === false),
        "validation should have run and failed"
      );
      assert.ok(
        !events.some((e) => e.name === "ui:savenext:submit"),
        "an invalid form must not reach the save-next AJAX submit"
      );
    }
  );
});

test("the stepper shows inline errors instead of blocking silently", async () => {
  // Regression: the wizard used reportValidity(), but data-ui-validate sets
  // novalidate, so "Next" refused to advance while showing nothing at all.
  await ui.page(
    `<form id="f" data-ui-validate data-ui-stepper-form>
       <div data-ui-validate-summary></div>
       <section data-ui-step>
         <div class="ui-field">
           <label class="ui-label" for="a">Company</label>
           <input class="ui-control" id="a" name="a" required>
         </div>
       </section>
       <section data-ui-step>
         <div class="ui-field">
           <label class="ui-label" for="b">Reference</label>
           <input class="ui-control" id="b" name="b" required>
         </div>
       </section>
       <button type="button" data-ui-step-back>Back</button>
       <button type="button" id="next" data-ui-step-next>Next</button>
       <button type="submit" data-ui-save-next-submit>Submit</button>
     </form>`,
    async (page) => {
      await page.click("#next");

      assert.equal(
        await page.evaluate(() => document.querySelectorAll("[data-ui-step]")[0].hidden),
        false,
        "should stay on the invalid step"
      );
      assert.equal(
        await page.evaluate(() => document.getElementById("a").classList.contains("ui-is-invalid")),
        true,
        "the blocking field must be visibly flagged, not silently rejected"
      );
      assert.equal(await page.text("#a ~ .ui-feedback-invalid"), "This field is required");

      // Step 2's required field must not be reported while it is off-screen.
      assert.equal(
        await page.evaluate(() => document.getElementById("b").classList.contains("ui-is-invalid")),
        false,
        "validation should be scoped to the visible step"
      );

      await page.type("#a", "Keystone Industries");
      await page.click("#next");
      assert.equal(
        await page.evaluate(() => document.querySelectorAll("[data-ui-step]")[1].hidden),
        false,
        "a valid step should advance"
      );
    }
  );
});

// --------------------------------------------------------------------------
// Input masks
// --------------------------------------------------------------------------

test("pattern mask inserts literals as you type", async () => {
  await ui.page('<input id="taxId" class="ui-control" data-ui-mask="999-999-999">', async (page) => {
    await page.type("#taxId", "123456789");
    assert.equal(await page.value("#taxId"), "123-456-789");
  });
});

test("pattern mask rejects characters that do not fit the token", async () => {
  await ui.page('<input id="ref" class="ui-control" data-ui-mask="AAA-9999">', async (page) => {
    await page.type("#ref", "REF2026");
    assert.equal(await page.value("#ref"), "REF-2026");

    await page.type("#ref", "12ab34");
    assert.equal(
      await page.value("#ref"),
      "ab",
      "leading digits are skipped, and masking stops at the unfillable third letter slot"
    );
  });
});

test("typing the literal separator does not double it", async () => {
  await ui.page('<input id="taxId" class="ui-control" data-ui-mask="999-999-999">', async (page) => {
    await page.type("#taxId", "123-456");
    assert.equal(await page.value("#taxId"), "123-456");
  });
});

test("mask truncates input beyond the pattern length", async () => {
  await ui.page('<input id="taxId" class="ui-control" data-ui-mask="999-999-999">', async (page) => {
    await page.type("#taxId", "1234567890000");
    assert.equal(await page.value("#taxId"), "123-456-789");
  });
});

test("currency mask groups thousands and prefixes the code", async () => {
  await ui.page(
    '<input id="fee" class="ui-control" data-ui-mask="currency" data-ui-currency="USD">',
    async (page) => {
      await page.type("#fee", "1500000");
      assert.equal(await page.value("#fee"), "USD 1,500,000");
    }
  );
});

test("number mask honours a decimal limit and settles on blur", async () => {
  await ui.page(
    `<input id="amt" class="ui-control" data-ui-mask="number" data-ui-decimals="2">
     <input id="other" class="ui-control">`,
    async (page) => {
      await page.type("#amt", "2500.5");
      assert.equal(await page.value("#amt"), "2,500.5");

      await page.focus("#other");
      await page.wait(50);
      assert.equal(
        await page.value("#amt"),
        "2,500.50",
        "blur should pad to the configured precision"
      );
    }
  );
});

test("data-ui-mask-raw posts the unformatted value", async () => {
  await ui.page(
    `<form id="f">
       <input id="fee" class="ui-control" name="fee" data-ui-mask="currency"
              data-ui-currency="USD" data-ui-mask-raw="true">
     </form>`,
    async (page) => {
      await page.type("#fee", "1500000");

      const posted = await page.evaluate(() => {
        const data = new FormData(document.getElementById("f"));
        return [...data.entries()];
      });

      assert.deepEqual(
        posted,
        [["fee", "1500000"]],
        "the server should receive digits, not the display string"
      );
      assert.equal(await page.value("#fee"), "USD 1,500,000", "the user still sees the mask");
    }
  );
});

test("UI.mask.raw and UI.mask.set round-trip a value", async () => {
  await ui.page('<input id="taxId" class="ui-control" data-ui-mask="999-999-999">', async (page) => {
    const result = await page.evaluate(() => {
      UI.mask.set("#taxId", "987654321");
      return { shown: document.getElementById("taxId").value, raw: UI.mask.raw("#taxId") };
    });
    assert.deepEqual(result, { shown: "987-654-321", raw: "987654321" });
  });
});

test("UI.mask.format renders currency outside an input", async () => {
  await ui.page("", async (page) => {
    const formatted = await page.evaluate(() => ({
      plain: UI.mask.format(1234567.891, { decimals: 2 }),
      currency: UI.mask.format(1500000, { currency: "USD" }),
      after: UI.mask.format(1500000, { currency: "USD", position: "after" }),
    }));

    assert.equal(formatted.plain, "1,234,567.89");
    assert.equal(formatted.currency, "USD 1,500,000");
    assert.equal(formatted.after, "1,500,000 USD");
  });
});

test("a masked field pre-filled from the server is formatted on init", async () => {
  await ui.page(
    '<input id="taxId" class="ui-control" data-ui-mask="999-999-999" value="123456789">',
    async (page) => {
      assert.equal(
        await page.value("#taxId"),
        "123-456-789",
        "server-rendered values should be masked without user interaction"
      );
    }
  );
});

// --------------------------------------------------------------------------
// Combobox
// --------------------------------------------------------------------------

const LOCAL_COMBOBOX = `
  <label class="ui-label" for="op">Company</label>
  <select id="op" name="company" data-ui-combobox>
    <option value="">Choose…</option>
    <option value="1">Keystone Industries Ltd</option>
    <option value="2">Summit Trading</option>
    <option value="3">Meridian Logistics</option>
    <option value="4">Zenith Holdings</option>
  </select>`;

test("local combobox filters options as you type", async () => {
  await ui.page(LOCAL_COMBOBOX, async (page) => {
    await page.click(".ui-combobox-input");
    await page.type(".ui-combobox-input", "it");

    const shown = await page.evaluate(() =>
      [...document.querySelectorAll(".ui-combobox-option-label")].map((el) => el.textContent)
    );
    assert.deepEqual(shown, ["Summit Trading", "Zenith Holdings"]);

    await page.type(".ui-combobox-input", "zen");
    assert.deepEqual(
      await page.evaluate(() =>
        [...document.querySelectorAll(".ui-combobox-option-label")].map((el) => el.textContent)
      ),
      ["Zenith Holdings"]
    );
  });
});

test("choosing an option syncs the backing select so the form posts it", async () => {
  await ui.page("<form id=\"f\">" + LOCAL_COMBOBOX + "</form>", async (page) => {
    await page.click(".ui-combobox-input");
    await page.type(".ui-combobox-input", "Summ");
    await page.click(".ui-combobox-option");

    assert.equal(await page.value("#op"), "2", "the real <select> must carry the value");
    assert.equal(await page.value(".ui-combobox-input"), "Summit Trading");

    const posted = await page.evaluate(() => [
      ...new FormData(document.getElementById("f")).entries(),
    ]);
    assert.deepEqual(posted, [["company", "2"]]);
  });
});

test("keyboard navigation selects with arrows and Enter", async () => {
  await ui.page(LOCAL_COMBOBOX, async (page) => {
    await page.click(".ui-combobox-input");
    // Opening already highlights option 1, so two ArrowDowns land on option 3.
    await page.press("ArrowDown");
    await page.press("ArrowDown");
    await page.press("Enter");

    assert.equal(await page.value("#op"), "3");
    assert.equal(
      await page.evaluate(() => document.querySelector(".ui-combobox-menu").hidden),
      true,
      "committing should close the menu"
    );
  });
});

test("combobox exposes correct ARIA wiring", async () => {
  await ui.page(LOCAL_COMBOBOX, async (page) => {
    assert.equal(await page.attr(".ui-combobox-input", "role"), "combobox");
    assert.equal(await page.attr(".ui-combobox-input", "aria-expanded"), "false");

    await page.click(".ui-combobox-input");
    assert.equal(await page.attr(".ui-combobox-input", "aria-expanded"), "true");

    const wiring = await page.evaluate(() => {
      const input = document.querySelector(".ui-combobox-input");
      const controls = input.getAttribute("aria-controls");
      const active = input.getAttribute("aria-activedescendant");
      return {
        controlsExists: !!document.getElementById(controls),
        activeExists: !!(active && document.getElementById(active)),
        listboxRole: document.querySelector(".ui-combobox-menu").getAttribute("role"),
      };
    });

    assert.deepEqual(wiring, {
      controlsExists: true,
      activeExists: true,
      listboxRole: "listbox",
    });
  });
});

test("uncommitted text reverts on blur so the display cannot lie", async () => {
  await ui.page(LOCAL_COMBOBOX + '<input id="elsewhere" class="ui-control">', async (page) => {
    await page.click(".ui-combobox-input");
    await page.press("ArrowDown");
    await page.press("Enter");
    assert.equal(await page.value("#op"), "2");

    // Type nonsense over the committed selection, then leave. Tab rather than
    // a click: the open menu is positioned over whatever follows the field, so
    // a click aimed at the next input would land on the menu instead.
    await page.type(".ui-combobox-input", "zzz not a real company");
    await page.press("Tab");
    await page.evaluate(() => document.getElementById("elsewhere").focus());
    await page.wait(200);

    assert.equal(
      await page.value(".ui-combobox-input"),
      "",
      "abandoned text should not linger next to a cleared value"
    );
    assert.equal(await page.value("#op"), "", "typing over a selection invalidates it");
  });
});

test("the clear button resets the selection", async () => {
  await ui.page(LOCAL_COMBOBOX, async (page) => {
    await page.click(".ui-combobox-input");
    await page.press("ArrowDown");
    await page.press("Enter");
    assert.equal(await page.isVisible(".ui-combobox-clear"), true);

    await page.click(".ui-combobox-clear");
    assert.equal(await page.value("#op"), "");
    assert.equal(await page.value(".ui-combobox-input"), "");
  });
});

test("clicking an already-focused, already-filled combobox reopens the menu", async () => {
  // Regression: only the "focus" event reopened the menu, so re-clicking a
  // field that already had focus (the common case right after picking a
  // value) silently did nothing.
  await ui.page(LOCAL_COMBOBOX, async (page) => {
    await page.click(".ui-combobox-input");
    await page.press("ArrowDown");
    await page.press("Enter");
    assert.equal(
      await page.evaluate(() => document.querySelector(".ui-combobox-menu").hidden),
      true,
      "committing a value should close the menu"
    );

    await page.click(".ui-combobox-input");
    assert.equal(
      await page.evaluate(() => document.querySelector(".ui-combobox-menu").hidden),
      false,
      "clicking the already-focused field should reopen it"
    );
    // Local mode filters by the input's current text, which after a commit is
    // the selected option's own label -- so reopening narrows to that one
    // match, shown with its checkmark, rather than the full list. That is
    // consistent with how filtering behaves on every keystroke elsewhere.
    assert.equal(await page.count(".ui-combobox-option"), 1);
    assert.equal(
      await page.evaluate(() =>
        document.querySelector(".ui-combobox-option").getAttribute("aria-selected")
      ),
      "true"
    );
  });
});

test("clicking a focused remote combobox re-shows results without a fresh query", async () => {
  await ui.page(
    `<select id="lic" data-ui-combobox data-ui-url="/api/customers" data-ui-min-chars="2"></select>`,
    async (page) => {
      await page.evaluate(() => {
        window.__calls = 0;
        window.fetch = function () {
          window.__calls++;
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ value: "1", label: "Acme Industries Ltd" }]),
          });
        };
      });

      await page.click(".ui-combobox-input");
      await page.type(".ui-combobox-input", "acme");
      await page.waitFor(() => document.querySelectorAll(".ui-combobox-option").length > 0);
      assert.equal(await page.evaluate(() => window.__calls), 1);

      await page.press("Escape");
      await page.click(".ui-combobox-input");

      assert.equal(
        await page.evaluate(() => window.__calls),
        1,
        "reopening on click should not re-query the server"
      );
      assert.equal(await page.count(".ui-combobox-option"), 1);
    }
  );
});

test("remote combobox queries the endpoint and renders results", async () => {
  await ui.page(
    `<select id="lic" name="customer" data-ui-combobox data-ui-url="/api/customers"
             data-ui-min-chars="2"></select>`,
    async (page) => {
      // Stub fetch so the test does not depend on a live endpoint.
      await page.evaluate(() => {
        window.__calls = [];
        window.fetch = function (url) {
          window.__calls.push(url);
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                results: [
                  { value: "L-1", label: "Keystone Industries Ltd", hint: "REG-0007" },
                  { value: "L-2", label: "Kestrel Trading", hint: "REG-0019" },
                ],
              }),
          });
        };
      });

      await page.click(".ui-combobox-input");
      await page.type(".ui-combobox-input", "kes");
      await page.waitFor(() => document.querySelectorAll(".ui-combobox-option").length > 0);

      const calls = await page.evaluate(() => window.__calls);
      assert.deepEqual(calls, ["/api/customers?q=kes"], "term should be sent as ?q=");

      const hints = await page.evaluate(() =>
        [...document.querySelectorAll(".ui-combobox-option-hint")].map((el) => el.textContent)
      );
      assert.deepEqual(hints, ["REG-0007", "REG-0019"], "hints give context for ambiguous names");

      await page.click(".ui-combobox-option");
      assert.equal(
        await page.value("#lic"),
        "L-1",
        "a remote result should be added to the select and selected"
      );
    }
  );
});

test("remote combobox waits for the minimum character count", async () => {
  await ui.page(
    `<select id="lic" data-ui-combobox data-ui-url="/api/customers" data-ui-min-chars="3"></select>`,
    async (page) => {
      await page.evaluate(() => {
        window.__calls = 0;
        window.fetch = function () {
          window.__calls++;
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        };
      });

      await page.click(".ui-combobox-input");
      await page.type(".ui-combobox-input", "ke");
      await page.wait(400);

      assert.equal(await page.evaluate(() => window.__calls), 0, "should not query below min-chars");
      assert.match(await page.text(".ui-combobox-message"), /Type to search/);
    }
  );
});

test("a slow earlier response cannot overwrite a newer one", async () => {
  await ui.page(
    `<select id="lic" data-ui-combobox data-ui-url="/api" data-ui-min-chars="1"></select>`,
    async (page) => {
      // Hold both requests open explicitly rather than racing timers, so the
      // out-of-order resolution is deterministic rather than timing-dependent.
      await page.evaluate(() => {
        window.__pending = [];
        window.fetch = function (url) {
          return new Promise((resolve) => window.__pending.push({ url, resolve }));
        };
      });

      await page.click(".ui-combobox-input");
      await page.type(".ui-combobox-input", "a");
      await page.waitFor(() => window.__pending.length === 1);

      await page.type(".ui-combobox-input", "ab");
      await page.waitFor(() => window.__pending.length === 2);

      // Resolve the *newer* request first, then let the older one land late.
      await page.evaluate(() => {
        const [stale, fresh] = window.__pending;
        fresh.resolve({
          ok: true,
          json: () => Promise.resolve([{ value: "new", label: "FRESH RESULT" }]),
        });
        return new Promise((r) => setTimeout(r, 50)).then(() =>
          stale.resolve({
            ok: true,
            json: () => Promise.resolve([{ value: "old", label: "STALE RESULT" }]),
          })
        );
      });
      await page.wait(150);

      const labels = await page.evaluate(() =>
        [...document.querySelectorAll(".ui-combobox-option-label")].map((el) => el.textContent)
      );
      assert.deepEqual(labels, ["FRESH RESULT"], "out-of-order responses must be discarded");
    }
  );
});

test("a failed request shows an error instead of an empty menu", async () => {
  await ui.page(
    `<select id="lic" data-ui-combobox data-ui-url="/api" data-ui-min-chars="1"></select>`,
    async (page) => {
      await page.evaluate(() => {
        window.fetch = () => Promise.resolve({ ok: false, status: 500 });
      });

      await page.recordEvents(["ui:combobox:error"]);
      await page.click(".ui-combobox-input");
      await page.type(".ui-combobox-input", "kes");
      await page.waitFor(() => !!document.querySelector(".ui-combobox-error"));

      assert.equal(await page.text(".ui-combobox-error"), "Could not load results");
      assert.equal((await page.recordedEvents()).length, 1, "should emit ui:combobox:error");
    }
  );
});

test("Escape closes the combobox without closing a surrounding modal", async () => {
  await ui.page(
    `<div class="ui-modal ui-show" id="m" aria-hidden="false">
       <div class="ui-backdrop"></div>
       <div class="ui-modal-dialog" role="dialog">
         <div class="ui-modal-body">${LOCAL_COMBOBOX}</div>
       </div>
     </div>`,
    async (page) => {
      await page.evaluate(() => UI.modal.open(document.getElementById("m")));
      await page.click(".ui-combobox-input");
      assert.equal(await page.attr(".ui-combobox-input", "aria-expanded"), "true");

      await page.press("Escape");
      assert.equal(await page.attr(".ui-combobox-input", "aria-expanded"), "false");
      assert.equal(await page.isVisible("#m"), true, "the modal must survive the first Escape");

      await page.press("Escape");
      assert.equal(await page.isVisible("#m"), false);
    }
  );
});
