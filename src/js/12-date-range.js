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

  UI.dateRange = { close: closeAll };
  UI.register(init);
})(window, document);
