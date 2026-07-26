/*!
 * UI Framework v1.1.0
 * Dependency-free JavaScript bundle.
 * License: MIT
 */
(function (window, document) {
  "use strict";

  var UI = window.UI || {};

  UI.version = "1.1.0";
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
      if (options.matchWidth) panel.style.width = triggerRect.width + "px";
      var panelRect = panel.getBoundingClientRect();
      var viewportW = document.documentElement.clientWidth;
      var viewportH = document.documentElement.clientHeight;

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

    return function cleanup() {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
      panel.style.position = "";
      panel.style.top = "";
      panel.style.left = "";
      panel.style.right = "";
      panel.style.bottom = "";
      panel.style.width = "";
      panel.classList.remove("ui-panel-above");
    };
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
    UI.qa(".ui-alert[data-ui-auto-dismiss]", root).forEach(function (alert) {
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
          align: dropdown.classList.contains("ui-dropdown-end") ? "end" : "start"
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
        UI.escape(select.getAttribute("data-search-placeholder") || "Search options") + '">';
      menu.appendChild(search);
    }

    if (select.getAttribute("data-select-all") !== "false") {
      var actions = document.createElement("div");
      actions.className = "ui-multiselect-actions";
      actions.innerHTML =
        '<button type="button" class="ui-multiselect-action" data-ui-ms-action="all">Select all</button>' +
        '<button type="button" class="ui-multiselect-action" data-ui-ms-action="clear">Clear</button>';
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
    empty.textContent = select.getAttribute("data-empty-text") || "No matching options";

    menu.appendChild(options);
    menu.appendChild(empty);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    function update() {
      var selected = Array.prototype.filter.call(select.options, function (option) { return option.selected; });
      var summary = UI.q(".ui-multiselect-summary", wrapper);
      var display = select.getAttribute("data-display") || "count";
      var placeholder = select.getAttribute("data-placeholder") || "Select options";
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
        wrapper._uiFloatCleanup = UI.floatPanel(trigger, menu, { matchWidth: true });
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
    UI.qa("select[multiple][data-ui-multiselect]", root).forEach(build);
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

  UI.multiselect = { build: build };
  UI.register(init);
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

  function render(state) {
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
    if (trigger && panel) container._uiFloatCleanup = UI.floatPanel(trigger, panel);

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
    UI.qa("[data-ui-date-range]", root).forEach(build);
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

  UI.dateRange = { close: closeAll };
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
    if (trigger && panel) container._uiFloatCleanup = UI.floatPanel(trigger, panel);

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
    UI.qa("[data-ui-date-picker]", root).forEach(build);
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

  UI.datePicker = { close: closeAll };
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
      '<button type="button" class="ui-toast-close" aria-label="Close">&times;</button>' +
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

  function initUploads(root) {
    UI.qa("[data-ui-upload]", root).forEach(function (zone) {
      if (zone.dataset.uiReady) return;
      zone.dataset.uiReady = "true";
      var input = UI.q('input[type="file"]', zone);
      var preview = UI.q(".ui-upload-preview", zone);
      if (!input) return;

      ["dragenter", "dragover"].forEach(function (name) {
        zone.addEventListener(name, function () { zone.classList.add("ui-dragover"); });
      });
      ["dragleave", "drop"].forEach(function (name) {
        zone.addEventListener(name, function () { zone.classList.remove("ui-dragover"); });
      });

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
          item.innerHTML =
            '<span class="ui-file-item-name">' + UI.escape(file.name) + " · " + Math.max(1, Math.round(file.size / 1024)) + " KB</span>" +
            '<button type="button" class="ui-file-item-remove" aria-label="Remove ' + UI.escape(file.name) + '">&times;</button>';
          item.querySelector(".ui-file-item-remove").addEventListener("click", function (event) {
            event.stopPropagation();
            removeFile(index);
          });
          preview.appendChild(item);
        });
      }

      input.addEventListener("change", renderPreview);
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
          '<div class="ui-modal-header"><h3 class="ui-modal-title">' + UI.escape(options.title || "Please confirm") + "</h3></div>" +
          '<div class="ui-modal-body"><p>' + UI.escape(options.message || "Are you sure?") + "</p></div>" +
          '<div class="ui-modal-footer">' +
            '<button type="button" class="ui-btn ui-btn-secondary"' + (variant === "danger" ? " autofocus" : "") + " data-ui-confirm-cancel>" + UI.escape(options.cancelText || "Cancel") + "</button>" +
            '<button type="button" class="ui-btn ui-btn-' + variant + '"' + (variant === "danger" ? "" : " autofocus") + " data-ui-confirm-ok>" + UI.escape(options.confirmText || "Confirm") + "</button>" +
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
    var message = form.getAttribute("data-ui-unsaved-message") || "You have unsaved changes. Leave without saving?";
    if (form.dataset.uiDirty !== "true") return Promise.resolve(true);
    if (typeof UI.confirm === "function") {
      return UI.confirm({ title: "Unsaved changes", message: message, variant: "danger", confirmText: "Leave" });
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
    UI.qa("form[data-ui-save-next]", root).forEach(function (form) {
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

  function validateStep(panel) {
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
        if (!validateStep(panels[current])) return;
        if (current < panels.length - 1) current++;
        render();
      });
    }

    render();
  }

  function init(root) {
    UI.qa("[data-ui-stepper-form]", root).forEach(build);
  }

  UI.register(init);
})(window, document);


(function (window, document) {
  "use strict";
  var UI = window.UI;

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

  function build(wrapper) {
    if (wrapper.dataset.uiReady) return;
    wrapper.dataset.uiReady = "true";

    var table = wrapper.tagName === "TABLE" ? wrapper : UI.q("table", wrapper);
    if (!table) return;
    var tbody = UI.q("tbody", table);
    var headers = UI.qa("thead th", table);
    var allRows = UI.qa("tr", tbody);
    var pageSize = Number(wrapper.getAttribute("data-ui-page-size")) || 10;
    var currentPage = 1;
    var sortIndex = -1;
    var sortDirection = "ascending";
    var query = "";

    var showSearch = wrapper.getAttribute("data-ui-search") !== "false";
    var showPageSizePicker = wrapper.getAttribute("data-ui-page-size-selector") !== "false";

    // Insert relative to `table` (not `wrapper`), since `data-ui-table` may
    // be on the <table> itself: a <nav> can't legally live inside a table,
    // and a node can't be inserted before itself.
    if (showSearch || showPageSizePicker) {
      var toolbar = document.createElement("div");
      toolbar.className = "ui-table-toolbar";

      if (showPageSizePicker) {
        var sizes = (wrapper.getAttribute("data-ui-page-sizes") || "5,10,25,50")
          .split(",").map(function (value) { return Number(value.trim()); }).filter(Boolean);
        if (sizes.indexOf(pageSize) === -1) sizes.push(pageSize);
        sizes.sort(function (a, b) { return a - b; });

        var sizeField = document.createElement("label");
        sizeField.className = "ui-table-page-size";
        sizeField.innerHTML = "Show " +
          '<select class="ui-select ui-control-sm">' +
          sizes.map(function (size) {
            return '<option value="' + size + '"' + (size === pageSize ? " selected" : "") + ">" + size + "</option>";
          }).join("") +
          "</select> per page";
        toolbar.appendChild(sizeField);

        UI.q("select", sizeField).addEventListener("change", function () {
          pageSize = Number(this.value) || pageSize;
          currentPage = 1;
          renderPage();
        });
      }

      if (showSearch) {
        var search = document.createElement("input");
        search.type = "search";
        search.className = "ui-control ui-control-sm ui-table-search";
        search.placeholder = wrapper.getAttribute("data-ui-search-placeholder") || "Search";
        toolbar.appendChild(search);

        search.addEventListener("input", function () {
          query = this.value.trim().toLowerCase();
          currentPage = 1;
          renderPage();
        });
      }

      table.parentNode.insertBefore(toolbar, table);
    }

    var pagination = document.createElement("nav");
    pagination.className = "ui-table-pagination";
    table.insertAdjacentElement("afterend", pagination);

    headers.forEach(function (th, index) {
      if (th.getAttribute("data-ui-sort") === "false" || !th.hasAttribute("data-ui-sort")) return;
      th.classList.add("ui-table-sortable");
      th.setAttribute("aria-sort", "none");
      th.addEventListener("click", function () {
        if (sortIndex === index) {
          sortDirection = sortDirection === "ascending" ? "descending" : "ascending";
        } else {
          sortIndex = index;
          sortDirection = "ascending";
        }
        headers.forEach(function (other) { other.setAttribute("aria-sort", other === th ? sortDirection : "none"); });
        currentPage = 1;
        renderPage();
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

      function addPage(label, page, disabled, active) {
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.href = "#";
        link.className = "ui-page-link" + (active ? " ui-active" : "") + (disabled ? " ui-disabled" : "");
        link.textContent = label;
        link.addEventListener("click", function (event) {
          event.preventDefault();
          if (disabled) return;
          currentPage = page;
          renderPage();
        });
        item.appendChild(link);
        list.appendChild(item);
      }

      addPage("‹", currentPage - 1, currentPage === 1, false);
      for (var page = 1; page <= totalPages; page++) addPage(String(page), page, false, page === currentPage);
      addPage("›", currentPage + 1, currentPage === totalPages, false);

      pagination.appendChild(list);
    }

    function renderPage() {
      var rows = sortedRows(filteredRows());
      var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      currentPage = Math.min(currentPage, totalPages);

      tbody.innerHTML = "";
      if (!rows.length) {
        var emptyRow = document.createElement("tr");
        emptyRow.className = "ui-table-empty-row";
        var emptyCell = document.createElement("td");
        emptyCell.colSpan = headers.length || 1;
        emptyCell.textContent = wrapper.getAttribute("data-ui-empty-text") || "No matching records";
        emptyRow.appendChild(emptyCell);
        tbody.appendChild(emptyRow);
      } else {
        rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).forEach(function (row) { tbody.appendChild(row); });
      }

      renderPagination(totalPages);
      UI.emit(wrapper, "ui:table:change", { page: currentPage, totalPages: totalPages, visible: rows.length, total: allRows.length });
    }

    renderPage();
  }

  function init(root) {
    UI.qa("[data-ui-table]", root).forEach(build);
  }

  UI.register(init);
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

  function relativeTime(timestamp) {
    var seconds = Math.round((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + (minutes === 1 ? " minute ago" : " minutes ago");
    var hours = Math.round(minutes / 60);
    return hours + (hours === 1 ? " hour ago" : " hours ago");
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
        '<div><div class="ui-alert-title">Unsaved draft found</div>' +
        '<p class="ui-alert-message">You have a draft saved ' + UI.escape(relativeTime(draft.savedAt)) + '.</p>' +
        '<div class="ui-d-flex ui-gap-2 ui-mt-2">' +
        '<button type="button" class="ui-btn ui-btn-sm ui-btn-primary" data-ui-draft-restore>Restore draft</button>' +
        '<button type="button" class="ui-btn ui-btn-sm ui-btn-outline-secondary" data-ui-draft-discard>Discard</button>' +
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
    UI.qa("form[data-ui-draft]", root).forEach(build);
  }

  UI.draft = {
    save: function (form) { if (form && form._uiDraftSave) form._uiDraftSave(); },
    discard: function (form) { if (form && form._uiDraftDiscard) form._uiDraftDiscard(); }
  };

  UI.register(init);
})(window, document);
