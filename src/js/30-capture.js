(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Capture behaviours: the repeating row table, the three-state
   * yes/no/not-applicable answer, and the selectable option card.
   *
   * All three are client-side only. Adding a row must never wait on the
   * network -- an inspector standing in a bar with one bar of signal may
   * add twenty rows before saving once, which is also why the API
   * contract posts child collections in full rather than per row.
   */

  /* ==================================================== repeater */

  /**
   *   <div class="ui-repeater" data-ui-repeater data-ui-min="1"
   *        data-ui-name="unlicensedPremises">
   *     <table class="ui-repeater-table">
   *       <thead><tr><th class="ui-repeater-num">#</th>
   *         <th>Premise</th><th>Devices</th><th></th></tr></thead>
   *       <tbody></tbody>
   *     </table>
   *
   *     <template data-ui-repeater-row>
   *       <tr>
   *         <td class="ui-repeater-num"></td>
   *         <td data-label="Premise">
   *           <input class="ui-control" name="{name}[{i}].premise"></td>
   *         <td data-label="Devices">
   *           <input class="ui-control" type="number" name="{name}[{i}].devices"></td>
   *         <td><button type="button" class="ui-repeater-remove"
   *                     data-ui-repeater-remove aria-label="Remove row">&times;</button></td>
   *       </tr>
   *     </template>
   *
   *     <div class="ui-repeater-empty">No unlicensed premises recorded.</div>
   *     <div class="ui-repeater-foot">
   *       <button type="button" class="ui-btn ui-btn-sm" data-ui-repeater-add>Add row</button>
   *       <span class="ui-repeater-count"></span>
   *     </div>
   *   </div>
   *
   * `{i}` in a name or id is replaced with the row index and renumbered
   * on every add and remove, so the collection posts as
   * `unlicensedPremises[0].premise`  the indexed form Spring binds to a
   * List without any custom binder. Getting this wrong is the usual
   * reason a hand-rolled repeater silently drops every row but the last.
   */

  function rows(repeater) {
    return UI.qa(":scope > .ui-repeater-table > tbody > tr", repeater);
  }

  function renumber(repeater) {
    var name = repeater.getAttribute("data-ui-name") || "rows";
    rows(repeater).forEach(function (row, index) {
      var cell = row.querySelector(".ui-repeater-num");
      if (cell) cell.textContent = index + 1;

      UI.qa("[name], [id], [for]", row).forEach(function (field) {
        ["name", "id", "for"].forEach(function (attribute) {
          var value = field.getAttribute(attribute);
          if (value == null) return;
          // The template value is kept on the element the first time it
          // is seen, so re-indexing is idempotent however many rows are
          // added and removed in between.
          var key = "uiTpl" + attribute;
          if (field.dataset[key] === undefined) {
            if (value.indexOf("{i}") === -1 && value.indexOf("{name}") === -1) return;
            field.dataset[key] = value;
          }
          field.setAttribute(attribute,
            field.dataset[key].replace(/\{i\}/g, index).replace(/\{name\}/g, name));
        });
      });
    });
  }

  function sync(repeater) {
    var count = rows(repeater).length;
    var min = Number(repeater.getAttribute("data-ui-min") || 0);
    var max = Number(repeater.getAttribute("data-ui-max") || 0);

    var empty = repeater.querySelector(":scope > .ui-repeater-empty");
    if (empty) empty.hidden = count > 0;
    var table = repeater.querySelector(":scope > .ui-repeater-table");
    if (table) table.hidden = count === 0;

    // Below the minimum the remove buttons disable rather than vanish: a
    // control that disappears teaches nothing about why it is gone.
    UI.qa("[data-ui-repeater-remove]", repeater).forEach(function (button) {
      button.disabled = count <= min;
    });

    var add = repeater.querySelector("[data-ui-repeater-add]");
    if (add && max) add.disabled = count >= max;

    var counter = repeater.querySelector(".ui-repeater-count");
    if (counter) {
      counter.textContent = count === 0 ? "" :
        count + " row" + (count === 1 ? "" : "s") + (max ? " of " + max : "");
    }

    renumber(repeater);
    UI.emit(repeater, "ui:repeater:change", { count: count });
  }

  function addRow(repeater, focus) {
    var template = repeater.querySelector("[data-ui-repeater-row]");
    var body = repeater.querySelector(":scope > .ui-repeater-table > tbody");
    if (!template || !body) return null;

    var max = Number(repeater.getAttribute("data-ui-max") || 0);
    if (max && rows(repeater).length >= max) return null;

    var row = template.content
      ? template.content.firstElementChild.cloneNode(true)
      : template.firstElementChild.cloneNode(true);

    body.appendChild(row);
    UI.init(row);
    sync(repeater);

    if (focus !== false) {
      var first = row.querySelector("input, select, textarea");
      if (first) first.focus();
    }
    UI.emit(repeater, "ui:repeater:add", { row: row });
    return row;
  }

  function build(repeater) {
    if (repeater.dataset.uiRepeaterReady) return;
    repeater.dataset.uiRepeaterReady = "true";

    var min = Number(repeater.getAttribute("data-ui-min") || 0);
    while (rows(repeater).length < min) addRow(repeater, false);
    sync(repeater);

    repeater.addEventListener("click", function (event) {
      if (UI.closest(event.target, "[data-ui-repeater-add]")) {
        event.preventDefault();
        addRow(repeater);
        return;
      }
      var remove = UI.closest(event.target, "[data-ui-repeater-remove]");
      if (!remove || remove.disabled) return;
      event.preventDefault();
      var row = UI.closest(remove, "tr");
      if (!row) return;
      UI.destroy(row);
      row.remove();
      sync(repeater);
      UI.emit(repeater, "ui:repeater:remove", {});
    });
  }

  /* ================================================== yes/no/n-a */

  /**
   *   <div class="ui-yn" data-ui-yn>
   *     <input type="hidden" name="premiseLicensed" value="">
   *     <button type="button" data-ui-yn-value="YES">Yes</button>
   *     <button type="button" data-ui-yn-value="NO">No</button>
   *     <button type="button" data-ui-yn-value="NA">N/A</button>
   *   </div>
   *
   * The value posts through a hidden input, so the control works inside
   * an ordinary form with no JavaScript on the receiving end.
   */
  function buildYn(group) {
    if (group.dataset.uiYnReady) return;
    group.dataset.uiYnReady = "true";

    var field = group.querySelector('input[type="hidden"]');
    var buttons = UI.qa("[data-ui-yn-value]", group);

    group.setAttribute("role", "group");

    function paint(value) {
      buttons.forEach(function (button) {
        var on = button.getAttribute("data-ui-yn-value") === value;
        button.classList.toggle("ui-on", on);
        button.setAttribute("aria-pressed", String(on));
      });
    }

    paint(field ? field.value : "");

    group.addEventListener("click", function (event) {
      var button = UI.closest(event.target, "[data-ui-yn-value]");
      if (!button || !group.contains(button)) return;
      event.preventDefault();

      var value = button.getAttribute("data-ui-yn-value");
      // Clicking the selected answer clears it. "Not answered" has to be
      // reachable: an officer who taps the wrong button on a phone
      // should not be forced to leave a wrong answer in place.
      if (field && field.value === value) value = "";
      if (field) field.value = value;
      paint(value);
      UI.emit(group, "ui:yn:change", { value: value });
    });
  }

  /* =================================================== option card */

  /**
   *   <div class="ui-option-grid" data-ui-options data-ui-multiple>
   *     <button type="button" class="ui-option" data-ui-value="BAR"> … </button>
   *   </div>
   *
   * Selection is mirrored onto a hidden input named by data-ui-name, so
   * this too survives a plain form post.
   */
  function buildOptions(grid) {
    if (grid.dataset.uiOptionsReady) return;
    grid.dataset.uiOptionsReady = "true";

    var multiple = grid.hasAttribute("data-ui-multiple");
    var field = grid.querySelector('input[type="hidden"]') ||
      (grid.getAttribute("data-ui-name") ? createField(grid) : null);

    UI.qa(".ui-option", grid).forEach(function (option) {
      if (!option.hasAttribute("type")) option.setAttribute("type", "button");
      option.setAttribute(multiple ? "aria-pressed" : "aria-checked",
        String(option.classList.contains("ui-on")));
      if (!multiple) option.setAttribute("role", "radio");
    });
    if (!multiple) grid.setAttribute("role", "radiogroup");

    function commit() {
      if (!field) return;
      field.value = UI.qa(".ui-option.ui-on", grid)
        .map(function (o) { return o.getAttribute("data-ui-value"); }).join(",");
    }

    grid.addEventListener("click", function (event) {
      var option = UI.closest(event.target, ".ui-option");
      if (!option || !grid.contains(option) || option.disabled) return;

      if (multiple) {
        option.classList.toggle("ui-on");
        option.setAttribute("aria-pressed", String(option.classList.contains("ui-on")));
      } else {
        UI.qa(".ui-option", grid).forEach(function (each) {
          each.classList.toggle("ui-on", each === option);
          each.setAttribute("aria-checked", String(each === option));
        });
      }

      commit();
      UI.emit(grid, "ui:options:change", {
        value: option.getAttribute("data-ui-value"),
        selected: UI.qa(".ui-option.ui-on", grid)
          .map(function (o) { return o.getAttribute("data-ui-value"); })
      });
    });

    commit();
  }

  function createField(grid) {
    var field = document.createElement("input");
    field.type = "hidden";
    field.name = grid.getAttribute("data-ui-name");
    grid.appendChild(field);
    return field;
  }

  /* ========================================================= init */

  function init(root) {
    UI.matchAll("[data-ui-repeater]", root).forEach(build);
    UI.matchAll("[data-ui-yn]", root).forEach(buildYn);
    UI.matchAll("[data-ui-options]", root).forEach(buildOptions);
  }

  UI.repeater = {
    /** Append a row and focus its first field. */
    add: function (target) {
      var repeater = typeof target === "string" ? UI.q(target) : target;
      return repeater ? addRow(repeater) : null;
    },
    /** Current row count. */
    count: function (target) {
      var repeater = typeof target === "string" ? UI.q(target) : target;
      return repeater ? rows(repeater).length : 0;
    },
    /** Remove every row, back down to the configured minimum. */
    clear: function (target) {
      var repeater = typeof target === "string" ? UI.q(target) : target;
      if (!repeater) return;
      rows(repeater).forEach(function (row) { UI.destroy(row); row.remove(); });
      var min = Number(repeater.getAttribute("data-ui-min") || 0);
      while (rows(repeater).length < min) addRow(repeater, false);
      sync(repeater);
    }
  };

  UI.yn = {
    /** Read the current answer: "YES", "NO", "NA" or "" for unanswered. */
    value: function (target) {
      var group = typeof target === "string" ? UI.q(target) : target;
      if (!group) return "";
      var field = group.querySelector('input[type="hidden"]');
      return field ? field.value : "";
    }
  };

  UI.register(init);
})(window, document);
