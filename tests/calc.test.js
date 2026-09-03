import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDerived,
  hoursFor,
  unitBreakdown,
  formatDuration,
  formatCount,
  formatMoney,
} from "../js/calc.js";

const base = {
  salary: 38400,
  hoursPerWeek: 40,
  weeksPerYear: 48,
  payBasis: "gross",
  takeHomePct: 70,
};
const d = computeDerived(base);

test("derived values for defaults", () => {
  assert.equal(d.hoursPerYear, 1920);
  assert.equal(d.hoursPerDay, 8);
  assert.equal(d.daysPerYear, 240);
  assert.equal(d.hourlyRate, 20);
});

test("take-home basis scales the wage", () => {
  const t = computeDerived({ ...base, payBasis: "takeHome" });
  assert.equal(t.effectiveWage, 26880);
  assert.equal(t.hourlyRate, 14);
});

test("zero working hours yields NaN rate, not Infinity", () => {
  const z = computeDerived({ ...base, hoursPerWeek: 0 });
  assert.ok(Number.isNaN(z.hourlyRate));
});

test("spec example: $6 coffee at $20/hr is 18 minutes", () => {
  assert.equal(formatDuration(hoursFor(6, 20), d), "18 min");
});

test("sub-30-second amounts read as under a minute", () => {
  assert.equal(formatDuration(hoursFor(0.01, 20), d), "< 1 min");
  assert.equal(formatDuration(hoursFor(0.01, 20), d, "long"), "less than a minute");
});

test("minutes round to the nearest minute", () => {
  assert.equal(formatDuration(0.5, d), "30 min");
  assert.equal(formatDuration(0.3, d), "18 min");
});

test("59.6 minutes rounds up into the hour tier", () => {
  assert.equal(formatDuration(59.6 / 60, d), "1 hr");
});

test("hours and minutes between one hour and one day", () => {
  assert.equal(formatDuration(1, d), "1 hr");
  assert.equal(formatDuration(3.25, d), "3 hrs 15 min");
  assert.equal(formatDuration(3.25, d, "long"), "3 hours and 15 minutes");
});

test("7.9999 hours rounds up to one day", () => {
  assert.equal(formatDuration(7.9999, d), "1 day");
});

test("days and hours, spec example shape", () => {
  assert.equal(formatDuration(28, d), "3 days, 4 hrs");
  assert.equal(formatDuration(28, d, "long"), "3 working days and 4 hours");
  assert.equal(formatDuration(8, d), "1 day");
});

test("day length follows the user's own hours per week", () => {
  const wide = computeDerived({ ...base, hoursPerWeek: 100, weeksPerYear: 52 });
  assert.equal(wide.hoursPerDay, 20);
  assert.equal(wide.hoursPerYear, 5200);
  assert.equal(formatDuration(30, wide), "1 day, 10 hrs");
});

test("a full working year and beyond", () => {
  assert.equal(formatDuration(1920, d), "1 working year");
  assert.equal(formatDuration(2000, d), "1 working year, 10 days");
  assert.equal(formatDuration(2000, d, "long"), "1 working year and 10 days");
  assert.equal(formatDuration(3840, d), "2 working years");
});

test("edge: salary of 1 makes a coffee cost working years", () => {
  const poor = computeDerived({ ...base, salary: 1 });
  const h = hoursFor(5.5, poor.hourlyRate);
  assert.equal(h, 10560);
  assert.equal(formatDuration(h, poor), "5 working years, 120 days");
});

test("edge: one cent at $20/hr", () => {
  assert.equal(formatDuration(hoursFor(0.01, 20), d), "< 1 min");
});

test("negative and non-finite inputs return empty", () => {
  assert.equal(formatDuration(-1, d), "");
  assert.equal(formatDuration(NaN, d), "");
  assert.equal(formatDuration(Infinity, d), "");
});

test("unit breakdown identity: units always sum to the working year", () => {
  for (const price of [0.01, 1, 5.5, 63, 1199, 20000]) {
    for (const s of [
      base,
      { ...base, salary: 1 },
      { ...base, hoursPerWeek: 100, weeksPerYear: 52 },
      { ...base, payBasis: "takeHome", takeHomePct: 55 },
    ]) {
      const b = unitBreakdown(price, s);
      const hpy = computeDerived(s).hoursPerYear;
      assert.ok(
        Math.abs(b.totalHours - hpy) < 1e-6 * hpy,
        `totalHours ${b.totalHours} != hoursPerYear ${hpy} at price ${price}`
      );
    }
  }
});

test("unit breakdown spec example: $6 coffee on $38,400", () => {
  const b = unitBreakdown(6, base);
  assert.equal(b.unitsPerYear, 6400);
  assert.equal(b.timePerUnitMin, 18);
  assert.equal(b.totalDays, 240);
  assert.equal(b.totalWeeks, 48);
});

test("counts show one decimal below 10, whole above", () => {
  assert.equal(formatCount(4.32), "4.3");
  assert.equal(formatCount(9.94), "9.9");
  assert.equal(formatCount(9.97), "10");
  assert.equal(formatCount(6400), "6,400");
  assert.equal(formatCount(1.0), "1.0");
});

test("money formatting", () => {
  assert.equal(formatMoney(5.5, "USD"), "$5.50");
  assert.equal(formatMoney(1199, "USD"), "$1,199");
  assert.equal(formatMoney(4.2, "GBP"), "£4.20");
});
