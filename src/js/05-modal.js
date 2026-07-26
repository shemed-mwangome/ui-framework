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
