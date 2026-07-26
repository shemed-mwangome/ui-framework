(function (window, document) {
  "use strict";
  var UI = window.UI;

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

  function build(wrapper) {
    if (wrapper.dataset.uiReady) return;
    wrapper.dataset.uiReady = "true";

    var table = wrapper.tagName === "TABLE" ? wrapper : UI.q("table", wrapper);
    if (!table) return;
    var tbody = UI.q("tbody", table);
    var headers = UI.qa("thead th", table);
    var allRows = UI.qa("tr", tbody);
    var pageSize = Number(wrapper.getAttribute("data-ui-page-size")) || 10;
    var currentPage = 1;
    var sortIndex = -1;
    var sortDirection = "ascending";
    var query = "";

    // Insert relative to `table` (not `wrapper`), since `data-ui-table` may
    // be on the <table> itself: a <nav> can't legally live inside a table,
    // and a node can't be inserted before itself.
    if (wrapper.getAttribute("data-ui-search") !== "false") {
      var toolbar = document.createElement("div");
      toolbar.className = "ui-table-toolbar";
      toolbar.innerHTML = '<input type="search" class="ui-control ui-control-sm ui-table-search" placeholder="' +
        UI.escape(wrapper.getAttribute("data-ui-search-placeholder") || "Search") + '">';
      table.parentNode.insertBefore(toolbar, table);

      UI.q("input", toolbar).addEventListener("input", function () {
        query = this.value.trim().toLowerCase();
        currentPage = 1;
        renderPage();
      });
    }

    var pagination = document.createElement("nav");
    pagination.className = "ui-table-pagination";
    table.insertAdjacentElement("afterend", pagination);

    headers.forEach(function (th, index) {
      if (th.getAttribute("data-ui-sort") === "false" || !th.hasAttribute("data-ui-sort")) return;
      th.classList.add("ui-table-sortable");
      th.setAttribute("aria-sort", "none");
      th.addEventListener("click", function () {
        if (sortIndex === index) {
          sortDirection = sortDirection === "ascending" ? "descending" : "ascending";
        } else {
          sortIndex = index;
          sortDirection = "ascending";
        }
        headers.forEach(function (other) { other.setAttribute("aria-sort", other === th ? sortDirection : "none"); });
        currentPage = 1;
        renderPage();
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

    function renderPagination(totalPages) {
      pagination.innerHTML = "";
      if (totalPages <= 1) return;

      var list = document.createElement("ul");
      list.className = "ui-pagination";

      function addPage(label, page, disabled, active) {
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.href = "#";
        link.className = "ui-page-link" + (active ? " ui-active" : "") + (disabled ? " ui-disabled" : "");
        link.textContent = label;
        link.addEventListener("click", function (event) {
          event.preventDefault();
          if (disabled) return;
          currentPage = page;
          renderPage();
        });
        item.appendChild(link);
        list.appendChild(item);
      }

      addPage("‹", currentPage - 1, currentPage === 1, false);
      for (var page = 1; page <= totalPages; page++) addPage(String(page), page, false, page === currentPage);
      addPage("›", currentPage + 1, currentPage === totalPages, false);

      pagination.appendChild(list);
    }

    function renderPage() {
      var rows = sortedRows(filteredRows());
      var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      currentPage = Math.min(currentPage, totalPages);

      tbody.innerHTML = "";
      if (!rows.length) {
        var emptyRow = document.createElement("tr");
        emptyRow.className = "ui-table-empty-row";
        var emptyCell = document.createElement("td");
        emptyCell.colSpan = headers.length || 1;
        emptyCell.textContent = wrapper.getAttribute("data-ui-empty-text") || "No matching records";
        emptyRow.appendChild(emptyCell);
        tbody.appendChild(emptyRow);
      } else {
        rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).forEach(function (row) { tbody.appendChild(row); });
      }

      renderPagination(totalPages);
      UI.emit(wrapper, "ui:table:change", { page: currentPage, totalPages: totalPages, visible: rows.length, total: allRows.length });
    }

    renderPage();
  }

  function init(root) {
    UI.qa("[data-ui-table]", root).forEach(build);
  }

  UI.register(init);
})(window, document);
