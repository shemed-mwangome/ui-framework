(function (window, document) {
  "use strict";
  var UI = window.UI;

  function atMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function today() {
    return atMidnight(new Date());
  }

  function parseISODate(value) {
    if (!value) return null;
    var parts = value.split("-");
    if (parts.length !== 3) return null;
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(date.getTime()) ? null : date;
  }

  function formatISODate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function formatDisplayDate(date) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function addDays(date, amount) {
    var result = atMidnight(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function addMonths(date, amount) {
    var result = atMidnight(date);
    result.setMonth(result.getMonth() + amount);
    return result;
  }

  function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
  function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }
  function sameDay(a, b) { return !!a && !!b && a.getTime() === b.getTime(); }

  function buildCalendarDays(viewDate) {
    var firstOfMonth = startOfMonth(viewDate);
    var gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());
    var days = [];
    for (var i = 0; i < 42; i++) days.push(addDays(gridStart, i));
    return days;
  }

  UI.dateUtils = {
    WEEKDAYS: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    atMidnight: atMidnight,
    today: today,
    parseISODate: parseISODate,
    formatISODate: formatISODate,
    formatDisplayDate: formatDisplayDate,
    addDays: addDays,
    addMonths: addMonths,
    startOfMonth: startOfMonth,
    endOfMonth: endOfMonth,
    sameDay: sameDay,
    buildCalendarDays: buildCalendarDays
  };
})(window, document);
