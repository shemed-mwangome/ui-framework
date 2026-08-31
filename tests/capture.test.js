"use strict";

/**
 * Capture patterns. The repeater's stacked variant carries a rule that is
 * invisible on a desk and expensive on a phone: any input under 16px makes
 * iOS Safari zoom the viewport the moment the field takes focus, and the
 * whole point of the stacked variant is a form filled in standing up. The
 * sizes below are therefore a contract, not a preference.
 *
 * The markup is the docs example verbatim, rows included, because the rows
 * are cloned from a <template> at runtime -- a hand-written <tr> would test
 * a shape the framework never actually produces.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useHarness } = require("./harness");

const ui = useHarness();

const REPEATER = `
<div class="ui-repeater ui-repeater-stack" data-ui-repeater data-ui-name="devices" data-ui-min="1" data-ui-max="5">
  <table class="ui-repeater-table">
    <thead><tr><th class="ui-repeater-num">#</th><th>Serial number</th><th>Manufacturer</th><th>Remarks</th><th></th></tr></thead>
    <tbody></tbody>
  </table>
  <template data-ui-repeater-row>
    <tr>
      <td class="ui-repeater-num"></td>
      <td data-label="Serial number"><input class="ui-control" name="{name}[{i}].serial"></td>
      <td data-label="Manufacturer"><input class="ui-control" name="{name}[{i}].make"></td>
      <td data-label="Remarks"><input class="ui-control" name="{name}[{i}].remarks"></td>
      <td><button type="button" class="ui-repeater-remove" data-ui-repeater-remove aria-label="Remove row">&times;</button></td>
    </tr>
  </template>
  <div class="ui-repeater-empty">No devices recorded.</div>
  <div class="ui-repeater-foot">
    <button type="button" class="ui-btn ui-btn-sm" data-ui-repeater-add>+ Add device</button>
    <span class="ui-repeater-count"></span>
  </div>
</div>`;

/** The same repeater with a select cell, which the framework styles too. */
const REPEATER_SELECT = REPEATER.replace(
  '<td data-label="Manufacturer"><input class="ui-control" name="{name}[{i}].make"></td>',
  '<td data-label="Manufacturer"><select class="ui-select" name="{name}[{i}].make">' +
    "<option>Aristocrat</option></select></td>"
);

/** Not stacked: the desk table, which keeps its own sizing everywhere. */
const REPEATER_FLAT = REPEATER.replace("ui-repeater ui-repeater-stack", "ui-repeater");

const PHONE = 375;
const DESK = 1280;

test("a repeater cell input stays compact on a desk", async () => {
  await ui.page(REPEATER, async (page) => {
    await page.viewport(DESK, 900);
    const styles = await page.styles('[name="devices[0].serial"]', ["font-size", "min-height"]);
    assert.equal(styles["font-size"], "12.4px");
    assert.equal(styles["min-height"], "29.6px"); // 1.85rem
  });
});

test("stacked repeater inputs reach 16px so iOS Safari does not zoom", async () => {
  await ui.page(REPEATER, async (page) => {
    await page.viewport(PHONE, 812, { mobile: true });

    // Every control, not just the first: the rule is a property of the
    // stacked variant, and a row is generated per field.
    const sizes = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".ui-repeater-stack .ui-repeater-table td .ui-control"))
        .map((el) => ({
          font: parseFloat(getComputedStyle(el).fontSize),
          height: parseFloat(getComputedStyle(el).minHeight),
        })));

    assert.equal(sizes.length, 3);
    sizes.forEach((size) => {
      assert.ok(size.font >= 16, "control font-size must be at least 16px, got " + size.font);
      assert.ok(size.height >= 40, "control min-height must be at least 40px, got " + size.height);
    });
  });
});

test("stacked repeater inputs get roomier padding for a thumb", async () => {
  await ui.page(REPEATER, async (page) => {
    await page.viewport(PHONE, 812, { mobile: true });
    const styles = await page.styles('[name="devices[0].serial"]', [
      "padding-top",
      "padding-bottom",
      "padding-left",
    ]);
    assert.equal(styles["padding-top"], "8px"); // .5rem
    assert.equal(styles["padding-bottom"], "8px");
    assert.equal(styles["padding-left"], "9.6px"); // .6rem
  });
});

