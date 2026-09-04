// Catalog visualizations: the working-day strip, the log-scale spread, the
// buy-one-of-everything donut, and the hourly-rate curve. Strip dots use the
// emphasis form (accent + de-emphasis); the donut's five hues plus a neutral
// fold were validated for CVD separation and 3:1 surface contrast, and every
// value shown by a tooltip is also visible in a legend, caption, or the grid.

import { computeDerived, hoursFor, formatDuration, formatMoney, formatRate } from "./calc.js";
import { priceIn, unitWords } from "./items.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PAD_X = 10;
const LANE_H = 15;
const DOT_R = 5;

const nfWhole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function svgEl(tag, attrs, cls) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (cls) n.setAttribute("class", cls);
  return n;
}

function moneyWhole(v, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(v);
}

function placeTip(tip, wrap, target, x, y) {
  const wrapRect = wrap.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  tip.hidden = false;
  tip.style.left = `${rect.left - wrapRect.left + x}px`;
  tip.style.top = `${rect.top - wrapRect.top + y - 6}px`;
}

// ---- Dot strips ------------------------------------------------------------

function assignLanes(points, minGap, maxLanes) {
  const laneLastX = [];
  for (const p of points) {
    let lane = laneLastX.findIndex((x) => p.x - x >= minGap);
    if (lane === -1) {
      if (laneLastX.length < maxLanes) lane = laneLastX.length;
      else lane = laneLastX.indexOf(Math.min(...laneLastX));
    }
    laneLastX[lane] = p.x;
    p.lane = lane;
  }
  return laneLastX.length;
}

class Strip {
  constructor({ svg, tip, wrap, onPick }) {
    this.svg = svg;
    this.tip = tip;
    this.wrap = wrap;
    this.onPick = onPick;
    this.points = [];
    svg.addEventListener("pointermove", (e) => this.hover(e));
    svg.addEventListener("pointerleave", () => this.hideTip());
    svg.addEventListener("pointerdown", (e) => {
      const p = this.nearest(e);
      if (p && this.onPick) this.onPick(p.item.id);
    });
  }

  hideTip() {
    this.tip.hidden = true;
  }

  nearest(e) {
    const rect = this.svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = null;
    let bestD = 24;
    for (const p of this.points) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  hover(e) {
    const p = this.nearest(e);
    if (!p) {
      this.hideTip();
      return;
    }
    this.tip.textContent = "";
    const value = document.createElement("strong");
    value.textContent = p.value;
    this.tip.append(value, ` ${p.label}`);
    placeTip(this.tip, this.wrap, this.svg, p.x, p.y);
  }

  draw({ width, dots, ticks, selectedLabel }) {
    const svg = this.svg;
    svg.textContent = "";
    this.hideTip();
    dots.sort((a, b) => a.x - b.x);
    const lanes = Math.max(1, assignLanes(dots, DOT_R * 2 + 3, 4));
    const labelRoom = 20;
    const baseY = labelRoom + lanes * LANE_H;
    const axisY = baseY + 8;
    const height = axisY + 22;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.height = `${height}px`;

    svg.appendChild(
      svgEl("line", { x1: PAD_X, y1: axisY, x2: width - PAD_X, y2: axisY }, "viz-axis")
    );
    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: t.x, y1: axisY - 4, x2: t.x, y2: axisY + 4 }, "viz-axis"));
      const label = svgEl("text", { x: t.x, y: axisY + 17 }, "viz-tick");
      label.setAttribute("text-anchor", t.anchor || "middle");
      label.textContent = t.label;
      svg.appendChild(label);
    }

    for (const p of dots) {
      p.y = baseY - p.lane * LANE_H - DOT_R;
      if (p.selected) continue;
      svg.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: DOT_R }, "viz-dot"));
    }
    const sel = dots.find((p) => p.selected);
    if (sel) {
      svg.appendChild(svgEl("circle", { cx: sel.x, cy: sel.y, r: DOT_R + 1 }, "viz-dot sel"));
      if (selectedLabel) {
        const text = svgEl("text", { y: sel.y - DOT_R - 6 }, "viz-label");
        text.textContent = selectedLabel;
        const anchor = sel.x > width * 0.82 ? "end" : sel.x < width * 0.18 ? "start" : "middle";
        text.setAttribute("text-anchor", anchor);
        text.setAttribute("x", sel.x);
        svg.appendChild(text);
      }
    }
    this.points = dots;
  }

  clear(height = 56) {
    this.svg.textContent = "";
    this.svg.style.height = `${height}px`;
    this.points = [];
    this.hideTip();
  }
}

