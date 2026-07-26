(function (window, document) {
  "use strict";
  var UI = window.UI;

  function setDirty(form, dirty) {
    form.dataset.uiDirty = dirty ? "true" : "false";
    form.classList.toggle("ui-dirty", dirty);
  }

  function syncProgress(form) {
    var position = Number(form.getAttribute("data-ui-position"));
    var total = Number(form.getAttribute("data-ui-total"));
    if (!position || !total) return;

    var bar = UI.q(".ui-save-next-progress .ui-progress-bar", form);
    if (bar) {
      var percent = Math.max(0, Math.min(100, Math.round((position / total) * 100)));
      bar.className = bar.className.replace(/\bui-progress-w-\d+\b/g, "").trim();
      bar.classList.add("ui-progress-w-" + percent);
    }

    var positionEl = UI.q("[data-ui-save-next-position]", form);
    if (positionEl) positionEl.textContent = position;
    var totalEl = UI.q("[data-ui-save-next-total]", form);
    if (totalEl) totalEl.textContent = total;
  }

  function confirmLeave(form) {
    var message = form.getAttribute("data-ui-unsaved-message") || "You have unsaved changes. Leave without saving?";
    if (form.dataset.uiDirty !== "true") return Promise.resolve(true);
    if (typeof UI.confirm === "function") {
      return UI.confirm({ title: "Unsaved changes", message: message, variant: "danger", confirmText: "Leave" });
    }
    return Promise.resolve(window.confirm(message));
  }

  function navigate(url) {
    if (url) window.location.href = url;
  }

  function submitAjax(form, submitter) {
    var action = form.getAttribute("action") || window.location.href;
    var method = (form.getAttribute("method") || "POST").toUpperCase();
    var body = new FormData(form);
    if (submitter && submitter.name) body.append(submitter.name, submitter.value);

    UI.emit(form, "ui:savenext:submit", { submitter: submitter });

    fetch(action, { method: method, body: body, headers: { "X-Requested-With": "XMLHttpRequest" } })
      .then(function (response) {
        if (!response.ok) throw new Error("Request failed with status " + response.status);
        setDirty(form, false);
        UI.emit(form, "ui:savenext:success", { response: response, submitter: submitter });
        if (UI.toast) UI.toast.show({ type: "success", title: "Saved", message: form.getAttribute("data-ui-success-message") || "Your changes were saved." });
        var isSaveNext = submitter && submitter.hasAttribute("data-ui-save-next-submit");
        if (isSaveNext) navigate(form.getAttribute("data-ui-next-url"));
      })
      .catch(function (error) {
        UI.emit(form, "ui:savenext:error", { error: error, submitter: submitter });
        if (UI.toast) UI.toast.show({ type: "danger", title: "Save failed", message: form.getAttribute("data-ui-error-message") || "The record could not be saved." });
      });
  }

  function init(root) {
    UI.qa("form[data-ui-save-next]", root).forEach(function (form) {
      if (form.dataset.uiSaveNextReady) return;
      form.dataset.uiSaveNextReady = "true";

      syncProgress(form);
      setDirty(form, false);

      form.addEventListener("input", function () { setDirty(form, true); });
      form.addEventListener("change", function () { setDirty(form, true); });

      form.addEventListener("submit", function (event) {
        if (form.getAttribute("data-ui-ajax") === "true") {
          event.preventDefault();
          submitAjax(form, event.submitter);
        } else {
          setDirty(form, false);
        }
      });

      var prevButton = UI.q("[data-ui-save-next-prev]", form);
      if (prevButton) {
        prevButton.addEventListener("click", function (event) {
          event.preventDefault();
          var url = form.getAttribute("data-ui-prev-url");
          confirmLeave(form).then(function (leave) {
            if (leave) navigate(url);
          });
        });
      }

      form.addEventListener("keydown", function (event) {
        var isSubmitCombo = (event.ctrlKey || event.metaKey) && event.key === "Enter";
        if (!isSubmitCombo) return;
        var submitButton = UI.q("[data-ui-save-next-submit]", form);
        if (!submitButton) return;
        event.preventDefault();
        if (typeof form.requestSubmit === "function") form.requestSubmit(submitButton);
        else submitButton.click();
      });
    });
  }

  window.addEventListener("beforeunload", function (event) {
    if (!UI.q("form[data-ui-save-next].ui-dirty")) return;
    event.preventDefault();
    event.returnValue = "";
  });

  UI.saveNext = { setDirty: setDirty };
  UI.register(init);
})(window, document);
