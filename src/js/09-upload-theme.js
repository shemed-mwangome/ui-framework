(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Upload area with client-side gating and optional direct upload.
   *
   *   <div data-ui-upload
   *        data-ui-max-size="5MB"
   *        data-ui-max-files="3"
   *        data-ui-url="/api/documents">      optional: upload immediately
   *     <input type="file" multiple accept=".pdf,image/*">
   *     <div class="ui-upload-preview"></div>
   *   </div>
   *
   * Rejecting an oversized or wrong-type file in the browser is a courtesy,
   * not a control -- the server must still enforce both. What it buys is the
   * user finding out before a slow upload rather than after it.
   */

  var SIZE_UNITS = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };

  function parseSize(text) {
    if (!text) return 0;
    var match = String(text).trim().match(/^([\d.]+)\s*(B|KB|MB|GB)?$/i);
    if (!match) return Number(text) || 0;
    var unit = (match[2] || "B").toUpperCase();
    return parseFloat(match[1]) * (SIZE_UNITS[unit] || 1);
  }

  function formatSize(bytes) {
    if (bytes >= SIZE_UNITS.MB) return (bytes / SIZE_UNITS.MB).toFixed(1).replace(/\.0$/, "") + " MB";
    if (bytes >= SIZE_UNITS.KB) return Math.round(bytes / SIZE_UNITS.KB) + " KB";
    return bytes + " B";
  }

  /** Matches a file against one `accept` entry: ".pdf", "image/*", "text/csv". */
  function matchesAccept(file, accept) {
    var name = file.name.toLowerCase();
    var type = (file.type || "").toLowerCase();

    return accept.split(",").some(function (entry) {
      entry = entry.trim().toLowerCase();
      if (!entry) return false;
      if (entry.charAt(0) === ".") return name.slice(-entry.length) === entry;
      if (entry.slice(-2) === "/*") return type.indexOf(entry.slice(0, -1)) === 0;
      return type === entry;
    });
  }

  function initUploads(root) {
    UI.matchAll("[data-ui-upload]", root).forEach(function (zone) {
      if (zone.dataset.uiUploadReady) return;
      zone.dataset.uiUploadReady = "true";

      var input = UI.q('input[type="file"]', zone);
      var preview = UI.q(".ui-upload-preview", zone);
      if (!input) return;

      var maxSize = parseSize(zone.getAttribute("data-ui-max-size"));
      var maxFiles = Number(zone.getAttribute("data-ui-max-files")) || 0;
      var accept = zone.getAttribute("accept") || input.getAttribute("accept") || "";
      var uploadUrl = zone.getAttribute("data-ui-url");

      var errors = UI.q(".ui-upload-errors", zone);
      if (!errors) {
        errors = document.createElement("div");
        errors.className = "ui-upload-errors";
        errors.setAttribute("role", "alert");
        zone.appendChild(errors);
      }

      ["dragenter", "dragover"].forEach(function (name) {
        zone.addEventListener(name, function (event) {
          event.preventDefault();
          zone.classList.add("ui-dragover");
        });
      });
      ["dragleave", "drop"].forEach(function (name) {
        zone.addEventListener(name, function () { zone.classList.remove("ui-dragover"); });
      });

      zone.addEventListener("drop", function (event) {
        event.preventDefault();
        if (!event.dataTransfer || !event.dataTransfer.files.length) return;
        var transfer = new DataTransfer();
        Array.prototype.forEach.call(input.files || [], function (file) { transfer.items.add(file); });
        Array.prototype.forEach.call(event.dataTransfer.files, function (file) { transfer.items.add(file); });
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });

      function showErrors(messages) {
        errors.innerHTML = messages
          .map(function (message) {
            return '<p class="ui-upload-error">' + UI.escape(message) + "</p>";
          })
          .join("");
        if (messages.length) UI.announce(messages[0], "assertive");
      }

      /**
       * Drops files that fail a rule and rebuilds the input's FileList, so what
       * the form submits always matches what the preview shows.
       */
      function enforceRules() {
        var files = Array.prototype.slice.call(input.files || []);
        var messages = [];
        var kept = [];

        files.forEach(function (file) {
          if (maxSize && file.size > maxSize) {
            messages.push(UI.t("upload.tooLarge", { name: file.name, max: formatSize(maxSize) }));
            return;
          }
          if (accept && !matchesAccept(file, accept)) {
            messages.push(UI.t("upload.wrongType", { name: file.name }));
            return;
          }
          kept.push(file);
        });

        if (maxFiles && kept.length > maxFiles) {
          messages.push(UI.t("upload.tooMany", { max: maxFiles }));
          kept = kept.slice(0, maxFiles);
        }

        if (kept.length !== files.length) {
          var transfer = new DataTransfer();
          kept.forEach(function (file) { transfer.items.add(file); });
          input.files = transfer.files;
        }

        showErrors(messages);
        if (messages.length) {
          UI.emit(zone, "ui:upload:rejected", { messages: messages });
        }
        return kept;
      }

      function removeFile(index) {
        var transfer = new DataTransfer();
        Array.prototype.forEach.call(input.files || [], function (file, i) {
          if (i !== index) transfer.items.add(file);
        });
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }

      function renderPreview() {
        if (!preview) return;
        preview.innerHTML = "";
        Array.prototype.forEach.call(input.files || [], function (file, index) {
          var item = document.createElement("div");
          item.className = "ui-file-item";
          item.setAttribute("data-ui-file-index", String(index));
          item.innerHTML =
            '<span class="ui-file-item-name">' + UI.escape(file.name) + " · " +
              formatSize(file.size) + "</span>" +
            '<div class="ui-file-item-progress" hidden><div class="ui-progress ui-progress-sm">' +
              '<div class="ui-progress-bar ui-progress-w-0"></div></div></div>' +
            '<button type="button" class="ui-file-item-remove" aria-label="' +
              UI.escape(UI.t("upload.remove", { name: file.name })) + '">&times;</button>';

          item.querySelector(".ui-file-item-remove").addEventListener("click", function (event) {
            event.stopPropagation();
            removeFile(index);
          });
          preview.appendChild(item);
        });
      }

      /**
       * Direct upload with real progress. XMLHttpRequest rather than fetch:
       * fetch still has no upload progress event, and a progress bar that
       * jumps 0 -> 100 is worse than none on the large scans this is for.
       */
      function upload(file, item) {
        var progressHolder = item.querySelector(".ui-file-item-progress");
        var bar = item.querySelector(".ui-progress-bar");
        progressHolder.hidden = false;
        item.classList.add("ui-uploading");

        var form = new FormData();
        form.append(zone.getAttribute("data-ui-field") || "file", file);

        var request = new XMLHttpRequest();
        request.open("POST", uploadUrl);
        request.setRequestHeader("X-Requested-With", "XMLHttpRequest");

        request.upload.addEventListener("progress", function (event) {
          if (!event.lengthComputable) return;
          var percent = Math.round((event.loaded / event.total) * 100);
          // Stepped classes keep this CSP-safe (no inline style attribute).
          bar.className = "ui-progress-bar ui-progress-w-" + (Math.round(percent / 5) * 5);
          UI.emit(zone, "ui:upload:progress", { name: file.name, percent: percent });
        });

        request.addEventListener("load", function () {
          item.classList.remove("ui-uploading");
          if (request.status >= 200 && request.status < 300) {
            item.classList.add("ui-uploaded");
            bar.className = "ui-progress-bar ui-progress-w-100";
            UI.emit(zone, "ui:upload:done", { name: file.name, response: request.responseText });
            UI.announce(UI.t("upload.done", { name: file.name }));
          } else {
            item.classList.add("ui-upload-failed");
            UI.emit(zone, "ui:upload:failed", { name: file.name, status: request.status });
            showErrors([UI.t("upload.failed", { name: file.name })]);
          }
        });

        request.addEventListener("error", function () {
          item.classList.remove("ui-uploading");
          item.classList.add("ui-upload-failed");
          UI.emit(zone, "ui:upload:failed", { name: file.name, status: 0 });
          showErrors([UI.t("upload.failed", { name: file.name })]);
        });

        request.send(form);
      }

      function onChange() {
        var kept = enforceRules();
        renderPreview();
        UI.emit(zone, "ui:upload:change", { count: kept.length });

        if (!uploadUrl) return;
        kept.forEach(function (file, index) {
          var item = UI.q('[data-ui-file-index="' + index + '"]', preview);
          if (item && !item.classList.contains("ui-uploaded")) upload(file, item);
        });
      }

      input.addEventListener("change", onChange);
      UI.cleanup(zone, function () {
        input.removeEventListener("change", onChange);
      });

      zone._uiUpload = {
        clear: function () {
          input.value = "";
          renderPreview();
          showErrors([]);
        }
      };
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

  UI.upload = {
    parseSize: parseSize,
    formatSize: formatSize,
    clear: function (target) {
      var zone = typeof target === "string" ? UI.q(target) : target;
      if (zone && zone._uiUpload) zone._uiUpload.clear();
    }
  };
})(window, document);
