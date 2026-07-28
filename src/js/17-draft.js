(function (window, document) {
  "use strict";
  var UI = window.UI;
  var STORAGE_PREFIX = "ui-draft:";
  var AUTOSAVE_DELAY = 800;

  function storageKey(form) {
    return STORAGE_PREFIX + (form.getAttribute("data-ui-draft-key") || form.id || form.getAttribute("action") || window.location.pathname);
  }

  function safeStorage() {
    try {
      window.localStorage.setItem("__ui_draft_test__", "1");
      window.localStorage.removeItem("__ui_draft_test__");
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  function serialize(form) {
    var data = {};
    new FormData(form).forEach(function (value, key) {
      if (value instanceof File) return;
      if (!data[key]) data[key] = [];
      data[key].push(value);
    });
    return data;
  }

  function restoreFields(form, data) {
    Object.keys(data).forEach(function (key) {
      var values = data[key];
      var fields = UI.qa('[name="' + key.replace(/"/g, '\\"') + '"]', form);
      if (!fields.length) return;

      if (fields[0].type === "checkbox" || fields[0].type === "radio") {
        fields.forEach(function (field) { field.checked = values.indexOf(field.value) !== -1; });
      } else if (fields[0].tagName === "SELECT" && fields[0].multiple) {
        Array.prototype.forEach.call(fields[0].options, function (option) {
          option.selected = values.indexOf(option.value) !== -1;
        });
      } else {
        fields[0].value = values[0];
      }
      fields[0].dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  // Intl.RelativeTimeFormat handles plural rules per locale, which a string
  // table cannot -- "2 minutes ago" vs "dakika 2 zilizopita" have different
  // pluralisation shapes. Falls back to the i18n table where unsupported.
  function relativeTime(timestamp) {
    var seconds = Math.round((Date.now() - timestamp) / 1000);
    var minutes = Math.round(seconds / 60);
    var hours = Math.round(minutes / 60);

    if (window.Intl && Intl.RelativeTimeFormat) {
      var formatter = new Intl.RelativeTimeFormat(UI.i18n.locale, { numeric: "auto" });
      if (seconds < 60) return formatter.format(-seconds, "second");
      if (minutes < 60) return formatter.format(-minutes, "minute");
      return formatter.format(-hours, "hour");
    }

    if (seconds < 60) return UI.t("draft.justNow");
    if (minutes < 60) return UI.t("draft.minutes", { count: minutes });
    return UI.t("draft.hours", { count: hours });
  }

  // Best-effort remote sync. The server contract:
  //   GET  <url>  -> 200 {fields, savedAt} | 404 (no draft)
  //   POST <url>  <- {fields, savedAt}     -> any 2xx
  //   DELETE <url>                         -> any 2xx
  // Network/server failures never block the local (localStorage) draft from
  // working -- they're swallowed and reported via ui:draft:sync-error.
  function remoteGet(url) {
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .catch(function () { return null; });
  }

  function remoteSave(form, url, record) {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    }).then(function (response) {
      if (!response.ok) throw new Error("Draft sync failed with status " + response.status);
    }).catch(function (error) {
      UI.emit(form, "ui:draft:sync-error", { error: error });
    });
  }

  function remoteDiscard(url) {
    fetch(url, { method: "DELETE" }).catch(function () {});
  }

  function build(form) {
    if (form.dataset.uiDraftReady) return;
    form.dataset.uiDraftReady = "true";

    var storage = safeStorage();
    if (!storage) return;
    var key = storageKey(form);
    var url = form.getAttribute("data-ui-draft-url");

    function readLocalDraft() {
      try {
        return JSON.parse(storage.getItem(key));
      } catch (error) {
        return null;
      }
    }

    function setStatus(text) {
      var status = UI.q("[data-ui-draft-status]", form);
      if (status) status.textContent = text || "";
    }

    function save() {
      var record = { fields: serialize(form), savedAt: Date.now() };
      storage.setItem(key, JSON.stringify(record));
      setStatus("Draft saved " + new Date(record.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      UI.emit(form, "ui:draft:saved", { savedAt: record.savedAt });
      if (url) remoteSave(form, url, record);
    }

    function discard() {
      storage.removeItem(key);
      setStatus("");
      UI.emit(form, "ui:draft:discarded", {});
      if (url) remoteDiscard(url);
    }

    var saveTimer = null;
    form.addEventListener("input", function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, AUTOSAVE_DELAY);
    });

    // Auto-discarding on the raw submit event assumes the submission always
    // goes through. Apps that gate submission behind an async confirm or
    // validation step (submit handler calls preventDefault(), decides
    // later) should set data-ui-draft-auto-discard="false" and call
    // UI.draft.discard(form) themselves once the submission actually
    // succeeds -- otherwise the draft is wiped even if the user cancels.
    form.addEventListener("submit", function () {
      clearTimeout(saveTimer);
      if (form.getAttribute("data-ui-draft-auto-discard") !== "false") discard();
    });

    form._uiDraftSave = save;
    form._uiDraftDiscard = discard;

    function showBanner(draft) {
      var banner = document.createElement("div");
      banner.className = "ui-alert ui-alert-info ui-draft-banner";
      banner.setAttribute("role", "alert");
      banner.innerHTML =
        '<div class="ui-alert-icon">i</div>' +
        '<div><div class="ui-alert-title">' + UI.escape(UI.t("unsaved.title")) + "</div>" +
        '<p class="ui-alert-message">' +
        UI.escape(UI.t("draft.found", { when: relativeTime(draft.savedAt) })) + "</p>" +
        '<div class="ui-d-flex ui-gap-2 ui-mt-2">' +
        '<button type="button" class="ui-btn ui-btn-sm ui-btn-primary" data-ui-draft-restore>' +
        UI.escape(UI.t("draft.restore")) + "</button>" +
        '<button type="button" class="ui-btn ui-btn-sm ui-btn-outline-secondary" data-ui-draft-discard>' +
        UI.escape(UI.t("draft.discard")) + "</button>" +
        "</div></div>";
      form.parentNode.insertBefore(banner, form);

      banner.querySelector("[data-ui-draft-restore]").addEventListener("click", function () {
        restoreFields(form, draft.fields);
        banner.remove();
        UI.emit(form, "ui:draft:restored", { savedAt: draft.savedAt });
      });
      banner.querySelector("[data-ui-draft-discard]").addEventListener("click", function () {
        discard();
        banner.remove();
      });
    }

    var localDraft = readLocalDraft();

    if (!url) {
      if (localDraft && localDraft.fields) showBanner(localDraft);
      return;
    }

    // With a remote URL configured, reconcile local vs. server before
    // showing anything -- whichever was saved more recently wins (e.g. the
    // user continued on a different device).
    remoteGet(url).then(function (remoteDraft) {
      var winner = localDraft;
      if (remoteDraft && remoteDraft.fields) {
        if (!winner || remoteDraft.savedAt > winner.savedAt) winner = remoteDraft;
      }
      if (winner && winner.fields) showBanner(winner);
    });
  }

  function init(root) {
    UI.matchAll("form[data-ui-draft]", root).forEach(build);
  }

  UI.draft = {
    save: function (form) { if (form && form._uiDraftSave) form._uiDraftSave(); },
    discard: function (form) { if (form && form._uiDraftDiscard) form._uiDraftDiscard(); }
  };

  UI.register(init);
})(window, document);