// The caret is painted by two gradients at calc(100% - 1rem) and
// calc(100% - .7rem), so it occupies the strip from 16px to about 6px off the
// right edge. Anything less than 16px of padding puts text underneath it.
const CARET_ROOM = 16;

test("a repeater select keeps room for its caret on a desk", async () => {
  // The cell rule sets padding with the shorthand, which silently drops the
  // 2.25rem the base select reserves for the arrow.
  await ui.page(REPEATER_SELECT, async (page) => {
    await page.viewport(DESK, 900);
    const styles = await page.styles('select[name="devices[0].make"]', [
      "font-size",
      "padding-right",
    ]);
    assert.equal(styles["font-size"], "12.4px");
    assert.ok(
      parseFloat(styles["padding-right"]) > CARET_ROOM,
      "select must keep the caret's room, got " + styles["padding-right"]
    );
  });
});

test("the text edge clears the caret wherever the caret is drawn", async () => {
  // CARET_ROOM above is today's number. This reads the arrow's actual position
  // out of the computed background instead, so moving it in 06-forms.css
  // without revisiting the repeater's padding fails here rather than in a
  // screenshot someone happens to look at.
  await ui.page(REPEATER_SELECT, async (page) => {
    await page.viewport(DESK, 900);
    const geometry = await page.evaluate(() => {
      const el = document.querySelector('select[name="devices[0].make"]');
      const cs = getComputedStyle(el);
      const width = el.getBoundingClientRect().width;
      const border = parseFloat(cs.borderRightWidth);

      // "calc(100% - 16px) 50%, calc(100% - 11.2px) 50%": the leftmost layer
      // is where the arrow starts. Positions are relative to the padding box.
      const insets = (cs.backgroundPosition.match(/100% - ([\d.]+)px/g) || [])
        .map((part) => parseFloat(part.replace("100% - ", "")));

      return {
        textEdgeFromRight: parseFloat(cs.paddingRight) + border,
        caretEdgeFromRight: Math.max.apply(null, insets) + border,
      };
    });

    assert.ok(
      geometry.textEdgeFromRight >= geometry.caretEdgeFromRight,
      "option text would run under the caret: text stops " +
        geometry.textEdgeFromRight + "px from the edge, caret starts at " +
        geometry.caretEdgeFromRight + "px"
    );
  });
});

test("a stacked select keeps room for its caret at 16px", async () => {
  // The padding shorthand that widens the input would otherwise reclaim the
  // right-hand gap the dropdown arrow is drawn into, and the larger text
  // makes the overlap easy to hit.
  await ui.page(REPEATER_SELECT, async (page) => {
    await page.viewport(PHONE, 812, { mobile: true });
    const styles = await page.styles('select[name="devices[0].make"]', [
      "font-size",
      "padding-right",
    ]);
    assert.equal(styles["font-size"], "16px");
    assert.ok(
      parseFloat(styles["padding-right"]) >= 32,
      "select must keep the caret's room, got " + styles["padding-right"]
    );
  });
});

test("the phone sizing rides on the same breakpoint that stacks the rows", async () => {
  // If these two ever drift apart the result is a card layout with desk-sized
  // inputs, which is the bug this file exists for.
  await ui.page(REPEATER, async (page) => {
    await page.viewport(PHONE, 812, { mobile: true });
    const state = await page.evaluate(() => {
      const cell = document.querySelector('[data-label="Serial number"]');
      return {
        display: getComputedStyle(cell).display,
        label: getComputedStyle(cell, "::before").content,
        font: getComputedStyle(cell.querySelector(".ui-control")).fontSize,
      };
    });
    assert.equal(state.display, "block");
    assert.match(state.label, /Serial number/);
    assert.equal(state.font, "16px");
  });
});

test("a repeater without ui-repeater-stack is untouched on a phone", async () => {
  // The desk table scrolls sideways rather than stacking, and enlarging its
  // inputs would only make it scroll further.
  await ui.page(REPEATER_FLAT, async (page) => {
    await page.viewport(PHONE, 812, { mobile: true });
    const styles = await page.styles('[name="devices[0].serial"]', ["font-size"]);
    assert.equal(styles["font-size"], "12.4px");
  });
});
