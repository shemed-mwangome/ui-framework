(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Dependency-free SVG charts.
   *
   *   <div data-ui-chart="bar"  data-ui-values="12,19,3" data-ui-labels="Jan,Feb,Mar"></div>
   *   <div data-ui-chart="line" data-ui-values="…"></div>
   *   <div data-ui-chart="area" data-ui-values="…"></div>
   *   <div data-ui-chart="donut" data-ui-values="…" data-ui-labels="…"></div>
   *   <span data-ui-chart="sparkline" data-ui-values="…"></span>
   *
   * `bar` also takes `data-ui-orientation="horizontal"`, single- or
   * multi-series. `area` is `line` with a deliberate gradient fill rather
   * than the line chart's incidental one -- use it when the filled shape
   * itself is the point.
   *
   * A flat `data-ui-values` list only ever holds one series. For grouped or
   * stacked bars, multi-line comparisons, or stacked areas, give the element
   * a JSON data island instead -- everything else about it (type, title,
   * height, currency formatting) stays the same:
   *
   *   <div data-ui-chart="bar" data-ui-stacked data-ui-legend>
   *     <script type="application/json">
   *       {"labels": ["Jan","Feb","Mar"],
   *        "series": [{"name": "North", "values": [12,19,3]},
   *                    {"name": "South", "values": [8,11,9]}]}
   *     </script>
   *   </div>
   *
   * Drop `data-ui-stacked` for side-by-side grouped bars instead of stacked
   * segments (bars only -- `data-ui-chart="area"` with a JSON data island is
   * always stacked, and `data-ui-chart="line"` is always separate lines).
   * `UI.chart.update(target, data)` accepts the same shape for live updates,
   * so a chart fed from an API does not need to hand-build a comma-separated
   * string.
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

  // ------------------------------------------------------- multi-series

  // A second, additive data source for grouped/stacked bars and multi-line
  // comparisons: a `data-ui-values` attribute can only ever hold one flat
  // list of numbers, which has no room for more than one named series. A
  // `<script type="application/json">` child holds `{labels, series}`
  // instead, where `series` is `[{name, values}, ...]`. Returns null (and
  // build() falls back to the single-series, attribute-based path below,
  // completely unchanged) when no such script is present or it does not
  // parse -- this is additive, not a replacement.
  function parseSeries(element) {
    var script = element.querySelector('script[type="application/json"]');
    if (!script) return null;

    var json;
    try {
      json = JSON.parse(script.textContent || "{}");
    } catch (error) {
      return null;
    }
    if (!json || !Array.isArray(json.series) || !json.series.length) return null;

    var series = json.series.map(function (item, index) {
      return {
        name: (item && item.name) || ("Series " + (index + 1)),
        values: ((item && item.values) || [])
          .map(function (value) { return parseFloat(value); })
          .filter(function (value) { return isFinite(value); })
      };
    });
    var categories = (json.labels || []).map(String);
    return { series: series, categories: categories };
  }

  function barRect(x, y, w, h, color, title) {
    return '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) +
      '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) +
      '" fill="' + color + '" rx="0.4"><title>' + UI.escape(title) + "</title></rect>";
  }

  function renderGroupedBar(element, series, categories, stacked) {
    var width = 100;
    var height = Number(element.getAttribute("data-ui-height")) || 40;
    var horizontal = element.getAttribute("data-ui-orientation") === "horizontal";
    var groups = categories.length;
    var seriesCount = series.length;
    if (!groups || !seriesCount) return svgOpen("0 0 " + width + " " + height) + "</svg>";

    var groupGap = groups > 1 ? 1.5 : 0;
    var mainAxis = horizontal ? height : width;
    var groupSize = (mainAxis - groupGap * (groups - 1)) / groups;
    var crossAxis = horizontal ? width : height;

    var max = 0;
    for (var g = 0; g < groups; g++) {
      if (stacked) {
        var sum = 0;
        for (var s = 0; s < seriesCount; s++) sum += (series[s].values[g] || 0);
        max = Math.max(max, sum);
      } else {
        for (var s2 = 0; s2 < seriesCount; s2++) max = Math.max(max, series[s2].values[g] || 0);
      }
    }

    var rects = [];
    for (var gi = 0; gi < groups; gi++) {
      var groupStart = gi * (groupSize + groupGap);

      if (stacked) {
        var cumulative = 0;
        for (var si = 0; si < seriesCount; si++) {
          var value = series[si].values[gi] || 0;
          var ratio = max > 0 ? value / max : 0;
          var segSize = ratio * crossAxis;
          var title = series[si].name + " – " + categories[gi] + ": " + formatValue(element, value);
          rects.push(horizontal
            ? barRect(cumulative, groupStart, segSize, groupSize, PALETTE[si % PALETTE.length], title)
            : barRect(groupStart, height - cumulative - segSize, groupSize, segSize, PALETTE[si % PALETTE.length], title));
          cumulative += segSize;
        }
      } else {
        var barGap = seriesCount > 1 ? 0.4 : 0;
        var barSize = (groupSize - barGap * (seriesCount - 1)) / seriesCount;
        for (var sj = 0; sj < seriesCount; sj++) {
          var value2 = series[sj].values[gi] || 0;
          var ratio2 = max > 0 ? value2 / max : 0;
          var segSize2 = ratio2 * crossAxis;
          var barStart = groupStart + sj * (barSize + barGap);
          var title2 = series[sj].name + " – " + categories[gi] + ": " + formatValue(element, value2);
          rects.push(horizontal
            ? barRect(0, barStart, segSize2, barSize, PALETTE[sj % PALETTE.length], title2)
            : barRect(barStart, height - segSize2, barSize, segSize2, PALETTE[sj % PALETTE.length], title2));
        }
      }
    }

    return svgOpen("0 0 " + width + " " + height) + rects.join("") + "</svg>";
  }

  function renderMultiLine(element, series, categories) {
    var width = 100;
    var height = Number(element.getAttribute("data-ui-height")) || 40;
    var allValues = [].concat.apply([], series.map(function (s) { return s.values; }));
    var max = Math.max.apply(null, allValues.concat([0]));
    var min = element.hasAttribute("data-ui-zero-based") ? 0 : Math.min.apply(null, allValues.concat([0]));

    var polylines = series.map(function (s, index) {
      var points = linePoints(s.values, width, height, max, min);
      var color = PALETTE[index % PALETTE.length];
      var dots = points.map(function (point, i) {
        var parts = point.split(",");
        return '<circle cx="' + parts[0] + '" cy="' + parts[1] + '" r="1.1" fill="' + color + '"><title>' +
          UI.escape(s.name + " – " + (categories[i] || "") + ": " + formatValue(element, s.values[i])) +
          "</title></circle>";
      }).join("");
      return '<polyline points="' + points.join(" ") + '" fill="none" stroke="' + color +
        '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" ' +
        'vector-effect="non-scaling-stroke"/>' + dots;
    }).join("");

    return svgOpen("0 0 " + width + " " + height) + polylines + "</svg>";
  }

  function renderSeriesLegend(element, series) {
    if (!element.hasAttribute("data-ui-legend")) return "";
    var items = series.map(function (s, index) {
      return '<li class="ui-chart-legend-item">' +
        '<span class="ui-chart-swatch" data-ui-swatch="' + (index % PALETTE.length) + '"></span>' +
        '<span class="ui-chart-legend-label">' + UI.escape(s.name) + "</span></li>";
    }).join("");
    return '<ul class="ui-chart-legend">' + items + "</ul>";
  }

  function multiDataTable(element, series, categories) {
    var head = "<tr><th></th>" + series.map(function (s) {
      return "<th>" + UI.escape(s.name) + "</th>";
    }).join("") + "</tr>";
    var rows = categories.map(function (category, i) {
      return "<tr><th scope=\"row\">" + UI.escape(category) + "</th>" +
        series.map(function (s) {
          return "<td>" + UI.escape(formatValue(element, s.values[i] || 0)) + "</td>";
        }).join("") + "</tr>";
    }).join("");

    return '<table class="ui-sr-only ui-chart-data"><caption>' +
      UI.escape(element.getAttribute("data-ui-title") || "Chart data") +
      "</caption><thead>" + head + "</thead><tbody>" + rows + "</tbody></table>";
  }

  function multiSummary(element, series, categories) {
    var title = element.getAttribute("data-ui-title") || "Chart";
    var parts = series.map(function (s) {
      return s.name + ": " + s.values.map(function (value, i) {
        return (categories[i] || "") + " " + formatValue(element, value);
      }).join(", ");
    });
    return title + ". " + parts.join(". ");
  }

  // ---------------------------------------------------------------- legend

  // ------------------------------------------------------------------ area

  // A more deliberate fill than the line chart's whisper-thin default tint
  // (opacity .12) -- a gradient fading from the series colour to transparent,
  // for when the filled area itself is the point rather than an incidental
  // backdrop to the line.
  function renderArea(element, values, names) {
    var width = 100;
    var height = Number(element.getAttribute("data-ui-height")) || 40;
    var max = Math.max.apply(null, values);
    var min = element.hasAttribute("data-ui-zero-based") ? 0 : Math.min.apply(null, values);
    var points = linePoints(values, width, height, max, min);
    var gradientId = UI.uid("ui-chart-area");

    var dots = values.map(function (value, index) {
      var parts = points[index].split(",");
      return '<circle cx="' + parts[0] + '" cy="' + parts[1] +
        '" r="1.2" fill="var(--ui-chart-1)"><title>' +
        UI.escape(names[index] + ": " + formatValue(element, value)) + "</title></circle>";
    }).join("");

    return svgOpen("0 0 " + width + " " + height) +
      '<defs><linearGradient id="' + gradientId + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--ui-chart-1)" stop-opacity="0.45"/>' +
      '<stop offset="100%" stop-color="var(--ui-chart-1)" stop-opacity="0.03"/>' +
      "</linearGradient></defs>" +
      '<polygon points="0,' + height + " " + points.join(" ") + " " + width + "," + height +
      '" fill="url(#' + gradientId + ')"/>' +
      '<polyline points="' + points.join(" ") +
      '" fill="none" stroke="var(--ui-chart-1)" stroke-width="1.5" ' +
      'stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      dots + "</svg>";
  }

  // Stacked multi-series area: each series is a band between its own
  // cumulative baseline and the baseline of everything stacked below it, so
  // the top edge of the last series traces the combined total.
  function renderMultiArea(element, series, categories) {
    var width = 100;
    var height = Number(element.getAttribute("data-ui-height")) || 40;
    var groups = categories.length;
    var seriesCount = series.length;
    if (!groups || !seriesCount) return svgOpen("0 0 " + width + " " + height) + "</svg>";

    var max = 0;
    for (var g = 0; g < groups; g++) {
      var sum = 0;
      for (var s = 0; s < seriesCount; s++) sum += (series[s].values[g] || 0);
      max = Math.max(max, sum);
    }

    var step = groups > 1 ? width / (groups - 1) : 0;
    var baseline = new Array(groups).fill(0);
    var layers = [];

    series.forEach(function (s, index) {
      var topPoints = [];
      var bottomPoints = [];
      for (var i = 0; i < groups; i++) {
        var value = s.values[i] || 0;
        var top = baseline[i] + value;
        var x = (i * step).toFixed(2);
        topPoints.push(x + "," + (max > 0 ? (height - (top / max) * height).toFixed(2) : height.toFixed(2)));
        bottomPoints.push(x + "," + (max > 0 ? (height - (baseline[i] / max) * height).toFixed(2) : height.toFixed(2)));
        baseline[i] = top;
      }

      var color = PALETTE[index % PALETTE.length];
      var polygonPoints = topPoints.concat(bottomPoints.slice().reverse()).join(" ");
      layers.push('<polygon points="' + polygonPoints + '" fill="' + color + '" opacity="0.55"><title>' +
        UI.escape(s.name) + "</title></polygon>");
      layers.push('<polyline points="' + topPoints.join(" ") + '" fill="none" stroke="' + color +
        '" stroke-width="1.25" vector-effect="non-scaling-stroke"/>');
    });

    return svgOpen("0 0 " + width + " " + height) + layers.join("") + "</svg>";
  }

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
    var multi = parseSeries(element);

    if (multi) {
      var hasValues = multi.series.some(function (s) { return s.values.length; });
      if (!hasValues) return;

      var mbody;
      if (type === "line") mbody = renderMultiLine(element, multi.series, multi.categories);
      else if (type === "area") mbody = renderMultiArea(element, multi.series, multi.categories);
      else mbody = renderGroupedBar(element, multi.series, multi.categories, element.hasAttribute("data-ui-stacked"));

      element.classList.add("ui-chart", "ui-chart-" + type, "ui-chart-multi");
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", multiSummary(element, multi.series, multi.categories));
      element.innerHTML = mbody +
        renderSeriesLegend(element, multi.series) +
        multiDataTable(element, multi.series, multi.categories);

      UI.emit(element, "ui:chart:rendered", { type: type, series: multi.series });
      return;
    }

    var values = numbers(element);
    if (!values.length) return;
    var names = labels(element, values.length);

    var body;
    if (type === "donut" || type === "pie") body = renderDonut(element, values, names);
    else if (type === "line") body = renderLine(element, values, names, false);
    else if (type === "sparkline") body = renderLine(element, values, names, true);
    else if (type === "area") body = renderArea(element, values, names);
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
    /**
     * Replaces a chart's data and re-renders it in place.
     *
     *   UI.chart.update("#c", [5, 10, 15], ["X", "Y", "Z"]);            single series
     *   UI.chart.update("#c", { labels: [...], series: [{name, values}, ...] });   multi
     */
    update: function (target, valuesOrData, names) {
      var element = typeof target === "string" ? UI.q(target) : target;
      if (!element) return;

      if (valuesOrData && !Array.isArray(valuesOrData) && typeof valuesOrData === "object") {
        var script = element.querySelector('script[type="application/json"]');
        if (!script) {
          script = document.createElement("script");
          script.type = "application/json";
          element.appendChild(script);
        }
        script.textContent = JSON.stringify({
          labels: valuesOrData.labels || [],
          series: valuesOrData.series || []
        });
        element.removeAttribute("data-ui-values");
        element.removeAttribute("data-ui-labels");
      } else {
        element.setAttribute("data-ui-values", valuesOrData.join(","));
        if (names) element.setAttribute("data-ui-labels", names.join(","));
      }

      delete element.dataset.uiChartReady;
      build(element);
    }
  };
})(window, document);
