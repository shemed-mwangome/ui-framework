(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Offline work queue.
   *
   * data-ui-draft (17-draft.js) protects the form you are looking at. This
   * protects the work you have finished: a durable, ordered queue of writes
   * that could not be sent, flushed automatically when a connection returns.
   *
   * Rules the implementation follows, each of them the answer to a way field
   * data gets lost in practice:
   *
   *   - Persist before responding. An item is written to storage before the
   *     caller is told it was queued, so a crash between the two cannot lose
   *     it.
   *   - Retry only what is worth retrying. A network failure or a 5xx is
   *     transient; a 400 or a 422 will fail identically forever, and retrying
   *     it in a loop buries the one item that needs a human.
   *   - A 409 is a conflict, not a failure. Someone else changed the record.
   *     The item is kept with the server's version attached so a person can
   *     resolve it. Nothing is overwritten by whichever write arrived last.
   *   - Order is preserved within a group. Premise visits under one
   *     inspection are sent oldest-first and stop at the first unresolved
   *     item, so a later edit never lands before the create it depends on.
   *
   * Storage is IndexedDB, with a localStorage fallback for browsers or
   * private-mode contexts where IndexedDB is unavailable. Evidence files are
   * out of scope here -- queue the metadata and upload binaries separately.
   */

  var DB_NAME = "ui-offline";
  var STORE = "queue";
  var LS_KEY = "ui-offline:queue";
  var MAX_ATTEMPTS = 8;

  var config = {
    autoFlush: true,
    interval: 30000,
    endpointHeaders: {}
  };

  var flushing = false;
  var timer = null;

  /* --------------------------------------------------------- storage */

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      if (!window.indexedDB) { resolve(null); return; }
      var request;
      try { request = window.indexedDB.open(DB_NAME, 1); }
      catch (error) { resolve(null); return; }

      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { resolve(null); };
      // Safari in private mode can leave the request pending indefinitely
      // rather than erroring, which would hang every queue call behind it.
      window.setTimeout(function () { resolve(request.readyState === "done" ? request.result : null); }, 1500);
    });
    return dbPromise;
  }

  function lsRead() {
    try { return JSON.parse(window.localStorage.getItem(LS_KEY) || "[]"); }
    catch (error) { return []; }
  }

  function lsWrite(items) {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(items)); }
    catch (error) { /* quota: the caller is told by the failed put below */ }
  }

  function allItems() {
    return openDb().then(function (db) {
      if (!db) return lsRead();
      return new Promise(function (resolve) {
        var request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
        request.onsuccess = function () { resolve(request.result || []); };
        request.onerror = function () { resolve([]); };
      });
    }).then(function (items) {
      return items.sort(function (a, b) { return a.queuedAt - b.queuedAt; });
    });
  }

  function putItem(item) {
    return openDb().then(function (db) {
      if (!db) {
        var items = lsRead().filter(function (each) { return each.id !== item.id; });
        items.push(item);
        lsWrite(items);
        return item;
      }
      return new Promise(function (resolve, reject) {
        var request = db.transaction(STORE, "readwrite").objectStore(STORE).put(item);
        request.onsuccess = function () { resolve(item); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function deleteItem(id) {
    return openDb().then(function (db) {
      if (!db) { lsWrite(lsRead().filter(function (each) { return each.id !== id; })); return; }
      return new Promise(function (resolve) {
        var request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { resolve(); };
      });
    });
  }

  /* ------------------------------------------------------------ state */

  function online() {
    return window.navigator.onLine !== false;
  }

  function summarise(items) {
    var pending = 0, conflict = 0, failed = 0, sending = 0;
    items.forEach(function (item) {
      if (item.status === "conflict") conflict++;
      else if (item.status === "failed") failed++;
      else if (item.status === "sending") sending++;
      else pending++;
    });

    var state = "online";
    if (conflict) state = "conflict";
    else if (failed) state = "failed";
    else if (!online()) state = "offline";
    else if (sending || flushing) state = "syncing";

    return {
      state: state,
      total: items.length,
      pending: pending,
      sending: sending,
      conflict: conflict,
      failed: failed,
      online: online()
    };
  }

  function broadcast() {
    return allItems().then(function (items) {
      var summary = summarise(items);
      document.body.classList.toggle("ui-is-offline", !summary.online);
      UI.emit(document, "ui:offline:state", summary);
      renderAll(summary, items);
      return summary;
    });
  }

  /* ------------------------------------------------------------ flush */

  function retryable(status) {
    // No response at all (status 0) is a network failure. 408 and 429 are
    // explicit "try again". 5xx is the server's problem, not the payload's.
    return status === 0 || status === 408 || status === 429 || status >= 500;
  }

  function send(item) {
    // The CSRF token is read at send time, not at queue time. An item may sit
    // in the queue for hours while the officer is out of signal, by which
    // point the token captured when it was queued is long dead -- and a stale
    // token fails exactly like a missing one.
    var headers = Object.assign({ "Content-Type": "application/json" },
      UI.http.csrfHeader(), config.endpointHeaders, item.headers || {});

    return window.fetch(item.url, {
      method: item.method || "POST",
      headers: headers,
      body: item.body == null ? null : JSON.stringify(item.body),
      credentials: "same-origin"
    }).then(function (response) {
      if (response.ok) return { ok: true, status: response.status };
      return response.text().then(function (text) {
        return { ok: false, status: response.status, detail: text };
      });
    }).catch(function () {
      return { ok: false, status: 0, detail: "network" };
    });
  }

  function flush() {
    if (flushing || !online()) return Promise.resolve(null);
    flushing = true;

    return allItems().then(function (items) {
      var blockedGroups = {};

      // Sequential rather than parallel: a queue of edits to the same record
      // sent concurrently arrives in an order nobody chose.
      return items.reduce(function (chain, item) {
        return chain.then(function () {
          if (item.status === "conflict" || item.status === "failed") {
            blockedGroups[item.group || ""] = true;
            return null;
          }
          if (blockedGroups[item.group || ""]) return null;

          item.status = "sending";
          item.attempts = (item.attempts || 0) + 1;

          return putItem(item)
            .then(function () { return send(item); })
            .then(function (result) {
              if (result.ok) {
                UI.emit(document, "ui:offline:synced", { item: item, status: result.status });
                return deleteItem(item.id);
              }

              if (result.status === 409) {
                item.status = "conflict";
                item.detail = result.detail;
                blockedGroups[item.group || ""] = true;
                UI.emit(document, "ui:offline:conflict", { item: item, detail: result.detail });
                return putItem(item);
              }

              if (!retryable(result.status) || item.attempts >= MAX_ATTEMPTS) {
                item.status = "failed";
                item.detail = result.detail;
                blockedGroups[item.group || ""] = true;
                UI.emit(document, "ui:offline:failed", { item: item, status: result.status });
                return putItem(item);
              }

              item.status = "pending";
              item.detail = result.detail;
              blockedGroups[item.group || ""] = true;
              return putItem(item);
            });
        });
      }, Promise.resolve());
    }).then(function () {
      flushing = false;
      return broadcast();
    }).catch(function () {
      flushing = false;
      return broadcast();
    });
  }

  /* --------------------------------------------------------- rendering */

  function relative(ms) {
    var seconds = Math.round((Date.now() - ms) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return Math.round(seconds / 60) + " min ago";
    if (seconds < 86400) return Math.round(seconds / 3600) + " h ago";
    return Math.round(seconds / 86400) + " d ago";
  }

  function describe(summary) {
    if (summary.conflict) {
      return {
        text: summary.conflict === 1
          ? "1 item needs your attention"
          : summary.conflict + " items need your attention",
        detail: "Someone else changed the same record. Open the queue to resolve."
      };
    }
    if (summary.failed) {
      return {
        text: summary.failed + " item" + (summary.failed === 1 ? "" : "s") + " could not be uploaded",
        detail: "These will not retry on their own."
      };
    }
    if (!summary.online) {
      return summary.total
        ? { text: "Offline", detail: summary.total + " saved on this device, waiting to upload" }
        : { text: "Offline", detail: "Your work is saved on this device" };
    }
    if (summary.sending || flushing) {
      return { text: "Uploading…", detail: summary.total + " remaining" };
    }
    if (summary.total) {
      return { text: summary.total + " waiting to upload", detail: "Tap upload to send them now" };
    }
    return { text: "All work uploaded", detail: "" };
  }

  function renderStrip(strip, summary) {
    strip.setAttribute("data-ui-state", summary.state);

    var described = describe(summary);
    var text = strip.querySelector(".ui-sync-text");
    if (text) {
      text.innerHTML = UI.escape(described.text) +
        (described.detail ? '<span class="ui-sync-detail">' + UI.escape(described.detail) + "</span>" : "");
    }

    var button = strip.querySelector("[data-ui-sync-now]");
    if (button) {
      button.hidden = !summary.total || !summary.online;
      button.disabled = flushing;
    }
  }

  function renderQueue(list, items) {
    if (!items.length) {
      list.innerHTML = '<div class="ui-sync-empty">Nothing is waiting to upload.</div>';
      return;
    }

    list.innerHTML = items.map(function (item) {
      var status = item.status || "pending";
      return '<div class="ui-sync-item" data-ui-status="' + UI.escape(status) + '" data-ui-id="' + UI.escape(item.id) + '">' +
        '<span class="ui-sync-item-label">' + UI.escape(item.label || item.url) +
          '<span class="ui-sync-item-meta">Saved ' + UI.escape(relative(item.queuedAt)) +
          (item.attempts ? " · " + item.attempts + " attempt" + (item.attempts === 1 ? "" : "s") : "") +
          "</span></span>" +
        '<span class="ui-sync-badge">' + UI.escape(status) + "</span>" +
        "</div>";
    }).join("");
  }

  function renderAll(summary, items) {
    UI.qa("[data-ui-sync]").forEach(function (strip) { renderStrip(strip, summary); });
    UI.qa("[data-ui-sync-queue]").forEach(function (list) { renderQueue(list, items); });
  }

  /* ------------------------------------------------------------ forms */

  // Intercepts submit and queues the form instead of posting it, either only
  // when offline (the default) or always -- "always" gives every submission
  // the same code path, so the offline case is not a rarely-exercised
  // branch that breaks unnoticed.
  function buildForm(form) {
    if (form.dataset.uiOfflineReady) return;
    form.dataset.uiOfflineReady = "true";

    form.addEventListener("submit", function (event) {
      var always = form.getAttribute("data-ui-offline-form") === "always";
      if (!always && online()) return;

      event.preventDefault();

      var data = {};
      new window.FormData(form).forEach(function (value, key) {
        if (data[key] === undefined) data[key] = value;
        else if (Array.isArray(data[key])) data[key].push(value);
        else data[key] = [data[key], value];
      });

      UI.offline.queue({
        url: form.getAttribute("data-ui-offline-url") || form.action,
        method: (form.getAttribute("method") || "POST").toUpperCase(),
        body: data,
        label: form.getAttribute("data-ui-offline-label") || document.title,
        group: form.getAttribute("data-ui-offline-group") || ""
      }).then(function () {
        UI.emit(form, "ui:offline:queued-form", {});
        if (UI.toast) {
          UI.toast.show({
            type: "success",
            title: online() ? "Saved" : "Saved on this device",
            message: online()
              ? "Uploading now."
              : "It will upload automatically when you have a connection."
          });
        }
        if (form.getAttribute("data-ui-offline-reset") !== "false") form.reset();
      });
    });
  }

  /* ------------------------------------------------------------- init */

  function buildStrip(strip) {
    if (strip.dataset.uiSyncReady) return;
    strip.dataset.uiSyncReady = "true";

    if (!strip.querySelector(".ui-sync-text")) {
      strip.innerHTML =
        '<span class="ui-sync-dot"></span>' +
        '<span class="ui-sync-text"></span>' +
        '<span class="ui-sync-actions">' +
          '<button type="button" class="ui-btn ui-btn-sm ui-btn-default" data-ui-sync-now hidden>Upload now</button>' +
        "</span>";
    }
    strip.setAttribute("role", "status");
    strip.setAttribute("aria-live", "polite");

    strip.addEventListener("click", function (event) {
      if (UI.closest(event.target, "[data-ui-sync-now]")) flush();
    });
  }

  function init(root) {
    UI.matchAll("[data-ui-sync]", root).forEach(buildStrip);
    UI.matchAll("[data-ui-offline-form]", root).forEach(buildForm);
    broadcast();
  }

  window.addEventListener("online", function () {
    broadcast();
    if (config.autoFlush) flush();
  });
  window.addEventListener("offline", broadcast);

  UI.offline = {
    configure: function (options) {
      Object.assign(config, options || {});
      if (timer) { window.clearInterval(timer); timer = null; }
      if (config.autoFlush && config.interval) {
        timer = window.setInterval(function () { if (online()) flush(); }, config.interval);
      }
    },

    /**
     * Queue one write. Resolves once it is durably stored, not once it is
     * sent -- the caller can safely navigate away as soon as this resolves.
     */
    queue: function (item) {
      var record = {
        id: item.id || UI.uid("ui-q"),
        url: item.url,
        method: (item.method || "POST").toUpperCase(),
        body: item.body || null,
        headers: item.headers || null,
        label: item.label || "",
        group: item.group || "",
        status: "pending",
        attempts: 0,
        queuedAt: Date.now()
      };
      return putItem(record).then(function () {
        UI.emit(document, "ui:offline:queued", { item: record });
        return broadcast();
      }).then(function () {
        if (config.autoFlush && online()) flush();
        return record;
      });
    },

    /** Everything currently queued, oldest first. */
    pending: allItems,

    /** Try to send everything now. */
    flush: flush,

    /** Current counts and connection state. */
    status: function () { return allItems().then(summarise); },

    /**
     * Resolve a conflicted or failed item. "retry" puts it back in the
     * queue; "discard" removes it -- and is the only path by which field
     * data ever leaves the device unsent, so it must be a deliberate act
     * with the item in front of the person doing it.
     */
    resolve: function (id, action) {
      return allItems().then(function (items) {
        var item = items.filter(function (each) { return each.id === id; })[0];
        if (!item) return null;
        if (action === "discard") return deleteItem(id).then(broadcast);
        item.status = "pending";
        item.attempts = 0;
        item.detail = null;
        return putItem(item).then(broadcast).then(function () { return flush(); });
      });
    },

    /** Remove everything. Intended for sign-out on a shared device. */
    clear: function () {
      return allItems().then(function (items) {
        return Promise.all(items.map(function (item) { return deleteItem(item.id); }));
      }).then(broadcast);
    }
  };

  UI.offline.configure({});
  UI.register(init);
})(window, document);
