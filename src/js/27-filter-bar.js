(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Filter bar -- one button per filterable dimension, each opening a picker.
   *
   * Three decisions worth stating, because each of them was a defect first:
   *
   *   1. State is per bar, not per page and not global. Narrowing a findings
   *      register to Critical must not silently narrow the inspections
   *      register when the user navigates back. Filters belong to the
   *      question being asked.
   *   2. The picker re-renders when an option is toggled. The counts beside
   *      each option are conditional on the other active filters, so a
   *      client-side toggle would leave stale numbers on screen -- worse
   *      than no numbers, because they look authoritative.
   *   3. Expanding a group inside the picker does *not* re-render. That is
   *      presentation, and round-tripping it makes the control feel broken
   *      on a slow connection.
   *
   * Markup:
   *
   *   <div class="ui-filter-bar" data-ui-filter-bar id="inspectionFilters">
   *     <span class="ui-filter-bar-label">Filter</span>
   *
   *     <button class="ui-filter-btn" data-ui-filter="region"
   *             data-ui-filter-title="Region"
   *             data-ui-filter-target="#regionPicker">Region:
   *       <span class="ui-filter-value">All</span></button>
   *
   *     <button class="ui-filter-clear" hidden>Clear</button>
   *   </div>
   *
   *   <template id="regionPicker"> ...a .ui-tree select list... </template>
   *
   * Or, for server-computed counts, replace data-ui-filter-target with
   * data-ui-filter-src="/inspections/filters/region" -- it is fetched with
   * the current state as query parameters and must return picker HTML.
   */

  var openState = null; // { bar, key, modal, cleanup }

  /* ------------------------------------------------------------ state */

  // Values live on the button so the DOM stays the source of truth -- a
  // server-rendered page can arrive with filters already applied simply by
  // writing the attribute, with no JS handshake.
  function readValues(button) {
    var raw = button.getAttribute("data-ui-filter-values");
    if (!raw) return [];
    try { return JSON.parse(raw); } catch (error) { return raw.split(",").filter(Boolean); }
  }

  function writeValues(button, values) {
    if (values.length) button.setAttribute("data-ui-filter-values", JSON.stringify(values));
    else button.removeAttribute("data-ui-filter-values");
  }

  function labelFor(button, value) {
    var map = button._uiFilterLabels || {};
    return map[value] || value;
  }

  function summarise(button) {
    var values = readValues(button);
    if (!values.length) return button.getAttribute("data-ui-filter-all-text") || "All";
    if (values.length === 1) return labelFor(button, values[0]);
    return values.length + " selected";
  }

  function paint(button) {
    var target = button.querySelector(".ui-filter-value");
    var text = summarise(button);
    if (target) target.textContent = text;
    else button.textContent = (button.getAttribute("data-ui-filter-title") || "") + ": " + text;

    if (readValues(button).length) button.setAttribute("data-ui-active", "");
    else button.removeAttribute("data-ui-active");
  }

  function buttons(bar) {
    return UI.qa("[data-ui-filter]", bar);
  }

  function state(bar) {
    var out = {};
    buttons(bar).forEach(function (button) {
      var values = readValues(button);
      if (values.length) out[button.getAttribute("data-ui-filter")] = values;
    });
    return out;
  }

  function activeCount(bar) {
    return buttons(bar).reduce(function (total, button) {
      return total + readValues(button).length;
    }, 0);
  }

  function paintBar(bar) {
    buttons(bar).forEach(paint);
    var clear = bar.querySelector(".ui-filter-clear");
    if (clear) {
      var count = activeCount(bar);
      clear.hidden = count === 0;
      clear.textContent = "Clear " + count + " filter" + (count === 1 ? "" : "s");
    }
  }

  function announceChange(bar, key) {
    var current = state(bar);
    UI.emit(bar, "ui:filter:change", { key: key, state: current, count: activeCount(bar) });
    if (bar.hasAttribute("data-ui-filter-url")) syncUrl(bar, current);
  }

  /* -------------------------------------------------------------- URL */

  // A filtered list that cannot be linked to is a filtered list a manager
  // cannot send to an officer. Opt in with data-ui-filter-url.
  function syncUrl(bar, current) {
    if (!window.history || !window.history.replaceState) return;
    var url = new URL(window.location.href);
    var prefix = bar.getAttribute("data-ui-filter-url") || "";

    buttons(bar).forEach(function (button) {
      url.searchParams.delete(prefix + button.getAttribute("data-ui-filter"));
    });
    Object.keys(current).forEach(function (key) {
      url.searchParams.set(prefix + key, current[key].join(","));
    });

    window.history.replaceState(window.history.state, "", url.toString());
  }

  function readUrl(bar) {
    var prefix = bar.getAttribute("data-ui-filter-url");
    if (prefix == null) return;
    var params = new URL(window.location.href).searchParams;
    buttons(bar).forEach(function (button) {
      var raw = params.get(prefix + button.getAttribute("data-ui-filter"));
      if (raw != null) writeValues(button, raw.split(",").filter(Boolean));
    });
  }

  /* ----------------------------------------------------------- picker */

  function closePicker(apply) {
    if (!openState) return;
    var current = openState;
    openState = null;

    if (apply) {
      var tree = current.modal.querySelector("[data-ui-tree]");
      var values = tree && UI.treeSelect ? UI.treeSelect.selected(tree) : [];
      writeValues(current.button, values);
      paintBar(current.bar);
      announceChange(current.bar, current.key);
    }

    UI.modal.close(current.modal);
    // The modal is built per open so a picker fetched from the server never
    // shows a previous dimension's options for a frame.
    window.setTimeout(function () {
      if (current.modal.parentNode) current.modal.parentNode.removeChild(current.modal);
    }, 200);
  }

  function buildModal(button) {
    var title = button.getAttribute("data-ui-filter-title") || "Filter";
    var modal = document.createElement("div");
    modal.className = "ui-modal ui-filter-picker";
    modal.setAttribute("aria-hidden", "true");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML =
      '<div class="ui-backdrop"></div>' +
      '<div class="ui-modal-dialog ui-modal-lg">' +
        '<div class="ui-modal-header">' +
          '<h2 class="ui-modal-title">' + UI.escape(title) + "</h2>" +
          '<button type="button" class="ui-modal-close" data-ui-filter-cancel ' +
            'aria-label="Close">&times;</button>' +
        "</div>" +
        '<div class="ui-modal-body"><div class="ui-filter-loading">Loading…</div></div>' +
        '<div class="ui-modal-footer">' +
          '<button type="button" class="ui-btn ui-btn-default" data-ui-filter-reset>Clear</button>' +
          '<button type="button" class="ui-btn ui-btn-primary" data-ui-filter-apply>Apply</button>' +
        "</div>" +
      "</div>";

    // The footer controls belong to this modal, which this module created and
    // will destroy, so the listener belongs on it too. A document-level
    // delegate would work only while `openState` happens to point at the right
    // modal, which is exactly the kind of shared mutable coupling that breaks
    // the moment two pickers exist -- and it is impossible to tear down
    // cleanly when the modal is removed.
    modal.addEventListener("click", function (event) {
      if (UI.closest(event.target, "[data-ui-filter-apply]")) { closePicker(true); return; }
      if (UI.closest(event.target, "[data-ui-filter-cancel]")) { closePicker(false); return; }
      if (UI.closest(event.target, "[data-ui-filter-reset]")) {
        UI.qa(".ui-tree-check", modal).forEach(function (checkbox) {
          checkbox.checked = false;
          checkbox.indeterminate = false;
        });
        var tree = modal.querySelector("[data-ui-tree]");
        if (tree && UI.selectList) UI.selectList.refresh(tree);
        return;
      }
      // Clicking the backdrop is a cancel, and has to drop our reference or
      // the next open would try to close a modal that is already gone.
      if (event.target.classList.contains("ui-backdrop")) closePicker(false);
    });

    document.body.appendChild(modal);
    return modal;
  }

  // Pre-tick whatever is already filtered, so opening a picker shows the
  // current state rather than a blank slate the user has to reconstruct.
  function applyExistingSelection(modal, values) {
    var wanted = {};
    values.forEach(function (value) { wanted[value] = true; });

    UI.qa("[data-ui-tree-value]", modal).forEach(function (node) {
      var checkbox = node.classList && node.classList.contains("ui-tree-check")
        ? node
        : node.querySelector(".ui-tree-check");
      if (!checkbox) return;
      var value = node.getAttribute("data-ui-tree-value");
      if (wanted[value]) checkbox.checked = true;
    });
  }

  function collectLabels(button, modal) {
    var map = {};
    UI.qa("[data-ui-tree-value]", modal).forEach(function (node) {
      var name = node.querySelector(".ui-tree-name") || node.querySelector(".ui-tree-label");
      if (name) map[node.getAttribute("data-ui-tree-value")] = name.textContent.trim();
    });
    button._uiFilterLabels = map;
  }

  function fillBody(modal, html, button) {
    var body = modal.querySelector(".ui-modal-body");
    body.innerHTML = html;
    applyExistingSelection(modal, readValues(button));
    UI.init(body);
    collectLabels(button, modal);
    // Counts and tri-state have to be recomputed after pre-ticking, since
    // the boxes were set directly rather than through a change event.
    var tree = body.querySelector("[data-ui-tree]");
    if (tree) {
      UI.emit(tree, "ui:tree:change", { values: [] });
      if (UI.selectList) UI.selectList.refresh(tree);
    }
  }

  function openPicker(bar, button) {
    closePicker(false);

    var modal = buildModal(button);
    openState = { bar: bar, button: button, key: button.getAttribute("data-ui-filter"), modal: modal };
    UI.modal.open(modal);

    var src = button.getAttribute("data-ui-filter-src");
    if (src) {
      var url = new URL(src, window.location.href);
      var current = state(bar);
      Object.keys(current).forEach(function (key) {
        url.searchParams.set(key, current[key].join(","));
      });
      window.fetch(url.toString(), { headers: { "X-Requested-With": "ui-filter" } })
        .then(function (response) {
          if (!response.ok) throw new Error(String(response.status));
          return response.text();
        })
        .then(function (html) { if (openState && openState.modal === modal) fillBody(modal, html, button); })
        .catch(function () {
          var body = modal.querySelector(".ui-modal-body");
          body.innerHTML = '<div class="ui-filter-loading">That list could not be loaded. ' +
            "Close this and try again.</div>";
        });
      return;
    }

    var targetSelector = button.getAttribute("data-ui-filter-target");
    var source = targetSelector ? UI.q(targetSelector) : null;
    if (!source) {
      modal.querySelector(".ui-modal-body").innerHTML =
        '<div class="ui-filter-loading">No options are defined for this filter.</div>';
      return;
    }
    var html = source.tagName === "TEMPLATE"
      ? source.innerHTML
      : source.outerHTML;
    fillBody(modal, html, button);
  }

  /* ------------------------------------------------------------ build */

  function build(bar) {
    if (bar.dataset.uiFilterBarReady) return;
    bar.dataset.uiFilterBarReady = "true";

    readUrl(bar);
    paintBar(bar);

    bar.addEventListener("click", function (event) {
      var button = UI.closest(event.target, "[data-ui-filter]");
      if (button && bar.contains(button)) { openPicker(bar, button); return; }

      var clear = UI.closest(event.target, ".ui-filter-clear");
      if (clear && bar.contains(clear)) {
        buttons(bar).forEach(function (each) { writeValues(each, []); });
        paintBar(bar);
        announceChange(bar, null);
      }
    });
  }

  // Escape is handled by the modal module, which closes the dialog without
  // telling us. Treat its own "hidden" event as a cancel so our reference
  // does not outlive the modal it points at.
  document.addEventListener("ui:modal:hidden", function (event) {
    if (openState && event.target === openState.modal) openState = null;
  });

  function init(root) {
    UI.matchAll("[data-ui-filter-bar]", root).forEach(build);
  }

  UI.filter = {
    /** Current state as { dimension: [values] }. */
    state: function (target) {
      var bar = typeof target === "string" ? UI.q(target) : target;
      return bar ? state(bar) : {};
    },
    /** Set one dimension programmatically. */
    set: function (target, key, values) {
      var bar = typeof target === "string" ? UI.q(target) : target;
      if (!bar) return;
      var button = bar.querySelector('[data-ui-filter="' + key + '"]');
      if (!button) return;
      writeValues(button, values || []);
      paintBar(bar);
      announceChange(bar, key);
    },
    /** Clear every dimension on a bar. */
    clear: function (target) {
      var bar = typeof target === "string" ? UI.q(target) : target;
      if (!bar) return;
      buttons(bar).forEach(function (button) { writeValues(button, []); });
      paintBar(bar);
      announceChange(bar, null);
    }
  };

  UI.register(init);
})(window, document);
