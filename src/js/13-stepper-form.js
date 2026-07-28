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