// ---- Donut: the whole catalog, once ---------------------------------------

// Fixed group-to-hue map so a currency switch never repaints survivors.
const DONUT_GROUPS = [
  { key: "housing", label: "Housing", cats: ["Housing"], cls: "fill-c1" },
  { key: "tech", label: "Tech", cats: ["Tech"], cls: "fill-c2" },
  { key: "bigbuys", label: "Big purchases", cats: ["Big Purchases"], cls: "fill-c3" },
  { key: "subs", label: "Subscriptions", cats: ["Subscriptions"], cls: "fill-c4" },
  { key: "transport", label: "Transport", cats: ["Transport"], cls: "fill-c5" },
  {
    key: "everyday",
    label: "Everyday",
    cats: ["Food & Drink", "Groceries", "Entertainment", "Clothing", "Health"],
    cls: "fill-dim",
  },
];

function polar(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

function renderDonut(els, { catalog, s, d, hasSalary }) {
  const rows = DONUT_GROUPS.map((g) => {
    const items = catalog.filter(
      (i) => g.cats.includes(i.category) && priceIn(i, s.currency) !== null
    );
    return {
      ...g,
      count: items.length,
      value: items.reduce((sum, i) => sum + priceIn(i, s.currency), 0),
    };
  }).filter((g) => g.value > 0);
  const total = rows.reduce((sum, g) => sum + g.value, 0);
  const svg = els.donutSvg;
  svg.textContent = "";
  els.donutLegend.textContent = "";
  if (!total) return;
  rows.sort((a, b) => b.value - a.value);

  const S = 230;
  const cx = S / 2;
  const cy = S / 2;
  const ringW = 30;
  const r = S / 2 - ringW / 2 - 4;
  const gap = 2.5 / r; // a 2px surface gap between segments
  svg.setAttribute("viewBox", `0 0 ${S} ${S}`);
  svg.style.maxWidth = `${S}px`;
  svg.style.marginInline = "auto";

  let angle = -Math.PI / 2;
  const totalItems = rows.reduce((sum, g) => sum + g.count, 0);
  for (const g of rows) {
    const span = (g.value / total) * Math.PI * 2;
    const a0 = angle + gap / 2;
    const a1 = Math.max(a0 + 0.008, angle + span - gap / 2);
    const path = svgEl("path", { d: arcPath(cx, cy, r, a0, a1), "stroke-width": ringW }, `slice ${g.cls}`);
    const pct = Math.round((g.value / total) * 100);
    const days = d.hourlyRate > 0 ? g.value / d.hourlyRate / d.hoursPerDay : NaN;
    path.addEventListener("pointerenter", () => path.classList.add("hovered"));
    path.addEventListener("pointerleave", () => {
      path.classList.remove("hovered");
      els.donutTip.hidden = true;
    });
    path.addEventListener("pointermove", (e) => {
      els.donutTip.textContent = "";
      const strong = document.createElement("strong");
      strong.textContent = moneyWhole(g.value, s.currency);
      const extra = Number.isFinite(days)
        ? ` ${g.label} · ${formatDuration(days * d.hoursPerDay, d)} · ${pct}%`
        : ` ${g.label} · ${pct}%`;
      els.donutTip.append(strong, extra);
      const rect = els.donutSvg.getBoundingClientRect();
      placeTip(els.donutTip, els.donutWrap, els.donutSvg, e.clientX - rect.left, e.clientY - rect.top);
    });
    svg.appendChild(path);
    angle += span;

    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = `swatch ${g.cls}`;
    const name = document.createElement("span");
    name.className = "l-name";
    name.textContent = g.label;
    const val = document.createElement("span");
    val.className = "l-value";
    val.textContent = moneyWhole(g.value, s.currency);
    const sub = document.createElement("span");
    sub.className = "l-sub";
    sub.textContent = Number.isFinite(days)
      ? `${formatDuration(days * d.hoursPerDay, d)} · ${pct}%`
      : `${pct}%`;
    li.append(swatch, name, val, sub);
    els.donutLegend.appendChild(li);
  }

  const totalHours = hasSalary ? total / d.hourlyRate : NaN;
  const center = svgEl("text", { x: cx, y: cy - 1, "text-anchor": "middle" }, "donut-center-value");
  const label1 = svgEl("text", { x: cx, y: cy + 18, "text-anchor": "middle" }, "donut-center-label");
  const label2 = svgEl("text", { x: cx, y: cy + 33, "text-anchor": "middle" }, "donut-center-label");
  if (hasSalary) {
    center.textContent = nfWhole.format(Math.round(totalHours / d.hoursPerDay));
    label1.textContent = "working days";
    label2.textContent = moneyWhole(total, s.currency);
  } else {
    center.textContent = moneyWhole(total, s.currency);
    center.setAttribute("class", "donut-center-value small");
    label1.textContent = "one of everything";
    label2.textContent = "add a salary for the time cost";
  }
  svg.append(center, label1, label2);

  els.donutSub.textContent = hasSalary
    ? `One of each of the ${totalItems} priced items costs ${moneyWhole(total, s.currency)}: ${formatDuration(totalHours, d, "long")} of your life.`
    : `One of each of the ${totalItems} priced items, split by where the money goes.`;
  els.donutAlt.textContent = rows
    .map((g) => `${g.label} ${moneyWhole(g.value, s.currency)}`)
    .join(", ");
}

// ---- Line: what one hour is worth -----------------------------------------

function niceStep(rough) {
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (rough <= m * mag) return m * mag;
  }
  return 10 * mag;
}

