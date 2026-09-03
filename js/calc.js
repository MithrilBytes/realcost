// Pure calculation and formatting. No DOM, no state, fully testable in Node.

export function computeDerived(settings) {
  const { salary, hoursPerWeek, weeksPerYear, payBasis, takeHomePct } = settings;
  const hoursPerYear = hoursPerWeek * weeksPerYear;
  const hoursPerDay = hoursPerWeek / 5;
  const daysPerYear = weeksPerYear * 5;
  const effectiveWage =
    payBasis === "takeHome" ? salary * (takeHomePct / 100) : salary;
  const hourlyRate = hoursPerYear > 0 ? effectiveWage / hoursPerYear : NaN;
  return { hoursPerYear, hoursPerDay, daysPerYear, effectiveWage, hourlyRate };
}

export function hoursFor(price, hourlyRate) {
  return price / hourlyRate;
}

// Breakdown for the salary summary hero, per SPEC 5.4.
export function unitBreakdown(price, settings) {
  const d = computeDerived(settings);
  const timePerUnitHours = price / d.hourlyRate;
  const unitsPerYear = d.effectiveWage / price;
  const totalHours = unitsPerYear * timePerUnitHours; // equals hoursPerYear by construction
  return {
    timePerUnitHours,
    timePerUnitMin: timePerUnitHours * 60,
    unitsPerYear,
    unitsPerDay: unitsPerYear / (settings.weeksPerYear * 5),
    unitsPerWeek: unitsPerYear / settings.weeksPerYear,
    unitsPerMonth: unitsPerYear / 12,
    totalHours,
    totalDays: totalHours / d.hoursPerDay,
    totalWeeks: totalHours / d.hoursPerDay / 5,
  };
}

const nfWhole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nfOneDp = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// Counts of units: one decimal below 10, whole numbers above.
export function formatCount(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 10 && Math.round(n * 10) < 100) return nfOneDp.format(n);
  return nfWhole.format(n);
}

export function formatMoney(amount, currency) {
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
}

export function formatRate(rate, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate);
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

// Duration display per SPEC 5.3. `hours` is decimal working hours.
// derived: { hoursPerDay, hoursPerYear } from computeDerived.
// style: "short" ("3 days, 4 hrs") or "long" ("3 working days and 4 hours").
export function formatDuration(hours, derived, style = "short") {
  if (!Number.isFinite(hours) || hours < 0) return "";
  const { hoursPerDay, hoursPerYear } = derived;
  const long = style === "long";

  if (hours * 3600 < 30 && hours < hoursPerDay) {
    return long ? "less than a minute" : "< 1 min";
  }

  // Minutes: under one hour (and under one working day, for extreme inputs).
  if (hours < 1 && hours < hoursPerDay) {
    let m = Math.round(hours * 60);
    if (m < 60) {
      return long ? `${m} ${plural(m, "minute", "minutes")}` : `${m} min`;
    }
    // 59.5+ min rounds to the hour tier.
  }

  // Hours and minutes: up to one working day.
  if (hours < hoursPerDay) {
    let h = Math.floor(hours);
    let m = Math.round((hours - h) * 60);
    if (m === 60) {
      h += 1;
      m = 0;
    }
    if (h < hoursPerDay) {
      const hs = long
        ? `${h} ${plural(h, "hour", "hours")}`
        : `${h} ${plural(h, "hr", "hrs")}`;
      if (m === 0) return hs;
      const ms = long ? `${m} ${plural(m, "minute", "minutes")}` : `${m} min`;
      return long ? `${hs} and ${ms}` : `${hs} ${ms}`;
    }
    // Rounding pushed us to a full day; fall through.
    hours = h;
  }

  // Working days: up to one working year.
  if (hours < hoursPerYear) {
    let days = Math.floor(hours / hoursPerDay);
    let remH = Math.round(hours - days * hoursPerDay);
    if (remH >= hoursPerDay) {
      days += 1;
      remH = 0;
    }
    if (days * hoursPerDay < hoursPerYear) {
      const ds = long
        ? `${nfWhole.format(days)} working ${plural(days, "day", "days")}`
        : `${nfWhole.format(days)} ${plural(days, "day", "days")}`;
      if (remH === 0) return ds;
      const hs = long
        ? `${remH} ${plural(remH, "hour", "hours")}`
        : `${remH} ${plural(remH, "hr", "hrs")}`;
      return long ? `${ds} and ${hs}` : `${ds}, ${hs}`;
    }
    hours = days * hoursPerDay;
  }

  // Working years and days.
  const daysPerYear = hoursPerYear / hoursPerDay;
  let years = Math.floor(hours / hoursPerYear);
  let remDays = Math.round((hours - years * hoursPerYear) / hoursPerDay);
  if (remDays >= daysPerYear) {
    years += 1;
    remDays = 0;
  }
  const ys = `${nfWhole.format(years)} working ${plural(years, "year", "years")}`;
  if (remDays === 0) return ys;
  const ds = `${nfWhole.format(remDays)} ${plural(remDays, "day", "days")}`;
  return long ? `${ys} and ${ds}` : `${ys}, ${ds}`;
}

// Screen-reader form, always fully spelled out.
export function durationAria(hours, derived) {
  return formatDuration(hours, derived, "long");
}
