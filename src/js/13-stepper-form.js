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