class RateLine {
  constructor({ svg, tip, wrap, onSetHours }) {
    this.svg = svg;
    this.tip = tip;
    this.wrap = wrap;
    this.onSetHours = onSetHours;
    this.geom = null;
    svg.addEventListener("pointermove", (e) => this.hover(e));
    svg.addEventListener("pointerleave", () => this.leave());
    svg.addEventListener("pointerdown", (e) => {
      const hw = this.hwAt(e);
      if (hw !== null) this.onSetHours(hw);
    });
  }

  hwAt(e) {
    const g = this.geom;
    if (!g) return null;
    const rect = this.svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < g.m.l - 8 || x > g.width - g.m.r + 8) return null;
    return Math.min(g.hwHi, Math.max(g.hwLo, Math.round(g.invX(x))));
  }

  leave() {
    this.tip.hidden = true;
    this.cross?.setAttribute("stroke-opacity", "0");
  }

  hover(e) {
    const g = this.geom;
    const hw = this.hwAt(e);
    if (hw === null || !g) {
      this.leave();
      return;
    }
    const rate = g.rate(hw);
    const x = g.x(hw);
    this.cross?.setAttribute("x1", x);
    this.cross?.setAttribute("x2", x);
    this.cross?.setAttribute("stroke-opacity", "1");
    this.tip.textContent = "";
    const strong = document.createElement("strong");
    strong.textContent = formatRate(rate, g.currency);
    this.tip.append(strong, ` per hour at ${hw}h/wk`);
    placeTip(this.tip, this.wrap, this.svg, x, g.y(rate));
  }

  clear() {
    this.svg.textContent = "";
    this.svg.style.height = "0px";
    this.geom = null;
    this.tip.hidden = true;
  }

  draw({ width, s, d }) {
    const svg = this.svg;
    svg.textContent = "";
    const H = 232;
    const m = { l: 54, r: 14, t: 14, b: 30 };
    svg.setAttribute("viewBox", `0 0 ${width} ${H}`);
    svg.style.height = `${H}px`;

    const wage = d.effectiveWage;
    const hwLo = 10;
    const hwHi = Math.max(80, Math.ceil(s.hoursPerWeek / 10) * 10);
    const rate = (hw) => wage / (hw * s.weeksPerYear);
    const yMax = rate(hwLo) * 1.06;
    const x = (hw) => m.l + ((hw - hwLo) / (hwHi - hwLo)) * (width - m.l - m.r);
    const invX = (px) => hwLo + ((px - m.l) / (width - m.l - m.r)) * (hwHi - hwLo);
    const y = (v) => m.t + (1 - v / yMax) * (H - m.t - m.b);

    const step = niceStep(yMax / 3.2);
    for (let v = step; v <= yMax; v += step) {
      svg.appendChild(svgEl("line", { x1: m.l, y1: y(v), x2: width - m.r, y2: y(v) }, "line-grid"));
      const t = svgEl("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, "viz-tick");
      t.textContent = moneyWhole(v, s.currency);
      svg.appendChild(t);
    }
    const xStep = width < 460 ? 20 : 10;
    for (let hw = Math.ceil(hwLo / xStep) * xStep; hw <= hwHi; hw += xStep) {
      const t = svgEl("text", { x: x(hw), y: H - 10, "text-anchor": "middle" }, "viz-tick");
      t.textContent = `${hw}h`;
      svg.appendChild(t);
    }
    svg.appendChild(svgEl("line", { x1: m.l, y1: H - m.b, x2: width - m.r, y2: H - m.b }, "viz-axis"));

    let lineD = "";
    let areaD = `M ${x(hwLo)} ${H - m.b}`;
    for (let hw = hwLo; hw <= hwHi; hw++) {
      const px = x(hw);
      const py = y(rate(hw));
      lineD += (hw === hwLo ? "M" : "L") + ` ${px} ${py} `;
      areaD += ` L ${px} ${py}`;
    }
    areaD += ` L ${x(hwHi)} ${H - m.b} Z`;
    svg.appendChild(svgEl("path", { d: areaD }, "line-area"));
    svg.appendChild(svgEl("path", { d: lineD }, "line-path"));

    this.cross = svgEl(
      "line",
      { x1: 0, y1: m.t, x2: 0, y2: H - m.b, "stroke-opacity": "0" },
      "line-cross"
    );
    svg.appendChild(this.cross);

    const you = { hw: s.hoursPerWeek, rate: rate(s.hoursPerWeek) };
    svg.appendChild(svgEl("circle", { cx: x(you.hw), cy: y(you.rate), r: 5.5 }, "line-dot"));
    const label = svgEl("text", { y: y(you.rate) - 12 }, "viz-label");
    label.textContent = `you · ${formatRate(you.rate, s.currency)} at ${you.hw}h`;
    const anchor = x(you.hw) > width * 0.72 ? "end" : "start";
    label.setAttribute("text-anchor", anchor);
    label.setAttribute("x", x(you.hw) + (anchor === "end" ? -10 : 10));
    svg.appendChild(label);

    this.geom = { m, width, hwLo, hwHi, x, invX, y, rate, currency: s.currency };
  }
}

