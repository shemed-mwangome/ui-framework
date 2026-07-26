(function (window, document) {
  "use strict";
  var UI = window.UI;

  function initUploads(root) {
    UI.qa("[data-ui-upload]", root).forEach(function (zone) {
      if (zone.dataset.uiReady) return;
      zone.dataset.uiReady = "true";
      var input = UI.q('input[type="file"]', zone);
      var preview = UI.q(".ui-upload-preview", zone);
      if (!input) return;

      ["dragenter", "dragover"].forEach(function (name) {
        zone.addEventListener(name, function () { zone.classList.add("ui-dragover"); });
      });
      ["dragleave", "drop"].forEach(function (name) {
        zone.addEventListener(name, function () { zone.classList.remove("ui-dragover"); });
      });

      input.addEventListener("change", function () {
        if (!preview) return;
        preview.innerHTML = "";
        Array.prototype.forEach.call(input.files || [], function (file) {
          var item = document.createElement("div");
          item.className = "ui-file-item";
          item.textContent = file.name + " · " + Math.max(1, Math.round(file.size / 1024)) + " KB";
          preview.appendChild(item);
        });
      });
    });
  }

  document.addEventListener("click", function (event) {
    var toggle = UI.closest(event.target, "[data-ui-theme-toggle]");
    if (!toggle) return;
    var root = document.documentElement;
    var current = root.getAttribute("data-ui-theme") || "light";
    var next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-ui-theme", next);
    try { localStorage.setItem("ui-theme", next); } catch (error) {}
    UI.emit(root, "ui:theme:changed", { theme: next });
  });

  try {
    var saved = localStorage.getItem("ui-theme");
    if (saved) document.documentElement.setAttribute("data-ui-theme", saved);
  } catch (error) {}

  UI.register(initUploads);
})(window, document);
