(function (window, document) {
  "use strict";
  var UI = window.UI;

  function build(select) {
    if (!select || select.dataset.uiReady) return;
    select.dataset.uiReady = "true";
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

  UI.multiselect = { build: build };
  UI.register(init);
})(window, document);
