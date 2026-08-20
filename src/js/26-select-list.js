(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Select list -- the decision layer over .ui-tree (25-tree-select.js).
   *
   * That module owns selection: cascade down, tri-state roll-up. This one
   * owns everything the user needs in order to *decide*: how many of each
   * group are selected, what the numbers behind each option are, per-group
   * select-all/clear, an explanation when a group is legitimately empty, and
   * a search over long lists.
   *
   * The two are deliberately separate. A tree without any of this still
   * works exactly as before; adding data-ui-tree-columns to an existing tree
   * upgrades it without touching its markup structure.
   *
   * Ordering matters: this module listens for ui:tree:change, which
   * 25-tree-select.js emits, so it must be registered after it. build.py's
   * JS_ORDER enforces that.
   */

  var GROUP = ".ui-tree-node";

  function leafNodes(scope) {
    return UI.qa(".ui-tree-leaf", scope);
  }

  function checkboxOf(node) {
    return node.querySelector(":scope > .ui-tree-row > .ui-tree-check");
  }

  function visible(node) {
    return !node.hasAttribute("data-ui-filtered");
  }

  /* ------------------------------------------------------------ counts */

  // "3 / 7" against the leaves under this group. Only leaves are counted:
  // an intermediate node's checkbox is derived state, so including it would
  // double-count the thing it is derived from.
  function countGroup(group) {
    var leaves = leafNodes(group).filter(visible);
    var selected = 0;
    leaves.forEach(function (leaf) {
      var cb = checkboxOf(leaf);
      if (cb && cb.checked && !cb.disabled) selected++;
    });
    return { selected: selected, total: leaves.length };
  }

  // Sums each numeric column across the group's visible leaves, so a zone
  // row can carry the totals of the regions inside it in the same columns.
  // Reads data-ui-value when present and falls back to parsing the text, so
  // a formatted "1,204" still adds up.
  function sumColumns(group, columnCount) {
    var totals = new Array(columnCount).fill(0);
    var any = new Array(columnCount).fill(false);

    leafNodes(group).filter(visible).forEach(function (leaf) {
      var cells = UI.qa(":scope > .ui-tree-row .ui-tree-num", leaf);
      cells.forEach(function (cell, index) {
        if (index >= columnCount) return;
        var raw = cell.getAttribute("data-ui-value");
        var value = raw != null ? Number(raw)
          : Number(String(cell.textContent).replace(/[^0-9.-]/g, ""));
        if (!isFinite(value)) return;
        totals[index] += value;
        any[index] = true;
      });
    });

    return totals.map(function (value, index) { return any[index] ? value : null; });
  }

  function writeCount(group) {
    var chip = group.querySelector(":scope > .ui-tree-row [data-ui-tree-selected]");
    if (!chip) return;
    var counts = countGroup(group);
    chip.textContent = counts.selected + " / " + counts.total;
    if (counts.selected === 0) chip.setAttribute("data-ui-empty", "");
    else chip.removeAttribute("data-ui-empty");
  }

  function writeTotals(container, group) {
    var columnCount = Number(container.dataset.uiTreeColumnCount || 0);
    if (!columnCount) return;
    var cells = UI.qa(":scope > .ui-tree-row .ui-tree-num", group);
    if (!cells.length) return;
    var totals = sumColumns(group, columnCount);
    cells.forEach(function (cell, index) {
      if (!cell.hasAttribute("data-ui-tree-total")) return;
      var value = totals[index];
      cell.textContent = value == null ? "" : String(value);
      markZero(cell);
    });
  }

  function markZero(cell) {
    var text = String(cell.textContent).trim();
    if (text === "0") cell.setAttribute("data-ui-zero", "");
    else cell.removeAttribute("data-ui-zero");
  }

  function refresh(container) {
    UI.qa(GROUP, container).forEach(function (group) {
      if (group.classList.contains("ui-tree-leaf")) return;
      writeCount(group);
      writeTotals(container, group);
      toggleEmptyRow(group);
    });
    UI.qa(".ui-tree-num", container).forEach(markZero);
    updateActionStates(container);
  }

  /* ------------------------------------------------------ empty groups */

  // A group that expands into nothing reads as a bug. Where the author has
  // supplied a .ui-tree-empty explanation, show it exactly when there is
  // nothing else to show.
  function toggleEmptyRow(group) {
    var empty = group.querySelector(":scope > .ui-tree-empty");
    if (!empty) return;
    var hasVisibleLeaf = leafNodes(group).some(visible);
    empty.hidden = hasVisibleLeaf;
  }

  /* --------------------------------------------------- group actions */

  function setGroup(group, checked) {
    leafNodes(group).filter(visible).forEach(function (leaf) {
      var cb = checkboxOf(leaf);
      if (!cb || cb.disabled) return;
      cb.checked = checked;
      cb.indeterminate = false;
      // Let the tree's own delegated handler do the roll-up, so there is one
      // implementation of tri-state rather than two that can disagree.
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  // Select all / Clear are disabled when they would do nothing. A control
  // that is enabled but inert teaches the user that clicking it is pointless
  // rather than that they have already done it.
  function updateActionStates(container) {
    UI.qa(GROUP, container).forEach(function (group) {
      if (group.classList.contains("ui-tree-leaf")) return;
      var counts = countGroup(group);
      var all = group.querySelector(":scope > .ui-tree-row [data-ui-tree-all]");
      var none = group.querySelector(":scope > .ui-tree-row [data-ui-tree-none]");
      if (all) all.disabled = counts.total === 0 || counts.selected === counts.total;
      if (none) none.disabled = counts.selected === 0;
    });
  }

  /* --------------------------------------------------------- search */

  function normalise(value) {
    return String(value == null ? "" : value).toLowerCase();
  }

  function searchText(node) {
    var row = node.querySelector(":scope > .ui-tree-row");
    return row ? normalise(row.textContent) : "";
  }

  function applySearch(container, term) {
    var query = normalise(term).trim();
    var shown = 0;
    var total = 0;

    UI.qa(GROUP, container).forEach(function (node) {
      if (!node.classList.contains("ui-tree-leaf")) return;
      total++;
      var match = !query || searchText(node).indexOf(query) !== -1;
      if (match) { node.removeAttribute("data-ui-filtered"); shown++; }
      else node.setAttribute("data-ui-filtered", "");
    });

    // A group with no surviving leaf is hidden too -- but only while a
    // search is running. With no query, an empty group is a real state that
    // deserves its explanation row, not a disappearance.
    UI.qa(GROUP, container).forEach(function (node) {
      if (node.classList.contains("ui-tree-leaf")) return;
      var hasLeaf = leafNodes(node).some(visible);
      if (query && !hasLeaf) node.setAttribute("data-ui-filtered", "");
      else node.removeAttribute("data-ui-filtered");
      // Searching implies you want to see what matched.
      if (query && hasLeaf) node.classList.remove("ui-collapsed");
    });

    var counter = container.querySelector(".ui-tree-search-count");
    if (counter) counter.textContent = query ? shown + " of " + total : "";

    var none = container.querySelector(".ui-tree-noresults");
    if (none) none.hidden = !(query && shown === 0);

    refresh(container);
    UI.emit(container, "ui:selectlist:search", { term: query, shown: shown, total: total });
  }

  function buildSearch(container) {
    var placeholder = container.dataset.uiTreeSearch;
    if (placeholder == null) return;

    var wrap = document.createElement("div");
    wrap.className = "ui-tree-search";

    var input = document.createElement("input");
    input.type = "search";
    input.setAttribute("autocomplete", "off");
    input.placeholder = placeholder || "Search";
    input.setAttribute("aria-label", placeholder || "Search this list");

    var count = document.createElement("span");
    count.className = "ui-tree-search-count";

    wrap.appendChild(input);
    wrap.appendChild(count);
    container.insertBefore(wrap, container.firstChild);

    var none = document.createElement("div");
    none.className = "ui-tree-noresults";
    none.hidden = true;
    none.textContent = "Nothing matches that search.";
    container.appendChild(none);

    input.addEventListener("input", function () { applySearch(container, input.value); });
  }

  /* -------------------------------------------------- column heading */

  function buildColumnHead(container) {
    var labels = (container.dataset.uiTreeColumns || "")
      .split(",")
      .map(function (label) { return label.trim(); })
      .filter(Boolean);

    container.dataset.uiTreeColumnCount = String(labels.length);
    container.classList.add("ui-tree-columns");
    if (!labels.length) return;

    var head = document.createElement("div");
    head.className = "ui-tree-colhead";
    head.setAttribute("aria-hidden", "true"); // decorative: each cell is labelled in its own row

    var spacer = document.createElement("span");
    spacer.className = "ui-tree-colhead-spacer";
    head.appendChild(spacer);

    labels.forEach(function (label) {
      var cell = document.createElement("span");
      cell.className = "ui-tree-num";
      cell.textContent = label;
      head.appendChild(cell);
    });

    var search = container.querySelector(":scope > .ui-tree-search");
    container.insertBefore(head, search ? search.nextSibling : container.firstChild);
  }

  /* ----------------------------------------------------------- build */

  function build(container) {
    if (container.dataset.uiSelectListReady) return;
    container.dataset.uiSelectListReady = "true";

    buildSearch(container);
    buildColumnHead(container);

    container.addEventListener("click", function (event) {
      var all = UI.closest(event.target, "[data-ui-tree-all]");
      var none = all ? null : UI.closest(event.target, "[data-ui-tree-none]");
      if (!all && !none) return;
      // These live inside .ui-tree-row, which the tree treats as a
      // collapse target. Stop here so "Select all" does not also fold the
      // group shut the moment it fills it.
      event.preventDefault();
      event.stopPropagation();
      var group = UI.closest(all || none, GROUP);
      if (group) setGroup(group, !!all);
    });

    container.addEventListener("ui:tree:change", function () { refresh(container); });

    refresh(container);
  }

  function init(root) {
    UI.matchAll("[data-ui-tree][data-ui-tree-columns], [data-ui-tree][data-ui-tree-search], [data-ui-tree][data-ui-select-list]", root)
      .forEach(build);
  }

  UI.selectList = {
    /** Recompute counts, totals and action states -- call after replacing rows. */
    refresh: function (target) {
      var container = typeof target === "string" ? UI.q(target) : target;
      if (container) refresh(container);
    },
    /** Selected leaf values, delegating to the tree that owns selection. */
    selected: function (target) {
      return UI.treeSelect ? UI.treeSelect.selected(target) : [];
    },
    /** Apply a search term programmatically (e.g. from a URL parameter). */
    search: function (target, term) {
      var container = typeof target === "string" ? UI.q(target) : target;
      if (!container) return;
      var input = container.querySelector(".ui-tree-search input");
      if (input) input.value = term == null ? "" : term;
      applySearch(container, term);
    }
  };

  UI.register(init);
})(window, document);
