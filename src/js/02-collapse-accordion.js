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
