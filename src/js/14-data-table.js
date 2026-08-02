(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Smart tables.
   *
   * Two sourcing modes share one set of controls, so a screen can start as a
   * server-rendered table and move to a paged endpoint without its markup or
   * its event contract changing:
   *
   *   <div data-ui-table>…</div>                      rows already in the DOM
   *   <div data-ui-table data-ui-url="/api/records">   rows fetched per page
   *
   * The endpoint receives `?page=&size=&q=&sort=&dir=` and returns either
   *   {"rows": [{…}|[…]], "total": n}   -- mapped via <th data-ui-field="…">
   *   {"html": "<tr>…</tr>", "total": n} -- for stacks that would rather render
   *                                         the rows server-side
   *
   * Client mode keeps every row in memory and does the work locally; that is
   * fine to a few thousand rows and wrong beyond it, which is what server mode
   * is for.
   */

  var SERVER_SEARCH_DEBOUNCE = 300;

  function compareValues(a, b, type) {
    if (type === "number") return (parseFloat(a) || 0) - (parseFloat(b) || 0);
    if (type === "date") return new Date(a).getTime() - new Date(b).getTime();
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }

  function cellValue(row, index) {
    var cell = row.children[index];
    if (!cell) return "";
    return cell.getAttribute("data-ui-sort-value") || cell.textContent.trim();
  }

  /** Wraps a value for CSV: quote it and double any embedded quotes. */
  function csvCell(value) {
    var text = String(value == null ? "" : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function build(wrapper) {
    if (wrapper.dataset.uiReady) return;
    wrapper.dataset.uiReady = "true";

    var table = wrapper.tagName === "TABLE" ? wrapper : UI.q("table", wrapper);
    if (!table) return;
    var tbody = UI.q("tbody", table);
    var headers = UI.qa("thead th", table);
    var headerRow = UI.q("thead tr", table);

    // When the table is wrapped for horizontal scrolling (`.ui-table-responsive`,
    // the documented pattern for wide tables on narrow screens), the toolbar
    // and pagination must sit *outside* that scroll box. Anchoring them to the
    // raw `table` element instead put them inside it, so on a narrow screen
    // the search box, column menu and export button scrolled out of view
    // along with the table instead of staying put above/below it.
    var scrollBox = UI.closest(table, ".ui-table-responsive") || table;

    var url = wrapper.getAttribute("data-ui-url");
    var serverMode = !!url;
    var allRows = serverMode ? [] : UI.qa("tr", tbody);

    var pageSize = Number(wrapper.getAttribute("data-ui-page-size")) || 10;
    var currentPage = 1;
    var sortIndex = -1;
    var sortDirection = "ascending";
    var query = "";
    var serverTotal = 0;
    var serverRows = [];
    var requestToken = 0;
    var searchTimer = null;

    var selectable = wrapper.hasAttribute("data-ui-select");
    var selected = Object.create(null);

    var showSearch = wrapper.getAttribute("data-ui-search") !== "false";
    var showPageSizePicker = wrapper.getAttribute("data-ui-page-size-selector") !== "false";
    var exportName = wrapper.getAttribute("data-ui-export");
    var columnToggle = wrapper.hasAttribute("data-ui-columns");

    // ---------------------------------------------------------------- select

    var selectAllBox = null;

    function rowId(row) {
      return row.getAttribute("data-ui-row-id") || "";
    }

    function selectedIds() {
      return Object.keys(selected).filter(function (id) { return selected[id]; });
    }

    function addSelectionColumn() {
      var th = document.createElement("th");
      th.className = "ui-table-select-cell";
      th.innerHTML = '<input type="checkbox" class="ui-check" aria-label="' +
        UI.escape(UI.t("table.selectAll")) + '">';
      headerRow.insertBefore(th, headerRow.firstChild);
      headers = UI.qa("thead th", table);

      selectAllBox = UI.q("input", th);
      selectAllBox.addEventListener("change", function () {
        var checked = this.checked;
        UI.qa("tbody tr:not(.ui-table-empty-row)", table).forEach(function (row) {
          var id = rowId(row);
          if (!id) return;
          selected[id] = checked;
          var box = UI.q(".ui-table-select-cell input", row);
          if (box) box.checked = checked;
          row.classList.toggle("ui-selected", checked);
        });
        emitSelection();
      });
    }

    function decorateRowForSelection(row) {
      if (UI.q(".ui-table-select-cell", row)) return;
      var id = rowId(row);
      var cell = document.createElement("td");
      cell.className = "ui-table-select-cell";
      cell.innerHTML = '<input type="checkbox" class="ui-check"' +
        (selected[id] ? " checked" : "") + ' aria-label="' +
        UI.escape(UI.t("table.selectRow")) + '">';
      row.insertBefore(cell, row.firstChild);
      row.classList.toggle("ui-selected", !!selected[id]);

      UI.q("input", cell).addEventListener("change", function () {
        selected[id] = this.checked;
        row.classList.toggle("ui-selected", this.checked);
        syncSelectAll();
        emitSelection();
      });
    }

    function syncSelectAll() {
      if (!selectAllBox) return;
      var visible = UI.qa("tbody tr:not(.ui-table-empty-row)", table);
      var ids = visible.map(rowId).filter(Boolean);
      var chosen = ids.filter(function (id) { return selected[id]; });
      selectAllBox.checked = ids.length > 0 && chosen.length === ids.length;
      selectAllBox.indeterminate = chosen.length > 0 && chosen.length < ids.length;
    }

    function emitSelection() {
      var ids = selectedIds();
      if (selectionBar) {
        var wasHidden = selectionBar.hidden;
        selectionBar.hidden = ids.length === 0;
        // A fresh selection (bar going from fully hidden to shown) always
        // starts expanded -- collapsing is a per-viewing choice, not one
        // that should carry over and hide bulk actions on the next unrelated
        // selection.
        if (wasHidden && !selectionBar.hidden) {
          selectionBar.classList.remove("ui-collapsed");
          if (selectionToggle) selectionToggle.setAttribute("aria-expanded", "true");
        }
        var label = UI.q(".ui-table-selection-count", selectionBar);
        if (label) label.textContent = UI.t("table.selected", { count: ids.length });
      }
      UI.emit(wrapper, "ui:table:select", { selected: ids, count: ids.length });
    }

    var selectionBar = null;
    var selectionToggle = null;
    if (selectable) {
      addSelectionColumn();
      selectionBar = UI.q("[data-ui-table-selection]", wrapper);
      if (selectionBar) {
        selectionBar.hidden = true;
        if (!UI.q(".ui-table-selection-count", selectionBar)) {
          var count = document.createElement("span");
          count.className = "ui-table-selection-count";
          selectionBar.insertBefore(count, selectionBar.firstChild);
        }

        // The count doubles as the collapse/expand control -- click (or
        // Enter/Space) hides the bulk-action buttons down to just the count
        // chip, so the bar can be tucked out of the way without clearing the
        // selection, and brought back the same way.
        selectionToggle = UI.q(".ui-table-selection-count", selectionBar);
        selectionToggle.setAttribute("role", "button");
        selectionToggle.setAttribute("tabindex", "0");
        selectionToggle.setAttribute("aria-expanded", "true");
        selectionToggle.title = UI.t("table.selectionToggle");

        var toggleCollapsed = function () {
          var collapsed = selectionBar.classList.toggle("ui-collapsed");
          selectionToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        };
        selectionToggle.addEventListener("click", toggleCollapsed);
        selectionToggle.addEventListener("keydown", function (event) {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleCollapsed();
        });
      }
    }

    // --------------------------------------------------------------- toolbar

    var toolbar = null;
    if (showSearch || showPageSizePicker || exportName || columnToggle) {
      toolbar = document.createElement("div");
      toolbar.className = "ui-table-toolbar";

      if (showPageSizePicker) {
        var sizes = (wrapper.getAttribute("data-ui-page-sizes") || "5,10,25,50")
          .split(",").map(function (value) { return Number(value.trim()); }).filter(Boolean);
        if (sizes.indexOf(pageSize) === -1) sizes.push(pageSize);
        sizes.sort(function (a, b) { return a - b; });

        var sizeField = document.createElement("label");
        sizeField.className = "ui-table-page-size";
        sizeField.innerHTML = UI.escape(UI.t("table.showPrefix")) + " " +
          '<select class="ui-select ui-control-sm">' +
          sizes.map(function (size) {
            return '<option value="' + size + '"' + (size === pageSize ? " selected" : "") + ">" + size + "</option>";
          }).join("") +
          "</select> " + UI.escape(UI.t("table.showSuffix"));
        toolbar.appendChild(sizeField);

        UI.q("select", sizeField).addEventListener("change", function () {
          pageSize = Number(this.value) || pageSize;
          currentPage = 1;
          refresh();
        });
      }

      var toolbarEnd = document.createElement("div");
      toolbarEnd.className = "ui-table-toolbar-end";
      toolbar.appendChild(toolbarEnd);

      if (columnToggle) toolbarEnd.appendChild(buildColumnMenu());
      if (exportName) toolbarEnd.appendChild(buildExportButton());

      if (showSearch) {
        var search = document.createElement("input");
        search.type = "search";
        search.className = "ui-control ui-control-sm ui-table-search";
        search.placeholder = wrapper.getAttribute("data-ui-search-placeholder") || UI.t("table.search");
        search.setAttribute("aria-label", UI.t("table.searchLabel"));
        toolbarEnd.appendChild(search);

        search.addEventListener("input", function () {
          var value = this.value.trim().toLowerCase();
          // Server mode debounces: one request per pause, not per keystroke.
          if (serverMode) {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(function () {
              query = value;
              currentPage = 1;
              refresh();
            }, SERVER_SEARCH_DEBOUNCE);
          } else {
            query = value;
            currentPage = 1;
            refresh();
          }
        });
      }

      // Insert relative to `scrollBox` (the .ui-table-responsive wrapper when
      // there is one, else `table` itself) rather than `wrapper`: `data-ui-table`
      // may be on the <table> itself, where a <nav> can't legally live inside
      // it and a node can't be inserted before itself.
      scrollBox.parentNode.insertBefore(toolbar, scrollBox);
    }

    // ------------------------------------------------------- column toggling

    function dataColumns() {
      // Skip the injected selection column, which is never toggleable.
      return headers.filter(function (th) {
        return !th.classList.contains("ui-table-select-cell");
      });
    }

    function applyColumnVisibility() {
      dataColumns().forEach(function (th) {
        var index = headers.indexOf(th);
        var hidden = th.hasAttribute("data-ui-hidden");
        th.hidden = hidden;
        UI.qa("tbody tr", table).forEach(function (row) {
          var cell = row.children[index];
          if (cell && !row.classList.contains("ui-table-empty-row")) cell.hidden = hidden;
        });
      });
    }

    function buildColumnMenu() {
      var holder = document.createElement("div");
      holder.className = "ui-dropdown ui-dropdown-end ui-table-columns";
      holder.innerHTML =
        '<button type="button" class="ui-btn ui-btn-sm ui-btn-outline-secondary" data-ui-dropdown>' +
        UI.escape(UI.t("table.columns")) + "</button>" +
        '<div class="ui-dropdown-menu"></div>';

      var menu = UI.q(".ui-dropdown-menu", holder);
      dataColumns().forEach(function (th) {
        var label = document.createElement("label");
        label.className = "ui-dropdown-item ui-table-column-option";
        label.innerHTML =
          '<input type="checkbox" class="ui-check"' + (th.hasAttribute("data-ui-hidden") ? "" : " checked") + ">" +
          "<span>" + UI.escape(th.textContent.trim()) + "</span>";
        label.querySelector("input").addEventListener("change", function () {
          if (this.checked) th.removeAttribute("data-ui-hidden");
          else th.setAttribute("data-ui-hidden", "");
          applyColumnVisibility();
          UI.emit(wrapper, "ui:table:columns", {
            hidden: dataColumns().filter(function (c) { return c.hasAttribute("data-ui-hidden"); })
              .map(function (c) { return c.textContent.trim(); })
          });
        });
        menu.appendChild(label);
      });

      return holder;
    }

    // ---------------------------------------------------------------- export

    function currentExportRows() {
      var visibleHeaders = dataColumns().filter(function (th) { return !th.hidden; });
      var indexes = visibleHeaders.map(function (th) { return headers.indexOf(th); });

      var head = visibleHeaders.map(function (th) { return th.textContent.trim(); });
      var body = exportSourceRows().map(function (row) {
        return indexes.map(function (index) {
          var cell = row.children[index];
          if (!cell) return "";
          return cell.getAttribute("data-ui-export-value") || cell.textContent.trim();
        });
      });

      return [head].concat(body);
    }

    function exportSourceRows() {
      // Client mode exports everything matching the current filter and sort,
      // not just the page on screen -- exporting one page is almost never what
      // someone wants. Server mode can only offer what it has been sent.
      if (serverMode) return UI.qa("tbody tr:not(.ui-table-empty-row)", table);
      return sortedRows(filteredRows());
    }

    function buildExportButton() {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "ui-btn ui-btn-sm ui-btn-outline-secondary ui-table-export";
      button.textContent = UI.t("table.export");

      button.addEventListener("click", function () {
        var rows = currentExportRows();
        // ﻿ makes Excel read the file as UTF-8 instead of the local
        // codepage, which otherwise mangles non-ASCII names. Written
        // as an escape rather than a literal BOM so an editor or a
        // normalising tool cannot silently strip it from the source.
        var csv = "﻿" + rows.map(function (row) {
          return row.map(csvCell).join(",");
        }).join("\r\n");

        var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = (exportName === "csv" ? "export" : exportName) + ".csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);

        UI.emit(wrapper, "ui:table:export", { rows: rows.length - 1 });
      });

      return button;
    }

    // ------------------------------------------------------------ pagination

    var pagination = document.createElement("nav");
    pagination.className = "ui-table-pagination";
    scrollBox.insertAdjacentElement("afterend", pagination);

    // Only sortable headers carry aria-sort. Setting aria-sort="none" on an
    // opted-out column would announce it to screen readers as a sortable
    // column that merely happens to be unsorted.
    var sortableHeaders = headers.filter(function (th) {
      return th.hasAttribute("data-ui-sort") && th.getAttribute("data-ui-sort") !== "false";
    });

    sortableHeaders.forEach(function (th) {
      var index = headers.indexOf(th);
      th.classList.add("ui-table-sortable");
      th.setAttribute("aria-sort", "none");
      th.addEventListener("click", function () {
        if (sortIndex === index) {
          sortDirection = sortDirection === "ascending" ? "descending" : "ascending";
        } else {
          sortIndex = index;
          sortDirection = "ascending";
        }
        sortableHeaders.forEach(function (other) {
          other.setAttribute("aria-sort", other === th ? sortDirection : "none");
        });
        currentPage = 1;
        refresh();
      });
    });

    function filteredRows() {
      if (!query) return allRows.slice();
      return allRows.filter(function (row) { return row.textContent.toLowerCase().indexOf(query) !== -1; });
    }

    function sortedRows(rows) {
      if (sortIndex === -1) return rows;
      var type = headers[sortIndex].getAttribute("data-ui-sort");
      var sorted = rows.slice().sort(function (a, b) {
        return compareValues(cellValue(a, sortIndex), cellValue(b, sortIndex), type);
      });
      if (sortDirection === "descending") sorted.reverse();
      return sorted;
    }

    var showStatus = wrapper.getAttribute("data-ui-status") !== "false";

    // "5 of 5 records" -- DataTables' classic always-on info text. Previously
    // this table only announced it to screen readers (UI.announce, below) and
    // showed nothing sighted users could see; with a small enough result set
    // that pagination itself has nothing to render (totalPages <= 1), the
    // table looked like it had silently dropped the row count entirely.
    function renderStatus(visible, total) {
      if (!showStatus) return;
      var status = UI.q(".ui-table-status", pagination);
      if (!status) {
        status = document.createElement("span");
        status.className = "ui-table-status";
        pagination.appendChild(status);
      }
      status.textContent = UI.t("table.status", { visible: visible, total: total });
    }

    function renderPagination(visible, total, totalPages) {
      pagination.innerHTML = "";
      renderStatus(visible, total);
      if (totalPages <= 1) return;

      var list = document.createElement("ul");
      list.className = "ui-pagination";

      function addPage(label, page, disabled, active, ariaLabel) {
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.href = "#";
        link.className = "ui-page-link" + (active ? " ui-active" : "") + (disabled ? " ui-disabled" : "");
        link.textContent = label;
        if (ariaLabel) link.setAttribute("aria-label", ariaLabel);
        if (active) link.setAttribute("aria-current", "page");
        link.addEventListener("click", function (event) {
          event.preventDefault();
          if (disabled) return;
          currentPage = page;
          refresh();
        });
        item.appendChild(link);
        list.appendChild(item);
      }

      addPage("‹", currentPage - 1, currentPage === 1, false, UI.t("table.previous"));
      for (var page = 1; page <= totalPages; page++) addPage(String(page), page, false, page === currentPage);
      addPage("›", currentPage + 1, currentPage === totalPages, false, UI.t("table.next"));

      pagination.appendChild(list);
    }

    function showEmptyRow() {
      var emptyRow = document.createElement("tr");
      emptyRow.className = "ui-table-empty-row";
      var emptyCell = document.createElement("td");
      emptyCell.colSpan = headers.length || 1;
      emptyCell.textContent = wrapper.getAttribute("data-ui-empty-text") || UI.t("table.empty");
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    }

    function afterRender(visible, total, totalPages) {
      if (selectable) {
        UI.qa("tbody tr:not(.ui-table-empty-row)", table).forEach(decorateRowForSelection);
        syncSelectAll();
      }
      applyColumnVisibility();
      renderPagination(visible, total, totalPages);

      UI.emit(wrapper, "ui:table:change", {
        page: currentPage,
        totalPages: totalPages,
        visible: visible,
        total: total
      });
    }

    // ----------------------------------------------------------- client mode

    function renderClientPage() {
      var rows = sortedRows(filteredRows());
      var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      currentPage = Math.min(currentPage, totalPages);

      tbody.innerHTML = "";
      if (!rows.length) {
        showEmptyRow();
      } else {
        rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).forEach(function (row) {
          tbody.appendChild(row);
        });
      }

      afterRender(rows.length, allRows.length, totalPages);
    }

    // ----------------------------------------------------------- server mode

    function fieldsFromHeaders() {
      return dataColumns().map(function (th) {
        return th.getAttribute("data-ui-field") || "";
      });
    }

    function renderServerRows(rows) {
      tbody.innerHTML = "";
      if (!rows.length) {
        showEmptyRow();
        return;
      }

      var fields = fieldsFromHeaders();
      rows.forEach(function (item) {
        var tr = document.createElement("tr");
        if (item && item.id != null) tr.setAttribute("data-ui-row-id", String(item.id));

        fields.forEach(function (field, index) {
          var td = document.createElement("td");
          var value = Array.isArray(item) ? item[index] : (field ? item[field] : "");
          td.textContent = value == null ? "" : String(value);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    function setLoading(on) {
      wrapper.classList.toggle("ui-table-loading", on);
      if (table) table.setAttribute("aria-busy", on ? "true" : "false");
    }

    function fetchServerPage() {
      var token = ++requestToken;
      setLoading(true);

      var sortField = "";
      if (sortIndex !== -1 && headers[sortIndex]) {
        sortField = headers[sortIndex].getAttribute("data-ui-field") ||
          headers[sortIndex].textContent.trim();
      }

      var params = new URLSearchParams({
        page: String(currentPage),
        size: String(pageSize)
      });
      if (query) params.set("q", query);
      if (sortField) {
        params.set("sort", sortField);
        params.set("dir", sortDirection === "descending" ? "desc" : "asc");
      }

      var endpoint = url + (url.indexOf("?") === -1 ? "?" : "&") + params.toString();

      fetch(endpoint, {
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }
      })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (data) {
          // Discard a slow earlier page that lands after a newer one.
          if (token !== requestToken) return;
          setLoading(false);

          serverTotal = Number(data.total) || 0;
          serverRows = data.rows || [];

          if (typeof data.html === "string") {
            tbody.innerHTML = data.html;
            if (!UI.qa("tr", tbody).length) showEmptyRow();
          } else {
            renderServerRows(serverRows);
          }

          var totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
          afterRender(UI.qa("tbody tr:not(.ui-table-empty-row)", table).length, serverTotal, totalPages);
          UI.announce(UI.t("table.status", { visible: serverRows.length, total: serverTotal }));
        })
        .catch(function (error) {
          if (token !== requestToken) return;
          setLoading(false);
          tbody.innerHTML = "";
          var errorRow = document.createElement("tr");
          errorRow.className = "ui-table-empty-row ui-table-error-row";
          var errorCell = document.createElement("td");
          errorCell.colSpan = headers.length || 1;
          errorCell.textContent = wrapper.getAttribute("data-ui-error-text") || UI.t("table.error");
          errorRow.appendChild(errorCell);
          tbody.appendChild(errorRow);
          renderPagination(0);
          UI.emit(wrapper, "ui:table:error", { error: error });
        });
    }

    function refresh() {
      if (serverMode) fetchServerPage();
      else renderClientPage();
    }

    UI.cleanup(wrapper, function () {
      window.clearTimeout(searchTimer);
      requestToken++;
    });

    wrapper._uiTable = {
      refresh: refresh,
      selected: selectedIds,
      clearSelection: function () {
        selected = Object.create(null);
        UI.qa("tbody tr", table).forEach(function (row) {
          row.classList.remove("ui-selected");
          var box = UI.q(".ui-table-select-cell input", row);
          if (box) box.checked = false;
        });
        syncSelectAll();
        emitSelection();
      }
    };

    refresh();
  }

  function init(root) {
    UI.matchAll("[data-ui-table]", root).forEach(build);
  }

  UI.register(init);

  UI.table = {
    /** Re-runs the current query/page — call after saving a row. */
    refresh: function (target) {
      var wrapper = typeof target === "string" ? UI.q(target) : target;
      if (wrapper && wrapper._uiTable) wrapper._uiTable.refresh();
    },
    selected: function (target) {
      var wrapper = typeof target === "string" ? UI.q(target) : target;
      return wrapper && wrapper._uiTable ? wrapper._uiTable.selected() : [];
    },
    clearSelection: function (target) {
      var wrapper = typeof target === "string" ? UI.q(target) : target;
      if (wrapper && wrapper._uiTable) wrapper._uiTable.clearSelection();
    }
  };
})(window, document);
