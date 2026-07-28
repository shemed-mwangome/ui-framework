(function (window, document) {
  "use strict";

  var UI = window.UI || {};

  UI.version = "1.5.1";
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
