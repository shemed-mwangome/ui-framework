(function (window, document) {
  "use strict";
  var UI = window.UI;
  var WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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

  function presetRanges() {
    var now = today();
    return {
      today: [now, now],
      yesterday: [addDays(now, -1), addDays(now, -1)],
      last7: [addDays(now, -6), now],
      last30: [addDays(now, -29), now],
      thisMonth: [startOfMonth(now), now],
      lastMonth: [startOfMonth(addMonths(now, -1)), endOfMonth(addMonths(now, -1))],
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

  function buildCalendarDays(viewDate) {
    var firstOfMonth = startOfMonth(viewDate);
    var gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());
    var days = [];
    for (var i = 0; i < 42; i++) days.push(addDays(gridStart, i));
    return days;
  }

  function State(container) {
    this.container = container;
    var inputs = UI.qa("input", container);
    this.startInput = inputs[0];
    this.endInput = inputs[1];
    this.rangeStart = parseISODate(this.startInput.value);
    this.rangeEnd = parseISODate(this.endInput.value);
    this.viewDate = startOfMonth(this.rangeStart || this.rangeEnd || today());
    this.minDate = parseISODate(container.getAttribute("data-min-date"));
    this.maxDate = parseISODate(container.getAttribute("data-max-date"));
    this.disabledDates = {};
    (container.getAttribute("data-disabled-dates") || "").split(",").forEach(function (value) {
      var trimmed = value.trim();
      if (trimmed) this.disabledDates[trimmed] = true;
    }, this);
  }

  State.prototype.isDisabled = function (date) {
    if (this.minDate && date < this.minDate) return true;
    if (this.maxDate && date > this.maxDate) return true;
    return !!this.disabledDates[formatISODate(date)];
  };

  // The visible calendar spans state.viewDate and the month after it (a
  // two-month view). True when `date` falls outside that span, so callers
  // know they need to shift viewDate before the date's cell exists to focus.
  function isOutsideVisibleSpan(state, date) {
    return date < state.viewDate || date >= addMonths(state.viewDate, 2);
  }

  function renderMonth(state, monthEl, monthDate) {
    var title = UI.q(".ui-date-range-calendar-title", monthEl);
    if (title) title.textContent = monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    var grid = UI.q(".ui-date-range-grid", monthEl);
    grid.innerHTML = "";
    var todayDate = today();

    buildCalendarDays(monthDate).forEach(function (day) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "ui-date-range-day";
      cell.textContent = day.getDate();
      cell.tabIndex = -1;
      cell.setAttribute("data-ui-date", formatISODate(day));

      if (day.getMonth() !== monthDate.getMonth()) cell.classList.add("ui-outside");
      if (sameDay(day, todayDate)) cell.classList.add("ui-today");
      if (sameDay(day, state.rangeStart)) cell.classList.add("ui-range-start");
      if (sameDay(day, state.rangeEnd)) cell.classList.add("ui-range-end");
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
        ? formatDisplayDate(state.rangeStart) + " – " + formatDisplayDate(state.rangeEnd)
        : container.getAttribute("data-ui-placeholder") || "Select date range";
    }

    UI.qa(".ui-date-range-month", container).forEach(function (monthEl, index) {
      renderMonth(state, monthEl, addMonths(state.viewDate, index));
    });

    var clearButton = UI.q("[data-ui-range-clear]", container);
    if (clearButton) clearButton.hidden = !(state.rangeStart || state.rangeEnd);
  }

  function applyRange(state) {
    state.startInput.value = state.rangeStart ? formatISODate(state.rangeStart) : "";
    state.endInput.value = state.rangeEnd ? formatISODate(state.rangeEnd) : "";
    state.startInput.dispatchEvent(new Event("change", { bubbles: true }));
    state.endInput.dispatchEvent(new Event("change", { bubbles: true }));
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
    var cell = UI.q('[data-ui-date="' + formatISODate(date) + '"]', state.container);
    if (cell) cell.focus();
  }

  function open(container, state) {
    closeAll();
    container.classList.add("ui-open");
    var trigger = UI.q(".ui-date-range-trigger", container);
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    var panel = UI.q(".ui-date-range-panel", container);
    if (trigger && panel) container._uiFloatCleanup = UI.floatPanel(trigger, panel);

    var focusTarget = state.rangeStart || today();
    if (isOutsideVisibleSpan(state, focusTarget)) {
      state.viewDate = startOfMonth(focusTarget);
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
      '<div class="ui-date-range-weekdays">' + WEEKDAYS.map(function (day) { return "<span>" + day + "</span>"; }).join("") + "</div>" +
      '<div class="ui-date-range-grid" role="grid"></div>'
    );
  }

  function build(container) {
    if (container.dataset.uiReady) return;
    container.dataset.uiReady = "true";

    UI.qa("input", container).forEach(function (input) { input.classList.add("ui-date-range-native"); });

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ui-date-range-trigger";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<span class="ui-date-range-value"></span>';

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
        if (!cell.classList.contains("ui-disabled")) pickDay(state, parseISODate(cell.getAttribute("data-ui-date")));
        return;
      }
      if (UI.closest(event.target, "[data-ui-cal-prev]")) {
        state.viewDate = addMonths(state.viewDate, -1);
        render(state);
        return;
      }
      if (UI.closest(event.target, "[data-ui-cal-next]")) {
        state.viewDate = addMonths(state.viewDate, 1);
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
        state.viewDate = startOfMonth(state.rangeEnd);
        render(state);
        applyRange(state);
        closeAll();
      }
    });

    panel.addEventListener("keydown", function (event) {
      var cell = UI.closest(event.target, "[data-ui-date]");
      if (!cell) return;
      var currentDate = parseISODate(cell.getAttribute("data-ui-date"));
      var delta = null;
      if (event.key === "ArrowLeft") delta = -1;
      else if (event.key === "ArrowRight") delta = 1;
      else if (event.key === "ArrowUp") delta = -7;
      else if (event.key === "ArrowDown") delta = 7;
      else if (event.key === "Home") delta = -currentDate.getDay();
      else if (event.key === "End") delta = 6 - currentDate.getDay();

      if (delta !== null) {
        event.preventDefault();
        var nextDate = addDays(currentDate, delta);
        if (isOutsideVisibleSpan(state, nextDate)) {
          state.viewDate = startOfMonth(nextDate);
          render(state);
        }
        focusDate(state, nextDate);
        return;
      }

      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        var monthDelta = event.key === "PageUp" ? -1 : 1;
        state.viewDate = addMonths(state.viewDate, monthDelta);
        render(state);
        focusDate(state, addMonths(currentDate, monthDelta));
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
