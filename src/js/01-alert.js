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
