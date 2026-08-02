/*!
 * UI Framework v1.8.1
 * Dependency-free JavaScript bundle.
 * License: MIT
 */
(function (window, document) {
  "use strict";

  var UI = window.UI || {};

  UI.version = "1.8.1";
  UI._initializers = UI._initializers || [];

  UI.q = function (selector, root) {
    return (root || document).querySelector(selector);
  };

  UI.qa = function (selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  };

  UI.closest = function (element, selector) {
    return element && element.closest ? element.closest(selector) : null;
  };

  /**
   * Like `UI.qa`, but also matches `root` itself.
   *
   * `querySelectorAll` only ever returns descendants, so a module scanning for
   * its own attribute would silently skip the very element it was handed:
   *
   *   UI.destroy(table);
   *   UI.init(table);   // no-op with UI.qa -- `table` IS the [data-ui-table]
   *
   * That is exactly the teardown-then-rebuild flow `UI.destroy()` invites, so
   * every module's `init(root)` uses this instead. `UI.qa` deliberately keeps
   * its plain descendant semantics: it is also used for ordinary lookups like
   * `UI.qa("tr", tbody)`, and for `UI.focusable()`, where including the root
   * would send a modal's initial focus to the dialog instead of its first
   * field.
   */
  UI.matchAll = function (selector, root) {
    var context = root || document;
    var found = UI.qa(selector, context);
    // Root first, so the set stays in document order.
    if (context.nodeType === 1 && context.matches && context.matches(selector)) {
      found.unshift(context);
    }
    return found;
  };

  UI.emit = function (element, name, detail) {
    if (!element) return;
    element.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      cancelable: true,
      detail: detail || {}
    }));
  };

  UI.escape = function (value) {
    var div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  };

  UI.uid = function (prefix) {
    return (prefix || "ui") + "-" + Math.random().toString(36).slice(2, 9);
  };

  UI.register = function (initializer) {
    if (typeof initializer === "function") {
      UI._initializers.push(initializer);
    }
  };

  UI.init = function (root) {
    var context = root || document;
    UI._initializers.forEach(function (initializer) {
      initializer(context);
    });
  };

  // ---------------------------------------------------------------------
  // Teardown
  //
  // Modules guard against double-initialisation with a `data-ui-*-ready`
  // flag, but nothing used to release the listeners they attach. In a
  // server-rendered app that swaps regions over AJAX, that leaks a listener
  // per swap -- and `floatPanel` in particular registers a *capture-phase*
  // window scroll handler, so an open panel removed from the DOM leaves
  // behind a handler that runs on every scroll for the life of the page.
  //
  // Modules register teardown with `UI.cleanup(element, fn)`; callers
  // release a subtree with `UI.destroy(root)` before replacing it.
  // ---------------------------------------------------------------------

  var CLEANUP_KEY = "__uiCleanup";

  UI.cleanup = function (element, fn) {
    if (!element || typeof fn !== "function") return;
    if (!element[CLEANUP_KEY]) element[CLEANUP_KEY] = [];
    element[CLEANUP_KEY].push(fn);
  };

  /**
   * Runs every registered teardown inside `root` (and on `root` itself), then
   * clears the `data-ui-*-ready` guards so the markup can be re-initialised.
   * Safe to call on a subtree that was never initialised.
   */
  UI.destroy = function (root) {
    var context = root || document;
    var elements = UI.qa("*", context);
    if (context.nodeType === 1) elements.push(context);

    elements.forEach(function (element) {
      var fns = element[CLEANUP_KEY];
      if (fns) {
        fns.forEach(function (fn) {
          try {
            fn();
          } catch (error) {
            if (window.console) window.console.error("UI.destroy cleanup failed", error);
          }
        });
        delete element[CLEANUP_KEY];
      }

      if (!element.dataset) return;
      Object.keys(element.dataset).forEach(function (key) {
        if (/^ui[A-Za-z]*Ready$/.test(key)) delete element.dataset[key];
      });
    });

    UI.emit(context.nodeType === 1 ? context : document.body, "ui:destroyed", {});
  };

  /**
   * Watches `root` for inserted markup and initialises it automatically, so
   * AJAX-loaded fragments do not each need a manual `UI.init()` call. Batched
   * on an animation frame, since a single response usually inserts many nodes.
   * Returns a function that stops observing.
   */
  UI.observe = function (root) {
    var target = root || document.body;
    if (!window.MutationObserver || !target) return function () {};

    var pending = [];
    var scheduled = false;

    function flush() {
      scheduled = false;
      var roots = pending;
      pending = [];
      roots.forEach(function (node) {
        if (node.isConnected) UI.init(node);
      });
    }

    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        Array.prototype.forEach.call(record.addedNodes, function (node) {
          if (node.nodeType !== 1) return;
          pending.push(node);
        });
        Array.prototype.forEach.call(record.removedNodes, function (node) {
          if (node.nodeType === 1) UI.destroy(node);
        });
      });

      if (pending.length && !scheduled) {
        scheduled = true;
        window.requestAnimationFrame(flush);
      }
    });

    observer.observe(target, { childList: true, subtree: true });
    return function () {
      observer.disconnect();
    };
  };

  // ---------------------------------------------------------------------
  // Internationalisation
  //
  // Every user-visible string the JavaScript generates routes through
  // `UI.t()`. Per-element `data-*` attributes still win where a component
  // already supported one, so existing markup keeps working unchanged.
  // ---------------------------------------------------------------------

  var DEFAULT_STRINGS = {
    "table.search": "Search",
    "table.searchLabel": "Search table",
    "table.empty": "No matching records",
    "table.showPrefix": "Show",
    "table.showSuffix": "per page",
    "table.previous": "Previous page",
    "table.next": "Next page",
    "table.status": "{visible} of {total} records",
    "table.selected": "{count} selected",
    "table.selectionToggle": "Show or hide bulk actions",
    "table.selectAll": "Select all rows",
    "table.selectRow": "Select row",
    "table.columns": "Columns",
    "table.export": "Export CSV",
    "table.error": "Could not load records",
    "select.placeholder": "Select options",
    "select.search": "Search options",
    "select.empty": "No matching options",
    "select.all": "Select all",
    "select.clear": "Clear",
    "select.more": "+{count} more",
    "combobox.loading": "Searching…",
    "combobox.empty": "No results",
    "combobox.error": "Could not load results",
    "combobox.hint": "Type to search",
    "confirm.title": "Please confirm",
    "confirm.message": "Are you sure?",
    "confirm.ok": "Confirm",
    "confirm.cancel": "Cancel",
    "dialog.close": "Close",
    "draft.restore": "Restore",
    "draft.discard": "Discard",
    "draft.found": "Unsaved draft from {when}",
    "draft.justNow": "just now",
    "draft.minutes": "{count} minute(s) ago",
    "draft.hours": "{count} hour(s) ago",
    "unsaved.title": "Unsaved changes",
    "unsaved.message": "You have unsaved changes. Leave without saving?",
    "unsaved.leave": "Leave",
    "upload.remove": "Remove {name}",
    "upload.tooLarge": "{name} is larger than {max}",
    "upload.wrongType": "{name} is not an accepted file type",
    "upload.tooMany": "You can upload at most {max} file(s)",
    "upload.uploading": "Uploading {name}…",
    "upload.done": "{name} uploaded",
    "upload.failed": "{name} could not be uploaded",
    "upload.retry": "Retry",
    "validate.required": "This field is required",
    "validate.email": "Enter a valid email address",
    "validate.url": "Enter a valid URL",
    "validate.number": "Enter a number",
    "validate.integer": "Enter a whole number",
    "validate.min": "Must be at least {min}",
    "validate.max": "Must be at most {max}",
    "validate.minLength": "Must be at least {min} character(s)",
    "validate.maxLength": "Must be at most {max} character(s)",
    "validate.pattern": "Enter a value in the required format",
    "validate.match": "Values do not match",
    "validate.after": "Must be after {other}",
    "validate.before": "Must be before {other}",
    "validate.summaryTitle": "Please fix {count} problem(s) before continuing",
    "toast.close": "Close",
    "copy.done": "Copied",
    "copy.failed": "Could not copy"
  };

  UI.i18n = {
    locale: "en",
    strings: { en: DEFAULT_STRINGS },

    /** Merges strings for a locale. Call more than once to extend. */
    add: function (locale, strings) {
      if (!UI.i18n.strings[locale]) UI.i18n.strings[locale] = {};
      Object.keys(strings || {}).forEach(function (key) {
        UI.i18n.strings[locale][key] = strings[key];
      });
      return UI.i18n;
    },

    setLocale: function (locale) {
      UI.i18n.locale = locale;
      UI.emit(document.documentElement, "ui:locale:changed", { locale: locale });
      return UI.i18n;
    }
  };

  /**
   * Looks up `key` for the active locale, falling back to English and then to
   * the key itself. `{placeholders}` in the string are replaced from `vars`.
   */
  UI.t = function (key, vars) {
    var table = UI.i18n.strings[UI.i18n.locale] || {};
    var fallback = UI.i18n.strings.en || {};
    var template = table[key] != null ? table[key] : fallback[key];
    if (template == null) return key;

    return String(template).replace(/\{(\w+)\}/g, function (match, name) {
      return vars && vars[name] != null ? String(vars[name]) : match;
    });
  };

  // ---------------------------------------------------------------------
  // Screen-reader announcements
  // ---------------------------------------------------------------------

  function liveRegion(priority) {
    var id = "ui-live-" + priority;
    var region = document.getElementById(id);
    if (!region) {
      region = document.createElement("div");
      region.id = id;
      region.className = "ui-sr-only";
      region.setAttribute("aria-live", priority);
      region.setAttribute("aria-atomic", "true");
      document.body.appendChild(region);
    }
    return region;
  }

  /**
   * Announces `message` to assistive technology without moving focus. Use for
   * outcomes a sighted user sees but a screen-reader user would not, such as
   * "12 records found" after filtering a table.
   */
  UI.announce = function (message, priority) {
    if (!message) return;
    var region = liveRegion(priority === "assertive" ? "assertive" : "polite");
    // Clearing first guarantees the change is announced even when the new
    // message is identical to the previous one.
    region.textContent = "";
    window.setTimeout(function () {
      region.textContent = message;
    }, 50);
  };

  UI.focusable = function (root) {
    return UI.qa(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      root
    ).filter(function (element) {
      return element.offsetParent !== null;
    });
  };

  // Positions `panel` relative to `trigger` using position:fixed and
  // viewport-relative coordinates, so it escapes clipping by any scrollable
  // ancestor (e.g. .ui-modal-body) and flips above the trigger when there
  // isn't enough room below. `panel` must already be visible (not
  // display:none) when this runs, so its real size can be measured. Returns
  // a cleanup function the caller must invoke when the panel closes.
  UI.floatPanel = function (trigger, panel, options) {
    options = options || {};
    var margin = 8;
    var align = options.align || "start";

    function place() {
      var triggerRect = trigger.getBoundingClientRect();
      var viewportW = document.documentElement.clientWidth;
      var viewportH = document.documentElement.clientHeight;

      // Once the trigger itself has scrolled out of the viewport there is
      // nothing left to anchor the panel to. Clamping the panel position to
      // the viewport in that state used to pin it to the top or bottom edge,
      // floating disconnected from its trigger. Dismiss instead, the same
      // way a click outside would.
      if (options.onDismiss && (triggerRect.bottom <= 0 || triggerRect.top >= viewportH || triggerRect.right <= 0 || triggerRect.left >= viewportW)) {
        options.onDismiss();
        return;
      }

      if (options.matchWidth) panel.style.width = triggerRect.width + "px";
      var panelRect = panel.getBoundingClientRect();

      var spaceBelow = viewportH - triggerRect.bottom;
      var spaceAbove = triggerRect.top;
      var openAbove = spaceBelow < panelRect.height + margin && spaceAbove > spaceBelow;

      var top = openAbove ? (triggerRect.top - panelRect.height - margin) : (triggerRect.bottom + margin);
      top = Math.max(margin, Math.min(top, viewportH - panelRect.height - margin));

      var left = align === "end" ? (triggerRect.right - panelRect.width) : triggerRect.left;
      left = Math.max(margin, Math.min(left, viewportW - panelRect.width - margin));

      panel.style.position = "fixed";
      panel.style.top = top + "px";
      panel.style.left = left + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.classList.toggle("ui-panel-above", openAbove);
    }

    place();

    function onReposition() { place(); }
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);

    var released = false;

    function cleanup() {
      if (released) return;
      released = true;
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
      panel.style.position = "";
      panel.style.top = "";
      panel.style.left = "";
      panel.style.right = "";
      panel.style.bottom = "";
      panel.style.width = "";
      panel.classList.remove("ui-panel-above");
    }

    // The scroll listener is capture-phase and global, so a panel torn out of
    // the DOM while open would otherwise leak a handler that fires on every
    // scroll. Registering here means UI.destroy() releases it even if the
    // owning component never gets to call cleanup itself.
    UI.cleanup(panel, cleanup);

    return cleanup;
  };

  UI.trapFocus = function (container, event) {
    if (event.key !== "Tab") return;
    var focusable = UI.focusable(container);
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    UI.init(document);
  });

  window.UI = UI;
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  function close(alert) {
    if (!alert || alert.classList.contains("ui-leaving")) return;
    UI.emit(alert, "ui:alert:close");
    alert.classList.add("ui-leaving");
    setTimeout(function () {
      alert.remove();
      UI.emit(document, "ui:alert:closed", { alert: alert });
    }, 180);
  }

  function init(root) {
    UI.matchAll(".ui-alert[data-ui-auto-dismiss]", root).forEach(function (alert) {
      if (alert.dataset.uiAlertReady) return;
      alert.dataset.uiAlertReady = "true";
      var duration = Number(alert.getAttribute("data-ui-auto-dismiss") || 4000);
      if (duration > 0) setTimeout(function () { close(alert); }, duration);
    });
  }

  document.addEventListener("click", function (event) {
    var button = UI.closest(event.target, "[data-ui-alert-close]");
    if (button) close(UI.closest(button, ".ui-alert"));
  });

  UI.alert = {
    close: close,
    create: function (options) {
      options = options || {};
      var type = options.type || "info";
      var alert = document.createElement("div");
      alert.className = "ui-alert ui-alert-" + type + (options.className ? " " + options.className : "");
      alert.setAttribute("role", "alert");
      alert.innerHTML =
        '<div class="ui-alert-icon">' + UI.escape(options.icon || "i") + '</div>' +
        '<div><div class="ui-alert-title">' + UI.escape(options.title || "Notification") + '</div>' +
        '<p class="ui-alert-message">' + UI.escape(options.message || "") + '</p></div>' +
        (options.dismissible === false ? "" : '<button class="ui-alert-close" type="button" data-ui-alert-close aria-label="Close">&times;</button>');

      var target = options.target
        ? (typeof options.target === "string" ? document.querySelector(options.target) : options.target)
        : document.body;

      if (target) {
        if (options.prepend) target.prepend(alert);
        else target.appendChild(alert);
      }

      if (Number(options.duration) > 0) {
        setTimeout(function () { close(alert); }, Number(options.duration));
      }

      return alert;
    }
  };

  UI.register(init);
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  function setExpanded(trigger, expanded) {
    var selector = trigger.getAttribute("data-ui-target") || trigger.getAttribute("aria-controls");
    var panel = selector ? document.getElementById(selector.replace(/^#/, "")) || document.querySelector(selector) : null;
    if (!panel) return;

    trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
    panel.classList.toggle("ui-show", expanded);
    panel.hidden = !expanded;
    UI.emit(panel, expanded ? "ui:collapse:shown" : "ui:collapse:hidden");
  }

  document.addEventListener("click", function (event) {
    var trigger = UI.closest(event.target, "[data-ui-collapse]");
    if (trigger) {
      event.preventDefault();
      var expanded = trigger.getAttribute("aria-expanded") === "true";
      setExpanded(trigger, !expanded);
      return;
    }

    var accordionButton = UI.closest(event.target, ".ui-accordion-button");
    if (!accordionButton) return;

    var accordion = UI.closest(accordionButton, ".ui-accordion");
    var expanded = accordionButton.getAttribute("aria-expanded") === "true";

    if (accordion && accordion.getAttribute("data-ui-multiple") !== "true" && !expanded) {
      UI.qa(".ui-accordion-button[aria-expanded='true']", accordion).forEach(function (other) {
        if (other !== accordionButton) setExpanded(other, false);
      });
    }

    setExpanded(accordionButton, !expanded);
  });

  UI.collapse = { toggle: setExpanded };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  function closeAll(except) {
    UI.qa(".ui-dropdown.ui-open").forEach(function (dropdown) {
      if (dropdown !== except) {
        dropdown.classList.remove("ui-open");
        var trigger = UI.q("[data-ui-dropdown]", dropdown);
        if (trigger) trigger.setAttribute("aria-expanded", "false");
        if (dropdown._uiFloatCleanup) {
          dropdown._uiFloatCleanup();
          dropdown._uiFloatCleanup = null;
        }
      }
    });
  }

  function toggle(dropdown, force) {
    if (!dropdown) return;
    var willOpen = typeof force === "boolean" ? force : !dropdown.classList.contains("ui-open");
    closeAll(willOpen ? dropdown : null);
    dropdown.classList.toggle("ui-open", willOpen);
    var trigger = UI.q("[data-ui-dropdown]", dropdown);
    if (trigger) trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");

    if (willOpen) {
      var menu = UI.q(".ui-dropdown-menu", dropdown);
      if (trigger && menu) {
        dropdown._uiFloatCleanup = UI.floatPanel(trigger, menu, {
          align: dropdown.classList.contains("ui-dropdown-end") ? "end" : "start",
          onDismiss: function () { closeAll(); }
        });
      }
    } else if (dropdown._uiFloatCleanup) {
      dropdown._uiFloatCleanup();
      dropdown._uiFloatCleanup = null;
    }
  }

  document.addEventListener("click", function (event) {
    var trigger = UI.closest(event.target, "[data-ui-dropdown]");
    if (trigger) {
      event.preventDefault();
      toggle(UI.closest(trigger, ".ui-dropdown"));
      return;
    }

    if (!UI.closest(event.target, ".ui-dropdown")) closeAll();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (!UI.q(".ui-dropdown.ui-open")) return;
    closeAll();
    event.stopImmediatePropagation();
  });

  UI.dropdown = { toggle: toggle, closeAll: closeAll };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  function activate(tab) {
    var tablist = UI.closest(tab, '[role="tablist"], .ui-tabs');
    if (!tablist) return;

    UI.qa('[role="tab"], .ui-tab', tablist).forEach(function (item) {
      var selected = item === tab;
      item.setAttribute("aria-selected", selected ? "true" : "false");
      item.setAttribute("tabindex", selected ? "0" : "-1");
      item.classList.toggle("ui-active", selected);

      var targetId = (item.getAttribute("data-ui-target") || item.getAttribute("aria-controls") || "").replace(/^#/, "");
      var panel = targetId ? document.getElementById(targetId) : null;
      if (panel) {
        panel.hidden = !selected;
        panel.classList.toggle("ui-active", selected);
      }
    });

    UI.emit(tab, "ui:tab:shown");
  }

  document.addEventListener("click", function (event) {
    var tab = UI.closest(event.target, '[data-ui-tab], [role="tab"].ui-tab');
    if (!tab) return;
    event.preventDefault();
    activate(tab);
  });

  document.addEventListener("keydown", function (event) {
    var tab = UI.closest(event.target, '[role="tab"], .ui-tab');
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    var tablist = UI.closest(tab, '[role="tablist"], .ui-tabs');
    var tabs = UI.qa('[role="tab"], .ui-tab', tablist);
    var index = tabs.indexOf(tab);
    if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") index = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") index = 0;
    if (event.key === "End") index = tabs.length - 1;
    event.preventDefault();
    tabs[index].focus();
    activate(tabs[index]);
  });

  UI.tabs = { activate: activate };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  function build(select) {
    if (!select || select.dataset.uiReady) return;
    select.dataset.uiReady = "true";
    select.classList.add("ui-multiselect-native");

    var wrapper = document.createElement("div");
    wrapper.className = "ui-multiselect";
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ui-multiselect-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<span class="ui-multiselect-summary"></span>';

    var menu = document.createElement("div");
    menu.className = "ui-multiselect-menu";

    if (select.getAttribute("data-search") !== "false") {
      var search = document.createElement("div");
      search.className = "ui-multiselect-search";
      search.innerHTML = '<input type="search" class="ui-control ui-control-sm" placeholder="' +
        UI.escape(select.getAttribute("data-search-placeholder") || UI.t("select.search")) + '">';
      menu.appendChild(search);
    }

    if (select.getAttribute("data-select-all") !== "false") {
      var actions = document.createElement("div");
      actions.className = "ui-multiselect-actions";
      actions.innerHTML =
        '<button type="button" class="ui-multiselect-action" data-ui-ms-action="all">' + UI.escape(UI.t("select.all")) + '</button>' +
        '<button type="button" class="ui-multiselect-action" data-ui-ms-action="clear">' + UI.escape(UI.t("select.clear")) + '</button>';
      menu.appendChild(actions);
    }

    var options = document.createElement("div");
    options.className = "ui-multiselect-options";
    options.setAttribute("role", "listbox");
    options.setAttribute("aria-multiselectable", "true");

    Array.prototype.forEach.call(select.options, function (option, index) {
      var row = document.createElement("label");
      row.className = "ui-multiselect-option";
      row.innerHTML =
        '<input type="checkbox" value="' + UI.escape(option.value) + '" ' +
        (option.selected ? "checked " : "") + (option.disabled ? "disabled " : "") + '>' +
        '<span>' + UI.escape(option.text) + '</span>';
      row.querySelector("input").dataset.optionIndex = index;
      options.appendChild(row);
    });

    var empty = document.createElement("div");
    empty.className = "ui-multiselect-empty";
    empty.textContent = select.getAttribute("data-empty-text") || UI.t("select.empty");

    menu.appendChild(options);
    menu.appendChild(empty);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    function update() {
      var selected = Array.prototype.filter.call(select.options, function (option) { return option.selected; });
      var summary = UI.q(".ui-multiselect-summary", wrapper);
      var display = select.getAttribute("data-display") || "count";
      var placeholder = select.getAttribute("data-placeholder") || UI.t("select.placeholder");
      summary.innerHTML = "";

      UI.qa(".ui-multiselect-option", wrapper).forEach(function (row, index) {
        row.classList.toggle("ui-selected", select.options[index].selected);
        var check = row.querySelector("input");
        check.checked = select.options[index].selected;
      });

      if (!selected.length) {
        summary.textContent = placeholder;
        summary.classList.add("ui-multiselect-placeholder");
      } else if (display === "tags") {
        summary.classList.remove("ui-multiselect-placeholder");
        var maxTags = Number(select.getAttribute("data-max-tags")) || 3;
        var visible = selected.slice(0, maxTags);
        var overflowCount = selected.length - visible.length;

        var tags = document.createElement("span");
        tags.className = "ui-multiselect-tags";
        visible.forEach(function (option) {
          var tag = document.createElement("span");
          tag.className = "ui-multiselect-tag";
          tag.innerHTML =
            '<span class="ui-multiselect-tag-text">' + UI.escape(option.text) + '</span>' +
            '<button type="button" class="ui-multiselect-tag-remove" aria-label="Remove">&times;</button>';
          tag.querySelector("button").addEventListener("click", function (event) {
            event.stopPropagation();
            option.selected = false;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          });
          tags.appendChild(tag);
        });

        if (overflowCount > 0) {
          var overflow = document.createElement("span");
          overflow.className = "ui-multiselect-tag ui-multiselect-tag-overflow";
          overflow.textContent = "+" + overflowCount;
          overflow.title = selected.slice(maxTags).map(function (option) { return option.text; }).join(", ");
          tags.appendChild(overflow);
        }

        summary.appendChild(tags);
      } else {
        summary.classList.remove("ui-multiselect-placeholder");
        summary.textContent = selected.length === 1 ? selected[0].text : selected.length + " selected";
      }
    }

    trigger.addEventListener("click", function () {
      var open = wrapper.classList.toggle("ui-open");
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        wrapper._uiFloatCleanup = UI.floatPanel(trigger, menu, {
          matchWidth: true,
          onDismiss: function () { closeWrapper(wrapper); }
        });
      } else if (wrapper._uiFloatCleanup) {
        wrapper._uiFloatCleanup();
        wrapper._uiFloatCleanup = null;
      }
    });

    options.addEventListener("change", function (event) {
      if (!event.target.matches('input[type="checkbox"]')) return;
      var index = Number(event.target.dataset.optionIndex);
      select.options[index].selected = event.target.checked;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    menu.addEventListener("click", function (event) {
      var action = UI.closest(event.target, "[data-ui-ms-action]");
      if (!action) return;
      var selectAll = action.getAttribute("data-ui-ms-action") === "all";
      Array.prototype.forEach.call(select.options, function (option) {
        if (!option.disabled) option.selected = selectAll;
      });
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    var searchInput = UI.q(".ui-multiselect-search input", wrapper);
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        var query = this.value.toLowerCase();
        var visible = 0;
        UI.qa(".ui-multiselect-option", wrapper).forEach(function (row) {
          var match = row.textContent.toLowerCase().indexOf(query) !== -1;
          row.style.display = match ? "flex" : "none";
          if (match) visible++;
        });
        empty.style.display = visible ? "none" : "block";
      });
    }

    select.addEventListener("change", update);
    update();
  }

  function init(root) {
    UI.matchAll("select[multiple][data-ui-multiselect]", root).forEach(build);
  }

  function closeWrapper(wrapper) {
    wrapper.classList.remove("ui-open");
    var trigger = UI.q(".ui-multiselect-trigger", wrapper);
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (wrapper._uiFloatCleanup) {
      wrapper._uiFloatCleanup();
      wrapper._uiFloatCleanup = null;
    }
  }

  document.addEventListener("click", function (event) {
    if (!UI.closest(event.target, ".ui-multiselect")) {
      UI.qa(".ui-multiselect.ui-open").forEach(closeWrapper);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    var open = UI.qa(".ui-multiselect.ui-open");
    if (!open.length) return;
    open.forEach(closeWrapper);
    event.stopImmediatePropagation();
  });

  // build() is a one-shot init guarded by data-ui-ready, so it silently no-ops on an
  // already-built select. Cascading fields (e.g. an operator list repopulated after
  // its region changes) need to rebuild the visible widget from a fresh option list --
  // refresh() unwraps back to the plain <select> and re-runs build() against it.
  function refresh(select) {
    if (!select) return;
    var wrapper = select.closest(".ui-multiselect");
    if (wrapper) {
      wrapper.parentNode.insertBefore(select, wrapper);
      wrapper.remove();
    }
    delete select.dataset.uiReady;
    select.classList.remove("ui-multiselect-native");
    build(select);
  }

  UI.multiselect = { build: build, refresh: refresh };
  UI.register(init);
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Popovers -- richer than a tooltip, lighter than a modal.
   *
   *   <button data-ui-popover="Any inline text">Why?</button>
   *   <button data-ui-popover-target="#help">Help</button>
   *   <template id="help"><p>Markup shown in the popover.</p></template>
   *
   * Unlike the tooltip, a popover can contain interactive content, so it takes
   * focus, traps nothing, and closes on Escape / outside click / re-click.
   *
   * The Escape handler runs before modal.js's (see JS_ORDER in build.py) and
   * calls stopImmediatePropagation(), so dismissing a popover inside a modal
   * does not also close the modal underneath it.
   */

  var openPopover = null;
  var openTrigger = null;
  var floatCleanup = null;

  function contentFor(trigger) {
    var inline = trigger.getAttribute("data-ui-popover");
    if (inline) return UI.escape(inline);

    var selector = trigger.getAttribute("data-ui-popover-target");
    if (!selector) return "";
    var source = UI.q(selector);
    if (!source) return "";
    // A <template> is inert until cloned, so the markup can live anywhere in
    // the page without rendering twice.
    return source.tagName === "TEMPLATE" ? source.innerHTML : source.innerHTML;
  }

  function close() {
    if (!openPopover) return;
    var trigger = openTrigger;

    if (floatCleanup) {
      floatCleanup();
      floatCleanup = null;
    }
    openPopover.remove();
    openPopover = null;
    openTrigger = null;

    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-controls");
      UI.emit(trigger, "ui:popover:hidden", {});
    }
  }

  function open(trigger) {
    close();

    var body = contentFor(trigger);
    if (!body) return;

    var popover = document.createElement("div");
    popover.className = "ui-popover";
    popover.id = UI.uid("ui-popover");
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", trigger.getAttribute("data-ui-popover-label") ||
      trigger.textContent.trim() || "More information");

    var title = trigger.getAttribute("data-ui-popover-title");
    popover.innerHTML =
      '<div class="ui-popover-arrow" aria-hidden="true"></div>' +
      (title ? '<div class="ui-popover-title">' + UI.escape(title) + "</div>" : "") +
      '<div class="ui-popover-body">' + body + "</div>" +
      '<button type="button" class="ui-popover-close" aria-label="' +
        UI.escape(UI.t("dialog.close")) + '">&times;</button>';

    document.body.appendChild(popover);

    openPopover = popover;
    openTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", popover.id);

    floatCleanup = UI.floatPanel(trigger, popover, {
      align: trigger.getAttribute("data-ui-popover-align") || "start",
      onDismiss: close
    });

    popover.querySelector(".ui-popover-close").addEventListener("click", function () {
      close();
      trigger.focus();
    });

    UI.init(popover);
    UI.emit(trigger, "ui:popover:shown", { popover: popover });

    // Move focus in only when there is something to interact with; otherwise
    // stealing focus from the trigger just makes Tab order confusing.
    var focusable = UI.focusable(popover).filter(function (element) {
      return !element.classList.contains("ui-popover-close");
    });
    if (focusable.length) focusable[0].focus();
  }

  document.addEventListener("click", function (event) {
    var trigger = UI.closest(event.target, "[data-ui-popover], [data-ui-popover-target]");
    if (trigger) {
      event.preventDefault();
      if (openTrigger === trigger) close();
      else open(trigger);
      return;
    }

    if (openPopover && !openPopover.contains(event.target)) close();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !openPopover) return;
    var trigger = openTrigger;
    close();
    if (trigger) trigger.focus();
    event.stopImmediatePropagation();
  });

  UI.popover = {
    open: function (target) {
      var trigger = typeof target === "string" ? UI.q(target) : target;
      if (trigger) open(trigger);
    },
    close: close
  };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  function atMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function today() {
    return atMidnight(new Date());
  }

  function parseISODate(value) {
    if (!value) return null;
    var parts = value.split("-");
    if (parts.length !== 3) return null;
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(date.getTime()) ? null : date;
  }

  function formatISODate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function formatDisplayDate(date) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function addDays(date, amount) {
    var result = atMidnight(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function addMonths(date, amount) {
    var result = atMidnight(date);
    result.setMonth(result.getMonth() + amount);
    return result;
  }

  function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
  function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }
  function sameDay(a, b) { return !!a && !!b && a.getTime() === b.getTime(); }

  function buildCalendarDays(viewDate) {
    var firstOfMonth = startOfMonth(viewDate);
    var gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());
    var days = [];
    for (var i = 0; i < 42; i++) days.push(addDays(gridStart, i));
    return days;
  }

  UI.dateUtils = {
    WEEKDAYS: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    atMidnight: atMidnight,
    today: today,
    parseISODate: parseISODate,
    formatISODate: formatISODate,
    formatDisplayDate: formatDisplayDate,
    addDays: addDays,
    addMonths: addMonths,
    startOfMonth: startOfMonth,
    endOfMonth: endOfMonth,
    sameDay: sameDay,
    buildCalendarDays: buildCalendarDays
  };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;
  var DU = UI.dateUtils;

  function presetRanges() {
    var now = DU.today();
    return {
      today: [now, now],
      yesterday: [DU.addDays(now, -1), DU.addDays(now, -1)],
      last7: [DU.addDays(now, -6), now],
      last30: [DU.addDays(now, -29), now],
      thisMonth: [DU.startOfMonth(now), now],
      lastMonth: [DU.startOfMonth(DU.addMonths(now, -1)), DU.endOfMonth(DU.addMonths(now, -1))],
      thisYear: [new Date(now.getFullYear(), 0, 1), now]
    };
  }

  var PRESET_LABELS = [
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["last7", "Last 7 days"],
    ["last30", "Last 30 days"],
    ["thisMonth", "This month"],
    ["lastMonth", "Last month"],
    ["thisYear", "This year"]
  ];

  var SINGLE_INPUT_SEPARATOR = " - ";

  function State(container) {
    this.container = container;
    var inputs = UI.qa("input", container);
    this.singleInput = inputs.length === 1;

    if (this.singleInput) {
      this.startInput = inputs[0];
      this.endInput = inputs[0];
      // A native <input type="date"> can only ever hold one ISO date, so it
      // silently rejects a combined "start - end" value. Single-input mode
      // needs a plain text field to hold both.
      if (this.startInput.type === "date") this.startInput.type = "text";
      var parts = (this.startInput.value || "").split(SINGLE_INPUT_SEPARATOR);
      this.rangeStart = DU.parseISODate(parts[0]);
      this.rangeEnd = DU.parseISODate(parts[1]);
    } else {
      this.startInput = inputs[0];
      this.endInput = inputs[1];
      this.rangeStart = DU.parseISODate(this.startInput.value);
      this.rangeEnd = DU.parseISODate(this.endInput.value);
    }

    this.hoverDate = null;
    this.viewDate = DU.startOfMonth(this.rangeStart || this.rangeEnd || DU.today());
    this.minDate = DU.parseISODate(container.getAttribute("data-min-date"));
    this.maxDate = DU.parseISODate(container.getAttribute("data-max-date"));
    this.disabledDates = {};
    (container.getAttribute("data-disabled-dates") || "").split(",").forEach(function (value) {
      var trimmed = value.trim();
      if (trimmed) this.disabledDates[trimmed] = true;
    }, this);
  }

  State.prototype.isDisabled = function (date) {
    if (this.minDate && date < this.minDate) return true;
    if (this.maxDate && date > this.maxDate) return true;
    return !!this.disabledDates[DU.formatISODate(date)];
  };

  // The visible calendar spans state.viewDate and the month after it (a
  // two-month view). True when `date` falls outside that span, so callers
  // know they need to shift viewDate before the date's cell exists to focus.
  function isOutsideVisibleSpan(state, date) {
    return date < state.viewDate || date >= DU.addMonths(state.viewDate, 2);
  }

  function renderMonth(state, monthEl, monthDate) {
    var title = UI.q(".ui-date-range-calendar-title", monthEl);
    if (title) title.textContent = monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    var grid = UI.q(".ui-date-range-grid", monthEl);
    grid.innerHTML = "";
    var todayDate = DU.today();

    DU.buildCalendarDays(monthDate).forEach(function (day) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "ui-date-range-day";
      cell.textContent = day.getDate();
      cell.tabIndex = -1;
      cell.setAttribute("data-ui-date", DU.formatISODate(day));

      if (day.getMonth() !== monthDate.getMonth()) cell.classList.add("ui-outside");
      if (DU.sameDay(day, todayDate)) cell.classList.add("ui-today");
      if (DU.sameDay(day, state.rangeStart)) cell.classList.add("ui-range-start");
      if (DU.sameDay(day, state.rangeEnd)) cell.classList.add("ui-range-end");
      if (state.rangeStart && state.rangeEnd && day > state.rangeStart && day < state.rangeEnd) {
        cell.classList.add("ui-in-range");
      }
      if (state.isDisabled(day)) {
        cell.classList.add("ui-disabled");
        cell.setAttribute("aria-disabled", "true");
      }

      grid.appendChild(cell);
    });
  }

  // Clears any stale mouse-hover preview -- render() rebuilds every day cell
  // from scratch, so a hover recorded against the previous set of cells no
  // longer refers to anything on screen. The next real mousemove sets it again.
  function render(state) {
    state.hoverDate = null;
    var container = state.container;
    var trigger = UI.q(".ui-date-range-trigger .ui-date-range-value", container);
    if (trigger) {
      trigger.textContent = state.rangeStart && state.rangeEnd
        ? DU.formatDisplayDate(state.rangeStart) + " – " + DU.formatDisplayDate(state.rangeEnd)
        : container.getAttribute("data-ui-placeholder") || "Select date range";
    }

    UI.qa(".ui-date-range-month", container).forEach(function (monthEl, index) {
      renderMonth(state, monthEl, DU.addMonths(state.viewDate, index));
    });

    var clearButton = UI.q("[data-ui-range-clear]", container);
    if (clearButton) clearButton.hidden = !(state.rangeStart || state.rangeEnd);
  }

  // Highlights the span between the picked start date and the day currently
  // under the pointer, the way flatpickr and similar pickers preview what
  // would be committed if the visitor clicked here -- without touching
  // state.rangeEnd, so a plain mouseout leaves the actual selection alone.
  function updateHoverPreview(state) {
    var cells = UI.qa(".ui-date-range-day", state.container);
    cells.forEach(function (cell) {
      cell.classList.remove("ui-in-range-hover", "ui-range-hover-end");
    });

    if (!state.rangeStart || state.rangeEnd || !state.hoverDate) return;

    var lo = state.rangeStart < state.hoverDate ? state.rangeStart : state.hoverDate;
    var hi = state.rangeStart < state.hoverDate ? state.hoverDate : state.rangeStart;

    cells.forEach(function (cell) {
      var date = DU.parseISODate(cell.getAttribute("data-ui-date"));
      if (date > lo && date < hi) cell.classList.add("ui-in-range-hover");
    });

    if (!DU.sameDay(state.hoverDate, state.rangeStart)) {
      var hoverCell = UI.q('[data-ui-date="' + DU.formatISODate(state.hoverDate) + '"]', state.container);
      if (hoverCell) hoverCell.classList.add("ui-range-hover-end");
    }
  }

  function applyRange(state) {
    if (state.singleInput) {
      state.startInput.value = (state.rangeStart && state.rangeEnd)
        ? DU.formatISODate(state.rangeStart) + SINGLE_INPUT_SEPARATOR + DU.formatISODate(state.rangeEnd)
        : "";
      state.startInput.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      state.startInput.value = state.rangeStart ? DU.formatISODate(state.rangeStart) : "";
      state.endInput.value = state.rangeEnd ? DU.formatISODate(state.rangeEnd) : "";
      state.startInput.dispatchEvent(new Event("change", { bubbles: true }));
      state.endInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    UI.emit(state.container, "ui:daterange:change", { start: state.rangeStart, end: state.rangeEnd });
  }

  function closeAll() {
    UI.qa(".ui-date-range.ui-open").forEach(function (container) {
      container.classList.remove("ui-open");
      var trigger = UI.q(".ui-date-range-trigger", container);
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      if (container._uiFloatCleanup) {
        container._uiFloatCleanup();
        container._uiFloatCleanup = null;
      }
    });
  }

  function focusDate(state, date) {
    var cell = UI.q('[data-ui-date="' + DU.formatISODate(date) + '"]', state.container);
    if (cell) cell.focus();
  }

  function open(container, state) {
    closeAll();
    container.classList.add("ui-open");
    var trigger = UI.q(".ui-date-range-trigger", container);
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    var panel = UI.q(".ui-date-range-panel", container);
    if (trigger && panel) container._uiFloatCleanup = UI.floatPanel(trigger, panel, { onDismiss: closeAll });

    var focusTarget = state.rangeStart || DU.today();
    if (isOutsideVisibleSpan(state, focusTarget)) {
      state.viewDate = DU.startOfMonth(focusTarget);
      render(state);
    }
    focusDate(state, focusTarget);
  }

  function pickDay(state, date) {
    if (state.isDisabled(date)) return;

    if (!state.rangeStart || (state.rangeStart && state.rangeEnd)) {
      state.rangeStart = date;
      state.rangeEnd = null;
    } else if (date < state.rangeStart) {
      state.rangeEnd = state.rangeStart;
      state.rangeStart = date;
    } else {
      state.rangeEnd = date;
    }

    render(state);

    if (state.rangeStart && state.rangeEnd) {
      applyRange(state);
      closeAll();
    } else {
      focusDate(state, date);
    }
  }

  function clearRange(state) {
    state.rangeStart = null;
    state.rangeEnd = null;
    render(state);
    applyRange(state);
  }

  function monthMarkup() {
    return (
      '<div class="ui-date-range-calendar-header">' +
        '<button type="button" class="ui-date-range-nav" data-ui-cal-prev aria-label="Previous month">‹</button>' +
        '<span class="ui-date-range-calendar-title"></span>' +
        '<button type="button" class="ui-date-range-nav" data-ui-cal-next aria-label="Next month">›</button>' +
      "</div>" +
      '<div class="ui-date-range-weekdays">' + DU.WEEKDAYS.map(function (day) { return "<span>" + day + "</span>"; }).join("") + "</div>" +
      '<div class="ui-date-range-grid" role="grid"></div>'
    );
  }

  function build(container) {
    if (container.dataset.uiReady) return;
    container.dataset.uiReady = "true";

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ui-date-range-trigger";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<span class="ui-date-range-value"></span>';

    // The native inputs are hidden, so a failed reportValidity() (e.g. from
    // a stepper form's "Next" gating) has no visible field to anchor its
    // bubble to. Surface that state on the trigger instead.
    UI.qa("input", container).forEach(function (input) {
      input.classList.add("ui-date-range-native");
      input.addEventListener("invalid", function () { trigger.classList.add("ui-is-invalid"); });
      input.addEventListener("change", function () { trigger.classList.remove("ui-is-invalid"); });
    });

    var panel = document.createElement("div");
    panel.className = "ui-date-range-panel";

    var presets = document.createElement("div");
    presets.className = "ui-date-range-presets";
    PRESET_LABELS.forEach(function (entry) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "ui-date-range-preset";
      button.textContent = entry[1];
      button.setAttribute("data-ui-preset", entry[0]);
      presets.appendChild(button);
    });

    var clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "ui-date-range-preset ui-date-range-clear";
    clearButton.textContent = "Clear";
    clearButton.setAttribute("data-ui-range-clear", "");
    presets.appendChild(clearButton);

    var months = document.createElement("div");
    months.className = "ui-date-range-months";

    var monthOne = document.createElement("div");
    monthOne.className = "ui-date-range-month";
    monthOne.innerHTML = monthMarkup();
    UI.q("[data-ui-cal-next]", monthOne).classList.add("ui-date-range-nav-hidden");

    var monthTwo = document.createElement("div");
    monthTwo.className = "ui-date-range-month";
    monthTwo.innerHTML = monthMarkup();
    UI.q("[data-ui-cal-prev]", monthTwo).classList.add("ui-date-range-nav-hidden");

    months.appendChild(monthOne);
    months.appendChild(monthTwo);
    panel.appendChild(presets);
    panel.appendChild(months);
    container.appendChild(trigger);
    container.appendChild(panel);

    var state = new State(container);
    container._uiDateRangeState = state;
    render(state);

    trigger.addEventListener("click", function () {
      if (container.classList.contains("ui-open")) closeAll();
      else open(container, state);
    });

    panel.addEventListener("mouseover", function (event) {
      var cell = UI.closest(event.target, "[data-ui-date]:not(.ui-disabled)");
      if (!cell) return;
      var date = DU.parseISODate(cell.getAttribute("data-ui-date"));
      if (state.hoverDate && DU.sameDay(state.hoverDate, date)) return;
      state.hoverDate = date;
      updateHoverPreview(state);
    });

    panel.addEventListener("mouseleave", function () {
      if (!state.hoverDate) return;
      state.hoverDate = null;
      updateHoverPreview(state);
    });

    panel.addEventListener("click", function (event) {
      var cell = UI.closest(event.target, "[data-ui-date]");
      if (cell) {
        if (!cell.classList.contains("ui-disabled")) pickDay(state, DU.parseISODate(cell.getAttribute("data-ui-date")));
        return;
      }
      if (UI.closest(event.target, "[data-ui-cal-prev]")) {
        state.viewDate = DU.addMonths(state.viewDate, -1);
        render(state);
        return;
      }
      if (UI.closest(event.target, "[data-ui-cal-next]")) {
        state.viewDate = DU.addMonths(state.viewDate, 1);
        render(state);
        return;
      }
      if (UI.closest(event.target, "[data-ui-range-clear]")) {
        clearRange(state);
        return;
      }
      var preset = UI.closest(event.target, "[data-ui-preset]");
      if (preset) {
        var range = presetRanges()[preset.getAttribute("data-ui-preset")];
        if (!range) return;
        state.rangeStart = range[0];
        state.rangeEnd = range[1];
        state.viewDate = DU.startOfMonth(state.rangeEnd);
        render(state);
        applyRange(state);
        closeAll();
      }
    });

    panel.addEventListener("keydown", function (event) {
      var cell = UI.closest(event.target, "[data-ui-date]");
      if (!cell) return;
      var currentDate = DU.parseISODate(cell.getAttribute("data-ui-date"));
      var delta = null;
      if (event.key === "ArrowLeft") delta = -1;
      else if (event.key === "ArrowRight") delta = 1;
      else if (event.key === "ArrowUp") delta = -7;
      else if (event.key === "ArrowDown") delta = 7;
      else if (event.key === "Home") delta = -currentDate.getDay();
      else if (event.key === "End") delta = 6 - currentDate.getDay();

      if (delta !== null) {
        event.preventDefault();
        var nextDate = DU.addDays(currentDate, delta);
        if (isOutsideVisibleSpan(state, nextDate)) {
          state.viewDate = DU.startOfMonth(nextDate);
          render(state);
        }
        focusDate(state, nextDate);
        return;
      }

      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        var monthDelta = event.key === "PageUp" ? -1 : 1;
        state.viewDate = DU.addMonths(state.viewDate, monthDelta);
        render(state);
        focusDate(state, DU.addMonths(currentDate, monthDelta));
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!cell.classList.contains("ui-disabled")) pickDay(state, currentDate);
      }
    });
  }

  function init(root) {
    UI.matchAll("[data-ui-date-range]", root).forEach(build);
  }

  document.addEventListener("click", function (event) {
    // Picking a day rebuilds the calendar grid while this click is still
    // bubbling, which detaches event.target from the document. Use
    // composedPath() instead of closest(event.target, ...) so the check
    // reflects the path at dispatch time, not the (possibly now-detached)
    // target's current ancestry.
    var path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    var insideDateRange = path.some(function (node) {
      return node.nodeType === 1 && node.classList && node.classList.contains("ui-date-range");
    });
    if (!insideDateRange) closeAll();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (!UI.q(".ui-date-range.ui-open")) return;
    closeAll();
    event.stopImmediatePropagation();
  });

  // Resets a range (e.g. a filter form's Reset button) without a matching
  // "click every cell" affordance in the UI itself, so it needs a public hook.
  function clear(container) {
    var target = typeof container === "string" ? UI.q(container) : container;
    if (target && target._uiDateRangeState) clearRange(target._uiDateRangeState);
  }

  UI.dateRange = { close: closeAll, clear: clear };
  UI.register(init);
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;
  var DU = UI.dateUtils;

  var PRESET_LABELS = [
    ["yesterday", "Yesterday"],
    ["today", "Today"],
    ["tomorrow", "Tomorrow"]
  ];

  function presetDates() {
    var now = DU.today();
    return {
      yesterday: DU.addDays(now, -1),
      today: now,
      tomorrow: DU.addDays(now, 1)
    };
  }

  function State(container) {
    this.container = container;
    this.input = UI.q("input", container);
    this.value = DU.parseISODate(this.input.value);
    this.viewDate = DU.startOfMonth(this.value || DU.today());
    this.minDate = DU.parseISODate(container.getAttribute("data-min-date"));
    this.maxDate = DU.parseISODate(container.getAttribute("data-max-date"));
    this.disabledDates = {};
    (container.getAttribute("data-disabled-dates") || "").split(",").forEach(function (entry) {
      var trimmed = entry.trim();
      if (trimmed) this.disabledDates[trimmed] = true;
    }, this);
  }

  State.prototype.isDisabled = function (date) {
    if (this.minDate && date < this.minDate) return true;
    if (this.maxDate && date > this.maxDate) return true;
    return !!this.disabledDates[DU.formatISODate(date)];
  };

  function render(state) {
    var container = state.container;
    var trigger = UI.q(".ui-date-range-trigger .ui-date-range-value", container);
    if (trigger) {
      trigger.textContent = state.value
        ? DU.formatDisplayDate(state.value)
        : container.getAttribute("data-ui-placeholder") || "Select date";
    }

    var title = UI.q(".ui-date-range-calendar-title", container);
    if (title) title.textContent = state.viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    var grid = UI.q(".ui-date-range-grid", container);
    grid.innerHTML = "";
    var todayDate = DU.today();

    DU.buildCalendarDays(state.viewDate).forEach(function (day) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "ui-date-range-day";
      cell.textContent = day.getDate();
      cell.tabIndex = -1;
      cell.setAttribute("data-ui-date", DU.formatISODate(day));

      if (day.getMonth() !== state.viewDate.getMonth()) cell.classList.add("ui-outside");
      if (DU.sameDay(day, todayDate)) cell.classList.add("ui-today");
      if (DU.sameDay(day, state.value)) cell.classList.add("ui-range-start");
      if (state.isDisabled(day)) {
        cell.classList.add("ui-disabled");
        cell.setAttribute("aria-disabled", "true");
      }

      grid.appendChild(cell);
    });

    var clearButton = UI.q("[data-ui-range-clear]", container);
    if (clearButton) clearButton.hidden = !state.value;
  }

  function applyValue(state) {
    state.input.value = state.value ? DU.formatISODate(state.value) : "";
    state.input.dispatchEvent(new Event("change", { bubbles: true }));
    UI.emit(state.container, "ui:datepicker:change", { value: state.value });
  }

  function closeAll() {
    UI.qa(".ui-date-picker.ui-open").forEach(function (container) {
      container.classList.remove("ui-open");
      var trigger = UI.q(".ui-date-range-trigger", container);
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      if (container._uiFloatCleanup) {
        container._uiFloatCleanup();
        container._uiFloatCleanup = null;
      }
    });
  }

  function focusDate(state, date) {
    var cell = UI.q('[data-ui-date="' + DU.formatISODate(date) + '"]', state.container);
    if (cell) cell.focus();
  }

  function open(container, state) {
    closeAll();
    container.classList.add("ui-open");
    var trigger = UI.q(".ui-date-range-trigger", container);
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    var panel = UI.q(".ui-date-range-panel", container);
    if (trigger && panel) container._uiFloatCleanup = UI.floatPanel(trigger, panel, { onDismiss: closeAll });

    var focusTarget = state.value || DU.today();
    if (DU.startOfMonth(focusTarget).getTime() !== state.viewDate.getTime()) {
      state.viewDate = DU.startOfMonth(focusTarget);
      render(state);
    }
    focusDate(state, focusTarget);
  }

  function pickDay(state, date) {
    if (state.isDisabled(date)) return;
    state.value = date;
    render(state);
    applyValue(state);
    closeAll();
  }

  function clearValue(state) {
    state.value = null;
    render(state);
    applyValue(state);
  }

  function build(container) {
    if (container.dataset.uiReady) return;
    container.dataset.uiReady = "true";
    container.classList.add("ui-date-range", "ui-date-picker-shell");

    var input = UI.q("input", container);
    input.classList.add("ui-date-range-native");

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ui-date-range-trigger";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<span class="ui-date-range-value"></span>';

    // The native input is hidden, so a failed reportValidity() has no
    // visible field to anchor its bubble to. Surface it on the trigger.
    input.addEventListener("invalid", function () { trigger.classList.add("ui-is-invalid"); });
    input.addEventListener("change", function () { trigger.classList.remove("ui-is-invalid"); });

    var panel = document.createElement("div");
    panel.className = "ui-date-range-panel";

    var presets = document.createElement("div");
    presets.className = "ui-date-range-presets";
    PRESET_LABELS.forEach(function (entry) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "ui-date-range-preset";
      button.textContent = entry[1];
      button.setAttribute("data-ui-preset", entry[0]);
      presets.appendChild(button);
    });

    var clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "ui-date-range-preset ui-date-range-clear";
    clearButton.textContent = "Clear";
    clearButton.setAttribute("data-ui-range-clear", "");
    presets.appendChild(clearButton);

    var calendar = document.createElement("div");
    calendar.className = "ui-date-range-month";
    calendar.innerHTML =
      '<div class="ui-date-range-calendar-header">' +
        '<button type="button" class="ui-date-range-nav" data-ui-cal-prev aria-label="Previous month">‹</button>' +
        '<span class="ui-date-range-calendar-title"></span>' +
        '<button type="button" class="ui-date-range-nav" data-ui-cal-next aria-label="Next month">›</button>' +
      "</div>" +
      '<div class="ui-date-range-weekdays">' + DU.WEEKDAYS.map(function (day) { return "<span>" + day + "</span>"; }).join("") + "</div>" +
      '<div class="ui-date-range-grid" role="grid"></div>';

    panel.appendChild(presets);
    panel.appendChild(calendar);
    container.appendChild(trigger);
    container.appendChild(panel);

    var state = new State(container);
    container._uiDatePickerState = state;
    render(state);

    trigger.addEventListener("click", function () {
      if (container.classList.contains("ui-open")) closeAll();
      else open(container, state);
    });

    panel.addEventListener("click", function (event) {
      var cell = UI.closest(event.target, "[data-ui-date]");
      if (cell) {
        if (!cell.classList.contains("ui-disabled")) pickDay(state, DU.parseISODate(cell.getAttribute("data-ui-date")));
        return;
      }
      if (UI.closest(event.target, "[data-ui-cal-prev]")) {
        state.viewDate = DU.addMonths(state.viewDate, -1);
        render(state);
        return;
      }
      if (UI.closest(event.target, "[data-ui-cal-next]")) {
        state.viewDate = DU.addMonths(state.viewDate, 1);
        render(state);
        return;
      }
      if (UI.closest(event.target, "[data-ui-range-clear]")) {
        clearValue(state);
        return;
      }
      var preset = UI.closest(event.target, "[data-ui-preset]");
      if (preset) {
        var date = presetDates()[preset.getAttribute("data-ui-preset")];
        if (!date || state.isDisabled(date)) return;
        state.viewDate = DU.startOfMonth(date);
        pickDay(state, date);
      }
    });

    panel.addEventListener("keydown", function (event) {
      var cell = UI.closest(event.target, "[data-ui-date]");
      if (!cell) return;
      var currentDate = DU.parseISODate(cell.getAttribute("data-ui-date"));
      var delta = null;
      if (event.key === "ArrowLeft") delta = -1;
      else if (event.key === "ArrowRight") delta = 1;
      else if (event.key === "ArrowUp") delta = -7;
      else if (event.key === "ArrowDown") delta = 7;
      else if (event.key === "Home") delta = -currentDate.getDay();
      else if (event.key === "End") delta = 6 - currentDate.getDay();

      if (delta !== null) {
        event.preventDefault();
        var nextDate = DU.addDays(currentDate, delta);
        if (DU.startOfMonth(nextDate).getTime() !== state.viewDate.getTime()) {
          state.viewDate = DU.startOfMonth(nextDate);
          render(state);
        }
        focusDate(state, nextDate);
        return;
      }

      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        var monthDelta = event.key === "PageUp" ? -1 : 1;
        state.viewDate = DU.addMonths(state.viewDate, monthDelta);
        render(state);
        focusDate(state, DU.addMonths(currentDate, monthDelta));
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!cell.classList.contains("ui-disabled")) pickDay(state, currentDate);
      }
    });
  }

  function init(root) {
    UI.matchAll("[data-ui-date-picker]", root).forEach(build);
  }

  document.addEventListener("click", function (event) {
    var path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    var insideDatePicker = path.some(function (node) {
      return node.nodeType === 1 && node.classList && node.classList.contains("ui-date-picker-shell");
    });
    if (!insideDatePicker) closeAll();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (!UI.q(".ui-date-picker-shell.ui-open")) return;
    closeAll();
    event.stopImmediatePropagation();
  });

  // Resets a value (e.g. a filter form's Reset button) without a matching
  // "click the day again" affordance in the UI itself, so it needs a public hook.
  function clear(container) {
    var target = typeof container === "string" ? UI.q(container) : container;
    if (target && target._uiDatePickerState) clearValue(target._uiDatePickerState);
  }

  UI.datePicker = { close: closeAll, clear: clear };
  UI.register(init);
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;
  var activeModal = null;
  var previousFocus = null;

  function open(modal) {
    if (!modal) return;
    previousFocus = document.activeElement;
    activeModal = modal;
    modal.classList.add("ui-show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("ui-overlay-open");
    UI.emit(modal, "ui:modal:shown");
    var focusable = UI.focusable(modal);
    (UI.q("[autofocus]", modal) || focusable[0] || modal).focus();
  }

  function close(modal) {
    if (!modal) return;
    modal.classList.remove("ui-show");
    modal.setAttribute("aria-hidden", "true");
    activeModal = null;
    if (!UI.q(".ui-modal.ui-show, .ui-offcanvas-root.ui-show")) {
      document.body.classList.remove("ui-overlay-open");
    }
    if (previousFocus && previousFocus.focus) previousFocus.focus();
    UI.emit(modal, "ui:modal:hidden");
  }

  document.addEventListener("click", function (event) {
    var opener = UI.closest(event.target, "[data-ui-modal-open]");
    if (opener) {
      event.preventDefault();
      open(document.querySelector(opener.getAttribute("data-ui-modal-open")));
      return;
    }

    var closer = UI.closest(event.target, "[data-ui-modal-close]");
    if (closer) {
      close(UI.closest(closer, ".ui-modal"));
      return;
    }

    if (event.target.classList.contains("ui-backdrop") && UI.closest(event.target, ".ui-modal")) {
      var modal = UI.closest(event.target, ".ui-modal");
      if (modal.getAttribute("data-ui-static") !== "true") close(modal);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (!activeModal) return;
    if (event.key === "Escape" && activeModal.getAttribute("data-ui-keyboard") !== "false") close(activeModal);
    UI.trapFocus(activeModal, event);
  });

  UI.modal = { open: open, close: close };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;
  var active = null;
  var previousFocus = null;

  function open(root) {
    if (!root) return;
    previousFocus = document.activeElement;
    active = root;
    root.classList.add("ui-show");
    root.setAttribute("aria-hidden", "false");
    document.body.classList.add("ui-overlay-open");
    var focusable = UI.focusable(root);
    (focusable[0] || root).focus();
    UI.emit(root, "ui:offcanvas:shown");
  }

  function close(root) {
    if (!root) return;
    root.classList.remove("ui-show");
    root.setAttribute("aria-hidden", "true");
    active = null;
    if (!UI.q(".ui-modal.ui-show, .ui-offcanvas-root.ui-show")) {
      document.body.classList.remove("ui-overlay-open");
    }
    if (previousFocus && previousFocus.focus) previousFocus.focus();
    UI.emit(root, "ui:offcanvas:hidden");
  }

  document.addEventListener("click", function (event) {
    var opener = UI.closest(event.target, "[data-ui-offcanvas-open]");
    if (opener) {
      event.preventDefault();
      open(document.querySelector(opener.getAttribute("data-ui-offcanvas-open")));
      return;
    }
    var closer = UI.closest(event.target, "[data-ui-offcanvas-close]");
    if (closer) {
      close(UI.closest(closer, ".ui-offcanvas-root"));
      return;
    }
    if (event.target.classList.contains("ui-backdrop") && UI.closest(event.target, ".ui-offcanvas-root")) {
      close(UI.closest(event.target, ".ui-offcanvas-root"));
    }
  });

  document.addEventListener("keydown", function (event) {
    if (!active) return;
    if (event.key === "Escape") close(active);
    UI.trapFocus(active, event);
  });

  UI.offcanvas = { open: open, close: close };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  function getContainer(position) {
    position = position || "top-end";
    var className = "ui-toast-" + position;
    var container = UI.q(".ui-toast-container." + className);
    if (!container) {
      container = document.createElement("div");
      container.className = "ui-toast-container " + className;
      container.setAttribute("aria-live", "polite");
      container.setAttribute("aria-atomic", "true");
      document.body.appendChild(container);
    }
    return container;
  }

  function remove(toast) {
    if (!toast || toast.classList.contains("ui-leaving")) return;
    toast.classList.add("ui-leaving");
    setTimeout(function () { toast.remove(); }, 180);
  }

  function show(options) {
    options = options || {};
    var type = options.type || "info";
    var duration = options.duration == null ? 4000 : Number(options.duration);
    var toast = document.createElement("div");
    toast.className = "ui-toast ui-toast-" + type;
    toast.setAttribute("role", type === "danger" ? "alert" : "status");
    toast.innerHTML =
      '<div class="ui-toast-icon">' + UI.escape(options.icon || "●") + '</div>' +
      '<div><div class="ui-toast-title">' + UI.escape(options.title || "Notification") + '</div>' +
      '<p class="ui-toast-message">' + UI.escape(options.message || "") + '</p></div>' +
      '<button type="button" class="ui-toast-close" aria-label="' + UI.escape(UI.t("toast.close")) + '">&times;</button>' +
      (duration > 0 ? '<div class="ui-toast-progress"></div>' : "");

    toast.querySelector(".ui-toast-close").addEventListener("click", function () { remove(toast); });
    var progress = toast.querySelector(".ui-toast-progress");
    if (progress) progress.style.animationDuration = duration + "ms";

    getContainer(options.position).appendChild(toast);
    if (duration > 0) setTimeout(function () { remove(toast); }, duration);
    return toast;
  }

  UI.toast = { show: show, remove: remove };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Upload area with client-side gating and optional direct upload.
   *
   *   <div data-ui-upload
   *        data-ui-max-size="5MB"
   *        data-ui-max-files="3"
   *        data-ui-url="/api/documents"        optional: upload immediately
   *        data-ui-upload-layout="inline">     optional: chips instead of stacked rows
   *     <input type="file" multiple accept=".pdf,image/*">
   *     <div class="ui-upload-preview"></div>
   *   </div>
   *
   * Rejecting an oversized or wrong-type file in the browser is a courtesy,
   * not a control -- the server must still enforce both. What it buys is the
   * user finding out before a slow upload rather than after it.
   */

  var SIZE_UNITS = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };

  function parseSize(text) {
    if (!text) return 0;
    var match = String(text).trim().match(/^([\d.]+)\s*(B|KB|MB|GB)?$/i);
    if (!match) return Number(text) || 0;
    var unit = (match[2] || "B").toUpperCase();
    return parseFloat(match[1]) * (SIZE_UNITS[unit] || 1);
  }

  function formatSize(bytes) {
    if (bytes >= SIZE_UNITS.MB) return (bytes / SIZE_UNITS.MB).toFixed(1).replace(/\.0$/, "") + " MB";
    if (bytes >= SIZE_UNITS.KB) return Math.round(bytes / SIZE_UNITS.KB) + " KB";
    return bytes + " B";
  }

  /** Matches a file against one `accept` entry: ".pdf", "image/*", "text/csv". */
  function matchesAccept(file, accept) {
    var name = file.name.toLowerCase();
    var type = (file.type || "").toLowerCase();

    return accept.split(",").some(function (entry) {
      entry = entry.trim().toLowerCase();
      if (!entry) return false;
      if (entry.charAt(0) === ".") return name.slice(-entry.length) === entry;
      if (entry.slice(-2) === "/*") return type.indexOf(entry.slice(0, -1)) === 0;
      return type === entry;
    });
  }

  function initUploads(root) {
    UI.matchAll("[data-ui-upload]", root).forEach(function (zone) {
      if (zone.dataset.uiUploadReady) return;
      zone.dataset.uiUploadReady = "true";

      var input = UI.q('input[type="file"]', zone);
      var preview = UI.q(".ui-upload-preview", zone);
      if (!input) return;

      if (preview && zone.getAttribute("data-ui-upload-layout") === "inline") {
        preview.classList.add("ui-upload-preview-inline");
      }

      var maxSize = parseSize(zone.getAttribute("data-ui-max-size"));
      var maxFiles = Number(zone.getAttribute("data-ui-max-files")) || 0;
      var accept = zone.getAttribute("accept") || input.getAttribute("accept") || "";
      var uploadUrl = zone.getAttribute("data-ui-url");

      var errors = UI.q(".ui-upload-errors", zone);
      if (!errors) {
        errors = document.createElement("div");
        errors.className = "ui-upload-errors";
        errors.setAttribute("role", "alert");
        zone.appendChild(errors);
      }

      ["dragenter", "dragover"].forEach(function (name) {
        zone.addEventListener(name, function (event) {
          event.preventDefault();
          zone.classList.add("ui-dragover");
        });
      });
      ["dragleave", "drop"].forEach(function (name) {
        zone.addEventListener(name, function () { zone.classList.remove("ui-dragover"); });
      });

      zone.addEventListener("drop", function (event) {
        event.preventDefault();
        if (!event.dataTransfer || !event.dataTransfer.files.length) return;
        var transfer = new DataTransfer();
        Array.prototype.forEach.call(input.files || [], function (file) { transfer.items.add(file); });
        Array.prototype.forEach.call(event.dataTransfer.files, function (file) { transfer.items.add(file); });
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });

      function showErrors(messages) {
        errors.innerHTML = messages
          .map(function (message) {
            return '<p class="ui-upload-error">' + UI.escape(message) + "</p>";
          })
          .join("");
        if (messages.length) UI.announce(messages[0], "assertive");
      }

      /**
       * Drops files that fail a rule and rebuilds the input's FileList, so what
       * the form submits always matches what the preview shows.
       */
      function enforceRules() {
        var files = Array.prototype.slice.call(input.files || []);
        var messages = [];
        var kept = [];

        files.forEach(function (file) {
          if (maxSize && file.size > maxSize) {
            messages.push(UI.t("upload.tooLarge", { name: file.name, max: formatSize(maxSize) }));
            return;
          }
          if (accept && !matchesAccept(file, accept)) {
            messages.push(UI.t("upload.wrongType", { name: file.name }));
            return;
          }
          kept.push(file);
        });

        if (maxFiles && kept.length > maxFiles) {
          messages.push(UI.t("upload.tooMany", { max: maxFiles }));
          kept = kept.slice(0, maxFiles);
        }

        if (kept.length !== files.length) {
          var transfer = new DataTransfer();
          kept.forEach(function (file) { transfer.items.add(file); });
          input.files = transfer.files;
        }

        showErrors(messages);
        if (messages.length) {
          UI.emit(zone, "ui:upload:rejected", { messages: messages });
        }
        return kept;
      }

      function removeFile(index) {
        var transfer = new DataTransfer();
        Array.prototype.forEach.call(input.files || [], function (file, i) {
          if (i !== index) transfer.items.add(file);
        });
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }

      function renderPreview() {
        if (!preview) return;
        preview.innerHTML = "";
        Array.prototype.forEach.call(input.files || [], function (file, index) {
          var item = document.createElement("div");
          item.className = "ui-file-item";
          item.setAttribute("data-ui-file-index", String(index));
          item.innerHTML =
            '<span class="ui-file-item-icon" aria-hidden="true">&#128196;</span>' +
            '<span class="ui-file-item-info">' +
              '<span class="ui-file-item-name">' + UI.escape(file.name) + '</span>' +
              '<span class="ui-file-item-size">' + formatSize(file.size) + '</span>' +
            '</span>' +
            '<div class="ui-file-item-progress" hidden><div class="ui-progress ui-progress-sm">' +
              '<div class="ui-progress-bar ui-progress-w-0"></div></div></div>' +
            '<button type="button" class="ui-file-item-remove" aria-label="' +
              UI.escape(UI.t("upload.remove", { name: file.name })) + '">&times;</button>';

          // The remove button lives in .ui-upload-preview, a sibling of the
          // dropzone that owns the file <input> -- never covered by it -- so
          // this stopPropagation is defensive, not load-bearing.
          item.querySelector(".ui-file-item-remove").addEventListener("click", function (event) {
            event.stopPropagation();
            removeFile(index);
          });
          preview.appendChild(item);
        });
      }

      /**
       * Direct upload with real progress. XMLHttpRequest rather than fetch:
       * fetch still has no upload progress event, and a progress bar that
       * jumps 0 -> 100 is worse than none on the large scans this is for.
       */
      function upload(file, item) {
        var progressHolder = item.querySelector(".ui-file-item-progress");
        var bar = item.querySelector(".ui-progress-bar");
        progressHolder.hidden = false;
        item.classList.add("ui-uploading");

        var form = new FormData();
        form.append(zone.getAttribute("data-ui-field") || "file", file);

        var request = new XMLHttpRequest();
        request.open("POST", uploadUrl);
        request.setRequestHeader("X-Requested-With", "XMLHttpRequest");

        request.upload.addEventListener("progress", function (event) {
          if (!event.lengthComputable) return;
          var percent = Math.round((event.loaded / event.total) * 100);
          // Stepped classes keep this CSP-safe (no inline style attribute).
          bar.className = "ui-progress-bar ui-progress-w-" + (Math.round(percent / 5) * 5);
          UI.emit(zone, "ui:upload:progress", { name: file.name, percent: percent });
        });

        request.addEventListener("load", function () {
          item.classList.remove("ui-uploading");
          if (request.status >= 200 && request.status < 300) {
            item.classList.add("ui-uploaded");
            bar.className = "ui-progress-bar ui-progress-w-100";
            UI.emit(zone, "ui:upload:done", { name: file.name, response: request.responseText });
            UI.announce(UI.t("upload.done", { name: file.name }));
          } else {
            item.classList.add("ui-upload-failed");
            UI.emit(zone, "ui:upload:failed", { name: file.name, status: request.status });
            showErrors([UI.t("upload.failed", { name: file.name })]);
          }
        });

        request.addEventListener("error", function () {
          item.classList.remove("ui-uploading");
          item.classList.add("ui-upload-failed");
          UI.emit(zone, "ui:upload:failed", { name: file.name, status: 0 });
          showErrors([UI.t("upload.failed", { name: file.name })]);
        });

        request.send(form);
      }

      function onChange() {
        var kept = enforceRules();
        renderPreview();
        UI.emit(zone, "ui:upload:change", { count: kept.length });

        if (!uploadUrl) return;
        kept.forEach(function (file, index) {
          var item = UI.q('[data-ui-file-index="' + index + '"]', preview);
          if (item && !item.classList.contains("ui-uploaded")) upload(file, item);
        });
      }

      input.addEventListener("change", onChange);
      UI.cleanup(zone, function () {
        input.removeEventListener("change", onChange);
      });

      zone._uiUpload = {
        clear: function () {
          input.value = "";
          renderPreview();
          showErrors([]);
        }
      };
    });
  }

  document.addEventListener("click", function (event) {
    var toggle = UI.closest(event.target, "[data-ui-theme-toggle]");
    if (!toggle) return;
    var root = document.documentElement;
    var current = root.getAttribute("data-ui-theme") || "light";
    var next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-ui-theme", next);
    try { localStorage.setItem("ui-theme", next); } catch (error) {}
    UI.emit(root, "ui:theme:changed", { theme: next });
  });

  try {
    var saved = localStorage.getItem("ui-theme");
    if (saved) document.documentElement.setAttribute("data-ui-theme", saved);
  } catch (error) {}

  UI.register(initUploads);

  UI.upload = {
    parseSize: parseSize,
    formatSize: formatSize,
    clear: function (target) {
      var zone = typeof target === "string" ? UI.q(target) : target;
      if (zone && zone._uiUpload) zone._uiUpload.clear();
    }
  };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  function confirmDialog(options) {
    options = options || {};
    var variant = options.variant === "danger" ? "danger" : "primary";

    return new Promise(function (resolve) {
      var modal = document.createElement("div");
      modal.className = "ui-modal ui-modal-sm";
      modal.setAttribute("aria-hidden", "true");
      if (options.static) modal.setAttribute("data-ui-static", "true");
      modal.innerHTML =
        '<div class="ui-backdrop"></div>' +
        '<div class="ui-modal-dialog" role="alertdialog" aria-modal="true">' +
          '<div class="ui-modal-header"><h3 class="ui-modal-title">' + UI.escape(options.title || UI.t("confirm.title")) + "</h3></div>" +
          '<div class="ui-modal-body"><p>' + UI.escape(options.message || UI.t("confirm.message")) + "</p></div>" +
          '<div class="ui-modal-footer">' +
            '<button type="button" class="ui-btn ui-btn-secondary"' + (variant === "danger" ? " autofocus" : "") + " data-ui-confirm-cancel>" + UI.escape(options.cancelText || UI.t("confirm.cancel")) + "</button>" +
            '<button type="button" class="ui-btn ui-btn-' + variant + '"' + (variant === "danger" ? "" : " autofocus") + " data-ui-confirm-ok>" + UI.escape(options.confirmText || UI.t("confirm.ok")) + "</button>" +
          "</div>" +
        "</div>";
      document.body.appendChild(modal);

      var confirmed = false;

      modal.querySelector("[data-ui-confirm-ok]").addEventListener("click", function () {
        confirmed = true;
        UI.modal.close(modal);
      });
      modal.querySelector("[data-ui-confirm-cancel]").addEventListener("click", function () {
        UI.modal.close(modal);
      });
      modal.addEventListener("ui:modal:hidden", function onHidden() {
        modal.removeEventListener("ui:modal:hidden", onHidden);
        modal.remove();
        resolve(confirmed);
      });

      UI.modal.open(modal);
    });
  }

  UI.confirm = confirmDialog;
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  function setDirty(form, dirty) {
    form.dataset.uiDirty = dirty ? "true" : "false";
    form.classList.toggle("ui-dirty", dirty);
  }

  function syncProgress(form) {
    var position = Number(form.getAttribute("data-ui-position"));
    var total = Number(form.getAttribute("data-ui-total"));
    if (!position || !total) return;

    var bar = UI.q(".ui-save-next-progress .ui-progress-bar", form);
    if (bar) {
      var percent = Math.max(0, Math.min(100, Math.round((position / total) * 100)));
      bar.className = bar.className.replace(/\bui-progress-w-\d+\b/g, "").trim();
      bar.classList.add("ui-progress-w-" + percent);
    }

    var positionEl = UI.q("[data-ui-save-next-position]", form);
    if (positionEl) positionEl.textContent = position;
    var totalEl = UI.q("[data-ui-save-next-total]", form);
    if (totalEl) totalEl.textContent = total;
  }

  function confirmLeave(form) {
    var message = form.getAttribute("data-ui-unsaved-message") || UI.t("unsaved.message");
    if (form.dataset.uiDirty !== "true") return Promise.resolve(true);
    if (typeof UI.confirm === "function") {
      return UI.confirm({ title: UI.t("unsaved.title"), message: message, variant: "danger", confirmText: UI.t("unsaved.leave") });
    }
    return Promise.resolve(window.confirm(message));
  }

  function navigate(url) {
    if (url) window.location.href = url;
  }

  function submitAjax(form, submitter) {
    var action = form.getAttribute("action") || window.location.href;
    var method = (form.getAttribute("method") || "POST").toUpperCase();
    var body = new FormData(form);
    if (submitter && submitter.name) body.append(submitter.name, submitter.value);

    UI.emit(form, "ui:savenext:submit", { submitter: submitter });

    fetch(action, { method: method, body: body, headers: { "X-Requested-With": "XMLHttpRequest" } })
      .then(function (response) {
        if (!response.ok) throw new Error("Request failed with status " + response.status);
        setDirty(form, false);
        UI.emit(form, "ui:savenext:success", { response: response, submitter: submitter });
        if (UI.toast) UI.toast.show({ type: "success", title: "Saved", message: form.getAttribute("data-ui-success-message") || "Your changes were saved." });
        var isSaveNext = submitter && submitter.hasAttribute("data-ui-save-next-submit");
        if (isSaveNext) navigate(form.getAttribute("data-ui-next-url"));
      })
      .catch(function (error) {
        UI.emit(form, "ui:savenext:error", { error: error, submitter: submitter });
        if (UI.toast) UI.toast.show({ type: "danger", title: "Save failed", message: form.getAttribute("data-ui-error-message") || "The record could not be saved." });
      });
  }

  function init(root) {
    UI.matchAll("form[data-ui-save-next]", root).forEach(function (form) {
      if (form.dataset.uiSaveNextReady) return;
      form.dataset.uiSaveNextReady = "true";

      syncProgress(form);
      setDirty(form, false);

      form.addEventListener("input", function () { setDirty(form, true); });
      form.addEventListener("change", function () { setDirty(form, true); });

      form.addEventListener("submit", function (event) {
        if (form.getAttribute("data-ui-ajax") === "true") {
          event.preventDefault();
          submitAjax(form, event.submitter);
        } else {
          setDirty(form, false);
        }
      });

      var prevButton = UI.q("[data-ui-save-next-prev]", form);
      if (prevButton) {
        prevButton.addEventListener("click", function (event) {
          event.preventDefault();
          var url = form.getAttribute("data-ui-prev-url");
          confirmLeave(form).then(function (leave) {
            if (leave) navigate(url);
          });
        });
      }

      form.addEventListener("keydown", function (event) {
        var isSubmitCombo = (event.ctrlKey || event.metaKey) && event.key === "Enter";
        if (!isSubmitCombo) return;
        var submitButton = UI.q("[data-ui-save-next-submit]", form);
        if (!submitButton) return;
        event.preventDefault();
        if (typeof form.requestSubmit === "function") form.requestSubmit(submitButton);
        else submitButton.click();
      });
    });
  }

  window.addEventListener("beforeunload", function (event) {
    if (!UI.q("form[data-ui-save-next].ui-dirty")) return;
    event.preventDefault();
    event.returnValue = "";
  });

  UI.saveNext = { setDirty: setDirty };
  UI.register(init);
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  // Gating "Next" on the current step only.
  //
  // When the form also opts into `data-ui-validate`, delegate: that module
  // sets `novalidate` and renders its own inline messages, so calling
  // reportValidity() here would leave the user stuck on a step with no visible
  // reason -- blocked, but silently. Otherwise fall back to native validation
  // so the wizard still works on its own.
  function validateStep(panel, form) {
    if (UI.validate && form.hasAttribute("data-ui-validate")) {
      var result = UI.validate.form(form, { scope: panel });
      if (!result.valid) UI.validate.focusFirst(form, result.errors);
      return result.valid;
    }

    var fields = UI.qa("input, select, textarea", panel);
    for (var i = 0; i < fields.length; i++) {
      if (!fields[i].reportValidity()) return false;
    }
    return true;
  }

  function build(form) {
    if (form.dataset.uiStepperReady) return;
    form.dataset.uiStepperReady = "true";

    var panels = UI.qa("[data-ui-step]", form);
    var markers = UI.qa("[data-ui-stepper] .ui-step", form);
    var backButton = UI.q("[data-ui-step-back]", form);
    var nextButton = UI.q("[data-ui-step-next]", form);
    var submitButton = UI.q("[data-ui-save-next-submit]", form);
    var current = 0;

    function render() {
      panels.forEach(function (panel, index) { panel.hidden = index !== current; });
      markers.forEach(function (marker, index) {
        marker.classList.toggle("ui-complete", index < current);
        marker.classList.toggle("ui-active", index === current);
      });

      if (backButton) backButton.hidden = current === 0;
      var isLast = current === panels.length - 1;
      if (nextButton) nextButton.hidden = isLast;
      if (submitButton) submitButton.hidden = !isLast;

      UI.emit(form, "ui:stepper:change", { step: current, total: panels.length });
    }

    if (backButton) {
      backButton.addEventListener("click", function () {
        if (current === 0) return;
        current--;
        render();
      });
    }

    if (nextButton) {
      nextButton.addEventListener("click", function () {
        if (!validateStep(panels[current], form)) return;
        if (current < panels.length - 1) current++;
        render();
      });
    }

    render();
  }

  function init(root) {
    UI.matchAll("[data-ui-stepper-form]", root).forEach(build);
  }

  UI.register(init);
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Smart tables.
   *
   * Two sourcing modes share one set of controls, so a screen can start as a
   * server-rendered table and move to a paged endpoint without its markup or
   * its event contract changing:
   *
   *   <div data-ui-table>…</div>                      rows already in the DOM
   *   <div data-ui-table data-ui-url="/api/records">   rows fetched per page
   *
   * The endpoint receives `?page=&size=&q=&sort=&dir=` and returns either
   *   {"rows": [{…}|[…]], "total": n}   -- mapped via <th data-ui-field="…">
   *   {"html": "<tr>…</tr>", "total": n} -- for stacks that would rather render
   *                                         the rows server-side
   *
   * Client mode keeps every row in memory and does the work locally; that is
   * fine to a few thousand rows and wrong beyond it, which is what server mode
   * is for.
   */

  var SERVER_SEARCH_DEBOUNCE = 300;

  function compareValues(a, b, type) {
    if (type === "number") return (parseFloat(a) || 0) - (parseFloat(b) || 0);
    if (type === "date") return new Date(a).getTime() - new Date(b).getTime();
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }

  function cellValue(row, index) {
    var cell = row.children[index];
    if (!cell) return "";
    return cell.getAttribute("data-ui-sort-value") || cell.textContent.trim();
  }

  /** Wraps a value for CSV: quote it and double any embedded quotes. */
  function csvCell(value) {
    var text = String(value == null ? "" : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function build(wrapper) {
    if (wrapper.dataset.uiReady) return;
    wrapper.dataset.uiReady = "true";

    var table = wrapper.tagName === "TABLE" ? wrapper : UI.q("table", wrapper);
    if (!table) return;
    var tbody = UI.q("tbody", table);
    var headers = UI.qa("thead th", table);
    var headerRow = UI.q("thead tr", table);

    // When the table is wrapped for horizontal scrolling (`.ui-table-responsive`,
    // the documented pattern for wide tables on narrow screens), the toolbar
    // and pagination must sit *outside* that scroll box. Anchoring them to the
    // raw `table` element instead put them inside it, so on a narrow screen
    // the search box, column menu and export button scrolled out of view
    // along with the table instead of staying put above/below it.
    var scrollBox = UI.closest(table, ".ui-table-responsive") || table;

    var url = wrapper.getAttribute("data-ui-url");
    var serverMode = !!url;
    var allRows = serverMode ? [] : UI.qa("tr", tbody);

    var pageSize = Number(wrapper.getAttribute("data-ui-page-size")) || 10;
    var currentPage = 1;
    var sortIndex = -1;
    var sortDirection = "ascending";
    var query = "";
    var serverTotal = 0;
    var serverRows = [];
    var requestToken = 0;
    var searchTimer = null;

    var selectable = wrapper.hasAttribute("data-ui-select");
    var selected = Object.create(null);

    var showSearch = wrapper.getAttribute("data-ui-search") !== "false";
    var showPageSizePicker = wrapper.getAttribute("data-ui-page-size-selector") !== "false";
    var exportName = wrapper.getAttribute("data-ui-export");
    var columnToggle = wrapper.hasAttribute("data-ui-columns");

    // ---------------------------------------------------------------- select

    var selectAllBox = null;

    function rowId(row) {
      return row.getAttribute("data-ui-row-id") || "";
    }

    function selectedIds() {
      return Object.keys(selected).filter(function (id) { return selected[id]; });
    }

    function addSelectionColumn() {
      var th = document.createElement("th");
      th.className = "ui-table-select-cell";
      th.innerHTML = '<input type="checkbox" class="ui-check" aria-label="' +
        UI.escape(UI.t("table.selectAll")) + '">';
      headerRow.insertBefore(th, headerRow.firstChild);
      headers = UI.qa("thead th", table);

      selectAllBox = UI.q("input", th);
      selectAllBox.addEventListener("change", function () {
        var checked = this.checked;
        UI.qa("tbody tr:not(.ui-table-empty-row)", table).forEach(function (row) {
          var id = rowId(row);
          if (!id) return;
          selected[id] = checked;
          var box = UI.q(".ui-table-select-cell input", row);
          if (box) box.checked = checked;
          row.classList.toggle("ui-selected", checked);
        });
        emitSelection();
      });
    }

    function decorateRowForSelection(row) {
      if (UI.q(".ui-table-select-cell", row)) return;
      var id = rowId(row);
      var cell = document.createElement("td");
      cell.className = "ui-table-select-cell";
      cell.innerHTML = '<input type="checkbox" class="ui-check"' +
        (selected[id] ? " checked" : "") + ' aria-label="' +
        UI.escape(UI.t("table.selectRow")) + '">';
      row.insertBefore(cell, row.firstChild);
      row.classList.toggle("ui-selected", !!selected[id]);

      UI.q("input", cell).addEventListener("change", function () {
        selected[id] = this.checked;
        row.classList.toggle("ui-selected", this.checked);
        syncSelectAll();
        emitSelection();
      });
    }

    function syncSelectAll() {
      if (!selectAllBox) return;
      var visible = UI.qa("tbody tr:not(.ui-table-empty-row)", table);
      var ids = visible.map(rowId).filter(Boolean);
      var chosen = ids.filter(function (id) { return selected[id]; });
      selectAllBox.checked = ids.length > 0 && chosen.length === ids.length;
      selectAllBox.indeterminate = chosen.length > 0 && chosen.length < ids.length;
    }

    function emitSelection() {
      var ids = selectedIds();
      if (selectionBar) {
        var wasHidden = selectionBar.hidden;
        selectionBar.hidden = ids.length === 0;
        // A fresh selection (bar going from fully hidden to shown) always
        // starts expanded -- collapsing is a per-viewing choice, not one
        // that should carry over and hide bulk actions on the next unrelated
        // selection.
        if (wasHidden && !selectionBar.hidden) {
          selectionBar.classList.remove("ui-collapsed");
          if (selectionToggle) selectionToggle.setAttribute("aria-expanded", "true");
        }
        var label = UI.q(".ui-table-selection-count", selectionBar);
        if (label) label.textContent = UI.t("table.selected", { count: ids.length });
      }
      UI.emit(wrapper, "ui:table:select", { selected: ids, count: ids.length });
    }

    var selectionBar = null;
    var selectionToggle = null;
    if (selectable) {
      addSelectionColumn();
      selectionBar = UI.q("[data-ui-table-selection]", wrapper);
      if (selectionBar) {
        selectionBar.hidden = true;
        if (!UI.q(".ui-table-selection-count", selectionBar)) {
          var count = document.createElement("span");
          count.className = "ui-table-selection-count";
          selectionBar.insertBefore(count, selectionBar.firstChild);
        }

        // The count doubles as the collapse/expand control -- click (or
        // Enter/Space) hides the bulk-action buttons down to just the count
        // chip, so the bar can be tucked out of the way without clearing the
        // selection, and brought back the same way.
        selectionToggle = UI.q(".ui-table-selection-count", selectionBar);
        selectionToggle.setAttribute("role", "button");
        selectionToggle.setAttribute("tabindex", "0");
        selectionToggle.setAttribute("aria-expanded", "true");
        selectionToggle.title = UI.t("table.selectionToggle");

        var toggleCollapsed = function () {
          var collapsed = selectionBar.classList.toggle("ui-collapsed");
          selectionToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        };
        selectionToggle.addEventListener("click", toggleCollapsed);
        selectionToggle.addEventListener("keydown", function (event) {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleCollapsed();
        });
      }
    }

    // --------------------------------------------------------------- toolbar

    var toolbar = null;
    if (showSearch || showPageSizePicker || exportName || columnToggle) {
      toolbar = document.createElement("div");
      toolbar.className = "ui-table-toolbar";

      if (showPageSizePicker) {
        var sizes = (wrapper.getAttribute("data-ui-page-sizes") || "5,10,25,50")
          .split(",").map(function (value) { return Number(value.trim()); }).filter(Boolean);
        if (sizes.indexOf(pageSize) === -1) sizes.push(pageSize);
        sizes.sort(function (a, b) { return a - b; });

        var sizeField = document.createElement("label");
        sizeField.className = "ui-table-page-size";
        sizeField.innerHTML = UI.escape(UI.t("table.showPrefix")) + " " +
          '<select class="ui-select ui-control-sm">' +
          sizes.map(function (size) {
            return '<option value="' + size + '"' + (size === pageSize ? " selected" : "") + ">" + size + "</option>";
          }).join("") +
          "</select> " + UI.escape(UI.t("table.showSuffix"));
        toolbar.appendChild(sizeField);

        UI.q("select", sizeField).addEventListener("change", function () {
          pageSize = Number(this.value) || pageSize;
          currentPage = 1;
          refresh();
        });
      }

      var toolbarEnd = document.createElement("div");
      toolbarEnd.className = "ui-table-toolbar-end";
      toolbar.appendChild(toolbarEnd);

      if (columnToggle) toolbarEnd.appendChild(buildColumnMenu());
      if (exportName) toolbarEnd.appendChild(buildExportButton());

      if (showSearch) {
        var search = document.createElement("input");
        search.type = "search";
        search.className = "ui-control ui-control-sm ui-table-search";
        search.placeholder = wrapper.getAttribute("data-ui-search-placeholder") || UI.t("table.search");
        search.setAttribute("aria-label", UI.t("table.searchLabel"));
        toolbarEnd.appendChild(search);

        search.addEventListener("input", function () {
          var value = this.value.trim().toLowerCase();
          // Server mode debounces: one request per pause, not per keystroke.
          if (serverMode) {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(function () {
              query = value;
              currentPage = 1;
              refresh();
            }, SERVER_SEARCH_DEBOUNCE);
          } else {
            query = value;
            currentPage = 1;
            refresh();
          }
        });
      }

      // Insert relative to `scrollBox` (the .ui-table-responsive wrapper when
      // there is one, else `table` itself) rather than `wrapper`: `data-ui-table`
      // may be on the <table> itself, where a <nav> can't legally live inside
      // it and a node can't be inserted before itself.
      scrollBox.parentNode.insertBefore(toolbar, scrollBox);
    }

    // ------------------------------------------------------- column toggling

    function dataColumns() {
      // Skip the injected selection column, which is never toggleable.
      return headers.filter(function (th) {
        return !th.classList.contains("ui-table-select-cell");
      });
    }

    function applyColumnVisibility() {
      dataColumns().forEach(function (th) {
        var index = headers.indexOf(th);
        var hidden = th.hasAttribute("data-ui-hidden");
        th.hidden = hidden;
        UI.qa("tbody tr", table).forEach(function (row) {
          var cell = row.children[index];
          if (cell && !row.classList.contains("ui-table-empty-row")) cell.hidden = hidden;
        });
      });
    }

    function buildColumnMenu() {
      var holder = document.createElement("div");
      holder.className = "ui-dropdown ui-dropdown-end ui-table-columns";
      holder.innerHTML =
        '<button type="button" class="ui-btn ui-btn-sm ui-btn-outline-secondary" data-ui-dropdown>' +
        UI.escape(UI.t("table.columns")) + "</button>" +
        '<div class="ui-dropdown-menu"></div>';

      var menu = UI.q(".ui-dropdown-menu", holder);
      dataColumns().forEach(function (th) {
        var label = document.createElement("label");
        label.className = "ui-dropdown-item ui-table-column-option";
        label.innerHTML =
          '<input type="checkbox" class="ui-check"' + (th.hasAttribute("data-ui-hidden") ? "" : " checked") + ">" +
          "<span>" + UI.escape(th.textContent.trim()) + "</span>";
        label.querySelector("input").addEventListener("change", function () {
          if (this.checked) th.removeAttribute("data-ui-hidden");
          else th.setAttribute("data-ui-hidden", "");
          applyColumnVisibility();
          UI.emit(wrapper, "ui:table:columns", {
            hidden: dataColumns().filter(function (c) { return c.hasAttribute("data-ui-hidden"); })
              .map(function (c) { return c.textContent.trim(); })
          });
        });
        menu.appendChild(label);
      });

      return holder;
    }

    // ---------------------------------------------------------------- export

    function currentExportRows() {
      var visibleHeaders = dataColumns().filter(function (th) { return !th.hidden; });
      var indexes = visibleHeaders.map(function (th) { return headers.indexOf(th); });

      var head = visibleHeaders.map(function (th) { return th.textContent.trim(); });
      var body = exportSourceRows().map(function (row) {
        return indexes.map(function (index) {
          var cell = row.children[index];
          if (!cell) return "";
          return cell.getAttribute("data-ui-export-value") || cell.textContent.trim();
        });
      });

      return [head].concat(body);
    }

    function exportSourceRows() {
      // Client mode exports everything matching the current filter and sort,
      // not just the page on screen -- exporting one page is almost never what
      // someone wants. Server mode can only offer what it has been sent.
      if (serverMode) return UI.qa("tbody tr:not(.ui-table-empty-row)", table);
      return sortedRows(filteredRows());
    }

    function buildExportButton() {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "ui-btn ui-btn-sm ui-btn-outline-secondary ui-table-export";
      button.textContent = UI.t("table.export");

      button.addEventListener("click", function () {
        var rows = currentExportRows();
        // ﻿ makes Excel read the file as UTF-8 instead of the local
        // codepage, which otherwise mangles non-ASCII names. Written
        // as an escape rather than a literal BOM so an editor or a
        // normalising tool cannot silently strip it from the source.
        var csv = "﻿" + rows.map(function (row) {
          return row.map(csvCell).join(",");
        }).join("\r\n");

        var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = (exportName === "csv" ? "export" : exportName) + ".csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);

        UI.emit(wrapper, "ui:table:export", { rows: rows.length - 1 });
      });

      return button;
    }

    // ------------------------------------------------------------ pagination

    var pagination = document.createElement("nav");
    pagination.className = "ui-table-pagination";
    scrollBox.insertAdjacentElement("afterend", pagination);

    // Only sortable headers carry aria-sort. Setting aria-sort="none" on an
    // opted-out column would announce it to screen readers as a sortable
    // column that merely happens to be unsorted.
    var sortableHeaders = headers.filter(function (th) {
      return th.hasAttribute("data-ui-sort") && th.getAttribute("data-ui-sort") !== "false";
    });

    sortableHeaders.forEach(function (th) {
      var index = headers.indexOf(th);
      th.classList.add("ui-table-sortable");
      th.setAttribute("aria-sort", "none");
      th.addEventListener("click", function () {
        if (sortIndex === index) {
          sortDirection = sortDirection === "ascending" ? "descending" : "ascending";
        } else {
          sortIndex = index;
          sortDirection = "ascending";
        }
        sortableHeaders.forEach(function (other) {
          other.setAttribute("aria-sort", other === th ? sortDirection : "none");
        });
        currentPage = 1;
        refresh();
      });
    });

    function filteredRows() {
      if (!query) return allRows.slice();
      return allRows.filter(function (row) { return row.textContent.toLowerCase().indexOf(query) !== -1; });
    }

    function sortedRows(rows) {
      if (sortIndex === -1) return rows;
      var type = headers[sortIndex].getAttribute("data-ui-sort");
      var sorted = rows.slice().sort(function (a, b) {
        return compareValues(cellValue(a, sortIndex), cellValue(b, sortIndex), type);
      });
      if (sortDirection === "descending") sorted.reverse();
      return sorted;
    }

    function renderPagination(totalPages) {
      pagination.innerHTML = "";
      if (totalPages <= 1) return;

      var list = document.createElement("ul");
      list.className = "ui-pagination";

      function addPage(label, page, disabled, active, ariaLabel) {
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.href = "#";
        link.className = "ui-page-link" + (active ? " ui-active" : "") + (disabled ? " ui-disabled" : "");
        link.textContent = label;
        if (ariaLabel) link.setAttribute("aria-label", ariaLabel);
        if (active) link.setAttribute("aria-current", "page");
        link.addEventListener("click", function (event) {
          event.preventDefault();
          if (disabled) return;
          currentPage = page;
          refresh();
        });
        item.appendChild(link);
        list.appendChild(item);
      }

      addPage("‹", currentPage - 1, currentPage === 1, false, UI.t("table.previous"));
      for (var page = 1; page <= totalPages; page++) addPage(String(page), page, false, page === currentPage);
      addPage("›", currentPage + 1, currentPage === totalPages, false, UI.t("table.next"));

      pagination.appendChild(list);
    }

    function showEmptyRow() {
      var emptyRow = document.createElement("tr");
      emptyRow.className = "ui-table-empty-row";
      var emptyCell = document.createElement("td");
      emptyCell.colSpan = headers.length || 1;
      emptyCell.textContent = wrapper.getAttribute("data-ui-empty-text") || UI.t("table.empty");
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    }

    function afterRender(visible, total, totalPages) {
      if (selectable) {
        UI.qa("tbody tr:not(.ui-table-empty-row)", table).forEach(decorateRowForSelection);
        syncSelectAll();
      }
      applyColumnVisibility();
      renderPagination(totalPages);

      UI.emit(wrapper, "ui:table:change", {
        page: currentPage,
        totalPages: totalPages,
        visible: visible,
        total: total
      });
    }

    // ----------------------------------------------------------- client mode

    function renderClientPage() {
      var rows = sortedRows(filteredRows());
      var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      currentPage = Math.min(currentPage, totalPages);

      tbody.innerHTML = "";
      if (!rows.length) {
        showEmptyRow();
      } else {
        rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).forEach(function (row) {
          tbody.appendChild(row);
        });
      }

      afterRender(rows.length, allRows.length, totalPages);
    }

    // ----------------------------------------------------------- server mode

    function fieldsFromHeaders() {
      return dataColumns().map(function (th) {
        return th.getAttribute("data-ui-field") || "";
      });
    }

    function renderServerRows(rows) {
      tbody.innerHTML = "";
      if (!rows.length) {
        showEmptyRow();
        return;
      }

      var fields = fieldsFromHeaders();
      rows.forEach(function (item) {
        var tr = document.createElement("tr");
        if (item && item.id != null) tr.setAttribute("data-ui-row-id", String(item.id));

        fields.forEach(function (field, index) {
          var td = document.createElement("td");
          var value = Array.isArray(item) ? item[index] : (field ? item[field] : "");
          td.textContent = value == null ? "" : String(value);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    function setLoading(on) {
      wrapper.classList.toggle("ui-table-loading", on);
      if (table) table.setAttribute("aria-busy", on ? "true" : "false");
    }

    function fetchServerPage() {
      var token = ++requestToken;
      setLoading(true);

      var sortField = "";
      if (sortIndex !== -1 && headers[sortIndex]) {
        sortField = headers[sortIndex].getAttribute("data-ui-field") ||
          headers[sortIndex].textContent.trim();
      }

      var params = new URLSearchParams({
        page: String(currentPage),
        size: String(pageSize)
      });
      if (query) params.set("q", query);
      if (sortField) {
        params.set("sort", sortField);
        params.set("dir", sortDirection === "descending" ? "desc" : "asc");
      }

      var endpoint = url + (url.indexOf("?") === -1 ? "?" : "&") + params.toString();

      fetch(endpoint, {
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }
      })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (data) {
          // Discard a slow earlier page that lands after a newer one.
          if (token !== requestToken) return;
          setLoading(false);

          serverTotal = Number(data.total) || 0;
          serverRows = data.rows || [];

          if (typeof data.html === "string") {
            tbody.innerHTML = data.html;
            if (!UI.qa("tr", tbody).length) showEmptyRow();
          } else {
            renderServerRows(serverRows);
          }

          var totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
          afterRender(UI.qa("tbody tr:not(.ui-table-empty-row)", table).length, serverTotal, totalPages);
          UI.announce(UI.t("table.status", { visible: serverRows.length, total: serverTotal }));
        })
        .catch(function (error) {
          if (token !== requestToken) return;
          setLoading(false);
          tbody.innerHTML = "";
          var errorRow = document.createElement("tr");
          errorRow.className = "ui-table-empty-row ui-table-error-row";
          var errorCell = document.createElement("td");
          errorCell.colSpan = headers.length || 1;
          errorCell.textContent = wrapper.getAttribute("data-ui-error-text") || UI.t("table.error");
          errorRow.appendChild(errorCell);
          tbody.appendChild(errorRow);
          renderPagination(0);
          UI.emit(wrapper, "ui:table:error", { error: error });
        });
    }

    function refresh() {
      if (serverMode) fetchServerPage();
      else renderClientPage();
    }

    UI.cleanup(wrapper, function () {
      window.clearTimeout(searchTimer);
      requestToken++;
    });

    wrapper._uiTable = {
      refresh: refresh,
      selected: selectedIds,
      clearSelection: function () {
        selected = Object.create(null);
        UI.qa("tbody tr", table).forEach(function (row) {
          row.classList.remove("ui-selected");
          var box = UI.q(".ui-table-select-cell input", row);
          if (box) box.checked = false;
        });
        syncSelectAll();
        emitSelection();
      }
    };

    refresh();
  }

  function init(root) {
    UI.matchAll("[data-ui-table]", root).forEach(build);
  }

  UI.register(init);

  UI.table = {
    /** Re-runs the current query/page — call after saving a row. */
    refresh: function (target) {
      var wrapper = typeof target === "string" ? UI.q(target) : target;
      if (wrapper && wrapper._uiTable) wrapper._uiTable.refresh();
    },
    selected: function (target) {
      var wrapper = typeof target === "string" ? UI.q(target) : target;
      return wrapper && wrapper._uiTable ? wrapper._uiTable.selected() : [];
    },
    clearSelection: function (target) {
      var wrapper = typeof target === "string" ? UI.q(target) : target;
      if (wrapper && wrapper._uiTable) wrapper._uiTable.clearSelection();
    }
  };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;
  var STORAGE_PREFIX = "ui-draft:";
  var AUTOSAVE_DELAY = 800;

  function storageKey(form) {
    return STORAGE_PREFIX + (form.getAttribute("data-ui-draft-key") || form.id || form.getAttribute("action") || window.location.pathname);
  }

  function safeStorage() {
    try {
      window.localStorage.setItem("__ui_draft_test__", "1");
      window.localStorage.removeItem("__ui_draft_test__");
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  function serialize(form) {
    var data = {};
    new FormData(form).forEach(function (value, key) {
      if (value instanceof File) return;
      if (!data[key]) data[key] = [];
      data[key].push(value);
    });
    return data;
  }

  function restoreFields(form, data) {
    Object.keys(data).forEach(function (key) {
      var values = data[key];
      var fields = UI.qa('[name="' + key.replace(/"/g, '\\"') + '"]', form);
      if (!fields.length) return;

      if (fields[0].type === "checkbox" || fields[0].type === "radio") {
        fields.forEach(function (field) { field.checked = values.indexOf(field.value) !== -1; });
      } else if (fields[0].tagName === "SELECT" && fields[0].multiple) {
        Array.prototype.forEach.call(fields[0].options, function (option) {
          option.selected = values.indexOf(option.value) !== -1;
        });
      } else {
        fields[0].value = values[0];
      }
      fields[0].dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  // Intl.RelativeTimeFormat handles plural rules per locale, which a string
  // table cannot -- "2 minutes ago" vs "dakika 2 zilizopita" have different
  // pluralisation shapes. Falls back to the i18n table where unsupported.
  function relativeTime(timestamp) {
    var seconds = Math.round((Date.now() - timestamp) / 1000);
    var minutes = Math.round(seconds / 60);
    var hours = Math.round(minutes / 60);

    if (window.Intl && Intl.RelativeTimeFormat) {
      var formatter = new Intl.RelativeTimeFormat(UI.i18n.locale, { numeric: "auto" });
      if (seconds < 60) return formatter.format(-seconds, "second");
      if (minutes < 60) return formatter.format(-minutes, "minute");
      return formatter.format(-hours, "hour");
    }

    if (seconds < 60) return UI.t("draft.justNow");
    if (minutes < 60) return UI.t("draft.minutes", { count: minutes });
    return UI.t("draft.hours", { count: hours });
  }

  // Best-effort remote sync. The server contract:
  //   GET  <url>  -> 200 {fields, savedAt} | 404 (no draft)
  //   POST <url>  <- {fields, savedAt}     -> any 2xx
  //   DELETE <url>                         -> any 2xx
  // Network/server failures never block the local (localStorage) draft from
  // working -- they're swallowed and reported via ui:draft:sync-error.
  function remoteGet(url) {
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .catch(function () { return null; });
  }

  function remoteSave(form, url, record) {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    }).then(function (response) {
      if (!response.ok) throw new Error("Draft sync failed with status " + response.status);
    }).catch(function (error) {
      UI.emit(form, "ui:draft:sync-error", { error: error });
    });
  }

  function remoteDiscard(url) {
    fetch(url, { method: "DELETE" }).catch(function () {});
  }

  function build(form) {
    if (form.dataset.uiDraftReady) return;
    form.dataset.uiDraftReady = "true";

    var storage = safeStorage();
    if (!storage) return;
    var key = storageKey(form);
    var url = form.getAttribute("data-ui-draft-url");

    function readLocalDraft() {
      try {
        return JSON.parse(storage.getItem(key));
      } catch (error) {
        return null;
      }
    }

    function setStatus(text) {
      var status = UI.q("[data-ui-draft-status]", form);
      if (status) status.textContent = text || "";
    }

    function save() {
      var record = { fields: serialize(form), savedAt: Date.now() };
      storage.setItem(key, JSON.stringify(record));
      setStatus("Draft saved " + new Date(record.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      UI.emit(form, "ui:draft:saved", { savedAt: record.savedAt });
      if (url) remoteSave(form, url, record);
    }

    function discard() {
      storage.removeItem(key);
      setStatus("");
      UI.emit(form, "ui:draft:discarded", {});
      if (url) remoteDiscard(url);
    }

    var saveTimer = null;
    form.addEventListener("input", function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, AUTOSAVE_DELAY);
    });

    // Auto-discarding on the raw submit event assumes the submission always
    // goes through. Apps that gate submission behind an async confirm or
    // validation step (submit handler calls preventDefault(), decides
    // later) should set data-ui-draft-auto-discard="false" and call
    // UI.draft.discard(form) themselves once the submission actually
    // succeeds -- otherwise the draft is wiped even if the user cancels.
    form.addEventListener("submit", function () {
      clearTimeout(saveTimer);
      if (form.getAttribute("data-ui-draft-auto-discard") !== "false") discard();
    });

    form._uiDraftSave = save;
    form._uiDraftDiscard = discard;

    function showBanner(draft) {
      var banner = document.createElement("div");
      banner.className = "ui-alert ui-alert-info ui-draft-banner";
      banner.setAttribute("role", "alert");
      banner.innerHTML =
        '<div class="ui-alert-icon">i</div>' +
        '<div><div class="ui-alert-title">' + UI.escape(UI.t("unsaved.title")) + "</div>" +
        '<p class="ui-alert-message">' +
        UI.escape(UI.t("draft.found", { when: relativeTime(draft.savedAt) })) + "</p>" +
        '<div class="ui-d-flex ui-gap-2 ui-mt-2">' +
        '<button type="button" class="ui-btn ui-btn-sm ui-btn-primary" data-ui-draft-restore>' +
        UI.escape(UI.t("draft.restore")) + "</button>" +
        '<button type="button" class="ui-btn ui-btn-sm ui-btn-outline-secondary" data-ui-draft-discard>' +
        UI.escape(UI.t("draft.discard")) + "</button>" +
        "</div></div>";
      form.parentNode.insertBefore(banner, form);

      banner.querySelector("[data-ui-draft-restore]").addEventListener("click", function () {
        restoreFields(form, draft.fields);
        banner.remove();
        UI.emit(form, "ui:draft:restored", { savedAt: draft.savedAt });
      });
      banner.querySelector("[data-ui-draft-discard]").addEventListener("click", function () {
        discard();
        banner.remove();
      });
    }

    var localDraft = readLocalDraft();

    if (!url) {
      if (localDraft && localDraft.fields) showBanner(localDraft);
      return;
    }

    // With a remote URL configured, reconcile local vs. server before
    // showing anything -- whichever was saved more recently wins (e.g. the
    // user continued on a different device).
    remoteGet(url).then(function (remoteDraft) {
      var winner = localDraft;
      if (remoteDraft && remoteDraft.fields) {
        if (!winner || remoteDraft.savedAt > winner.savedAt) winner = remoteDraft;
      }
      if (winner && winner.fields) showBanner(winner);
    });
  }

  function init(root) {
    UI.matchAll("form[data-ui-draft]", root).forEach(build);
  }

  UI.draft = {
    save: function (form) { if (form && form._uiDraftSave) form._uiDraftSave(); },
    discard: function (form) { if (form && form._uiDraftDiscard) form._uiDraftDiscard(); }
  };

  UI.register(init);
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  // Built-in rules. Each returns an error message key + vars when it fails,
  // or null when it passes. Native constraint attributes are handled here
  // rather than deferred to reportValidity() so the messages are translatable
  // and render inline instead of in a browser bubble that cannot be styled,
  // cannot be read by a screen reader on submit, and disappears on scroll.
  var RULES = {
    required: function (value, field) {
      if (field.type === "checkbox") return field.checked ? null : { key: "validate.required" };
      if (field.type === "radio") {
        var group = field.form
          ? UI.qa('input[type="radio"][name="' + cssEscape(field.name) + '"]', field.form)
          : [field];
        return group.some(function (radio) { return radio.checked; })
          ? null
          : { key: "validate.required" };
      }
      return value.length ? null : { key: "validate.required" };
    },

    email: function (value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : { key: "validate.email" };
    },

    url: function (value) {
      try {
        new URL(value);
        return null;
      } catch (error) {
        return { key: "validate.url" };
      }
    },

    number: function (value) {
      return isFinite(parseFloat(value)) && /^-?\d*\.?\d+$/.test(value.replace(/[\s,]/g, ""))
        ? null
        : { key: "validate.number" };
    },

    integer: function (value) {
      return /^-?\d+$/.test(value.replace(/[\s,]/g, "")) ? null : { key: "validate.integer" };
    },

    min: function (value, field, param) {
      return parseFloat(value) >= parseFloat(param)
        ? null
        : { key: "validate.min", vars: { min: param } };
    },

    max: function (value, field, param) {
      return parseFloat(value) <= parseFloat(param)
        ? null
        : { key: "validate.max", vars: { max: param } };
    },

    minlength: function (value, field, param) {
      return value.length >= Number(param)
        ? null
        : { key: "validate.minLength", vars: { min: param } };
    },

    maxlength: function (value, field, param) {
      return value.length <= Number(param)
        ? null
        : { key: "validate.maxLength", vars: { max: param } };
    },

    pattern: function (value, field, param) {
      var expression = new RegExp("^(?:" + param + ")$");
      return expression.test(value) ? null : { key: "validate.pattern" };
    },

    // Cross-field rules. `param` is a selector or a field name in the same form.
    match: function (value, field, param) {
      var other = resolveField(field, param);
      return other && other.value === value ? null : { key: "validate.match" };
    },

    after: function (value, field, param) {
      var other = resolveField(field, param);
      if (!other || !other.value) return null;
      return new Date(value) > new Date(other.value)
        ? null
        : { key: "validate.after", vars: { other: fieldLabel(other) } };
    },

    before: function (value, field, param) {
      var other = resolveField(field, param);
      if (!other || !other.value) return null;
      return new Date(value) < new Date(other.value)
        ? null
        : { key: "validate.before", vars: { other: fieldLabel(other) } };
    }
  };

  function cssEscape(value) {
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function resolveField(field, reference) {
    var form = field.form;
    if (!form) return null;
    if (/^[#.\[]/.test(reference)) return UI.q(reference, form) || UI.q(reference);
    return UI.q('[name="' + cssEscape(reference) + '"]', form);
  }

  function fieldLabel(field) {
    var explicit = field.getAttribute("data-ui-label");
    if (explicit) return explicit;
    if (field.id) {
      var label = UI.q('label[for="' + cssEscape(field.id) + '"]', field.form || document);
      if (label) return label.textContent.trim().replace(/\s*\*$/, "");
    }
    var wrapping = UI.closest(field, "label");
    if (wrapping) return wrapping.textContent.trim();
    return field.getAttribute("placeholder") || field.name || "This field";
  }

  /** The container a field's error message belongs in. */
  function fieldWrapper(field) {
    return UI.closest(field, ".ui-field") || field.parentNode;
  }

  function feedbackElement(field) {
    var wrapper = fieldWrapper(field);
    var existing = UI.q(".ui-feedback-invalid", wrapper);
    if (existing) return existing;

    var element = document.createElement("p");
    element.className = "ui-feedback ui-feedback-invalid";

    // For a wrapped component (date picker, date range, multi-select) the
    // real <input> is hidden and sits *before* the visible trigger in the
    // DOM, so inserting right after it would place the message above the
    // control instead of below it. Anchor to the whole wrapper instead.
    var overlay = UI.closest(field, ".ui-date-range, .ui-date-picker, .ui-multiselect");
    var anchor = overlay || field;

    if (anchor.nextSibling) {
      anchor.parentNode.insertBefore(element, anchor.nextSibling);
    } else {
      anchor.parentNode.appendChild(element);
    }
    return element;
  }

  /** Fields that participate in validation. */
  function fields(form) {
    return UI.qa("input, select, textarea", form).filter(function (field) {
      if (field.disabled || field.type === "hidden" || field.type === "submit") return false;
      if (field.getAttribute("data-ui-validate") === "false") return false;
      // A radio group reports once, on its first member.
      if (field.type === "radio") {
        var first = UI.q('input[type="radio"][name="' + cssEscape(field.name) + '"]', form);
        return first === field;
      }
      return true;
    });
  }

  /** Collects the rules that apply to a field, in the order they should run. */
  function rulesFor(field) {
    var applicable = [];

    if (field.hasAttribute("required")) applicable.push({ name: "required", param: null });

    var value = field.value;
    // Format rules only apply to a non-empty value; `required` covers emptiness.
    if (value !== "") {
      if (field.type === "email") applicable.push({ name: "email", param: null });
      if (field.type === "url") applicable.push({ name: "url", param: null });
      if (field.type === "number") applicable.push({ name: "number", param: null });

      ["min", "max", "minlength", "maxlength", "pattern"].forEach(function (name) {
        if (field.hasAttribute(name)) {
          applicable.push({ name: name, param: field.getAttribute(name) });
        }
      });

      Object.keys(RULES).forEach(function (name) {
        var attribute = "data-ui-rule-" + name.toLowerCase();
        if (field.hasAttribute(attribute)) {
          applicable.push({ name: name, param: field.getAttribute(attribute) });
        }
      });
    }

    return applicable;
  }

  /**
   * Validates one field. Returns null when valid, otherwise the message.
   * A `data-ui-message-<rule>` attribute overrides the translated default.
   */
  function checkField(field) {
    var value = field.type === "checkbox" || field.type === "radio" ? field.value : field.value.trim();

    var applicable = rulesFor(field);
    for (var i = 0; i < applicable.length; i++) {
      var rule = applicable[i];
      var check = RULES[rule.name];
      if (!check) continue;

      var failure = check(value, field, rule.param);
      if (failure) {
        var override = field.getAttribute("data-ui-message-" + rule.name.toLowerCase());
        return override || UI.t(failure.key, failure.vars);
      }
    }

    // Anything the browser knows about that we do not (e.g. `step`).
    if (field.validity && field.validity.badInput) return UI.t("validate.number");

    return null;
  }

  function markInvalid(field, message) {
    field.classList.add("ui-is-invalid");
    field.classList.remove("ui-is-valid");
    field.setAttribute("aria-invalid", "true");

    var feedback = feedbackElement(field);
    feedback.textContent = message;
    if (!feedback.id) feedback.id = UI.uid("ui-err");
    field.setAttribute("aria-describedby", feedback.id);

    // The date pickers hide their backing <input>, so a red border on a
    // display:none element is invisible; mirror the state onto the trigger.
    var wrapper = UI.closest(field, ".ui-date-range, .ui-date-picker, .ui-multiselect");
    if (wrapper) {
      var trigger = UI.q(".ui-date-range-trigger, .ui-multiselect-trigger", wrapper);
      if (trigger) trigger.classList.add("ui-is-invalid");
    }
  }

  function markValid(field) {
    field.classList.remove("ui-is-invalid");
    field.removeAttribute("aria-invalid");

    var wrapper = fieldWrapper(field);
    var feedback = UI.q(".ui-feedback-invalid", wrapper);
    if (feedback) feedback.textContent = "";

    var overlay = UI.closest(field, ".ui-date-range, .ui-date-picker, .ui-multiselect");
    if (overlay) {
      UI.qa(".ui-is-invalid", overlay).forEach(function (element) {
        element.classList.remove("ui-is-invalid");
      });
    }
  }

  function renderSummary(form, errors) {
    var summary = UI.q("[data-ui-validate-summary]", form) ||
      UI.q('[data-ui-validate-summary="' + cssEscape(form.id) + '"]');
    if (!summary) return;

    if (!errors.length) {
      summary.hidden = true;
      summary.innerHTML = "";
      return;
    }

    summary.hidden = false;
    summary.className = "ui-validate-summary";
    summary.setAttribute("role", "alert");
    summary.setAttribute("tabindex", "-1");

    var items = errors.map(function (error) {
      var target = error.element.id || "";
      var label = UI.escape(fieldLabel(error.element));
      var message = UI.escape(error.message);
      return target
        ? '<li><a href="#' + UI.escape(target) + '" data-ui-summary-link="' + UI.escape(target) + '">' +
            label + "</a> — " + message + "</li>"
        : "<li>" + label + " — " + message + "</li>";
    });

    // A standalone flex layout rather than the generic `.ui-alert` grid,
    // which is shaped for icon|body|close-button and squeezes a wide list
    // into whatever the title's natural width leaves over.
    summary.innerHTML =
      '<span class="ui-validate-summary-icon" aria-hidden="true">!</span>' +
      '<div class="ui-validate-summary-body">' +
      '<p class="ui-validate-summary-title">' +
      UI.escape(UI.t("validate.summaryTitle", { count: errors.length })) +
      "</p>" +
      '<ul class="ui-validate-summary-list">' + items.join("") + "</ul>" +
      "</div>";
  }

  function validateForm(form, options) {
    options = options || {};
    var errors = [];

    // `scope` limits validation to one region -- the multi-step wizard uses it
    // so "Next" only gates on the step currently on screen.
    var candidates = fields(form).filter(function (field) {
      return !options.scope || options.scope.contains(field);
    });

    candidates.forEach(function (field) {
      var message = checkField(field);
      if (message) {
        errors.push({ name: field.name, element: field, message: message });
        if (options.silent !== true) markInvalid(field, message);
      } else if (options.silent !== true) {
        markValid(field);
      }
    });

    if (options.silent !== true) {
      renderSummary(form, errors);
      UI.emit(form, "ui:validate", { valid: !errors.length, errors: errors });
    }

    return { valid: errors.length === 0, errors: errors };
  }

  function focusFirstError(form, errors) {
    if (!errors.length) return;
    var summary = UI.q("[data-ui-validate-summary]", form);
    var target = summary && !summary.hidden ? summary : errors[0].element;

    // Prefer the visible trigger when the real control is hidden behind an
    // overlay component.
    if (target === errors[0].element) {
      var overlay = UI.closest(target, ".ui-date-range, .ui-date-picker, .ui-multiselect");
      if (overlay) target = UI.q(".ui-date-range-trigger, .ui-multiselect-trigger", overlay) || target;
    }

    if (target.focus) target.focus();
    if (target.scrollIntoView) target.scrollIntoView({ block: "center", behavior: "smooth" });

    UI.announce(
      UI.t("validate.summaryTitle", { count: errors.length }) + ". " + errors[0].message,
      "assertive"
    );
  }

  /**
   * Applies server-side errors to a form. This is the piece that otherwise
   * gets hand-rolled on every screen: a failed POST returns
   * `{"tin": "Already registered"}` and the messages need to land on the right
   * controls, in the summary, with focus moved.
   */
  function showErrors(form, errors) {
    if (typeof form === "string") form = UI.q(form);
    if (!form || !errors) return { valid: true, errors: [] };

    // Accept {field: message}, {field: [messages]}, or [{field, message}].
    var normalised = [];
    if (Array.isArray(errors)) {
      errors.forEach(function (entry) {
        normalised.push({
          name: entry.field || entry.name,
          message: entry.message || entry.error
        });
      });
    } else {
      Object.keys(errors).forEach(function (name) {
        var message = errors[name];
        normalised.push({ name: name, message: Array.isArray(message) ? message[0] : message });
      });
    }

    var applied = [];
    normalised.forEach(function (entry) {
      var field = UI.q('[name="' + cssEscape(entry.name) + '"]', form) ||
        UI.q("#" + cssEscape(entry.name), form);
      if (!field) return;
      markInvalid(field, entry.message);
      applied.push({ name: entry.name, element: field, message: entry.message });
    });

    renderSummary(form, applied);
    focusFirstError(form, applied);
    UI.emit(form, "ui:validate:server", { errors: applied });

    return { valid: applied.length === 0, errors: applied };
  }

  function clear(form) {
    if (typeof form === "string") form = UI.q(form);
    if (!form) return;
    fields(form).forEach(markValid);
    renderSummary(form, []);
  }

  function build(form) {
    if (form.dataset.uiValidateReady) return;
    form.dataset.uiValidateReady = "true";

    // Let the framework render messages instead of native bubbles.
    form.setAttribute("novalidate", "novalidate");

    var mode = form.getAttribute("data-ui-validate-on") || "submit";
    var submitted = false;

    function revalidate(field) {
      var message = checkField(field);
      if (message) markInvalid(field, message);
      else markValid(field);

      // Keep the summary in step once it is on screen.
      if (submitted) {
        var summary = UI.q("[data-ui-validate-summary]", form);
        if (summary && !summary.hidden) validateForm(form);
      }
    }

    function onBlur(event) {
      var field = event.target;
      if (!field.matches || !field.matches("input, select, textarea")) return;
      if (mode === "submit" && !submitted) return;
      revalidate(field);
    }

    function onInput(event) {
      var field = event.target;
      if (!field.matches || !field.matches("input, select, textarea")) return;
      // Only ever *clear* an error while typing -- flagging a field invalid
      // mid-keystroke is hostile.
      if (field.classList.contains("ui-is-invalid")) revalidate(field);
      else if (mode === "input" && submitted) revalidate(field);
    }

    function onSubmit(event) {
      submitted = true;
      var result = validateForm(form);
      if (!result.valid) {
        event.preventDefault();
        event.stopImmediatePropagation();
        focusFirstError(form, result.errors);
      }
    }

    function onSummaryClick(event) {
      var link = UI.closest(event.target, "[data-ui-summary-link]");
      if (!link) return;
      event.preventDefault();
      var target = document.getElementById(link.getAttribute("data-ui-summary-link"));
      if (target && target.focus) {
        target.focus();
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }

    form.addEventListener("blur", onBlur, true);
    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput);
    // Capture phase so validation runs before save-next/stepper submit handlers.
    form.addEventListener("submit", onSubmit, true);
    form.addEventListener("click", onSummaryClick);

    UI.cleanup(form, function () {
      form.removeEventListener("blur", onBlur, true);
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onInput);
      form.removeEventListener("submit", onSubmit, true);
      form.removeEventListener("click", onSummaryClick);
    });

    var summary = UI.q("[data-ui-validate-summary]", form);
    if (summary) summary.hidden = true;
  }

  function init(root) {
    UI.matchAll("[data-ui-validate]", root).forEach(function (form) {
      if (form.tagName === "FORM") build(form);
    });
  }

  UI.register(init);

  UI.validate = {
    form: validateForm,
    field: checkField,
    showErrors: showErrors,
    clear: clear,
    focusFirst: focusFirstError,
    rules: RULES,
    /** Registers a custom rule usable as `data-ui-rule-<name>`. */
    addRule: function (name, fn) {
      RULES[name] = fn;
      return UI.validate;
    }
  };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Input masking and number formatting.
   *
   * Pattern masks use `9` for a digit, `A` for a letter and `*` for either;
   * every other character is a literal that the mask inserts as you type:
   *
   *   <input data-ui-mask="999-999-999">          tax / national ID
   *   <input data-ui-mask="+99 999 999 999">      international phone
   *   <input data-ui-mask="AAA-9999">             reference code
   *
   * Numeric masks are driven by intent rather than a pattern, because
   * thousands separators move as digits are added:
   *
   *   <input data-ui-mask="currency" data-ui-currency="USD">
   *   <input data-ui-mask="number" data-ui-decimals="2">
   *
   * A masked field posts its formatted value by default. Set
   * `data-ui-mask-raw="true"` to submit the unformatted digits instead, which
   * is usually what a server-side validator wants.
   */

  var TOKENS = {
    "9": /\d/,
    A: /[A-Za-z]/,
    "*": /[A-Za-z0-9]/
  };

  function isToken(character) {
    return Object.prototype.hasOwnProperty.call(TOKENS, character);
  }

  /** Applies `pattern` to `raw`, returning the formatted string. */
  function applyPattern(raw, pattern) {
    var out = "";
    var rawIndex = 0;

    for (var i = 0; i < pattern.length && rawIndex < raw.length; i++) {
      var patternChar = pattern[i];

      if (isToken(patternChar)) {
        // Skip input characters that cannot satisfy this token.
        while (rawIndex < raw.length && !TOKENS[patternChar].test(raw[rawIndex])) rawIndex++;
        if (rawIndex >= raw.length) break;
        out += raw[rawIndex++];
      } else {
        out += patternChar;
        // Let the user type the literal themselves without doubling it.
        if (raw[rawIndex] === patternChar) rawIndex++;
      }
    }

    return out;
  }

  /** Strips everything the pattern would have inserted. */
  function unmaskPattern(value, pattern) {
    var literals = new Set();
    for (var i = 0; i < pattern.length; i++) {
      if (!isToken(pattern[i])) literals.add(pattern[i]);
    }
    return Array.prototype.filter
      .call(value, function (character) {
        return !literals.has(character);
      })
      .join("");
  }

  function localeFor(field) {
    return field.getAttribute("data-ui-locale") || UI.i18n.locale || "en";
  }

  function digitsAndSign(value) {
    var negative = /^-/.test(value.trim());
    var cleaned = value.replace(/[^\d.]/g, "");
    return { negative: negative, cleaned: cleaned };
  }

  function formatNumber(value, field) {
    var decimals = field.hasAttribute("data-ui-decimals")
      ? Number(field.getAttribute("data-ui-decimals"))
      : null;

    var parts = digitsAndSign(value);
    if (!parts.cleaned) return "";

    // Keep only the first decimal point.
    var pieces = parts.cleaned.split(".");
    var whole = pieces.shift();
    var fraction = pieces.join("");

    var options = {};
    if (decimals != null) {
      options.minimumFractionDigits = 0;
      options.maximumFractionDigits = decimals;
      fraction = fraction.slice(0, decimals);
    }

    var wholeFormatted = whole
      ? new Intl.NumberFormat(localeFor(field), options).format(Number(whole))
      : "";

    var out = wholeFormatted;
    // Preserve a trailing "." while the user is mid-entry.
    if (parts.cleaned.indexOf(".") !== -1 && decimals !== 0) {
      out += "." + fraction;
    }
    return (parts.negative ? "-" : "") + out;
  }

  function formatCurrency(value, field) {
    var formatted = formatNumber(value, field);
    if (!formatted) return "";
    var code = field.getAttribute("data-ui-currency");
    if (!code) return formatted;
    var position = field.getAttribute("data-ui-currency-position") || "before";
    return position === "after" ? formatted + " " + code : code + " " + formatted;
  }

  function maskValue(value, field, type) {
    if (type === "number") return formatNumber(value, field);
    if (type === "currency") return formatCurrency(value, field);
    return applyPattern(value, type);
  }

  function rawValue(value, field, type) {
    if (type === "number" || type === "currency") {
      var parts = digitsAndSign(value);
      return (parts.negative ? "-" : "") + parts.cleaned;
    }
    return unmaskPattern(value, type);
  }

  /**
   * Reformatting rewrites the whole value, which would otherwise throw the
   * caret to the end on every keystroke. Counting the value-characters before
   * the caret and re-finding that position in the formatted string keeps it
   * where the user expects, including mid-string edits.
   */
  function caretAfterFormat(formatted, previousCaret, oldValue, type) {
    var isNumeric = type === "number" || type === "currency";
    var significant = isNumeric ? /[\d]/ : /[A-Za-z0-9]/;

    var typedBefore = 0;
    for (var i = 0; i < previousCaret && i < oldValue.length; i++) {
      if (significant.test(oldValue[i])) typedBefore++;
    }

    var seen = 0;
    for (var j = 0; j < formatted.length; j++) {
      if (significant.test(formatted[j])) {
        seen++;
        if (seen === typedBefore) return j + 1;
      }
    }
    return typedBefore === 0 ? 0 : formatted.length;
  }

  function build(field) {
    if (field.dataset.uiMaskReady) return;
    field.dataset.uiMaskReady = "true";

    var type = field.getAttribute("data-ui-mask");
    if (!type) return;

    var submitRaw = field.getAttribute("data-ui-mask-raw") === "true";
    var shadow = null;

    if (submitRaw) {
      // The visible input stops carrying a name; a hidden sibling posts the
      // unformatted value under the original name so the server sees digits.
      shadow = document.createElement("input");
      shadow.type = "hidden";
      shadow.name = field.name;
      field.removeAttribute("name");
      field.parentNode.insertBefore(shadow, field.nextSibling);
    }

    function reformat(preserveCaret) {
      var oldValue = field.value;
      var caret = preserveCaret ? field.selectionStart : null;

      var formatted = maskValue(oldValue, field, type);
      if (formatted !== oldValue) {
        field.value = formatted;
        if (caret != null && field.setSelectionRange) {
          var next = caretAfterFormat(formatted, caret, oldValue, type);
          try {
            field.setSelectionRange(next, next);
          } catch (error) {
            /* not all input types support selection */
          }
        }
      }

      if (shadow) shadow.value = rawValue(field.value, field, type);
    }

    function onInput() {
      reformat(true);
    }

    function onBlur() {
      // On blur, settle a numeric field to its full decimal precision.
      if ((type === "number" || type === "currency") && field.hasAttribute("data-ui-decimals")) {
        var decimals = Number(field.getAttribute("data-ui-decimals"));
        var raw = rawValue(field.value, field, type);
        if (raw !== "" && raw !== "-") {
          field.value = maskValue(Number(raw).toFixed(decimals), field, type);
          if (shadow) shadow.value = rawValue(field.value, field, type);
        }
      }
      reformat(false);
    }

    field.addEventListener("input", onInput);
    field.addEventListener("blur", onBlur);
    field.setAttribute("autocomplete", field.getAttribute("autocomplete") || "off");
    if (type === "number" || type === "currency") {
      field.setAttribute("inputmode", "decimal");
    } else if (/^[9\W]+$/.test(type)) {
      field.setAttribute("inputmode", "numeric");
    }

    UI.cleanup(field, function () {
      field.removeEventListener("input", onInput);
      field.removeEventListener("blur", onBlur);
      if (shadow) {
        field.name = shadow.name;
        shadow.remove();
      }
    });

    field._uiMask = {
      type: type,
      raw: function () { return rawValue(field.value, field, type); },
      set: function (value) {
        field.value = maskValue(String(value), field, type);
        if (shadow) shadow.value = rawValue(field.value, field, type);
      }
    };

    if (field.value) reformat(false);
  }

  function init(root) {
    UI.matchAll("[data-ui-mask]", root).forEach(build);
  }

  UI.register(init);

  UI.mask = {
    apply: applyPattern,
    strip: unmaskPattern,
    /** Reads the unformatted value of a masked field. */
    raw: function (field) {
      if (typeof field === "string") field = UI.q(field);
      return field && field._uiMask ? field._uiMask.raw() : field ? field.value : "";
    },
    /** Sets a masked field's value, formatting it on the way in. */
    set: function (field, value) {
      if (typeof field === "string") field = UI.q(field);
      if (field && field._uiMask) field._uiMask.set(value);
      else if (field) field.value = value;
    },
    /** Standalone number formatting, for rendering totals outside an input. */
    format: function (value, options) {
      options = options || {};
      var formatter = new Intl.NumberFormat(options.locale || UI.i18n.locale, {
        minimumFractionDigits: options.decimals != null ? options.decimals : 0,
        maximumFractionDigits: options.decimals != null ? options.decimals : 2
      });
      var out = formatter.format(Number(value) || 0);
      if (!options.currency) return out;
      return options.position === "after"
        ? out + " " + options.currency
        : options.currency + " " + out;
    }
  };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Single-select combobox with type-ahead, over either a local <select> or a
   * remote endpoint.
   *
   *   <select data-ui-combobox>…</select>                     filter in place
   *   <select data-ui-combobox data-ui-url="/api/customers"></select>   remote
   *
   * The remote contract is deliberately loose: the endpoint receives `?q=<term>`
   * and may return either `[{value, label, hint}]` or `{results: [...]}`.
   * `data-ui-value-key` / `data-ui-label-key` map other shapes without needing
   * a server change.
   *
   * The backing <select> is kept in sync throughout, so the field posts
   * normally in a server-rendered form and existing validation still sees it.
   */

  var MIN_CHARS = 2;
  var DEBOUNCE = 250;

  function optionFrom(item, valueKey, labelKey) {
    if (typeof item === "string") return { value: item, label: item, hint: "" };
    return {
      value: String(item[valueKey] != null ? item[valueKey] : item.value),
      label: String(item[labelKey] != null ? item[labelKey] : item.label),
      hint: item.hint || item.description || ""
    };
  }

  function build(select) {
    if (select.dataset.uiComboboxReady) return;
    select.dataset.uiComboboxReady = "true";

    var url = select.getAttribute("data-ui-url");
    var valueKey = select.getAttribute("data-ui-value-key") || "value";
    var labelKey = select.getAttribute("data-ui-label-key") || "label";
    var minChars = select.hasAttribute("data-ui-min-chars")
      ? Number(select.getAttribute("data-ui-min-chars"))
      : (url ? MIN_CHARS : 0);
    var allowClear = select.getAttribute("data-ui-allow-clear") !== "false";

    select.classList.add("ui-combobox-native");

    var wrapper = document.createElement("div");
    wrapper.className = "ui-combobox";
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    var control = document.createElement("div");
    control.className = "ui-combobox-control";

    var input = document.createElement("input");
    input.type = "text";
    input.className = "ui-control ui-combobox-input";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.autocomplete = "off";
    input.placeholder =
      select.getAttribute("data-ui-placeholder") ||
      (url ? UI.t("combobox.hint") : UI.t("select.placeholder"));
    if (select.disabled) input.disabled = true;
    if (select.hasAttribute("required")) input.setAttribute("aria-required", "true");

    var clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "ui-combobox-clear";
    clearButton.setAttribute("aria-label", UI.t("select.clear"));
    clearButton.innerHTML = "&times;";
    clearButton.hidden = true;

    // Purely decorative: signals "this opens a list" the way a native
    // <select>'s platform arrow does, and flips when the menu is open.
    var chevron = document.createElement("span");
    chevron.className = "ui-combobox-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.innerHTML =
      '<svg viewBox="0 0 12 8" width="10" height="7" fill="none"><path d="M1 1.5L6 6.5L11 1.5" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var listbox = document.createElement("div");
    listbox.className = "ui-combobox-menu";
    listbox.setAttribute("role", "listbox");
    listbox.id = UI.uid("ui-combobox");
    listbox.hidden = true;
    input.setAttribute("aria-controls", listbox.id);

    control.appendChild(input);
    if (allowClear) control.appendChild(clearButton);
    control.appendChild(chevron);
    wrapper.appendChild(control);
    wrapper.appendChild(listbox);

    var options = [];
    var activeIndex = -1;
    var open = false;
    var floatCleanup = null;
    var debounceTimer = null;
    var requestToken = 0;

    function localOptions() {
      return Array.prototype.map.call(select.options, function (option) {
        return { value: option.value, label: option.text, hint: "" };
      }).filter(function (option) {
        return option.value !== "";
      });
    }

    function selectedOption() {
      var option = select.options[select.selectedIndex];
      return option && option.value ? { value: option.value, label: option.text } : null;
    }

    function syncInputToSelection() {
      var current = selectedOption();
      input.value = current ? current.label : "";
      clearButton.hidden = !current || !allowClear;
    }

    function setSelection(option) {
      // Remote results are not in the <select>, so add on demand.
      if (option && !Array.prototype.some.call(select.options, function (existing) {
        return existing.value === option.value;
      })) {
        var element = document.createElement("option");
        element.value = option.value;
        element.text = option.label;
        select.appendChild(element);
      }

      select.value = option ? option.value : "";
      syncInputToSelection();
      select.dispatchEvent(new Event("change", { bubbles: true }));
      UI.emit(wrapper, "ui:combobox:change", { value: select.value, option: option });
    }

    function renderMessage(text, modifier) {
      listbox.innerHTML =
        '<div class="ui-combobox-message' + (modifier ? " " + modifier : "") + '">' +
        UI.escape(text) + "</div>";
    }

    function renderOptions() {
      if (!options.length) {
        renderMessage(UI.t("combobox.empty"));
        return;
      }

      listbox.innerHTML = options
        .map(function (option, index) {
          return (
            '<div class="ui-combobox-option" role="option" id="' +
            listbox.id + "-" + index + '" data-index="' + index + '"' +
            ' aria-selected="' + (option.value === select.value ? "true" : "false") + '">' +
            '<span class="ui-combobox-option-text">' +
            '<span class="ui-combobox-option-label">' + UI.escape(option.label) + "</span>" +
            (option.hint
              ? '<span class="ui-combobox-option-hint">' + UI.escape(option.hint) + "</span>"
              : "") +
            "</span>" +
            '<span class="ui-combobox-option-check" aria-hidden="true">' +
            '<svg viewBox="0 0 16 12" width="13" height="10" fill="none">' +
            '<path d="M1 6L5.5 10.5L15 1" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
            "</div>"
          );
        })
        .join("");
    }

    function setActive(index) {
      activeIndex = index;
      UI.qa(".ui-combobox-option", listbox).forEach(function (element, i) {
        element.classList.toggle("ui-active", i === index);
      });

      if (index >= 0) {
        input.setAttribute("aria-activedescendant", listbox.id + "-" + index);
        var active = UI.q(".ui-combobox-option.ui-active", listbox);
        if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function openMenu() {
      if (open) return;
      open = true;
      listbox.hidden = false;
      input.setAttribute("aria-expanded", "true");
      wrapper.classList.add("ui-open");
      floatCleanup = UI.floatPanel(control, listbox, { matchWidth: true, onDismiss: closeMenu });
    }

    function closeMenu() {
      if (!open) return;
      open = false;
      listbox.hidden = true;
      input.setAttribute("aria-expanded", "false");
      wrapper.classList.remove("ui-open");
      setActive(-1);
      if (floatCleanup) {
        floatCleanup();
        floatCleanup = null;
      }
    }

    function search(term) {
      if (!url) {
        var needle = term.trim().toLowerCase();
        options = localOptions().filter(function (option) {
          return !needle || option.label.toLowerCase().indexOf(needle) !== -1;
        });
        renderOptions();
        setActive(options.length ? 0 : -1);
        openMenu();
        return;
      }

      if (term.trim().length < minChars) {
        options = [];
        renderMessage(UI.t("combobox.hint"));
        openMenu();
        return;
      }

      var token = ++requestToken;
      renderMessage(UI.t("combobox.loading"), "ui-combobox-loading");
      openMenu();

      var endpoint = url + (url.indexOf("?") === -1 ? "?" : "&") + "q=" + encodeURIComponent(term);

      fetch(endpoint, { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" } })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (data) {
          // A slower earlier request must not overwrite a newer one's results.
          if (token !== requestToken) return;
          var list = Array.isArray(data) ? data : data.results || data.items || [];
          options = list.map(function (item) {
            return optionFrom(item, valueKey, labelKey);
          });
          renderOptions();
          setActive(options.length ? 0 : -1);
          UI.emit(wrapper, "ui:combobox:results", { term: term, count: options.length });
        })
        .catch(function (error) {
          if (token !== requestToken) return;
          options = [];
          renderMessage(UI.t("combobox.error"), "ui-combobox-error");
          UI.emit(wrapper, "ui:combobox:error", { term: term, error: error });
        });
    }

    function onInput() {
      var term = input.value;
      clearButton.hidden = !term || !allowClear;

      // Typing past a committed selection invalidates it.
      if (select.value && term !== (selectedOption() || {}).label) {
        select.value = "";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }

      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(function () {
        search(term);
      }, url ? DEBOUNCE : 0);
    }

    function commitActive() {
      if (activeIndex < 0 || !options[activeIndex]) return false;
      setSelection(options[activeIndex]);
      closeMenu();
      return true;
    }

    function onKeydown(event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!open) return search(input.value);
        setActive(Math.min(activeIndex + 1, options.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
      } else if (event.key === "Enter") {
        if (open && commitActive()) event.preventDefault();
      } else if (event.key === "Escape") {
        if (open) {
          closeMenu();
          event.stopImmediatePropagation();
        }
      } else if (event.key === "Tab") {
        closeMenu();
      }
    }

    function onOptionClick(event) {
      var option = UI.closest(event.target, ".ui-combobox-option");
      if (!option) return;
      setActive(Number(option.getAttribute("data-index")));
      commitActive();
      input.focus();
    }

    function onClear() {
      setSelection(null);
      input.value = "";
      clearButton.hidden = true;
      input.focus();
      closeMenu();
    }

    function onBlur() {
      // Leaving with text that was never committed reverts to the selection,
      // so the visible text can never disagree with what will be posted.
      window.setTimeout(function () {
        if (wrapper.contains(document.activeElement)) return;
        closeMenu();
        syncInputToSelection();
      }, 120);
    }

    function onDocumentClick(event) {
      if (!wrapper.contains(event.target)) closeMenu();
    }

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKeydown);
    input.addEventListener("blur", onBlur);
    input.addEventListener("focus", function () {
      if (!url && !open) search(input.value);
    });
    // A click on an already-focused input (the common case right after
    // picking a value) does not re-fire "focus", so without this the menu
    // only ever reopens after the field loses and regains focus first.
    // Re-show whatever was last fetched rather than issuing a fresh remote
    // query merely because the field was clicked.
    input.addEventListener("click", function () {
      if (open) return;
      if (!url) {
        search(input.value);
        return;
      }
      openMenu();
      if (options.length) renderOptions();
      else renderMessage(input.value.trim().length < minChars ? UI.t("combobox.hint") : UI.t("combobox.empty"));
    });
    listbox.addEventListener("mousedown", function (event) {
      // Prevent the input losing focus before the click resolves.
      event.preventDefault();
    });
    listbox.addEventListener("click", onOptionClick);
    clearButton.addEventListener("click", onClear);
    document.addEventListener("click", onDocumentClick);

    UI.cleanup(wrapper, function () {
      window.clearTimeout(debounceTimer);
      document.removeEventListener("click", onDocumentClick);
      if (floatCleanup) floatCleanup();
    });

    syncInputToSelection();

    wrapper._uiCombobox = {
      select: setSelection,
      clear: function () { setSelection(null); },
      value: function () { return select.value; }
    };
  }

  function init(root) {
    UI.matchAll("select[data-ui-combobox]", root).forEach(build);
  }

  UI.register(init);

  UI.combobox = {
    /** Programmatically set a combobox's selection. */
    set: function (target, option) {
      var wrapper = typeof target === "string" ? UI.q(target) : target;
      if (wrapper && !wrapper._uiCombobox) wrapper = UI.closest(wrapper, ".ui-combobox");
      if (wrapper && wrapper._uiCombobox) wrapper._uiCombobox.select(option);
    },
    clear: function (target) {
      var wrapper = typeof target === "string" ? UI.q(target) : target;
      if (wrapper && !wrapper._uiCombobox) wrapper = UI.closest(wrapper, ".ui-combobox");
      if (wrapper && wrapper._uiCombobox) wrapper._uiCombobox.clear();
    }
  };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Dependency-free SVG charts.
   *
   *   <div data-ui-chart="bar"  data-ui-values="12,19,3" data-ui-labels="Jan,Feb,Mar"></div>
   *   <div data-ui-chart="line" data-ui-values="…"></div>
   *   <div data-ui-chart="area" data-ui-values="…"></div>
   *   <div data-ui-chart="donut" data-ui-values="…" data-ui-labels="…"></div>
   *   <span data-ui-chart="sparkline" data-ui-values="…"></span>
   *
   * `bar` also takes `data-ui-orientation="horizontal"`, single- or
   * multi-series. `area` is `line` with a deliberate gradient fill rather
   * than the line chart's incidental one -- use it when the filled shape
   * itself is the point.
   *
   * A flat `data-ui-values` list only ever holds one series. For grouped or
   * stacked bars, multi-line comparisons, or stacked areas, give the element
   * a JSON data island instead -- everything else about it (type, title,
   * height, currency formatting) stays the same:
   *
   *   <div data-ui-chart="bar" data-ui-stacked data-ui-legend>
   *     <script type="application/json">
   *       {"labels": ["Jan","Feb","Mar"],
   *        "series": [{"name": "North", "values": [12,19,3]},
   *                    {"name": "South", "values": [8,11,9]}]}
   *     </script>
   *   </div>
   *
   * Drop `data-ui-stacked` for side-by-side grouped bars instead of stacked
   * segments (bars only -- `data-ui-chart="area"` with a JSON data island is
   * always stacked, and `data-ui-chart="line"` is always separate lines).
   * `UI.chart.update(target, data)` accepts the same shape for live updates,
   * so a chart fed from an API does not need to hand-build a comma-separated
   * string.
   *
   * Scope is deliberately narrow: these cover the "how many records by
   * status / by month" panels a typical dashboard needs. Anything
   * requiring zooming, brushing or real-time streaming wants a charting
   * library, and this does not pretend otherwise.
   *
   * Every chart renders `role="img"` with a generated `aria-label`, plus a
   * visually-hidden data table. A chart nobody can read is not a chart, and a
   * bare <svg> is invisible to a screen reader and to print.
   */

  var PALETTE = [
    "var(--ui-chart-1)", "var(--ui-chart-2)", "var(--ui-chart-3)",
    "var(--ui-chart-4)", "var(--ui-chart-5)", "var(--ui-chart-6)"
  ];

  function numbers(element) {
    return (element.getAttribute("data-ui-values") || "")
      .split(",")
      .map(function (value) { return parseFloat(value.trim()); })
      .filter(function (value) { return isFinite(value); });
  }

  function labels(element, count) {
    var given = (element.getAttribute("data-ui-labels") || "")
      .split(",")
      .map(function (value) { return value.trim(); })
      .filter(Boolean);
    var out = [];
    for (var i = 0; i < count; i++) out.push(given[i] || String(i + 1));
    return out;
  }

  function formatValue(element, value) {
    if (element.hasAttribute("data-ui-format-currency")) {
      return UI.mask.format(value, {
        currency: element.getAttribute("data-ui-format-currency"),
        decimals: 0
      });
    }
    return UI.mask ? UI.mask.format(value, { decimals: 0 }) : String(value);
  }

  /** Visually-hidden table so the numbers are readable, selectable and printable. */
  function dataTable(element, values, names) {
    var rows = values.map(function (value, index) {
      return "<tr><th scope=\"row\">" + UI.escape(names[index]) + "</th><td>" +
        UI.escape(formatValue(element, value)) + "</td></tr>";
    }).join("");

    return '<table class="ui-sr-only ui-chart-data"><caption>' +
      UI.escape(element.getAttribute("data-ui-title") || "Chart data") +
      "</caption><tbody>" + rows + "</tbody></table>";
  }

  function summary(element, values, names) {
    var title = element.getAttribute("data-ui-title") || "Chart";
    var parts = values.map(function (value, index) {
      return names[index] + " " + formatValue(element, value);
    });
    return title + ": " + parts.join(", ");
  }

  function svgOpen(viewBox, extraClass) {
    return '<svg class="ui-chart-svg' + (extraClass ? " " + extraClass : "") +
      '" viewBox="' + viewBox + '" preserveAspectRatio="none" focusable="false" aria-hidden="true">';
  }

  // ------------------------------------------------------------------ bar

  function renderBar(element, values, names) {
    var width = 100;
    var height = Number(element.getAttribute("data-ui-height")) || 40;
    var max = Math.max.apply(null, values.concat([0]));
    var gap = values.length > 1 ? 1.5 : 0;
    var barWidth = (width - gap * (values.length - 1)) / values.length;
    var horizontal = element.getAttribute("data-ui-orientation") === "horizontal";

    // One series, one colour. Cycling the palette across the bars of a single
    // series reads as six categories rather than six months -- colour should
    // only vary where it means something. `data-ui-multicolour` opts in for
    // genuinely categorical bars.
    var multicolour = element.hasAttribute("data-ui-multicolour");

    var bars = values.map(function (value, index) {
      var ratio = max > 0 ? value / max : 0;
      var color = multicolour ? PALETTE[index % PALETTE.length] : PALETTE[0];

      if (horizontal) {
        var rowHeight = (height - gap * (values.length - 1)) / values.length;
        return '<rect x="0" y="' + (index * (rowHeight + gap)).toFixed(2) +
          '" width="' + (ratio * width).toFixed(2) + '" height="' + rowHeight.toFixed(2) +
          '" fill="' + color + '" rx="0.6"><title>' + UI.escape(names[index] + ": " +
          formatValue(element, value)) + "</title></rect>";
      }

      var barHeight = ratio * height;
      return '<rect x="' + (index * (barWidth + gap)).toFixed(2) +
        '" y="' + (height - barHeight).toFixed(2) +
        '" width="' + barWidth.toFixed(2) + '" height="' + barHeight.toFixed(2) +
        '" fill="' + color + '" rx="0.6"><title>' + UI.escape(names[index] + ": " +
        formatValue(element, value)) + "</title></rect>";
    }).join("");

    return svgOpen("0 0 " + width + " " + height) + bars + "</svg>";
  }

  // ----------------------------------------------------------------- line

  function linePoints(values, width, height, max, min) {
    var span = max - min || 1;
    var step = values.length > 1 ? width / (values.length - 1) : 0;
    return values.map(function (value, index) {
      var x = index * step;
      var y = height - ((value - min) / span) * height;
      return x.toFixed(2) + "," + y.toFixed(2);
    });
  }

  function renderLine(element, values, names, sparkline) {
    var width = 100;
    var height = Number(element.getAttribute("data-ui-height")) || (sparkline ? 20 : 40);
    var max = Math.max.apply(null, values);
    var min = element.hasAttribute("data-ui-zero-based") ? 0 : Math.min.apply(null, values);
    var points = linePoints(values, width, height, max, min);

    var area = "";
    if (!sparkline || element.hasAttribute("data-ui-area")) {
      area = '<polygon points="0,' + height + " " + points.join(" ") + " " + width + "," + height +
        '" fill="var(--ui-chart-1)" opacity="0.12"/>';
    }

    var dots = sparkline
      ? ""
      : values.map(function (value, index) {
          var parts = points[index].split(",");
          return '<circle cx="' + parts[0] + '" cy="' + parts[1] +
            '" r="1.2" fill="var(--ui-chart-1)"><title>' +
            UI.escape(names[index] + ": " + formatValue(element, value)) + "</title></circle>";
        }).join("");

    return svgOpen("0 0 " + width + " " + height, sparkline ? "ui-chart-sparkline-svg" : "") +
      area +
      '<polyline points="' + points.join(" ") +
      '" fill="none" stroke="var(--ui-chart-1)" stroke-width="1.5" ' +
      'stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      dots +
      "</svg>";
  }

  // ---------------------------------------------------------------- donut

  function renderDonut(element, values, names) {
    var total = values.reduce(function (sum, value) { return sum + value; }, 0);
    var radius = 15.915494;   // circumference 100, so dash lengths are percentages
    var thickness = Number(element.getAttribute("data-ui-thickness")) || 4;
    var offset = 25;          // start at 12 o'clock

    var segments = values.map(function (value, index) {
      var percent = total > 0 ? (value / total) * 100 : 0;
      var circle = '<circle class="ui-chart-segment" cx="21" cy="21" r="' + radius +
        '" fill="none" stroke="' + PALETTE[index % PALETTE.length] +
        '" stroke-width="' + thickness +
        '" stroke-dasharray="' + percent.toFixed(2) + " " + (100 - percent).toFixed(2) +
        '" stroke-dashoffset="' + offset.toFixed(2) + '"><title>' +
        UI.escape(names[index] + ": " + formatValue(element, value)) + "</title></circle>";
      // Dash offsets run backwards around the circle.
      offset -= percent;
      return circle;
    }).join("");

    var centre = "";
    var centreLabel = element.getAttribute("data-ui-centre") || element.getAttribute("data-ui-center");
    if (centreLabel) {
      centre = '<text x="21" y="21" class="ui-chart-centre" text-anchor="middle" ' +
        'dominant-baseline="central">' + UI.escape(centreLabel) + "</text>";
    }

    return '<svg class="ui-chart-svg ui-chart-donut-svg" viewBox="0 0 42 42" ' +
      'focusable="false" aria-hidden="true">' +
      '<circle cx="21" cy="21" r="' + radius + '" fill="none" stroke="var(--ui-surface-muted)" ' +
      'stroke-width="' + thickness + '"/>' + segments + centre + "</svg>";
  }

  // ------------------------------------------------------- multi-series

  // A second, additive data source for grouped/stacked bars and multi-line
  // comparisons: a `data-ui-values` attribute can only ever hold one flat
  // list of numbers, which has no room for more than one named series. A
  // `<script type="application/json">` child holds `{labels, series}`
  // instead, where `series` is `[{name, values}, ...]`. Returns null (and
  // build() falls back to the single-series, attribute-based path below,
  // completely unchanged) when no such script is present or it does not
  // parse -- this is additive, not a replacement.
  function parseSeries(element) {
    var script = element.querySelector('script[type="application/json"]');
    if (!script) return null;

    var json;
    try {
      json = JSON.parse(script.textContent || "{}");
    } catch (error) {
      return null;
    }
    if (!json || !Array.isArray(json.series) || !json.series.length) return null;

    var series = json.series.map(function (item, index) {
      return {
        name: (item && item.name) || ("Series " + (index + 1)),
        values: ((item && item.values) || [])
          .map(function (value) { return parseFloat(value); })
          .filter(function (value) { return isFinite(value); })
      };
    });
    var categories = (json.labels || []).map(String);
    return { series: series, categories: categories };
  }

  function barRect(x, y, w, h, color, title) {
    return '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) +
      '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) +
      '" fill="' + color + '" rx="0.4"><title>' + UI.escape(title) + "</title></rect>";
  }

  function renderGroupedBar(element, series, categories, stacked) {
    var width = 100;
    var height = Number(element.getAttribute("data-ui-height")) || 40;
    var horizontal = element.getAttribute("data-ui-orientation") === "horizontal";
    var groups = categories.length;
    var seriesCount = series.length;
    if (!groups || !seriesCount) return svgOpen("0 0 " + width + " " + height) + "</svg>";

    var groupGap = groups > 1 ? 1.5 : 0;
    var mainAxis = horizontal ? height : width;
    var groupSize = (mainAxis - groupGap * (groups - 1)) / groups;
    var crossAxis = horizontal ? width : height;

    var max = 0;
    for (var g = 0; g < groups; g++) {
      if (stacked) {
        var sum = 0;
        for (var s = 0; s < seriesCount; s++) sum += (series[s].values[g] || 0);
        max = Math.max(max, sum);
      } else {
        for (var s2 = 0; s2 < seriesCount; s2++) max = Math.max(max, series[s2].values[g] || 0);
      }
    }

    var rects = [];
    for (var gi = 0; gi < groups; gi++) {
      var groupStart = gi * (groupSize + groupGap);

      if (stacked) {
        var cumulative = 0;
        for (var si = 0; si < seriesCount; si++) {
          var value = series[si].values[gi] || 0;
          var ratio = max > 0 ? value / max : 0;
          var segSize = ratio * crossAxis;
          var title = series[si].name + " – " + categories[gi] + ": " + formatValue(element, value);
          rects.push(horizontal
            ? barRect(cumulative, groupStart, segSize, groupSize, PALETTE[si % PALETTE.length], title)
            : barRect(groupStart, height - cumulative - segSize, groupSize, segSize, PALETTE[si % PALETTE.length], title));
          cumulative += segSize;
        }
      } else {
        var barGap = seriesCount > 1 ? 0.4 : 0;
        var barSize = (groupSize - barGap * (seriesCount - 1)) / seriesCount;
        for (var sj = 0; sj < seriesCount; sj++) {
          var value2 = series[sj].values[gi] || 0;
          var ratio2 = max > 0 ? value2 / max : 0;
          var segSize2 = ratio2 * crossAxis;
          var barStart = groupStart + sj * (barSize + barGap);
          var title2 = series[sj].name + " – " + categories[gi] + ": " + formatValue(element, value2);
          rects.push(horizontal
            ? barRect(0, barStart, segSize2, barSize, PALETTE[sj % PALETTE.length], title2)
            : barRect(barStart, height - segSize2, barSize, segSize2, PALETTE[sj % PALETTE.length], title2));
        }
      }
    }

    return svgOpen("0 0 " + width + " " + height) + rects.join("") + "</svg>";
  }

  function renderMultiLine(element, series, categories) {
    var width = 100;
    var height = Number(element.getAttribute("data-ui-height")) || 40;
    var allValues = [].concat.apply([], series.map(function (s) { return s.values; }));
    var max = Math.max.apply(null, allValues.concat([0]));
    var min = element.hasAttribute("data-ui-zero-based") ? 0 : Math.min.apply(null, allValues.concat([0]));

    var polylines = series.map(function (s, index) {
      var points = linePoints(s.values, width, height, max, min);
      var color = PALETTE[index % PALETTE.length];
      var dots = points.map(function (point, i) {
        var parts = point.split(",");
        return '<circle cx="' + parts[0] + '" cy="' + parts[1] + '" r="1.1" fill="' + color + '"><title>' +
          UI.escape(s.name + " – " + (categories[i] || "") + ": " + formatValue(element, s.values[i])) +
          "</title></circle>";
      }).join("");
      return '<polyline points="' + points.join(" ") + '" fill="none" stroke="' + color +
        '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" ' +
        'vector-effect="non-scaling-stroke"/>' + dots;
    }).join("");

    return svgOpen("0 0 " + width + " " + height) + polylines + "</svg>";
  }

  function renderSeriesLegend(element, series) {
    if (!element.hasAttribute("data-ui-legend")) return "";
    var items = series.map(function (s, index) {
      return '<li class="ui-chart-legend-item">' +
        '<span class="ui-chart-swatch" data-ui-swatch="' + (index % PALETTE.length) + '"></span>' +
        '<span class="ui-chart-legend-label">' + UI.escape(s.name) + "</span></li>";
    }).join("");
    return '<ul class="ui-chart-legend">' + items + "</ul>";
  }

  function multiDataTable(element, series, categories) {
    var head = "<tr><th></th>" + series.map(function (s) {
      return "<th>" + UI.escape(s.name) + "</th>";
    }).join("") + "</tr>";
    var rows = categories.map(function (category, i) {
      return "<tr><th scope=\"row\">" + UI.escape(category) + "</th>" +
        series.map(function (s) {
          return "<td>" + UI.escape(formatValue(element, s.values[i] || 0)) + "</td>";
        }).join("") + "</tr>";
    }).join("");

    return '<table class="ui-sr-only ui-chart-data"><caption>' +
      UI.escape(element.getAttribute("data-ui-title") || "Chart data") +
      "</caption><thead>" + head + "</thead><tbody>" + rows + "</tbody></table>";
  }

  function multiSummary(element, series, categories) {
    var title = element.getAttribute("data-ui-title") || "Chart";
    var parts = series.map(function (s) {
      return s.name + ": " + s.values.map(function (value, i) {
        return (categories[i] || "") + " " + formatValue(element, value);
      }).join(", ");
    });
    return title + ". " + parts.join(". ");
  }

  // ---------------------------------------------------------------- legend

  // ------------------------------------------------------------------ area

  // A more deliberate fill than the line chart's whisper-thin default tint
  // (opacity .12) -- a gradient fading from the series colour to transparent,
  // for when the filled area itself is the point rather than an incidental
  // backdrop to the line.
  function renderArea(element, values, names) {
    var width = 100;
    var height = Number(element.getAttribute("data-ui-height")) || 40;
    var max = Math.max.apply(null, values);
    var min = element.hasAttribute("data-ui-zero-based") ? 0 : Math.min.apply(null, values);
    var points = linePoints(values, width, height, max, min);
    var gradientId = UI.uid("ui-chart-area");

    var dots = values.map(function (value, index) {
      var parts = points[index].split(",");
      return '<circle cx="' + parts[0] + '" cy="' + parts[1] +
        '" r="1.2" fill="var(--ui-chart-1)"><title>' +
        UI.escape(names[index] + ": " + formatValue(element, value)) + "</title></circle>";
    }).join("");

    return svgOpen("0 0 " + width + " " + height) +
      '<defs><linearGradient id="' + gradientId + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--ui-chart-1)" stop-opacity="0.45"/>' +
      '<stop offset="100%" stop-color="var(--ui-chart-1)" stop-opacity="0.03"/>' +
      "</linearGradient></defs>" +
      '<polygon points="0,' + height + " " + points.join(" ") + " " + width + "," + height +
      '" fill="url(#' + gradientId + ')"/>' +
      '<polyline points="' + points.join(" ") +
      '" fill="none" stroke="var(--ui-chart-1)" stroke-width="1.5" ' +
      'stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      dots + "</svg>";
  }

  // Stacked multi-series area: each series is a band between its own
  // cumulative baseline and the baseline of everything stacked below it, so
  // the top edge of the last series traces the combined total.
  function renderMultiArea(element, series, categories) {
    var width = 100;
    var height = Number(element.getAttribute("data-ui-height")) || 40;
    var groups = categories.length;
    var seriesCount = series.length;
    if (!groups || !seriesCount) return svgOpen("0 0 " + width + " " + height) + "</svg>";

    var max = 0;
    for (var g = 0; g < groups; g++) {
      var sum = 0;
      for (var s = 0; s < seriesCount; s++) sum += (series[s].values[g] || 0);
      max = Math.max(max, sum);
    }

    var step = groups > 1 ? width / (groups - 1) : 0;
    var baseline = new Array(groups).fill(0);
    var layers = [];

    series.forEach(function (s, index) {
      var topPoints = [];
      var bottomPoints = [];
      for (var i = 0; i < groups; i++) {
        var value = s.values[i] || 0;
        var top = baseline[i] + value;
        var x = (i * step).toFixed(2);
        topPoints.push(x + "," + (max > 0 ? (height - (top / max) * height).toFixed(2) : height.toFixed(2)));
        bottomPoints.push(x + "," + (max > 0 ? (height - (baseline[i] / max) * height).toFixed(2) : height.toFixed(2)));
        baseline[i] = top;
      }

      var color = PALETTE[index % PALETTE.length];
      var polygonPoints = topPoints.concat(bottomPoints.slice().reverse()).join(" ");
      layers.push('<polygon points="' + polygonPoints + '" fill="' + color + '" opacity="0.55"><title>' +
        UI.escape(s.name) + "</title></polygon>");
      layers.push('<polyline points="' + topPoints.join(" ") + '" fill="none" stroke="' + color +
        '" stroke-width="1.25" vector-effect="non-scaling-stroke"/>');
    });

    return svgOpen("0 0 " + width + " " + height) + layers.join("") + "</svg>";
  }

  function renderLegend(element, values, names) {
    if (!element.hasAttribute("data-ui-legend")) return "";
    var total = values.reduce(function (sum, value) { return sum + value; }, 0);

    var items = values.map(function (value, index) {
      var percent = total > 0 ? Math.round((value / total) * 100) : 0;
      return '<li class="ui-chart-legend-item">' +
        '<span class="ui-chart-swatch" data-ui-swatch="' + (index % PALETTE.length) + '"></span>' +
        '<span class="ui-chart-legend-label">' + UI.escape(names[index]) + "</span>" +
        '<span class="ui-chart-legend-value">' + UI.escape(formatValue(element, value)) +
        (element.hasAttribute("data-ui-legend-percent") ? " (" + percent + "%)" : "") +
        "</span></li>";
    }).join("");

    return '<ul class="ui-chart-legend">' + items + "</ul>";
  }

  function build(element) {
    if (element.dataset.uiChartReady) return;
    element.dataset.uiChartReady = "true";

    var type = element.getAttribute("data-ui-chart") || "bar";
    var multi = parseSeries(element);

    if (multi) {
      var hasValues = multi.series.some(function (s) { return s.values.length; });
      if (!hasValues) return;

      var mbody;
      if (type === "line") mbody = renderMultiLine(element, multi.series, multi.categories);
      else if (type === "area") mbody = renderMultiArea(element, multi.series, multi.categories);
      else mbody = renderGroupedBar(element, multi.series, multi.categories, element.hasAttribute("data-ui-stacked"));

      element.classList.add("ui-chart", "ui-chart-" + type, "ui-chart-multi");
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", multiSummary(element, multi.series, multi.categories));

      // The multi-series data lives in a <script> child (see parseSeries
      // above), and this innerHTML assignment would otherwise discard it
      // along with the previous render -- fine the first time build() runs
      // off markup that already has one, but it means any *second*
      // re-render that isn't routed through UI.chart.update() (which
      // recreates the script itself) finds no data and silently renders
      // nothing. Detach it before clearing the element and reattach it
      // after, so the chart can be reinitialised by ordinary means
      // (UI.destroy()+UI.init(), a MutationObserver-driven UI.observe()
      // region, etc.) as many times as needed.
      var dataScript = element.querySelector('script[type="application/json"]');
      element.innerHTML = mbody +
        renderSeriesLegend(element, multi.series) +
        multiDataTable(element, multi.series, multi.categories);
      if (dataScript) element.appendChild(dataScript);

      UI.emit(element, "ui:chart:rendered", { type: type, series: multi.series });
      return;
    }

    var values = numbers(element);
    if (!values.length) return;
    var names = labels(element, values.length);

    var body;
    if (type === "donut" || type === "pie") body = renderDonut(element, values, names);
    else if (type === "line") body = renderLine(element, values, names, false);
    else if (type === "sparkline") body = renderLine(element, values, names, true);
    else if (type === "area") body = renderArea(element, values, names);
    else body = renderBar(element, values, names);

    element.classList.add("ui-chart", "ui-chart-" + type);
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", summary(element, values, names));
    element.innerHTML = body + renderLegend(element, values, names) + dataTable(element, values, names);

    UI.emit(element, "ui:chart:rendered", { type: type, values: values });
  }

  function init(root) {
    UI.matchAll("[data-ui-chart]", root).forEach(build);
  }

  UI.register(init);

  UI.chart = {
    /**
     * Replaces a chart's data and re-renders it in place.
     *
     *   UI.chart.update("#c", [5, 10, 15], ["X", "Y", "Z"]);            single series
     *   UI.chart.update("#c", { labels: [...], series: [{name, values}, ...] });   multi
     */
    update: function (target, valuesOrData, names) {
      var element = typeof target === "string" ? UI.q(target) : target;
      if (!element) return;

      if (valuesOrData && !Array.isArray(valuesOrData) && typeof valuesOrData === "object") {
        var script = element.querySelector('script[type="application/json"]');
        if (!script) {
          script = document.createElement("script");
          script.type = "application/json";
          element.appendChild(script);
        }
        script.textContent = JSON.stringify({
          labels: valuesOrData.labels || [],
          series: valuesOrData.series || []
        });
        element.removeAttribute("data-ui-values");
        element.removeAttribute("data-ui-labels");
      } else {
        element.setAttribute("data-ui-values", valuesOrData.join(","));
        if (names) element.setAttribute("data-ui-labels", names.join(","));
      }

      delete element.dataset.uiChartReady;
      build(element);
    }
  };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Copy to clipboard.
   *
   *   <button data-ui-copy="REF-2026-0184">Copy reference</button>
   *   <button data-ui-copy-target="#account">Copy account number</button>
   *
   * Confirmation goes through both a transient label swap (for sighted users)
   * and UI.announce (for screen-reader users) -- a silent copy leaves people
   * unsure whether the click registered.
   */

  var FEEDBACK_MS = 1600;

  function textFor(trigger) {
    if (trigger.hasAttribute("data-ui-copy")) return trigger.getAttribute("data-ui-copy");

    var selector = trigger.getAttribute("data-ui-copy-target");
    if (!selector) return "";
    var source = UI.q(selector);
    if (!source) return "";
    // Inputs carry their value; everything else its text.
    return "value" in source && source.value !== undefined
      ? source.value
      : source.textContent.trim();
  }

  /**
   * navigator.clipboard needs a secure context, so it is absent on the plain
   * HTTP that internal deployments often run on. The execCommand path is
   * deprecated but is the only thing that works there.
   */
  function legacyCopy(text) {
    var holder = document.createElement("textarea");
    holder.value = text;
    holder.setAttribute("readonly", "");
    holder.className = "ui-sr-only";
    document.body.appendChild(holder);

    var selection = document.getSelection();
    var previous = selection.rangeCount ? selection.getRangeAt(0) : null;

    holder.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }

    holder.remove();
    if (previous) {
      selection.removeAllRanges();
      selection.addRange(previous);
    }
    return ok;
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; },
        function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function flash(trigger, messageKey, modifier) {
    var message = UI.t(messageKey);
    var original = trigger.getAttribute("data-ui-copy-original");

    if (original === null) {
      trigger.setAttribute("data-ui-copy-original", trigger.innerHTML);
      original = trigger.innerHTML;
    }

    trigger.classList.add(modifier);
    trigger.textContent = message;
    UI.announce(message);

    window.clearTimeout(trigger._uiCopyTimer);
    trigger._uiCopyTimer = window.setTimeout(function () {
      trigger.innerHTML = trigger.getAttribute("data-ui-copy-original");
      trigger.classList.remove(modifier);
    }, FEEDBACK_MS);
  }

  document.addEventListener("click", function (event) {
    var trigger = UI.closest(event.target, "[data-ui-copy], [data-ui-copy-target]");
    if (!trigger) return;
    event.preventDefault();

    var text = textFor(trigger);
    if (!text) return;

    copy(text).then(function (ok) {
      if (ok) {
        flash(trigger, "copy.done", "ui-copied");
        UI.emit(trigger, "ui:copy", { text: text });
      } else {
        flash(trigger, "copy.failed", "ui-copy-failed");
        UI.emit(trigger, "ui:copy:failed", { text: text });
      }
    });
  });

  UI.clipboard = { copy: copy };
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Prints one element instead of the whole page it sits on.
   *
   *   <button data-ui-print-target="#certificate">Print certificate</button>
   *
   * Plain window.print() prints everything visible -- the surrounding
   * dashboard, nav, tables -- not just the document sheet a "Print
   * certificate" button implies. See UI.print() for the same thing from
   * script.
   */
  function print(target) {
    var element = typeof target === "string" ? UI.q(target) : target;
    if (!element) return;

    document.body.classList.add("ui-print-isolate");
    element.classList.add("ui-print-target");

    function cleanup() {
      document.body.classList.remove("ui-print-isolate");
      element.classList.remove("ui-print-target");
      window.removeEventListener("afterprint", cleanup);
    }
    // afterprint fires once the print dialog closes, whether the user
    // printed or cancelled -- the only reliable point to undo the isolation
    // classes without guessing at a timeout.
    window.addEventListener("afterprint", cleanup);

    window.print();
  }

  document.addEventListener("click", function (event) {
    var trigger = UI.closest(event.target, "[data-ui-print-target]");
    if (!trigger) return;
    event.preventDefault();
    print(trigger.getAttribute("data-ui-print-target"));
  });

  UI.print = print;
})(window, document);


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

  function initNodeStates(node) {
    if (!directChildrenWrap(node)) {
      node.classList.add("ui-tree-leaf");
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
