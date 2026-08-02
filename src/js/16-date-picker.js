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
