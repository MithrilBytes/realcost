// Two catalog visualizations, built to the emphasis form: every item as a dot
// in the de-emphasis tone, the chosen unit in the accent, identity carried by
// tooltips and the grid rather than by color. Colors come from CSS classes so
// both themes work; CVD separation and 3:1 surface contrast were validated.

import { computeDerived, hoursFor, formatDuration, formatMoney } from "./calc.js";
import { priceIn, unitWords } from "./items.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PAD_X = 10;
const LANE_H = 15;
const DOT_R = 5;

function svgEl(tag, attrs, cls) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (cls) n.setAttribute("class", cls);
  return n;
}

// Bee-swarm lane assignment: dots stack upward instead of overlapping.
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
    let bestD = 24; // minimum hit radius per the interaction contract
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
    this.tip.hidden = false;
    const wrapRect = this.wrap.getBoundingClientRect();
    const svgRect = this.svg.getBoundingClientRect();
    this.tip.style.left = `${svgRect.left - wrapRect.left + p.x}px`;
    this.tip.style.top = `${svgRect.top - wrapRect.top + p.y - 6}px`;
  }

  // dots: [{item, h, value, label, selected}] with x precomputed by caller.
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

export function initViz({ els, state, getItems, onPromote }) {
  const day = new Strip({ svg: els.daySvg, tip: els.dayTip, wrap: els.dayWrap, onPick: onPromote });
  const spread = new Strip({ svg: els.spreadSvg, tip: els.spreadTip, wrap: els.spreadWrap, onPick: onPromote });

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
    els.dayInfo.textContent = "";
    const strong = document.createElement("strong");
    strong.textContent = `${inDay.length} of the ${rows.length} items`;
    const dayLen = Number.isInteger(d.hoursPerDay) ? d.hoursPerDay : d.hoursPerDay.toFixed(1);
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
    const hasSalary = Number.isFinite(s.salary) && s.salary > 0;
    if (!hasSalary) {
      day.clear();
      spread.clear();
      els.dayInfo.textContent = "Enter a salary above to lay your items along one working day.";
      els.spreadInfo.textContent = "Enter a salary to place every item on one time scale.";
      els.dayAlt.textContent = "";
      els.spreadAlt.textContent = "";
      return;
    }
    observe();
    const d = computeDerived(s);
    const rows = pricedRows();
    renderDay(rows, s, d);
    renderSpread(rows, s, d);
  }

  return { update };
}
