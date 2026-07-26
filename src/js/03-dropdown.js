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
