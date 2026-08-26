(function (window, document) {
  "use strict";
  var UI = window.UI;

  function build(select) {
    if (!select || select.dataset.uiMultiselectReady) return;
    select.dataset.uiMultiselectReady = "true";
    select.classList.add("ui-multiselect-native");

    var wrapper = document.createElement("div");
    wrapper.className = "ui-multiselect";
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ui-multiselect-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<span class="ui-multiselect-summary"></span>';

    var menu = document.createElement("div");
    menu.className = "ui-multiselect-menu";

    if (select.getAttribute("data-search") !== "false") {
      var search = document.createElement("div");
      search.className = "ui-multiselect-search";
      search.innerHTML = '<input type="search" class="ui-control ui-control-sm" placeholder="' +
        UI.escape(select.getAttribute("data-search-placeholder") || UI.t("select.search")) + '">';
      menu.appendChild(search);
    }

    if (select.getAttribute("data-select-all") !== "false") {
      var actions = document.createElement("div");
      actions.className = "ui-multiselect-actions";
      actions.innerHTML =
        '<button type="button" class="ui-multiselect-action" data-ui-ms-action="all">' + UI.escape(UI.t("select.all")) + '</button>' +
        '<button type="button" class="ui-multiselect-action" data-ui-ms-action="clear">' + UI.escape(UI.t("select.clear")) + '</button>';
      menu.appendChild(actions);
    }

    var options = document.createElement("div");
    options.className = "ui-multiselect-options";
    options.setAttribute("role", "listbox");
    options.setAttribute("aria-multiselectable", "true");

    Array.prototype.forEach.call(select.options, function (option, index) {
      var row = document.createElement("label");
      row.className = "ui-multiselect-option";
      row.innerHTML =
        '<input type="checkbox" value="' + UI.escape(option.value) + '" ' +
        (option.selected ? "checked " : "") + (option.disabled ? "disabled " : "") + '>' +
        '<span>' + UI.escape(option.text) + '</span>';
      row.querySelector("input").dataset.optionIndex = index;
      options.appendChild(row);
    });

    var empty = document.createElement("div");
    empty.className = "ui-multiselect-empty";
    empty.textContent = select.getAttribute("data-empty-text") || UI.t("select.empty");

    menu.appendChild(options);
    menu.appendChild(empty);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    function update() {
      var selected = Array.prototype.filter.call(select.options, function (option) { return option.selected; });
      var summary = UI.q(".ui-multiselect-summary", wrapper);
      var display = select.getAttribute("data-display") || "count";
      var placeholder = select.getAttribute("data-placeholder") || UI.t("select.placeholder");
      summary.innerHTML = "";

      UI.qa(".ui-multiselect-option", wrapper).forEach(function (row, index) {
        row.classList.toggle("ui-selected", select.options[index].selected);
        var check = row.querySelector("input");
        check.checked = select.options[index].selected;
      });

      if (!selected.length) {
        summary.textContent = placeholder;
        summary.classList.add("ui-multiselect-placeholder");
      } else if (display === "tags") {
        summary.classList.remove("ui-multiselect-placeholder");
        var maxTags = Number(select.getAttribute("data-max-tags")) || 3;
        var visible = selected.slice(0, maxTags);
        var overflowCount = selected.length - visible.length;

        var tags = document.createElement("span");
        tags.className = "ui-multiselect-tags";
        visible.forEach(function (option) {
          var tag = document.createElement("span");
          tag.className = "ui-multiselect-tag";
          tag.innerHTML =
            '<span class="ui-multiselect-tag-text">' + UI.escape(option.text) + '</span>' +
            '<button type="button" class="ui-multiselect-tag-remove" aria-label="Remove">&times;</button>';
          tag.querySelector("button").addEventListener("click", function (event) {
            event.stopPropagation();
            option.selected = false;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          });
          tags.appendChild(tag);
        });

        if (overflowCount > 0) {
          var overflow = document.createElement("span");
          overflow.className = "ui-multiselect-tag ui-multiselect-tag-overflow";
          overflow.textContent = "+" + overflowCount;
          overflow.title = selected.slice(maxTags).map(function (option) { return option.text; }).join(", ");
          tags.appendChild(overflow);
        }

        summary.appendChild(tags);
      } else {
        summary.classList.remove("ui-multiselect-placeholder");
        summary.textContent = selected.length === 1 ? selected[0].text : selected.length + " selected";
      }
    }

    trigger.addEventListener("click", function () {
      var open = wrapper.classList.toggle("ui-open");
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      // Fetched on first open rather than on page load: a filter the user
      // never touches should not cost a request, and a form with six remote
      // multi-selects should not fire six on arrival.
      if (open && select.hasAttribute("data-ui-url")) loadRemote(select);
      if (open) {
        wrapper._uiFloatCleanup = UI.floatPanel(trigger, menu, {
          matchWidth: true,
          onDismiss: function () { closeWrapper(wrapper); }
        });
      } else if (wrapper._uiFloatCleanup) {
        wrapper._uiFloatCleanup();
        wrapper._uiFloatCleanup = null;
      }
    });

    options.addEventListener("change", function (event) {
      if (!event.target.matches('input[type="checkbox"]')) return;
      var index = Number(event.target.dataset.optionIndex);
      select.options[index].selected = event.target.checked;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    menu.addEventListener("click", function (event) {
      var action = UI.closest(event.target, "[data-ui-ms-action]");
      if (!action) return;
      var selectAll = action.getAttribute("data-ui-ms-action") === "all";
      Array.prototype.forEach.call(select.options, function (option) {
        if (!option.disabled) option.selected = selectAll;
      });
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    var searchInput = UI.q(".ui-multiselect-search input", wrapper);
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        var query = this.value.toLowerCase();
        var visible = 0;
        UI.qa(".ui-multiselect-option", wrapper).forEach(function (row) {
          var match = row.textContent.toLowerCase().indexOf(query) !== -1;
          row.style.display = match ? "flex" : "none";
          if (match) visible++;
        });
        empty.style.display = visible ? "none" : "block";
      });
    }

    select.addEventListener("change", update);
    update();
  }

  /**
   * Remote options.
   *
   * The combobox and the smart table have both been able to load from an
   * endpoint since they were written; the multi-select could not, so a list
   * of 400 operators had to be rendered into the page as 400 <option>
   * elements whether or not the field was ever opened.
   *
   *   <select multiple data-ui-multiselect
   *           data-ui-url="/operators/options"
   *           data-ui-value-key="id" data-ui-label-key="name"></select>
   *
   * The endpoint returns `[{id, name}]`, or `{results: [...]}`. Options are
   * fetched once, on first open rather than on page load -- a filter the user
   * never touches should not cost a request. Whatever is already selected in
   * the markup is preserved, so a server-rendered page that arrives with
   * values set does not lose them when the full list lands.
   */
  function loadRemote(select) {
    if (select._uiOptionsLoaded || select._uiOptionsLoading) return Promise.resolve();
    var url = select.getAttribute("data-ui-url");
    if (!url) return Promise.resolve();

    select._uiOptionsLoading = true;
    var valueKey = select.getAttribute("data-ui-value-key") || "value";
    var labelKey = select.getAttribute("data-ui-label-key") || "label";

    return UI.http.fetch(url, { headers: { Accept: "application/json" } })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        var list = Array.isArray(data) ? data : (data.results || data.items || []);
        var chosen = {};
        UI.qa("option", select).forEach(function (option) {
          if (option.selected) chosen[option.value] = true;
        });

        select.innerHTML = "";
        list.forEach(function (item) {
          var option = document.createElement("option");
          option.value = item && item[valueKey] != null ? String(item[valueKey]) : String(item);
          // textContent, not innerHTML: a label is data and may legitimately
          // contain characters that would otherwise be parsed as markup.
          option.textContent = item && item[labelKey] != null ? String(item[labelKey]) : String(item);
          if (chosen[option.value]) option.selected = true;
          select.appendChild(option);
        });

        select._uiOptionsLoaded = true;
        select._uiOptionsLoading = false;
        UI.emit(select, "ui:multiselect:options", { count: list.length });
        refresh(select);
      })
      .catch(function (error) {
        select._uiOptionsLoading = false;
        UI.emit(select, "ui:multiselect:error", { error: error, status: error && error.status });
      });
  }

  function init(root) {
    UI.matchAll("select[multiple][data-ui-multiselect]", root).forEach(build);
  }

  function closeWrapper(wrapper) {
    wrapper.classList.remove("ui-open");
    var trigger = UI.q(".ui-multiselect-trigger", wrapper);
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (wrapper._uiFloatCleanup) {
      wrapper._uiFloatCleanup();
      wrapper._uiFloatCleanup = null;
    }
  }

  document.addEventListener("click", function (event) {
    if (!UI.closest(event.target, ".ui-multiselect")) {
      UI.qa(".ui-multiselect.ui-open").forEach(closeWrapper);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    var open = UI.qa(".ui-multiselect.ui-open");
    if (!open.length) return;
    open.forEach(closeWrapper);
    event.stopImmediatePropagation();
  });

  // build() is a one-shot init guarded by data-ui-multiselect-ready, so it silently
  // no-ops on an already-built select. Cascading fields (e.g. an operator list
  // repopulated after its region changes) need to rebuild the visible widget from a
  // fresh option list -- refresh() unwraps back to the plain <select> and re-runs
  // build() against it.
  function refresh(select) {
    if (!select) return;
    var wrapper = select.closest(".ui-multiselect");
    if (wrapper) {
      wrapper.parentNode.insertBefore(select, wrapper);
      wrapper.remove();
    }
    delete select.dataset.uiMultiselectReady;
    select.classList.remove("ui-multiselect-native");
    build(select);
  }

  UI.multiselect = {
    build: build,
    refresh: refresh,
    /** Force a remote option list to reload -- after the parent field changes. */
    load: function (target) {
      var select = typeof target === "string" ? UI.q(target) : target;
      if (!select) return Promise.resolve();
      select._uiOptionsLoaded = false;
      return loadRemote(select);
    }
  };
  UI.register(init);
})(window, document);
