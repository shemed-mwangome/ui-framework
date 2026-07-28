(function (window, document) {
  "use strict";
  var UI = window.UI;

  function getContainer(position) {
    position = position || "top-end";
    var className = "ui-toast-" + position;
    var container = UI.q(".ui-toast-container." + className);
    if (!container) {
      container = document.createElement("div");
      container.className = "ui-toast-container " + className;
      container.setAttribute("aria-live", "polite");
      container.setAttribute("aria-atomic", "true");
      document.body.appendChild(container);
    }
    return container;
  }

  function remove(toast) {
    if (!toast || toast.classList.contains("ui-leaving")) return;
    toast.classList.add("ui-leaving");
    setTimeout(function () { toast.remove(); }, 180);
  }

  function show(options) {
    options = options || {};
    var type = options.type || "info";
    var duration = options.duration == null ? 4000 : Number(options.duration);
    var toast = document.createElement("div");
    toast.className = "ui-toast ui-toast-" + type;
    toast.setAttribute("role", type === "danger" ? "alert" : "status");
    toast.innerHTML =
      '<div class="ui-toast-icon">' + UI.escape(options.icon || "●") + '</div>' +
      '<div><div class="ui-toast-title">' + UI.escape(options.title || "Notification") + '</div>' +
      '<p class="ui-toast-message">' + UI.escape(options.message || "") + '</p></div>' +
      '<button type="button" class="ui-toast-close" aria-label="' + UI.escape(UI.t("toast.close")) + '">&times;</button>' +
      (duration > 0 ? '<div class="ui-toast-progress"></div>' : "");

    toast.querySelector(".ui-toast-close").addEventListener("click", function () { remove(toast); });
    var progress = toast.querySelector(".ui-toast-progress");
    if (progress) progress.style.animationDuration = duration + "ms";

    getContainer(options.position).appendChild(toast);
    if (duration > 0) setTimeout(function () { remove(toast); }, duration);
    return toast;
  }

  UI.toast = { show: show, remove: remove };
})(window, document);
