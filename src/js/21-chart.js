(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Dependency-free SVG charts.
   *
   *   <div data-ui-chart="bar"  data-ui-values="12,19,3" data-ui-labels="Jan,Feb,Mar"></div>
   *   <div data-ui-chart="line" data-ui-values="…"></div>
   *   <div data-ui-chart="donut" data-ui-values="…" data-ui-labels="…"></div>
   *   <span data-ui-chart="sparkline" data-ui-values="…"></span>
   *
   * Scope is deliberately narrow: these cover the "how many records by
   * status / by month" panels a typical dashboard needs. Anything
   * requiring zooming, brushing or real-time streaming wants a charting
   * library, and this does not pretend otherwise.
   *
   * Every chart renders `role="img"` with a generated `aria-label`, plus a
   * visually-hidden data table. A chart nobody can read is not a chart, and a
   * bare <svg> is invisible to a screen reader and to print.
   */

  var PALETTE = [
    "var(--ui-chart-1)", "var(--ui-chart-2)", "var(--ui-chart-3)",
    "var(--ui-chart-4)", "var(--ui-chart-5)", "var(--ui-chart-6)"
  ];

  function numbers(element) {
    return (element.getAttribute("data-ui-values") || "")
      .split(",")
      .map(function (value) { return parseFloat(value.trim()); })
      .filter(function (value) { return isFinite(value); });
  }

  function labels(element, count) {
    var given = (element.getAttribute("data-ui-labels") || "")
      .split(",")
      .map(function (value) { return value.trim(); })
      .filter(Boolean);
    var out = [];
    for (var i = 0; i < count; i++) out.push(given[i] || String(i + 1));
    return out;
  }

  function formatValue(element, value) {
    if (element.hasAttribute("data-ui-format-currency")) {
      return UI.mask.format(value, {
        currency: element.getAttribute("data-ui-format-currency"),
        decimals: 0
      });
    }
    return UI.mask ? UI.mask.format(value, { decimals: 0 }) : String(value);
  }

  /** Visually-hidden table so the numbers are readable, selectable and printable. */
  function dataTable(element, values, names) {
    var rows = values.map(function (value, index) {
      return "<tr><th scope=\"row\">" + UI.escape(names[index]) + "</th><td>" +
        UI.escape(formatValue(element, value)) + "</td></tr>";
    }).join("");

    return '<table class="ui-sr-only ui-chart-data"><caption>' +
      UI.escape(element.getAttribute("data-ui-title") || "Chart data") +
      "</caption><tbody>" + rows + "</tbody></table>";
  }

  function summary(element, values, names) {
    var title = element.getAttribute("data-ui-title") || "Chart";
    var parts = values.map(function (value, index) {
      return names[index] + " " + formatValue(element, value);
    });
    return title + ": " + parts.join(", ");
  }

  function svgOpen(viewBox, extraClass) {
    return '<svg class="ui-chart-svg' + (extraClass ? " " + extraClass : "") +
      '" viewBox="' + viewBox + '" preserveAspectRatio="none" focusable="false" aria-hidden="true">';
  }

  // ------------------------------------------------------------------ bar

  function renderBar(element, values, names) {
    var width = 100;
    var height = Number(element.getAttribute("data-ui-height")) || 40;
    var max = Math.max.apply(null, values.concat([0]));
    var gap = values.length > 1 ? 1.5 : 0;
    var barWidth = (width - gap * (values.length - 1)) / values.length;
    var horizontal = element.getAttribute("data-ui-orientation") === "horizontal";

    // One series, one colour. Cycling the palette across the bars of a single
    // series reads as six categories rather than six months -- colour should
    // only vary where it means something. `data-ui-multicolour` opts in for
    // genuinely categorical bars.
    var multicolour = element.hasAttribute("data-ui-multicolour");

    var bars = values.map(function (value, index) {
      var ratio = max > 0 ? value / max : 0;
      var color = multicolour ? PALETTE[index % PALETTE.length] : PALETTE[0];

      if (horizontal) {
        var rowHeight = (height - gap * (values.length - 1)) / values.length;
        return '<rect x="0" y="' + (index * (rowHeight + gap)).toFixed(2) +
          '" width="' + (ratio * width).toFixed(2) + '" height="' + rowHeight.toFixed(2) +
          '" fill="' + color + '" rx="0.6"><title>' + UI.escape(names[index] + ": " +
          formatValue(element, value)) + "</title></rect>";
      }

      var barHeight = ratio * height;
      return '<rect x="' + (index * (barWidth + gap)).toFixed(2) +
        '" y="' + (height - barHeight).toFixed(2) +
        '" width="' + barWidth.toFixed(2) + '" height="' + barHeight.toFixed(2) +
        '" fill="' + color + '" rx="0.6"><title>' + UI.escape(names[index] + ": " +
        formatValue(element, value)) + "</title></rect>";
    }).join("");

    return svgOpen("0 0 " + width + " " + height) + bars + "</svg>";
  }

  // ----------------------------------------------------------------- line

  function linePoints(values, width, height, max, min) {
    var span = max - min || 1;
    var step = values.length > 1 ? width / (values.length - 1) : 0;
    return values.map(function (value, index) {
      var x = index * step;
      var y = height - ((value - min) / span) * height;
      return x.toFixed(2) + "," + y.toFixed(2);
    });
  }

  function renderLine(element, values, names, sparkline) {
    var width = 100;
    var height = Number(element.getAttribute("data-ui-height")) || (sparkline ? 20 : 40);
    var max = Math.max.apply(null, values);
    var min = element.hasAttribute("data-ui-zero-based") ? 0 : Math.min.apply(null, values);
    var points = linePoints(values, width, height, max, min);

    var area = "";
    if (!sparkline || element.hasAttribute("data-ui-area")) {
      area = '<polygon points="0,' + height + " " + points.join(" ") + " " + width + "," + height +
        '" fill="var(--ui-chart-1)" opacity="0.12"/>';
    }

    var dots = sparkline
      ? ""
      : values.map(function (value, index) {
          var parts = points[index].split(",");
          return '<circle cx="' + parts[0] + '" cy="' + parts[1] +
            '" r="1.2" fill="var(--ui-chart-1)"><title>' +
            UI.escape(names[index] + ": " + formatValue(element, value)) + "</title></circle>";
        }).join("");

    return svgOpen("0 0 " + width + " " + height, sparkline ? "ui-chart-sparkline-svg" : "") +
      area +
      '<polyline points="' + points.join(" ") +
      '" fill="none" stroke="var(--ui-chart-1)" stroke-width="1.5" ' +
      'stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      dots +
      "</svg>";
  }

  // ---------------------------------------------------------------- donut

  function renderDonut(element, values, names) {
    var total = values.reduce(function (sum, value) { return sum + value; }, 0);
    var radius = 15.915494;   // circumference 100, so dash lengths are percentages
    var thickness = Number(element.getAttribute("data-ui-thickness")) || 4;
    var offset = 25;          // start at 12 o'clock

    var segments = values.map(function (value, index) {
      var percent = total > 0 ? (value / total) * 100 : 0;
      var circle = '<circle class="ui-chart-segment" cx="21" cy="21" r="' + radius +
        '" fill="none" stroke="' + PALETTE[index % PALETTE.length] +
        '" stroke-width="' + thickness +
        '" stroke-dasharray="' + percent.toFixed(2) + " " + (100 - percent).toFixed(2) +
        '" stroke-dashoffset="' + offset.toFixed(2) + '"><title>' +
        UI.escape(names[index] + ": " + formatValue(element, value)) + "</title></circle>";
      // Dash offsets run backwards around the circle.
      offset -= percent;
      return circle;
    }).join("");

    var centre = "";
    var centreLabel = element.getAttribute("data-ui-centre") || element.getAttribute("data-ui-center");
    if (centreLabel) {
      centre = '<text x="21" y="21" class="ui-chart-centre" text-anchor="middle" ' +
        'dominant-baseline="central">' + UI.escape(centreLabel) + "</text>";
    }

    return '<svg class="ui-chart-svg ui-chart-donut-svg" viewBox="0 0 42 42" ' +
      'focusable="false" aria-hidden="true">' +
      '<circle cx="21" cy="21" r="' + radius + '" fill="none" stroke="var(--ui-surface-muted)" ' +
      'stroke-width="' + thickness + '"/>' + segments + centre + "</svg>";
  }

  // ---------------------------------------------------------------- legend

  function renderLegend(element, values, names) {
    if (!element.hasAttribute("data-ui-legend")) return "";
    var total = values.reduce(function (sum, value) { return sum + value; }, 0);

    var items = values.map(function (value, index) {
      var percent = total > 0 ? Math.round((value / total) * 100) : 0;
      return '<li class="ui-chart-legend-item">' +
        '<span class="ui-chart-swatch" data-ui-swatch="' + (index % PALETTE.length) + '"></span>' +
        '<span class="ui-chart-legend-label">' + UI.escape(names[index]) + "</span>" +
        '<span class="ui-chart-legend-value">' + UI.escape(formatValue(element, value)) +
        (element.hasAttribute("data-ui-legend-percent") ? " (" + percent + "%)" : "") +
        "</span></li>";
    }).join("");

    return '<ul class="ui-chart-legend">' + items + "</ul>";
  }

  function build(element) {
    if (element.dataset.uiChartReady) return;
    element.dataset.uiChartReady = "true";

    var type = element.getAttribute("data-ui-chart") || "bar";
    var values = numbers(element);
    if (!values.length) return;
    var names = labels(element, values.length);

    var body;
    if (type === "donut" || type === "pie") body = renderDonut(element, values, names);
    else if (type === "line") body = renderLine(element, values, names, false);
    else if (type === "sparkline") body = renderLine(element, values, names, true);
    else body = renderBar(element, values, names);

    element.classList.add("ui-chart", "ui-chart-" + type);
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", summary(element, values, names));
    element.innerHTML = body + renderLegend(element, values, names) + dataTable(element, values, names);

    UI.emit(element, "ui:chart:rendered", { type: type, values: values });
  }

  function init(root) {
    UI.matchAll("[data-ui-chart]", root).forEach(build);
  }

  UI.register(init);

  UI.chart = {
    /** Replaces a chart's data and re-renders it in place. */
    update: function (target, values, names) {
      var element = typeof target === "string" ? UI.q(target) : target;
      if (!element) return;
      element.setAttribute("data-ui-values", values.join(","));
      if (names) element.setAttribute("data-ui-labels", names.join(","));
      delete element.dataset.uiChartReady;
      build(element);
    }
  };
})(window, document);
