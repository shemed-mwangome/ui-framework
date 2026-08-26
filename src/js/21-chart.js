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
   * Multi-series data goes in a JSON island child rather than an attribute,
   * because a comma-separated list has no room for more than one named series:
   *
   *   <div data-ui-chart="bar" data-ui-stacked data-ui-legend>
   *     <script type="application/json">
   *       {"labels": ["Jan","Feb"],
   *        "series": [{"name":"North","values":[12,19]},
   *                   {"name":"South","values":[8,11]}]}
   *     </script>
   *   </div>
   *
   * ---------------------------------------------------------------------
   * Why this renders in pixel user units
   *
   * The previous implementation drew into a fixed 100x40 viewBox and let
   * `preserveAspectRatio="none"` stretch it to the container. That is a
   * reasonable trick for a bare sparkline and wrong for everything else: at a
   * typical 910x160 box the horizontal scale is 9.1 and the vertical scale
   * 4.0, so every circle rendered as an ellipse 2.27 times wider than it was
   * tall, and any text would have been distorted by the same factor -- which
   * is the real reason the old renderer had no axis labels. It could not have
   * drawn them legibly.
   *
   * So the SVG is now sized in real pixels, measured from the element, with
   * the default `preserveAspectRatio`. Circles are circles, strokes are
   * uniform, and text can be placed. A ResizeObserver re-renders on width
   * change, which is now necessary: with text in the picture, scaling is no
   * longer a substitute for laying out again.
   *
   * `data-ui-height` keeps working. Values below 60 are read as the old
   * viewBox units and multiplied by 4 -- the ratio the old CSS height of
   * 10rem against a 40-unit viewBox already resolved to -- so existing charts
   * keep the size they had. Anything 60 or above is read as pixels.
   *
   * ---------------------------------------------------------------------
   * Scope
   *
   * These cover the panels a back-office application needs: how many by
   * status, how many by month, coverage against a target. Zooming, brushing,
   * panning and real-time streaming want a charting library, and this does
   * not pretend otherwise.
   *
   * Every chart carries a generated summary and a visually-hidden data table,
   * so the numbers survive a screen reader and a printer. A chart nobody can
   * read is not a chart.
   */

  var PALETTE = [
    "var(--ui-chart-1)", "var(--ui-chart-2)", "var(--ui-chart-3)",
    "var(--ui-chart-4)", "var(--ui-chart-5)", "var(--ui-chart-6)"
  ];

  var CHAR_WIDTH = 6.4;   // ~0.58em at the 11px axis font; used to size margins
  var MIN_BAR = 2;        // px: a small non-zero value must stay visible

  /* ==================================================================== */
  /* Configuration                                                        */
  /* ==================================================================== */

  function attr(element, name, fallback) {
    var value = element.getAttribute("data-ui-" + name);
    return value == null || value === "" ? fallback : value;
  }

  function flag(element, name) {
    return element.hasAttribute("data-ui-" + name);
  }

  function num(element, name, fallback) {
    var value = parseFloat(element.getAttribute("data-ui-" + name));
    return isFinite(value) ? value : fallback;
  }

  function numbers(element) {
    return (attr(element, "values", "") || "")
      .split(",")
      .map(function (value) { return parseFloat(value.trim()); })
      .filter(function (value) { return isFinite(value); });
  }

  function labels(element, count) {
    var given = (attr(element, "labels", "") || "")
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
    var decimals = num(element, "decimals", 0);
    return UI.mask ? UI.mask.format(value, { decimals: decimals }) : String(value);
  }

  /** Axis ticks need to stay short: 12,000 becomes 12k, not a wrapped label. */
  function compact(value) {
    var abs = Math.abs(value);
    if (abs >= 1e9) return trimZero(value / 1e9) + "b";
    if (abs >= 1e6) return trimZero(value / 1e6) + "m";
    if (abs >= 1e3) return trimZero(value / 1e3) + "k";
    return trimZero(value);
  }

  function trimZero(value) {
    var rounded = Math.round(value * 10) / 10;
    return String(rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1));
  }

  /* ==================================================================== */
  /* Scales                                                               */
  /* ==================================================================== */

  /**
   * Ticks a person would have chosen: steps of 1, 2, 2.5 or 5 times a power
   * of ten, with the axis maximum rounded up to one of them. An axis topped
   * at the largest data point puts that bar flush against the ceiling and
   * makes the reader work out the scale from the bar rather than the axis.
   */
  function niceScale(min, max, targetTicks) {
    if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
    if (min === max) { max = min + Math.abs(min || 1); }

    var span = max - min;
    var rough = span / (targetTicks || 4);
    var magnitude = Math.pow(10, Math.floor(Math.log(rough) / Math.LN10));
    var normalised = rough / magnitude;
    var step = magnitude * (normalised >= 5 ? 5 : normalised >= 2.5 ? 2.5 : normalised >= 2 ? 2 : 1);

    var niceMin = Math.floor(min / step) * step;
    var niceMax = Math.ceil(max / step) * step;

    var ticks = [];
    // Accumulating with += would drift on steps like 2.5; multiply instead.
    var count = Math.round((niceMax - niceMin) / step);
    for (var i = 0; i <= count; i++) ticks.push(niceMin + i * step);

    return { min: niceMin, max: niceMax, ticks: ticks };
  }

  /* ==================================================================== */
  /* Geometry                                                             */
  /* ==================================================================== */

  function measure(element, type) {
    var width = element.clientWidth || element.parentElement && element.parentElement.clientWidth || 480;

    var raw = num(element, "height", null);
    var height;
    if (raw == null) height = type === "sparkline" ? 28 : 200;
    else if (raw < 60) height = raw * 4;   // legacy viewBox units
    else height = raw;

    if (type === "sparkline" && !element.clientWidth) width = 96;
    return { width: Math.max(80, Math.round(width)), height: Math.round(height) };
  }

  /**
   * Reserves room for whatever chrome the chart actually has. Measuring the
   * longest tick label rather than assuming a fixed gutter is the difference
   * between "1,250,000" fitting and being clipped.
   */
  function plotBox(cfg, box, scale, categories) {
    var left = 4, right = 6, top = cfg.valueLabels ? 14 : 6, bottom = 4;

    if (cfg.axis) {
      var widest = 0;
      scale.ticks.forEach(function (tick) {
        widest = Math.max(widest, compact(tick).length);
      });
      left = Math.ceil(widest * CHAR_WIDTH) + 10;
      bottom = 20;
      right = 8;
      if (cfg.axisXTitle) bottom += 16;
      if (cfg.axisYTitle) left += 16;
    }

    if (cfg.horizontal) {
      // Category names run down the left of a horizontal bar chart, and they
      // are words rather than numbers -- capped so one long name cannot eat
      // the plot it is labelling.
      var longest = 0;
      (categories || []).forEach(function (name) { longest = Math.max(longest, String(name).length); });
      left = Math.min(Math.ceil(longest * CHAR_WIDTH) + 10, Math.round(box.width * 0.4));
      bottom = cfg.axis ? 20 : 4;
      top = 4;
    }

    return {
      left: left, top: top, right: right, bottom: bottom,
      width: Math.max(10, box.width - left - right),
      height: Math.max(10, box.height - top - bottom)
    };
  }

  /* ==================================================================== */
  /* SVG primitives                                                       */
  /* ==================================================================== */

  function esc(value) { return UI.escape(value); }

  function svgOpen(box, interactive, extraClass) {
    return '<svg class="ui-chart-svg' + (extraClass ? " " + extraClass : "") +
      '" viewBox="0 0 ' + box.width + " " + box.height +
      '" width="100%" height="' + box.height + '" ' +
      'style="height:' + box.height + 'px" focusable="false"' +
      (interactive ? "" : ' aria-hidden="true"') + ">";
  }

  function text(x, y, value, className, anchor, baseline) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" class="' + className +
      '" text-anchor="' + (anchor || "middle") + '"' +
      (baseline ? ' dominant-baseline="' + baseline + '"' : "") + ">" + esc(value) + "</text>";
  }

  /* ==================================================================== */
  /* Links                                                                */
  /* ==================================================================== */

  /**
   * A clickable data point is a link, not a click handler.
   *
   * An <a> inside SVG is a real link: it is keyboard focusable, it shows its
   * target in the status bar, it opens in a new tab on middle-click or
   * ctrl-click, it can be copied from the context menu, and it still works if
   * the JavaScript that would have handled a click fails to load. None of
   * that is true of onclick, and all of it is behaviour people expect from
   * something that navigates.
   *
   * Three ways to supply them, in precedence order:
   *   data-ui-links="/a,/b,/c"                  one per point, single series
   *   series[].links in the JSON island         one per point, per series
   *   data-ui-link-template="/x?region={label}" a pattern
   *
   * Placeholders: {label} {value} {series} {index} {seriesIndex}, each
   * URL-encoded. Charts with no links behave exactly as before.
   */
  function linkFor(cfg, point) {
    // Every one of these can arrive in a server response now that charts load
    // from data-ui-url -- a `links` array in the JSON, or a template rendered
    // into the attribute. UI.escape would make `javascript:alert(1)` safe to
    // sit inside the attribute and entirely happy to execute when followed,
    // so the scheme is checked too. A rejected URL returns null and the mark
    // renders without a link rather than with a dangerous one.
    if (cfg.linkList && cfg.linkList[point.index]) return UI.safeUrl(cfg.linkList[point.index]);
    if (point.seriesLinks && point.seriesLinks[point.index]) {
      return UI.safeUrl(point.seriesLinks[point.index]);
    }
    if (!cfg.linkTemplate) return null;

    return UI.safeUrl(cfg.linkTemplate
      .replace(/\{label\}/g, encodeURIComponent(point.label == null ? "" : point.label))
      .replace(/\{value\}/g, encodeURIComponent(point.value))
      .replace(/\{series\}/g, encodeURIComponent(point.series == null ? "" : point.series))
      .replace(/\{seriesIndex\}/g, encodeURIComponent(point.seriesIndex == null ? 0 : point.seriesIndex))
      .replace(/\{index\}/g, encodeURIComponent(point.index)));
  }

  /**
   * Wraps a mark in its link, or -- when there is no link -- in a plain <g>
   * so that the hover/tooltip machinery has one consistent element to target
   * either way.
   */
  function mark(cfg, point, inner) {
    var tip = point.tip;
    var common = ' class="ui-chart-mark" data-ui-tip="' + esc(tip) + '"' +
      ' data-ui-index="' + point.index + '"' +
      ' data-ui-label="' + esc(point.label == null ? "" : point.label) + '"' +
      ' data-ui-value="' + esc(point.value) + '"' +
      (point.series != null ? ' data-ui-series-name="' + esc(point.series) + '"' : "");
    var href = linkFor(cfg, point);

    if (!href) return "<g" + common + ">" + inner + "</g>";

    return '<a href="' + esc(href) + '"' + common +
      (cfg.linkTarget ? ' target="' + esc(cfg.linkTarget) + '"' : "") +
      (cfg.linkTarget === "_blank" ? ' rel="noopener"' : "") +
      ' aria-label="' + esc(tip) + '">' + inner + "</a>";
  }

  /* ==================================================================== */
  /* Axis chrome                                                          */
  /* ==================================================================== */

  function yAxis(cfg, plot, scale) {
    if (!cfg.axis) return "";
    var parts = [];
    var span = scale.max - scale.min || 1;

    scale.ticks.forEach(function (tick) {
      var y = plot.top + plot.height - ((tick - scale.min) / span) * plot.height;
      if (cfg.grid) {
        parts.push('<line class="ui-chart-grid" x1="' + plot.left + '" y1="' + y.toFixed(1) +
          '" x2="' + (plot.left + plot.width) + '" y2="' + y.toFixed(1) + '"/>');
      }
      parts.push(text(plot.left - 6, y, compact(tick), "ui-chart-tick", "end", "middle"));
    });

    parts.push('<line class="ui-chart-axis" x1="' + plot.left + '" y1="' + plot.top +
      '" x2="' + plot.left + '" y2="' + (plot.top + plot.height) + '"/>');

    if (cfg.axisYTitle) {
      parts.push('<text class="ui-chart-axis-title" transform="rotate(-90 12 ' +
        (plot.top + plot.height / 2).toFixed(1) + ')" x="12" y="' +
        (plot.top + plot.height / 2).toFixed(1) + '" text-anchor="middle">' +
        esc(cfg.axisYTitle) + "</text>");
    }
    return parts.join("");
  }

  function xAxisLine(cfg, plot) {
    if (!cfg.axis) return "";
    var y = plot.top + plot.height;
    return '<line class="ui-chart-axis" x1="' + plot.left + '" y1="' + y +
      '" x2="' + (plot.left + plot.width) + '" y2="' + y + '"/>';
  }

  /**
   * Category labels, thinned rather than overlapped. Twelve months across a
   * narrow card cannot all be written; showing every second or third is
   * honest, drawing them on top of each other is not.
   */
  /**
   * `centred` distinguishes the two ways a category maps to an x position. A
   * bar occupies a slot and its label belongs in the middle of it; a line's
   * point sits *on* the boundary, at index x step. Using the bar rule for a
   * line shifts every label half a slot to the right and pushes the last one
   * off the end of the axis entirely.
   */
  function xLabels(cfg, plot, categories, slot, centred) {
    if (!cfg.axis || !categories.length) return "";
    var longest = 0;
    categories.forEach(function (c) { longest = Math.max(longest, String(c).length); });
    var needed = longest * CHAR_WIDTH + 6;
    var stride = Math.max(1, Math.ceil(needed / Math.max(slot, 1)));

    var out = categories.map(function (category, index) {
      if (index % stride !== 0) return "";
      var x = plot.left + (centred === false ? index * slot : (index + 0.5) * slot);
      // Keep the first and last labels inside the plot instead of hanging
      // half a word over the edge of the card.
      var anchor = "middle";
      if (centred === false && index === 0) anchor = "start";
      if (centred === false && index === categories.length - 1) anchor = "end";
      return text(x, plot.top + plot.height + 14, category, "ui-chart-tick", anchor);
    }).join("");

    if (cfg.axisXTitle) {
      out += text(plot.left + plot.width / 2, plot.top + plot.height + 30,
        cfg.axisXTitle, "ui-chart-axis-title");
    }
    return out;
  }

  /**
   * A reference line -- a statutory minimum, a service target. Without one,
   * "82%" is a number; with one, it is a pass or a fail, which is the
   * question the reader actually has.
   */
  function targetLine(cfg, plot, scale) {
    if (cfg.target == null) return "";
    var span = scale.max - scale.min || 1;
    if (cfg.target < scale.min || cfg.target > scale.max) return "";
    var y = plot.top + plot.height - ((cfg.target - scale.min) / span) * plot.height;

    return '<line class="ui-chart-target" x1="' + plot.left + '" y1="' + y.toFixed(1) +
      '" x2="' + (plot.left + plot.width) + '" y2="' + y.toFixed(1) + '"/>' +
      (cfg.targetLabel
        ? text(plot.left + plot.width - 2, y - 4, cfg.targetLabel, "ui-chart-target-label", "end")
        : "");
  }

  function note(cfg, box, message) {
    return text(box.width / 2, box.height / 2, message, "ui-chart-note", "middle", "middle");
  }

  /* ==================================================================== */
  /* Renderers                                                            */
  /* ==================================================================== */

  function readConfig(element, type) {
    var linkList = (attr(element, "links", "") || "").split(",")
      .map(function (value) { return value.trim(); }).filter(Boolean);

    return {
      type: type,
      axis: flag(element, "axis"),
      grid: !element.hasAttribute("data-ui-no-grid"),
      valueLabels: flag(element, "value-labels"),
      horizontal: attr(element, "orientation", "") === "horizontal",
      stacked: flag(element, "stacked"),
      multicolour: flag(element, "multicolour"),
      zeroBased: flag(element, "zero-based") || type === "bar",
      target: element.hasAttribute("data-ui-target") ? num(element, "target", null) : null,
      targetLabel: attr(element, "target-label", null),
      axisXTitle: attr(element, "axis-x", null),
      axisYTitle: attr(element, "axis-y", null),
      emptyText: attr(element, "empty-text", "No data to display"),
      errorText: attr(element, "error-text", "This chart could not be loaded."),
      linkTemplate: attr(element, "link-template", null),
      linkList: linkList.length ? linkList : null,
      linkTarget: attr(element, "link-target", null),
      max: element.hasAttribute("data-ui-max") ? num(element, "max", null) : null
    };
  }

  function interactive(cfg) {
    return !!(cfg.linkTemplate || cfg.linkList);
  }

  /* ------------------------------------------------------------- bar --- */

  function renderBar(element, cfg, values, names) {
    var box = measure(element, cfg.type);
    var dataMax = Math.max.apply(null, values.concat([0]));
    var dataMin = cfg.zeroBased ? Math.min(0, Math.min.apply(null, values)) : Math.min.apply(null, values.concat([0]));
    var scale = cfg.axis
      ? niceScale(dataMin, cfg.max != null ? cfg.max : Math.max(dataMax, cfg.target || 0), 4)
      : { min: dataMin, max: Math.max(cfg.max != null ? cfg.max : dataMax, cfg.target || 0) || 1, ticks: [] };

    var plot = plotBox(cfg, box, scale, names);
    var span = scale.max - scale.min || 1;
    var count = values.length;
    var slot = (cfg.horizontal ? plot.height : plot.width) / count;
    var gap = Math.min(slot * 0.2, 8);
    var thickness = Math.max(1, slot - gap);

    var marks = values.map(function (value, index) {
      var colour = cfg.multicolour ? PALETTE[index % PALETTE.length] : PALETTE[0];
      var ratio = (value - scale.min) / span;
      var tip = names[index] + ": " + formatValue(element, value);
      var point = { index: index, label: names[index], value: value, tip: tip };
      var inner, labelSvg = "";

      if (cfg.horizontal) {
        var w = Math.max(value > 0 ? MIN_BAR : 0, ratio * plot.width);
        var y = plot.top + index * slot + gap / 2;
        inner = '<rect class="ui-chart-bar-rect" x="' + plot.left + '" y="' + y.toFixed(1) +
          '" width="' + w.toFixed(1) + '" height="' + thickness.toFixed(1) +
          '" fill="' + colour + '" rx="2"><title>' + esc(tip) + "</title></rect>";
        labelSvg = text(plot.left - 6, y + thickness / 2, names[index], "ui-chart-tick", "end", "middle");
        if (cfg.valueLabels) {
          labelSvg += text(plot.left + w + 4, y + thickness / 2,
            formatValue(element, value), "ui-chart-value", "start", "middle");
        }
      } else {
        var h = Math.max(value > 0 ? MIN_BAR : 0, ratio * plot.height);
        var x = plot.left + index * slot + gap / 2;
        inner = '<rect class="ui-chart-bar-rect" x="' + x.toFixed(1) +
          '" y="' + (plot.top + plot.height - h).toFixed(1) +
          '" width="' + thickness.toFixed(1) + '" height="' + h.toFixed(1) +
          '" fill="' + colour + '" rx="2"><title>' + esc(tip) + "</title></rect>";
        if (cfg.valueLabels) {
          labelSvg = text(x + thickness / 2, plot.top + plot.height - h - 4,
            formatValue(element, value), "ui-chart-value");
        }
      }

      return mark(cfg, point, inner) + labelSvg;
    }).join("");

    var chrome = cfg.horizontal
      ? xAxisLine(cfg, plot) + (cfg.axis ? yAxisNumericBottom(cfg, plot, scale) : "")
      : yAxis(cfg, plot, scale) + xAxisLine(cfg, plot) + xLabels(cfg, plot, names, slot);

    return svgOpen(box, interactive(cfg)) + chrome + targetLine(cfg, plot, scale) + marks +
      (dataMax === 0 ? note(cfg, box, "All values are zero") : "") + "</svg>";
  }

  /** Horizontal bars put the numeric scale along the bottom instead. */
  function yAxisNumericBottom(cfg, plot, scale) {
    var parts = [];
    var span = scale.max - scale.min || 1;
    scale.ticks.forEach(function (tick) {
      var x = plot.left + ((tick - scale.min) / span) * plot.width;
      if (cfg.grid) {
        parts.push('<line class="ui-chart-grid" x1="' + x.toFixed(1) + '" y1="' + plot.top +
          '" x2="' + x.toFixed(1) + '" y2="' + (plot.top + plot.height) + '"/>');
      }
      parts.push(text(x, plot.top + plot.height + 14, compact(tick), "ui-chart-tick"));
    });
    return parts.join("");
  }

  /* ------------------------------------------------------------ line --- */

  function renderLine(element, cfg, values, names, sparkline) {
    var box = measure(element, sparkline ? "sparkline" : cfg.type);
    var dataMax = Math.max.apply(null, values);
    var dataMin = cfg.zeroBased || flag(element, "zero-based") ? 0 : Math.min.apply(null, values);
    var scale = cfg.axis && !sparkline
      ? niceScale(dataMin, cfg.max != null ? cfg.max : Math.max(dataMax, cfg.target || 0), 4)
      : { min: dataMin, max: (cfg.max != null ? cfg.max : dataMax) || 1, ticks: [] };

    var plot = sparkline
      ? { left: 1, top: 2, width: box.width - 2, height: box.height - 4 }
      : plotBox(cfg, box, scale, names);

    var span = scale.max - scale.min || 1;
    var step = values.length > 1 ? plot.width / (values.length - 1) : 0;
    var coords = values.map(function (value, index) {
      return {
        x: plot.left + index * step,
        y: plot.top + plot.height - ((value - scale.min) / span) * plot.height
      };
    });
    var path = coords.map(function (c) { return c.x.toFixed(1) + "," + c.y.toFixed(1); }).join(" ");

    var fill = "";
    if (!sparkline || flag(element, "area")) {
      fill = '<polygon class="ui-chart-fill" points="' + plot.left + "," + (plot.top + plot.height) +
        " " + path + " " + (plot.left + plot.width) + "," + (plot.top + plot.height) +
        '" fill="var(--ui-chart-1)" opacity="0.12"/>';
    }

    var dots = sparkline ? "" : coords.map(function (c, index) {
      var tip = names[index] + ": " + formatValue(element, values[index]);
      var inner = '<circle class="ui-chart-dot" cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) +
        '" r="3.5" fill="var(--ui-chart-1)"><title>' + esc(tip) + "</title></circle>";
      var labelSvg = cfg.valueLabels
        ? text(c.x, c.y - 8, formatValue(element, values[index]), "ui-chart-value") : "";
      return mark(cfg, { index: index, label: names[index], value: values[index], tip: tip }, inner) + labelSvg;
    }).join("");

    var chrome = sparkline ? ""
      : yAxis(cfg, plot, scale) + xAxisLine(cfg, plot) +
        xLabels(cfg, plot, names, values.length > 1 ? plot.width / (values.length - 1) : plot.width, false);

    return svgOpen(box, interactive(cfg), sparkline ? "ui-chart-sparkline-svg" : "") +
      chrome + targetLine(cfg, plot, scale) + fill +
      '<polyline points="' + path + '" fill="none" stroke="var(--ui-chart-1)" ' +
      'stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + dots + "</svg>";
  }

  /* ------------------------------------------------------------ area --- */

  function renderArea(element, cfg, values, names) {
    var box = measure(element, cfg.type);
    var dataMax = Math.max.apply(null, values);
    var dataMin = flag(element, "zero-based") ? 0 : Math.min.apply(null, values);
    var scale = cfg.axis
      ? niceScale(dataMin, cfg.max != null ? cfg.max : dataMax, 4)
      : { min: dataMin, max: (cfg.max != null ? cfg.max : dataMax) || 1, ticks: [] };
    var plot = plotBox(cfg, box, scale, names);

    var span = scale.max - scale.min || 1;
    var step = values.length > 1 ? plot.width / (values.length - 1) : 0;
    var coords = values.map(function (value, index) {
      return {
        x: plot.left + index * step,
        y: plot.top + plot.height - ((value - scale.min) / span) * plot.height
      };
    });
    var path = coords.map(function (c) { return c.x.toFixed(1) + "," + c.y.toFixed(1); }).join(" ");
    var gradient = UI.uid("ui-chart-area");

    var dots = coords.map(function (c, index) {
      var tip = names[index] + ": " + formatValue(element, values[index]);
      var inner = '<circle class="ui-chart-dot" cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) +
        '" r="3.5" fill="var(--ui-chart-1)"><title>' + esc(tip) + "</title></circle>";
      return mark(cfg, { index: index, label: names[index], value: values[index], tip: tip }, inner);
    }).join("");

    return svgOpen(box, interactive(cfg)) +
      yAxis(cfg, plot, scale) + xAxisLine(cfg, plot) +
      xLabels(cfg, plot, names, values.length > 1 ? plot.width / (values.length - 1) : plot.width, false) +
      '<defs><linearGradient id="' + gradient + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--ui-chart-1)" stop-opacity="0.45"/>' +
      '<stop offset="100%" stop-color="var(--ui-chart-1)" stop-opacity="0.03"/>' +
      "</linearGradient></defs>" +
      '<polygon points="' + plot.left + "," + (plot.top + plot.height) + " " + path + " " +
      (plot.left + plot.width) + "," + (plot.top + plot.height) +
      '" fill="url(#' + gradient + ')"/>' +
      targetLine(cfg, plot, scale) +
      '<polyline points="' + path + '" fill="none" stroke="var(--ui-chart-1)" ' +
      'stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + dots + "</svg>";
  }

  /* ----------------------------------------------------------- donut --- */

  function renderDonut(element, cfg, values, names) {
    var total = values.reduce(function (sum, value) { return sum + value; }, 0);
    var radius = 15.915494;   // circumference 100, so dash lengths are percentages
    var thickness = num(element, "thickness", 4);
    var offset = 25;          // start at 12 o'clock

    if (total <= 0) {
      return '<svg class="ui-chart-svg ui-chart-donut-svg" viewBox="0 0 42 42" aria-hidden="true">' +
        '<circle cx="21" cy="21" r="' + radius + '" fill="none" stroke="var(--ui-surface-muted)" ' +
        'stroke-width="' + thickness + '"/></svg>';
    }

    var segments = values.map(function (value, index) {
      var percent = (value / total) * 100;
      var tip = names[index] + ": " + formatValue(element, value) +
        " (" + Math.round(percent) + "%)";
      var inner = '<circle class="ui-chart-segment" cx="21" cy="21" r="' + radius +
        '" fill="none" stroke="' + PALETTE[index % PALETTE.length] +
        '" stroke-width="' + thickness +
        '" stroke-dasharray="' + percent.toFixed(2) + " " + (100 - percent).toFixed(2) +
        '" stroke-dashoffset="' + offset.toFixed(2) + '"><title>' + esc(tip) + "</title></circle>";
      offset -= percent;   // dash offsets run backwards around the circle
      return mark(cfg, { index: index, label: names[index], value: value, tip: tip }, inner);
    }).join("");

    var centre = "";
    var centreLabel = attr(element, "centre", null) || attr(element, "center", null);
    if (centreLabel) {
      centre = '<text x="21" y="21" class="ui-chart-centre" text-anchor="middle" ' +
        'dominant-baseline="central">' + esc(centreLabel) + "</text>";
    }

    return '<svg class="ui-chart-svg ui-chart-donut-svg" viewBox="0 0 42 42" focusable="false"' +
      (interactive(cfg) ? "" : ' aria-hidden="true"') + ">" +
      '<circle cx="21" cy="21" r="' + radius + '" fill="none" stroke="var(--ui-surface-muted)" ' +
      'stroke-width="' + thickness + '"/>' + segments + centre + "</svg>";
  }

  /* ---------------------------------------------------- multi-series --- */

  /* Colour follows the series' original position, so switching one off in the
     legend does not recolour the ones that remain. */
  function colourOf(series, index) {
    var at = series.paletteIndex != null ? series.paletteIndex : index;
    return PALETTE[at % PALETTE.length];
  }

  function parseSeries(element) {
    var script = element.querySelector('script[type="application/json"]');
    if (!script) return null;

    var json;
    try { json = JSON.parse(script.textContent || "{}"); }
    catch (error) { return null; }
    if (!json || !Array.isArray(json.series) || !json.series.length) return null;

    var series = json.series.map(function (item, index) {
      return {
        name: (item && item.name) || ("Series " + (index + 1)),
        links: (item && item.links) || null,
        paletteIndex: index,
        values: ((item && item.values) || [])
          .map(function (value) { return parseFloat(value); })
          .filter(function (value) { return isFinite(value); })
      };
    });
    return { series: series, categories: (json.labels || []).map(String) };
  }

  function renderGroupedBar(element, cfg, series, categories) {
    var box = measure(element, cfg.type);
    var groups = categories.length;
    var count = series.length;
    if (!groups || !count) return svgOpen(box, false) + "</svg>";

    var max = 0;
    for (var g = 0; g < groups; g++) {
      if (cfg.stacked) {
        var sum = 0;
        for (var s = 0; s < count; s++) sum += (series[s].values[g] || 0);
        max = Math.max(max, sum);
      } else {
        for (var s2 = 0; s2 < count; s2++) max = Math.max(max, series[s2].values[g] || 0);
      }
    }

    var scale = cfg.axis
      ? niceScale(0, cfg.max != null ? cfg.max : Math.max(max, cfg.target || 0), 4)
      : { min: 0, max: Math.max(cfg.max != null ? cfg.max : max, cfg.target || 0) || 1, ticks: [] };
    var plot = plotBox(cfg, box, scale, categories);
    var span = scale.max - scale.min || 1;

    var slot = (cfg.horizontal ? plot.height : plot.width) / groups;
    var gap = Math.min(slot * 0.2, 10);
    var groupSize = slot - gap;
    var cross = cfg.horizontal ? plot.width : plot.height;

    var out = [];
    for (var gi = 0; gi < groups; gi++) {
      var start = (cfg.horizontal ? plot.top : plot.left) + gi * slot + gap / 2;

      if (cfg.stacked) {
        var cumulative = 0;
        for (var si = 0; si < count; si++) {
          var value = series[si].values[gi] || 0;
          var size = (value / span) * cross;
          var tip = series[si].name + " – " + categories[gi] + ": " + formatValue(element, value);
          var point = {
            index: gi, label: categories[gi], value: value,
            series: series[si].name, seriesIndex: si, seriesLinks: series[si].links, tip: tip
          };
          var inner = cfg.horizontal
            ? rect(plot.left + cumulative, start, size, groupSize, colourOf(series[si], si), tip)
            : rect(start, plot.top + plot.height - cumulative - size, groupSize, size, colourOf(series[si], si), tip);
          out.push(mark(cfg, point, inner));
          cumulative += size;
        }
      } else {
        var barGap = count > 1 ? 2 : 0;
        var barSize = (groupSize - barGap * (count - 1)) / count;
        for (var sj = 0; sj < count; sj++) {
          var v = series[sj].values[gi] || 0;
          var sz = Math.max(v > 0 ? MIN_BAR : 0, (v / span) * cross);
          var pos = start + sj * (barSize + barGap);
          var t = series[sj].name + " – " + categories[gi] + ": " + formatValue(element, v);
          var p = {
            index: gi, label: categories[gi], value: v,
            series: series[sj].name, seriesIndex: sj, seriesLinks: series[sj].links, tip: t
          };
          var el = cfg.horizontal
            ? rect(plot.left, pos, sz, barSize, colourOf(series[sj], sj), t)
            : rect(pos, plot.top + plot.height - sz, barSize, sz, colourOf(series[sj], sj), t);
          out.push(mark(cfg, p, el));
        }
      }
    }

    var chrome = cfg.horizontal
      ? xAxisLine(cfg, plot) + (cfg.axis ? yAxisNumericBottom(cfg, plot, scale) : "") +
        categories.map(function (category, index) {
          return text(plot.left - 6, plot.top + (index + 0.5) * slot, category, "ui-chart-tick", "end", "middle");
        }).join("")
      : yAxis(cfg, plot, scale) + xAxisLine(cfg, plot) + xLabels(cfg, plot, categories, slot);

    return svgOpen(box, interactive(cfg)) + chrome + targetLine(cfg, plot, scale) +
      out.join("") + "</svg>";
  }

  function rect(x, y, w, h, colour, tip) {
    return '<rect class="ui-chart-bar-rect" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
      '" width="' + Math.max(0, w).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) +
      '" fill="' + colour + '" rx="1.5"><title>' + esc(tip) + "</title></rect>";
  }

  function renderMultiLine(element, cfg, series, categories) {
    var box = measure(element, cfg.type);
    var all = [].concat.apply([], series.map(function (s) { return s.values; }));
    var max = Math.max.apply(null, all.concat([0]));
    var min = flag(element, "zero-based") ? 0 : Math.min.apply(null, all.concat([0]));
    var scale = cfg.axis
      ? niceScale(min, cfg.max != null ? cfg.max : Math.max(max, cfg.target || 0), 4)
      : { min: min, max: (cfg.max != null ? cfg.max : max) || 1, ticks: [] };
    var plot = plotBox(cfg, box, scale, categories);
    var span = scale.max - scale.min || 1;
    var step = categories.length > 1 ? plot.width / (categories.length - 1) : 0;

    var lines = series.map(function (s, index) {
      var colour = colourOf(s, index);
      var coords = s.values.map(function (value, i) {
        return {
          x: plot.left + i * step,
          y: plot.top + plot.height - ((value - scale.min) / span) * plot.height
        };
      });
      var path = coords.map(function (c) { return c.x.toFixed(1) + "," + c.y.toFixed(1); }).join(" ");
      var dots = coords.map(function (c, i) {
        var tip = s.name + " – " + (categories[i] || "") + ": " + formatValue(element, s.values[i]);
        var inner = '<circle class="ui-chart-dot" cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) +
          '" r="3" fill="' + colour + '"><title>' + esc(tip) + "</title></circle>";
        return mark(cfg, {
          index: i, label: categories[i], value: s.values[i],
          series: s.name, seriesIndex: index, seriesLinks: s.links, tip: tip
        }, inner);
      }).join("");
      return '<polyline points="' + path + '" fill="none" stroke="' + colour +
        '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + dots;
    }).join("");

    return svgOpen(box, interactive(cfg)) +
      yAxis(cfg, plot, scale) + xAxisLine(cfg, plot) + xLabels(cfg, plot, categories, step || plot.width, false) +
      targetLine(cfg, plot, scale) + lines + "</svg>";
  }

  function renderMultiArea(element, cfg, series, categories) {
    var box = measure(element, cfg.type);
    var groups = categories.length;
    var count = series.length;
    if (!groups || !count) return svgOpen(box, false) + "</svg>";

    var max = 0;
    for (var g = 0; g < groups; g++) {
      var sum = 0;
      for (var s = 0; s < count; s++) sum += (series[s].values[g] || 0);
      max = Math.max(max, sum);
    }
    var scale = cfg.axis ? niceScale(0, cfg.max != null ? cfg.max : max, 4)
      : { min: 0, max: (cfg.max != null ? cfg.max : max) || 1, ticks: [] };
    var plot = plotBox(cfg, box, scale, categories);
    var span = scale.max - scale.min || 1;
    var step = groups > 1 ? plot.width / (groups - 1) : 0;

    var baseline = new Array(groups).fill(0);
    var layers = [];
    series.forEach(function (s, index) {
      var top = [], bottom = [];
      for (var i = 0; i < groups; i++) {
        var value = s.values[i] || 0;
        var stackTop = baseline[i] + value;
        var x = (plot.left + i * step).toFixed(1);
        top.push(x + "," + (plot.top + plot.height - (stackTop / span) * plot.height).toFixed(1));
        bottom.push(x + "," + (plot.top + plot.height - (baseline[i] / span) * plot.height).toFixed(1));
        baseline[i] = stackTop;
      }
      var colour = colourOf(s, index);
      layers.push('<polygon points="' + top.concat(bottom.slice().reverse()).join(" ") +
        '" fill="' + colour + '" opacity="0.55"><title>' + esc(s.name) + "</title></polygon>");
      layers.push('<polyline points="' + top.join(" ") + '" fill="none" stroke="' + colour +
        '" stroke-width="1.5"/>');
    });

    return svgOpen(box, interactive(cfg)) +
      yAxis(cfg, plot, scale) + xAxisLine(cfg, plot) + xLabels(cfg, plot, categories, step || plot.width, false) +
      layers.join("") + "</svg>";
  }

  /* ==================================================================== */
  /* Legend, data table, summary                                          */
  /* ==================================================================== */

  // `modifier` has to join the existing class attribute rather than arrive as
  // a second one: a duplicate class="" is silently ignored by the parser, so
  // the off-state simply never appeared.
  function legendItem(index, label, value, extra, modifier) {
    return '<li class="ui-chart-legend-item' + (modifier ? " " + modifier : "") + '"' +
      (extra || "") + ">" +
      '<span class="ui-chart-swatch" data-ui-swatch="' + (index % PALETTE.length) + '"></span>' +
      '<span class="ui-chart-legend-label">' + esc(label) + "</span>" +
      (value != null ? '<span class="ui-chart-legend-value">' + esc(value) + "</span>" : "") +
      "</li>";
  }

  function renderLegend(element, values, names) {
    if (!flag(element, "legend")) return "";
    var total = values.reduce(function (sum, value) { return sum + value; }, 0);
    var items = values.map(function (value, index) {
      var percent = total > 0 ? Math.round((value / total) * 100) : 0;
      return legendItem(index, names[index],
        formatValue(element, value) + (flag(element, "legend-percent") ? " (" + percent + "%)" : ""));
    }).join("");
    return '<ul class="ui-chart-legend">' + items + "</ul>";
  }

  // The legend always lists every series, including switched-off ones --
  // otherwise the control that hides a series also hides the way to bring it
  // back, and the reader has no way to know anything is missing.
  function renderSeriesLegend(element, allSeries, hidden) {
    if (!flag(element, "legend")) return "";
    var toggle = flag(element, "legend-toggle");
    var items = allSeries.map(function (s, index) {
      var off = hidden.indexOf(index) !== -1;
      return legendItem(index, s.name, null,
        toggle ? ' data-ui-series="' + index + '" tabindex="0" role="button" aria-pressed="' +
          (off ? "false" : "true") + '"' : "",
        off ? "ui-off" : "");
    }).join("");
    return '<ul class="ui-chart-legend' + (toggle ? " ui-chart-legend-toggle" : "") + '">' + items + "</ul>";
  }

  function dataTable(element, values, names) {
    var rows = values.map(function (value, index) {
      return '<tr><th scope="row">' + esc(names[index]) + "</th><td>" +
        esc(formatValue(element, value)) + "</td></tr>";
    }).join("");
    return '<table class="ui-sr-only ui-chart-data"><caption>' +
      esc(attr(element, "title", "Chart data")) + "</caption><tbody>" + rows + "</tbody></table>";
  }

  function multiDataTable(element, series, categories) {
    var head = "<tr><th></th>" + series.map(function (s) {
      return "<th>" + esc(s.name) + "</th>";
    }).join("") + "</tr>";
    var rows = categories.map(function (category, i) {
      return '<tr><th scope="row">' + esc(category) + "</th>" +
        series.map(function (s) {
          return "<td>" + esc(formatValue(element, s.values[i] || 0)) + "</td>";
        }).join("") + "</tr>";
    }).join("");
    return '<table class="ui-sr-only ui-chart-data"><caption>' +
      esc(attr(element, "title", "Chart data")) +
      "</caption><thead>" + head + "</thead><tbody>" + rows + "</tbody></table>";
  }

  function summary(element, values, names) {
    return attr(element, "title", "Chart") + ": " + values.map(function (value, index) {
      return names[index] + " " + formatValue(element, value);
    }).join(", ");
  }

  function multiSummary(element, series, categories) {
    return attr(element, "title", "Chart") + ". " + series.map(function (s) {
      return s.name + ": " + s.values.map(function (value, i) {
        return (categories[i] || "") + " " + formatValue(element, value);
      }).join(", ");
    }).join(". ");
  }

  /* ==================================================================== */
  /* Tooltip                                                              */
  /* ==================================================================== */

  /**
   * The old implementation relied on SVG <title>, which the browser renders
   * as a native tooltip: about a second of hover delay, no styling, and --
   * the reason this exists -- nothing at all on a touch screen. On a phone
   * in the field there was simply no way to read a value off a chart.
   *
   * <title> is still emitted as a fallback for anything that bypasses this
   * (a printed page, a browser with scripting disabled).
   */
  var tip = null;
  var tipCleanup = null;

  function tipElement() {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "ui-chart-tip";
      tip.setAttribute("role", "status");
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    return tip;
  }

  function showTip(target) {
    var message = target.getAttribute("data-ui-tip");
    if (!message) return;
    var element = tipElement();
    element.textContent = message;
    element.hidden = false;
    if (tipCleanup) tipCleanup();
    tipCleanup = UI.floatPanel ? UI.floatPanel(target, element, { align: "center" }) : null;
  }

  function hideTip() {
    if (tipCleanup) { tipCleanup(); tipCleanup = null; }
    if (tip) tip.hidden = true;
  }

  document.addEventListener("pointerover", function (event) {
    var target = UI.closest(event.target, ".ui-chart-mark");
    if (target) showTip(target); else if (UI.closest(event.target, ".ui-chart")) hideTip();
  });
  document.addEventListener("pointerleave", hideTip, true);
  document.addEventListener("focusin", function (event) {
    var target = UI.closest(event.target, ".ui-chart-mark");
    if (target) showTip(target);
  });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") hideTip();
  });
  window.addEventListener("scroll", hideTip, true);

  /* ==================================================================== */
  /* Selection                                                            */
  /* ==================================================================== */

  /**
   * Fires alongside the link so a single-page application can intercept and
   * route rather than navigate. Calling preventDefault() on ui:chart:select
   * cancels the navigation -- which is why the href is still there: without
   * JavaScript it is a working link, and with it the application decides.
   */
  document.addEventListener("click", function (event) {
    var target = UI.closest(event.target, ".ui-chart-mark");
    if (!target) return;
    var chart = UI.closest(target, ".ui-chart");
    if (!chart) return;

    var detail = {
      label: target.getAttribute("data-ui-label"),
      value: parseFloat(target.getAttribute("data-ui-value")),
      series: target.getAttribute("data-ui-series-name"),
      index: parseInt(target.getAttribute("data-ui-index"), 10),
      href: target.getAttribute("href") || null,
      mark: target
    };

    var custom = new window.CustomEvent("ui:chart:select", {
      bubbles: true, cancelable: true, detail: detail
    });
    if (!chart.dispatchEvent(custom)) event.preventDefault();
  });

  /* ==================================================================== */
  /* Build                                                                */
  /* ==================================================================== */

  /* ------------------------------------------------------ legend toggle -- */

  // Which series the reader has switched off, kept on the element so a
  // re-render (resize, data update) preserves the choice.
  function hiddenSeries(element) {
    return (element.getAttribute("data-ui-hidden-series") || "")
      .split(",").filter(Boolean).map(Number);
  }

  function toggleSeries(element, index) {
    var hidden = hiddenSeries(element);
    var at = hidden.indexOf(index);
    if (at === -1) hidden.push(index); else hidden.splice(at, 1);
    element.setAttribute("data-ui-hidden-series", hidden.join(","));
    refresh(element);
    UI.emit(element, "ui:chart:toggle", { hidden: hidden });
  }

  document.addEventListener("click", function (event) {
    var item = UI.closest(event.target, ".ui-chart-legend-toggle [data-ui-series]");
    if (!item) return;
    var chart = UI.closest(item, ".ui-chart");
    if (chart) toggleSeries(chart, Number(item.getAttribute("data-ui-series")));
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var item = UI.closest(event.target, ".ui-chart-legend-toggle [data-ui-series]");
    if (!item) return;
    event.preventDefault();
    var chart = UI.closest(item, ".ui-chart");
    if (chart) toggleSeries(chart, Number(item.getAttribute("data-ui-series")));
  });

  function empty(element, cfg) {
    element.classList.add("ui-chart", "ui-chart-" + cfg.type, "ui-chart-is-empty");
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", attr(element, "title", "Chart") + ": " + cfg.emptyText);
    element.innerHTML = '<div class="ui-chart-empty">' + esc(cfg.emptyText) + "</div>";
  }

  function build(element) {
    if (element.dataset.uiChartReady) return;
    element.dataset.uiChartReady = "true";

    var type = attr(element, "chart", "bar");
    var cfg = readConfig(element, type);
    var multi = parseSeries(element);

    if (multi) {
      var hasValues = multi.series.some(function (s) { return s.values.length; });
      if (!hasValues) { empty(element, cfg); return; }

      var hidden = hiddenSeries(element);
      var shown = multi.series.filter(function (s, index) { return hidden.indexOf(index) === -1; });
      if (!shown.length) shown = multi.series;   // never leave a blank plot

      var body;
      if (type === "line") body = renderMultiLine(element, cfg, shown, multi.categories);
      else if (type === "area") body = renderMultiArea(element, cfg, shown, multi.categories);
      else body = renderGroupedBar(element, cfg, shown, multi.categories);

      element.classList.add("ui-chart", "ui-chart-" + type, "ui-chart-multi");
      element.classList.remove("ui-chart-is-empty");
      applyRole(element, cfg, multiSummary(element, shown, multi.categories));

      // The data island is a child of the element we are about to clear.
      // Detaching and reattaching it keeps a second render (UI.destroy() +
      // UI.init(), a resize, an observed region) from finding no data and
      // silently drawing nothing.
      var island = element.querySelector('script[type="application/json"]');
      element.innerHTML = body + renderSeriesLegend(element, multi.series, hidden) +
        multiDataTable(element, multi.series, multi.categories);
      if (island) element.appendChild(island);

      UI.emit(element, "ui:chart:rendered", { type: type, series: shown });
      return;
    }

    var values = numbers(element);
    if (!values.length) { empty(element, cfg); return; }
    var names = labels(element, values.length);

    var svg;
    if (type === "donut" || type === "pie") svg = renderDonut(element, cfg, values, names);
    else if (type === "line") svg = renderLine(element, cfg, values, names, false);
    else if (type === "sparkline") svg = renderLine(element, cfg, values, names, true);
    else if (type === "area") svg = renderArea(element, cfg, values, names);
    else svg = renderBar(element, cfg, values, names);

    element.classList.add("ui-chart", "ui-chart-" + type);
    element.classList.remove("ui-chart-is-empty");
    applyRole(element, cfg, summary(element, values, names));
    element.innerHTML = svg + renderLegend(element, values, names) + dataTable(element, values, names);

    UI.emit(element, "ui:chart:rendered", { type: type, values: values });
  }

  /**
   * A static chart is one image with one description. An interactive one is a
   * group of links, and marking that role="img" would hide every one of them
   * from a screen reader -- an image has no interior.
   */
  function applyRole(element, cfg, description) {
    if (interactive(cfg)) {
      element.setAttribute("role", "group");
      element.setAttribute("aria-label", description);
    } else {
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", description);
    }
  }

  /* ------------------------------------------------------------ resize -- */

  // Layout now depends on the element's width in pixels rather than being
  // scaled to fit, so a width change needs a re-render, not a re-scale.
  var observer = null;
  var pending = null;

  function watch(element) {
    if (!window.ResizeObserver) return;
    if (!observer) {
      observer = new window.ResizeObserver(function (entries) {
        if (pending) window.cancelAnimationFrame(pending);
        var targets = entries.map(function (entry) { return entry.target; });
        pending = window.requestAnimationFrame(function () {
          targets.forEach(function (target) {
            if (!target.isConnected) return;
            var width = Math.round(target.clientWidth);
            if (target._uiChartWidth === width) return;
            target._uiChartWidth = width;
            refresh(target);
          });
        });
      });
    }
    element._uiChartWidth = Math.round(element.clientWidth);
    observer.observe(element);
    UI.cleanup(element, function () { observer.unobserve(element); });
  }

  function refresh(element) {
    if (element.classList.contains("ui-chart-sparkline")) return;   // fixed size, nothing to relayout
    delete element.dataset.uiChartReady;
    build(element);
  }

  /* ==================================================================== */
  /* Server data source                                                   */
  /* ==================================================================== */

  /**
   * Smart tables have had `data-ui-url` since they were written; charts did
   * not, so every dashboard hand-rolled the same fetch-then-update. This
   * closes that gap.
   *
   *   <div data-ui-chart="bar" data-ui-axis
   *        data-ui-url="/compliance/rates"
   *        data-ui-refresh-on="#inspectionFilters"></div>
   *
   * Accepted response shapes, matching UI.chart.update():
   *   [1, 2, 3]
   *   { "values": [...], "labels": [...] }
   *   { "labels": [...], "series": [{ "name": …, "values": [...] }] }
   *
   * `data-ui-refresh-on` names an element whose changes should re-query --
   * usually a filter bar. The current filter state goes out as query
   * parameters, so one endpoint serves the chart and the table beside it.
   */
  function loadingState(element, cfg) {
    element.classList.add("ui-chart", "ui-chart-" + cfg.type, "ui-chart-is-loading");
    element.setAttribute("aria-busy", "true");
    // A skeleton rather than a spinner: it reserves the height the chart is
    // about to take, so the page does not jump when the data lands.
    element.innerHTML = '<div class="ui-chart-skeleton" aria-hidden="true">' +
      '<span></span><span></span><span></span><span></span><span></span>' +
      "</div>";
  }

  function errorState(element, cfg, status) {
    element.classList.add("ui-chart", "ui-chart-" + cfg.type, "ui-chart-is-error");
    element.classList.remove("ui-chart-is-loading");
    element.removeAttribute("aria-busy");
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", attr(element, "title", "Chart") + ": " + cfg.errorText);
    element.innerHTML = '<div class="ui-chart-error">' + esc(cfg.errorText) + "</div>";
    UI.emit(element, "ui:chart:error", { status: status });
  }

  function queryFor(element) {
    var params = new window.URLSearchParams();
    var source = attr(element, "refresh-on", null);
    var bar = source ? UI.q(source) : null;
    if (bar && UI.filter) {
      var state = UI.filter.state(bar);
      Object.keys(state).forEach(function (key) { params.set(key, state[key].join(",")); });
    }
    return params;
  }

  function load(element) {
    var url = attr(element, "url", null);
    if (!url) return;

    var cfg = readConfig(element, attr(element, "chart", "bar"));

    // A filter changed while the previous request was still in flight would
    // otherwise race: whichever response arrived last would win, which is not
    // necessarily the one the user is waiting for.
    if (element._uiChartAbort) element._uiChartAbort.abort();
    var controller = window.AbortController ? new window.AbortController() : null;
    element._uiChartAbort = controller;

    var target = new URL(url, window.location.href);
    queryFor(element).forEach(function (value, key) { target.searchParams.set(key, value); });

    loadingState(element, cfg);

    window.fetch(target.toString(), {
      headers: { "Accept": "application/json", "X-Requested-With": "ui-chart" },
      credentials: "same-origin",
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) {
        var error = new Error("HTTP " + response.status);
        error.status = response.status;
        throw error;
      }
      return response.json();
    }).then(function (data) {
      element._uiChartAbort = null;
      element.classList.remove("ui-chart-is-loading", "ui-chart-is-error");
      element.removeAttribute("aria-busy");
      apply(element, data);
      UI.emit(element, "ui:chart:loaded", { data: data });
    }).catch(function (error) {
      if (error && error.name === "AbortError") return;   // superseded, not failed
      element._uiChartAbort = null;
      errorState(element, cfg, error && error.status);
    });
  }

  function apply(element, data) {
    if (Array.isArray(data)) { UI.chart.update(element, data); return; }
    if (data && Array.isArray(data.series)) {
      UI.chart.update(element, { labels: data.labels || [], series: data.series });
      return;
    }
    UI.chart.update(element, (data && data.values) || [], (data && data.labels) || null);
  }

  function bindRefresh(element) {
    var source = attr(element, "refresh-on", null);
    if (!source) return;
    var bar = UI.q(source);
    if (!bar) return;

    var handler = function () { load(element); };
    ["ui:filter:change", "ui:segment:change", "ui:daterange:change"].forEach(function (name) {
      bar.addEventListener(name, handler);
    });
    UI.cleanup(element, function () {
      ["ui:filter:change", "ui:segment:change", "ui:daterange:change"].forEach(function (name) {
        bar.removeEventListener(name, handler);
      });
    });
  }

  function init(root) {
    UI.matchAll("[data-ui-chart]", root).forEach(function (element) {
      if (element.hasAttribute("data-ui-url")) {
        if (element.dataset.uiChartReady) return;
        element.dataset.uiChartReady = "true";
        bindRefresh(element);
        load(element);
        watch(element);
        return;
      }
      build(element);
      watch(element);
    });
  }

  UI.register(init);

  UI.chart = {
    /**
     * Replaces a chart's data and re-renders it in place.
     *
     *   UI.chart.update("#c", [5, 10, 15], ["X", "Y", "Z"]);
     *   UI.chart.update("#c", { labels: [...], series: [{name, values}, ...] });
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
        element.setAttribute("data-ui-values", (valuesOrData || []).join(","));
        if (names) element.setAttribute("data-ui-labels", names.join(","));
      }

      refresh(element);
    },

    /** Re-render without changing the data -- after a container resize or a theme change. */
    refresh: function (target) {
      var element = typeof target === "string" ? UI.q(target) : target;
      if (element) refresh(element);
    },

    /** Re-query a `data-ui-url` chart -- after saving a record, say. */
    load: function (target) {
      var element = typeof target === "string" ? UI.q(target) : target;
      if (element) load(element);
    }
  };
})(window, document);