// ---- Orchestration ---------------------------------------------------------

export function initViz({ els, state, getItems, getCatalog, onPromote, onSetHours }) {
  const day = new Strip({ svg: els.daySvg, tip: els.dayTip, wrap: els.dayWrap, onPick: onPromote });
  const spread = new Strip({ svg: els.spreadSvg, tip: els.spreadTip, wrap: els.spreadWrap, onPick: onPromote });
  const line = new RateLine({ svg: els.lineSvg, tip: els.lineTip, wrap: els.lineWrap, onSetHours });

  let ro = null;
  function observe() {
    if (ro) return;
    ro = new ResizeObserver(() => update());
    ro.observe(els.dayWrap);
  }

  function pricedRows() {
    const s = state.get();
    const d = computeDerived(s);
    return getItems()
      .map((item) => {
        const price = priceIn(item, s.currency);
        if (price === null) return null;
        return { item, price, h: hoursFor(price, d.hourlyRate) };
      })
      .filter(Boolean);
  }

  function shortName(item) {
    return item.short || unitWords(item).singular;
  }

  function renderDay(rows, s, d) {
    const width = Math.max(280, els.dayWrap.clientWidth);
    const inDay = rows.filter((r) => r.h < d.hoursPerDay * 0.995);
    if (!inDay.length) {
      day.clear();
      els.dayInfo.textContent = "Nothing in the catalog fits inside one of your working days.";
      els.dayAlt.textContent = "";
      return;
    }
    const x = (h) => PAD_X + (h / d.hoursPerDay) * (width - 2 * PAD_X);
    const maxTicks = Math.max(3, Math.floor((width - 2 * PAD_X) / 56));
    const step = Math.max(1, Math.ceil(d.hoursPerDay / maxTicks));
    const ticks = [];
    for (let h = 0; h <= d.hoursPerDay + 1e-9; h += step) {
      ticks.push({ x: x(Math.min(h, d.hoursPerDay)), label: `${h}h` });
    }
    if (d.hoursPerDay - (ticks.length - 1) * step > step / 2) {
      ticks.push({ x: x(d.hoursPerDay), label: `${d.hoursPerDay}h` });
    }
    ticks[0].anchor = "start";
    ticks[ticks.length - 1].anchor = "end";
    const dots = inDay.map((r) => ({
      item: r.item,
      x: x(r.h),
      value: formatDuration(r.h, d),
      label: `in, you have earned ${r.item.custom ? r.item.name : "your " + unitWords(r.item).singular} · ${formatMoney(r.price, s.currency)}`,
      selected: r.item.id === s.unit,
    }));
    const sel = dots.find((p) => p.selected);
    day.draw({
      width,
      dots,
      ticks,
      selectedLabel: sel && `${shortName(sel.item)} · ${sel.value}`,
    });
    const quickest = inDay.reduce((a, b) => (a.h < b.h ? a : b));
    const dayLen = Number.isInteger(d.hoursPerDay) ? d.hoursPerDay : d.hoursPerDay.toFixed(1);
    els.dayInfo.textContent = "";
    const strong = document.createElement("strong");
    strong.textContent = `${inDay.length} of the ${rows.length} items`;
    els.dayInfo.append(
      strong,
      ` cost less than one of your ${dayLen}-hour days. The quickest is ${shortName(quickest.item)}, earned ${formatDuration(quickest.h, d)} in.`
    );
    els.dayAlt.textContent = `${inDay.length} of ${rows.length} items cost less than one working day.`;
  }

  function renderSpread(rows, s, d) {
    const width = Math.max(280, els.spreadWrap.clientWidth);
    if (rows.length < 2) {
      spread.clear();
      els.spreadInfo.textContent = "";
      return;
    }
    const min = Math.min(...rows.map((r) => r.h));
    const max = Math.max(...rows.map((r) => r.h));
    const lo = Math.log10(min) - 0.06;
    const hi = Math.log10(max) + 0.06;
    const x = (h) => PAD_X + ((Math.log10(h) - lo) / (hi - lo)) * (width - 2 * PAD_X);
    const anchors = [
      [1 / 60, "1 min"],
      [10 / 60, "10 min"],
      [1, "1 hr"],
      [d.hoursPerDay, "1 day"],
      [s.hoursPerWeek, "1 wk"],
      [d.hoursPerYear / 12, "1 mo"],
      [d.hoursPerYear, "1 yr"],
    ];
    const ticks = anchors
      .filter(([h]) => Math.log10(h) >= lo && Math.log10(h) <= hi)
      .map(([h, label]) => ({ x: x(h), label }));
    if (ticks.length) {
      ticks[0].anchor = "start";
      ticks[ticks.length - 1].anchor = "end";
    }
    const dots = rows.map((r) => ({
      item: r.item,
      x: x(r.h),
      value: formatDuration(r.h, d),
      label: `${r.item.name} · ${formatMoney(r.price, s.currency)}`,
      selected: r.item.id === s.unit,
    }));
    const sel = dots.find((p) => p.selected);
    spread.draw({
      width,
      dots,
      ticks,
      selectedLabel: sel && `${shortName(sel.item)} · ${sel.value}`,
    });
    const cheap = rows.reduce((a, b) => (a.h < b.h ? a : b));
    const dear = rows.reduce((a, b) => (a.h > b.h ? a : b));
    els.spreadInfo.textContent = `At your rate the catalog runs from ${formatDuration(cheap.h, d)} (${shortName(cheap.item)}) to ${formatDuration(dear.h, d)} (${shortName(dear.item)}), on a log scale.`;
    els.spreadAlt.textContent = els.spreadInfo.textContent;
  }

  function update() {
    const s = state.get();
    const d = computeDerived(s);
    const hasSalary = Number.isFinite(s.salary) && s.salary > 0;
    observe();
    renderDonut(els, { catalog: getCatalog(), s, d, hasSalary });
    if (!hasSalary) {
      day.clear();
      spread.clear();
      line.clear();
      els.dayInfo.textContent = "Enter a salary above to lay your items along one working day.";
      els.spreadInfo.textContent = "Enter a salary to place every item on one time scale.";
      els.lineSub.textContent = "Enter a salary to draw the curve.";
      els.dayAlt.textContent = "";
      els.spreadAlt.textContent = "";
      els.lineAlt.textContent = "";
      return;
    }
    const rows = pricedRows();
    renderDay(rows, s, d);
    renderSpread(rows, s, d);
    const lineWidth = Math.max(280, els.lineWrap.clientWidth);
    line.draw({ width: lineWidth, s, d });
    els.lineSub.textContent =
      "Your hourly rate if the same pay covered a different week. Select a point on the curve to try it.";
    const g = line.geom;
    els.lineAlt.textContent = `At ${g.hwLo} hours per week this pay is ${formatRate(g.rate(g.hwLo), s.currency)} per hour; at ${g.hwHi}, ${formatRate(g.rate(g.hwHi), s.currency)}.`;
  }

  return { update };
}
