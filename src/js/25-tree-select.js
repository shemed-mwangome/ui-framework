(function (window, document) {
  "use strict";
  var UI = window.UI;

  // A .ui-tree-node is a leaf when it has no .ui-tree-children wrapper as a
  // direct child. Detected at init rather than required in markup, so
  // authors don't have to remember to tag leaves themselves.
  function directChildrenWrap(node) {
    return node.querySelector(":scope > .ui-tree-children");
  }

  function directChildNodes(node) {
    var wrap = directChildrenWrap(node);
    return wrap ? UI.qa(":scope > .ui-tree-node", wrap) : [];
  }

  function rowCheckbox(node) {
    return node.querySelector(":scope > .ui-tree-row > .ui-tree-check");
  }

  function parentTreeNode(node) {
    var wrap = node.parentElement;
    return wrap ? UI.closest(wrap, ".ui-tree-node") : null;
  }

  // Sets every descendant checkbox to match the node's own state -- the
  // "check a region, get every premise under it" half of the pattern.
  // Disabled leaves (e.g. a premise already scheduled and blocked from being
  // scheduled twice) are left alone -- a bulk "select all" must not silently
  // select something the UI itself says can't be selected.
  function cascadeDown(node, checked) {
    var wrap = directChildrenWrap(node);
    if (!wrap) return;
    UI.qa(".ui-tree-check", wrap).forEach(function (cb) {
      if (cb.disabled) return;
      cb.checked = checked;
      cb.indeterminate = false;
    });
  }

  // Derives one node's own checkbox state from its *direct* children only --
  // each child's checkbox already reflects its own subtree, so this doesn't
  // need to look any deeper than one level. A disabled child is excluded from
  // the tally entirely, not counted as "unchecked" -- otherwise one blocked
  // premise would permanently pin its operator at indeterminate even once
  // every selectable premise under it is checked.
  function updateNodeState(node) {
    var cb = rowCheckbox(node);
    if (!cb) return;
    var children = directChildNodes(node);
    if (!children.length) return;

    var allChecked = true;
    var noneChecked = true;
    var eligible = 0;
    children.forEach(function (child) {
      var childCb = rowCheckbox(child);
      if (!childCb || childCb.disabled) return;
      eligible++;
      var state = childCb.indeterminate ? "mixed" : (childCb.checked ? "checked" : "unchecked");
      if (state !== "checked") allChecked = false;
      if (state !== "unchecked") noneChecked = false;
    });

    if (!eligible) {
      cb.checked = false;
      cb.indeterminate = false;
      return;
    }
    cb.checked = allChecked;
    cb.indeterminate = !allChecked && !noneChecked;
  }

  // The "premise flips, operator and region roll up to reflect it" half --
  // walks every ancestor recomputing its tri-state from its own children.
  function rollUp(node) {
    var parent = parentTreeNode(node);
    while (parent) {
      updateNodeState(parent);
      parent = parentTreeNode(parent);
    }
  }

  function toggle(node) {
    if (node.classList.contains("ui-tree-leaf")) return;
    var collapsed = node.classList.toggle("ui-collapsed");
    var btn = node.querySelector(":scope > .ui-tree-row > .ui-tree-toggle");
    if (btn) btn.setAttribute("aria-expanded", String(!collapsed));
  }

  function leafValue(node, cb) {
    var explicit = node.getAttribute("data-ui-tree-value");
    if (explicit != null) return explicit;
    return cb.value && cb.value !== "on" ? cb.value : null;
  }

  function selectedValues(container) {
    return UI.qa(".ui-tree-leaf > .ui-tree-row > .ui-tree-check:checked", container)
      .map(function (cb) { return leafValue(UI.closest(cb, ".ui-tree-node"), cb); })
      .filter(function (value) { return value != null; });
  }

  // A leaf's row is documented (and commonly authored) without a
  // .ui-tree-toggle at all, since there's nothing to expand/collapse. But
  // .ui-tree-row is a flex row, and the toggle is the first item in a branch
  // row -- so a leaf missing that element entirely sits ~1 toggle-width
  // *closer* to the row's edge than a sibling branch at the same nesting
  // level, throwing off the whole level's visual alignment. Insert a hidden,
  // unfocusable placeholder so every row at a level reserves identical space
  // whether or not its author bothered to include a toggle button.
  function ensureToggleSlot(node) {
    var row = node.querySelector(":scope > .ui-tree-row");
    if (!row || row.querySelector(":scope > .ui-tree-toggle")) return;
    var placeholder = document.createElement("button");
    placeholder.type = "button";
    placeholder.className = "ui-tree-toggle";
    placeholder.tabIndex = -1;
    placeholder.setAttribute("aria-hidden", "true");
    row.insertBefore(placeholder, row.firstChild);
  }

  function initNodeStates(node) {
    if (!directChildrenWrap(node)) {
      node.classList.add("ui-tree-leaf");
      ensureToggleSlot(node);
      return;
    }
    directChildNodes(node).forEach(initNodeStates);
    updateNodeState(node);
  }

  function build(container) {
    if (container.dataset.uiTreeReady) return;
    container.dataset.uiTreeReady = "true";

    UI.qa(":scope > .ui-tree-node", container).forEach(initNodeStates);

    container.addEventListener("change", function (event) {
      var cb = event.target;
      if (!cb.classList || !cb.classList.contains("ui-tree-check")) return;
      var node = UI.closest(cb, ".ui-tree-node");
      if (!node) return;
      cascadeDown(node, cb.checked);
      cb.indeterminate = false;
      rollUp(node);
      UI.emit(container, "ui:tree:change", { values: selectedValues(container) });
    });

    // The whole row toggles expand/collapse (a bigger, more forgiving click
    // target than the small arrow alone) -- except the checkbox itself,
    // which must stay a plain, independent click.
    container.addEventListener("click", function (event) {
      if (UI.closest(event.target, ".ui-tree-check")) return;
      if (UI.closest(event.target, ".ui-tree-meta")) return;
      var row = UI.closest(event.target, ".ui-tree-row");
      if (!row) return;
      toggle(UI.closest(row, ".ui-tree-node"));
    });
  }

  function init(root) {
    UI.matchAll("[data-ui-tree]", root).forEach(build);
  }

  UI.treeSelect = {
    selected: function (target) {
      var container = typeof target === "string" ? UI.q(target) : target;
      return container ? selectedValues(container) : [];
    }
  };

  UI.register(init);
})(window, document);
