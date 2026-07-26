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
