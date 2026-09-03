// Salary summary hero: unit chips, headline, breakdown table, canvas dot
// field with tile fallback, milestone markers, compare mode, unit picker.

import {
  computeDerived,
  unitBreakdown,
  hoursFor,
  formatDuration,
  formatCount,
  formatMoney,
} from "./calc.js";
import { priceIn, sourceFor, unitWords } from "./items.js";

const nfWhole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const reducedMotion = () =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Animate a numeric text node toward a value; instant under reduced motion.
function countUp(el, to, fmt, duration = 400) {
  cancelAnimationFrame(el._raf ?? 0);
  if (!Number.isFinite(to)) {
    el._v = undefined;
    el.textContent = "…";
    return;
  }
  const from = Number.isFinite(el._v) ? el._v : to;
  el._v = to;
  if (reducedMotion() || from === to || document.visibilityState === "hidden") {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / duration);
    el.textContent = fmt(from + (to - from) * easeOut(t));
    if (t < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

export function resolveUnit(items, state, config) {
  const has = (id) =>
    items.find((i) => i.id === id && priceIn(i, state.currency) !== null);
  return has(state.unit) || has(config.defaultUnit) ||
    items.find((i) => priceIn(i, state.currency) !== null) || null;
}

// ---- Dot field -------------------------------------------------------------

class DotField {
  constructor({ canvas, tileEl, tipEl, legendEl, altEl, config }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.off = document.createElement("canvas");
    this.tileEl = tileEl;
    this.tipEl = tipEl;
    this.legendEl = legendEl;
    this.altEl = altEl;
    this.cfg = config.dotField;
    this.data = null;
    this.geom = null;

    const wrap = canvas.parentElement;
    this.ro = new ResizeObserver(() => {
      if (this.data && this.geom && !this.canvas.hidden) this.render(false);
    });
    this.ro.observe(wrap);

    canvas.addEventListener("pointermove", (e) => this.onPoint(e));
    canvas.addEventListener("pointerdown", (e) => this.onPoint(e));
    canvas.addEventListener("pointerleave", () => this.hideTip());
    tileEl.addEventListener("pointerover", (e) => this.onTilePoint(e));
    tileEl.addEventListener("pointerdown", (e) => this.onTilePoint(e));
    tileEl.addEventListener("pointerleave", () => this.hideTip());
  }

  set(data) {
    const changed =
      !this.data ||
      !data ||
      Math.abs((this.data.count ?? -1) - (data.count ?? -2)) > 1e-9 ||
      this.data.words.plural !== data.words.plural;
    this.data = data;
    this.render(changed);
  }

  hideTip() {
    this.tipEl.hidden = true;
  }

  colors() {
    const cs = getComputedStyle(this.canvas);
    return { accent: cs.getPropertyValue("--accent").trim() || "#5A3A22" };
  }

  render(animate) {
    const d = this.data;
    this.hideTip();
    if (!d || !Number.isFinite(d.count) || d.count <= 0) {
      this.canvas.hidden = false;
      this.canvas.classList.add("is-empty");
      this.tileEl.hidden = true;
      this.tileEl.textContent = "";
      const w = this.canvas.parentElement.clientWidth;
      this.canvas.width = Math.max(1, w * devicePixelRatio);
      this.canvas.height = Math.max(1, 180 * devicePixelRatio);
      this.canvas.style.height = "180px";
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.legendEl.textContent =
        "The field fills in once there is a salary to draw.";
      this.altEl.textContent = "";
      this.geom = null;
      return;
    }
    this.canvas.classList.remove("is-empty");
    this.altEl.textContent = `${formatCount(d.count)} ${d.words.plural} in your working year.`;
    if (d.count < this.cfg.tileBelow) this.renderTiles(d);
    else this.renderDots(d, animate);
  }

  renderTiles(d) {
    this.canvas.hidden = true;
    this.canvas.style.height = "0px";
    this.tileEl.hidden = false;
    this.tileEl.textContent = "";
    this.geom = null;
    const full = Math.floor(d.count);
    const frac = d.count - full;
    const hasPartial = frac > 0.005;
    const total = full + (hasPartial ? 1 : 0);
    for (let i = 0; i < total; i++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      const partial = hasPartial && i === full;
      if (partial) tile.classList.add("partial");
      tile.style.setProperty("--fill", partial ? `${Math.round(frac * 100)}%` : "100%");
      const week = Math.min(
        d.weeksPerYear,
        Math.max(1, Math.ceil(((i + 1) / d.count) * d.weeksPerYear))
      );
      tile.dataset.tip = partial
        ? `the remaining ${Math.round(frac * 100)}% of one ${d.words.singular}`
        : `${capitalize(d.words.singular)} ${i + 1} of ${formatCount(d.count)} · earned by week ${week}`;
      tile.title = tile.dataset.tip;
      this.tileEl.appendChild(tile);
    }
    this.legendEl.textContent = hasPartial
      ? `Each tile is one ${d.words.singular}. The dashed tile is the remaining ${Math.round(frac * 100)}%.`
      : `Each tile is one ${d.words.singular}.`;
  }

  layoutDots(count) {
    const width = Math.max(220, this.canvas.parentElement.clientWidth);
    let scale = 1;
    while (count / scale > this.cfg.rescaleAbove) scale *= 10;
    const dots = Math.max(1, Math.round(count / scale));
    const blocks = Math.ceil(dots / this.cfg.blockSize);
    let geom = null;
    for (const cell of [9, 8, 7, 6, 5, 4, 3]) {
      const blockW = 10 * cell;
      const gap = Math.max(6, cell);
      const perRow = Math.max(1, Math.floor((width + gap) / (blockW + gap)));
      const rows = Math.ceil(blocks / perRow);
      const height = rows * (blockW + gap) - gap;
      geom = { cell, blockW, gap, perRow, rows, width, height, dots, scale };
      if (height <= this.cfg.maxFieldHeight) break;
    }
    return geom;
  }

  renderDots(d, animate) {
    this.tileEl.hidden = true;
    this.tileEl.textContent = "";
    this.canvas.hidden = false;
    const g = (this.geom = this.layoutDots(d.count));
    const dpr = Math.min(2, devicePixelRatio || 1);
    const H = Math.max(g.blockW, g.height);
    this.canvas.width = Math.round(g.width * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.height = `${H}px`;

    // Paint every dot once to an offscreen canvas, then sweep it in.
    this.off.width = this.canvas.width;
    this.off.height = this.canvas.height;
    const octx = this.off.getContext("2d");
    octx.clearRect(0, 0, this.off.width, this.off.height);
    octx.scale(dpr, dpr);
    octx.fillStyle = this.colors().accent;
    const r = g.cell * 0.32;
    octx.beginPath();
    for (let i = 0; i < g.dots; i++) {
      const block = Math.floor(i / this.cfg.blockSize);
      const inBlock = i % this.cfg.blockSize;
      const bx = block % g.perRow;
      const by = Math.floor(block / g.perRow);
      const x = bx * (g.blockW + g.gap) + (inBlock % 10) * g.cell + g.cell / 2;
      const y = by * (g.blockW + g.gap) + Math.floor(inBlock / 10) * g.cell + g.cell / 2;
      octx.moveTo(x + r, y);
      octx.arc(x, y, r, 0, Math.PI * 2);
    }
    octx.fill();

    cancelAnimationFrame(this._raf ?? 0);
    const paint = (fraction) => {
      const w = Math.max(1, Math.round(this.canvas.width * fraction));
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(this.off, 0, 0, w, this.canvas.height, 0, 0, w, this.canvas.height);
    };
    if (!animate || reducedMotion() || document.visibilityState === "hidden") {
      paint(1);
    } else {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / 600);
        paint(easeOut(t));
        if (t < 1) this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    }

    const s = g.scale;
    this.legendEl.textContent =
      s === 1
        ? `Each dot is one ${d.words.singular}. Each block is ${nfWhole.format(this.cfg.blockSize)}.`
        : `Each dot is ${nfWhole.format(s)} ${d.words.plural}. Each block is ${nfWhole.format(s * this.cfg.blockSize)}.`;
  }

  onPoint(e) {
    const g = this.geom;
    const d = this.data;
    if (!g || !d) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const stride = g.blockW + g.gap;
    const bx = Math.floor(x / stride);
    const by = Math.floor(y / stride);
    const ix = x - bx * stride;
    const iy = y - by * stride;
    if (bx >= g.perRow || ix >= g.blockW || iy >= g.blockW || bx < 0 || by < 0) {
      this.hideTip();
      return;
    }
    const dot =
      (by * g.perRow + bx) * this.cfg.blockSize +
      Math.floor(iy / g.cell) * 10 +
      Math.floor(ix / g.cell);
    if (dot >= g.dots) {
      this.hideTip();
      return;
    }
    const ordinal = Math.min(Math.round(d.count), (dot + 1) * g.scale);
    const week = Math.min(
      d.weeksPerYear,
      Math.max(1, Math.ceil((ordinal / d.count) * d.weeksPerYear))
    );
    this.showTip(
      `${capitalize(d.words.singular)} #${nfWhole.format(ordinal)} · earned by week ${week}`,
      x,
      y
    );
  }

  onTilePoint(e) {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    const wrapRect = this.tipEl.parentElement.getBoundingClientRect();
    const r = tile.getBoundingClientRect();
    this.showTip(
      tile.dataset.tip,
      r.left - wrapRect.left + r.width / 2,
      r.top - wrapRect.top + 4
    );
  }

  showTip(text, x, y) {
    this.tipEl.textContent = text;
    this.tipEl.hidden = false;
    this.tipEl.style.left = `${x}px`;
    this.tipEl.style.top = `${y}px`;
  }
}

// ---- Milestones ------------------------------------------------------------

function pickMilestones(items, unitItem, currency, count) {
  const unitPrice = priceIn(unitItem, currency);
  const candidates = items
    .filter((i) => i.id !== unitItem.id && !i.custom && priceIn(i, currency) !== null)
    .map((i) => ({ item: i, equiv: priceIn(i, currency) / unitPrice }))
    .filter((c) => c.equiv >= 1.5 && c.equiv <= count * 0.97)
    .sort((a, b) => b.equiv - a.equiv);
  const kept = [];
  for (const c of candidates) {
    if (kept.length >= 5) break;
    if (kept.every((k) => k.equiv / c.equiv >= 2.4)) kept.push(c);
  }
  return kept.reverse();
}

function renderMilestones(el, { items, unitItem, state, count, onPromote }) {
  el.textContent = "";
  if (!Number.isFinite(count) || count <= 0 || !unitItem) return;
  const words = unitWords(unitItem);
  const picks = pickMilestones(items, unitItem, state.currency, count);
  picks.forEach((p, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "milestone" + (idx % 2 ? " row-2" : "");
    const short = p.item.short || unitWords(p.item).singular;
    btn.textContent = `${short} = ${formatCount(p.equiv)}`;
    const label = `Your ${unitWords(p.item).singular} equals ${formatCount(p.equiv)} ${words.plural}. Make it the unit.`;
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.style.left = `${Math.min(99, Math.max(1, (p.equiv / count) * 100))}%`;
    btn.addEventListener("click", () => onPromote(p.item.id));
    el.appendChild(btn);
  });
}

// ---- Picker ----------------------------------------------------------------

function initPicker({ dialog, search, list, closeBtn, getItems, state, onChoose }) {
  function renderList() {
    const q = search.value.trim().toLowerCase();
    const currency = state.get().currency;
    list.textContent = "";
    const rows = getItems()
      .filter((i) => priceIn(i, currency) !== null)
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.id.includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const item of rows) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      const name = document.createElement("span");
      name.textContent = item.custom ? `${item.name} (yours)` : item.name;
      const price = document.createElement("span");
      price.className = "p-price";
      price.textContent = formatMoney(priceIn(item, currency), currency);
      btn.append(name, price);
      btn.addEventListener("click", () => {
        dialog.close();
        onChoose(item.id);
      });
      li.appendChild(btn);
      list.appendChild(li);
    }
    if (!rows.length) {
      const li = document.createElement("li");
      li.textContent = "Nothing matches.";
      list.appendChild(li);
    }
  }
  search.addEventListener("input", renderList);
  closeBtn.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  return {
    open() {
      search.value = "";
      renderList();
      dialog.showModal();
      search.focus();
    },
  };
}

// ---- Hero orchestration ----------------------------------------------------

export function initSummary({ els, state, config, getItems }) {
  const dotField = new DotField({
    canvas: els.dotCanvas,
    tileEl: els.tileField,
    tipEl: els.dotTip,
    legendEl: els.fieldLegend,
    altEl: els.fieldAlt,
    config,
  });

  const promote = (id) => {
    state.patch(state.get().compareOn ? { compareOn: false, unit: id } : { unit: id });
  };

  const picker = initPicker({
    dialog: els.picker,
    search: els.pickerSearch,
    list: els.pickerList,
    closeBtn: els.pickerClose,
    getItems,
    state,
    onChoose: (id) => {
      const s = state.get();
      if (s.compareOn) toggleCompareId(id);
      else state.patch({ unit: id });
    },
  });

  function toggleCompareId(id) {
    const s = state.get();
    const set = new Set(s.compare);
    if (set.has(id)) set.delete(id);
    else if (set.size < config.compareMax) set.add(id);
    else {
      els.compareHint.textContent =
        `Five units is the limit. Unselect one to add another.`;
      return;
    }
    state.patch({ compare: [...set] });
  }

  function chipLabel(item) {
    return capitalize(item.short || unitWords(item).singular);
  }

  function renderChips(unitItem) {
    const s = state.get();
    const items = getItems();
    els.unitChips.textContent = "";
    const ids = config.chips.filter((id) =>
      items.some((i) => i.id === id && priceIn(i, s.currency) !== null)
    );
    if (unitItem && !ids.includes(unitItem.id)) ids.push(unitItem.id);
    for (const cid of s.compare) if (!ids.includes(cid)) ids.push(cid);
    for (const id of ids) {
      const item = items.find((i) => i.id === id);
      if (!item || priceIn(item, s.currency) === null) continue;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = chipLabel(item);
      const pressed = s.compareOn ? s.compare.includes(id) : unitItem?.id === id;
      chip.setAttribute("aria-pressed", String(pressed));
      chip.addEventListener("click", () => {
        if (state.get().compareOn) toggleCompareId(id);
        else state.patch({ unit: id });
      });
      els.unitChips.appendChild(chip);
    }
    const more = document.createElement("button");
    more.type = "button";
    more.className = "chip";
    more.textContent = "More…";
    more.setAttribute("aria-pressed", "false");
    more.setAttribute("aria-haspopup", "dialog");
    more.addEventListener("click", () => picker.open());
    els.unitChips.appendChild(more);
  }

  function setLine(el, order, text, hidden = false) {
    el.style.order = String(order);
    el.hidden = hidden;
    if (text !== null) el.textContent = text;
  }

  function renderSingle(unitItem) {
    const s = state.get();
    const d = computeDerived(s);
    const currency = s.currency;
    const price = unitItem ? priceIn(unitItem, currency) : null;
    const words = unitItem ? unitWords(unitItem) : { singular: "item", plural: "items" };
    const hasSalary = Number.isFinite(s.salary) && s.salary > 0;
    const b = hasSalary && price ? unitBreakdown(price, s) : null;
    const largeUnit = b ? b.unitsPerYear < 10 : false;

    // Headline lines are reordered per mode; numbers animate in place.
    countUp(els.hlHours, d.hoursPerYear, (v) => nfWhole.format(v));
    if (!b) {
      setLine(els.hlIntro, 0, "Your year is");
      setLine(els.hlHoursLine, 1, null, false);
      setLine(els.hlBridge, 2, "Enter your salary to see what it buys.");
      setLine(els.hlUnitsLine, 3, null, true);
    } else if (largeUnit) {
      setLine(els.hlIntro, 0, "Your year buys");
      setLine(els.hlUnitsLine, 1, null, false);
      setLine(
        els.hlBridge, 2,
        `Each one is ${formatDuration(b.timePerUnitHours, d, "long")} of work.`
      );
      setLine(els.hlHoursLine, 3, null, true);
      els.hlUnitsLabel.textContent = `${b.unitsPerYear === 1 ? words.singular : words.plural}.`;
      countUp(els.hlUnits, b.unitsPerYear, formatCount);
    } else {
      setLine(els.hlIntro, 0, "Your year is");
      setLine(els.hlHoursLine, 1, null, false);
      setLine(els.hlBridge, 2, "That's");
      setLine(els.hlUnitsLine, 3, null, false);
      els.hlUnitsLabel.textContent = `${words.plural}.`;
      countUp(els.hlUnits, b.unitsPerYear, formatCount);
    }

    // Facts line with the price, its date, and the source.
    els.unitFacts.textContent = "";
    if (unitItem && price !== null) {
      const money = formatMoney(price, currency);
      const lead = document.createElement("span");
      if (unitItem.custom) {
        lead.textContent = hasSalary
          ? `You priced ${unitItem.name} at ${money}: ${formatDuration(hoursFor(price, d.hourlyRate), d, "long")} of your life at your rate. `
          : `You priced ${unitItem.name} at ${money}. `;
        els.unitFacts.appendChild(lead);
      } else {
        lead.textContent = hasSalary
          ? `One ${words.singular} costs ${money}: ${formatDuration(hoursFor(price, d.hourlyRate), d, "long")} of your life at your rate. `
          : `One ${words.singular} costs ${money}. `;
        els.unitFacts.appendChild(lead);
        const link = document.createElement("a");
        link.href = sourceFor(unitItem, currency);
        link.rel = "noopener";
        link.textContent = "source";
        els.unitFacts.append(`Price as of ${unitItem.asOf} (`, link, ").");
      }
    }

    // Breakdown table.
    const cells = els.breakdownCells;
    const rows = b
      ? {
          day: [b.unitsPerDay, d.hoursPerDay, 1],
          week: [b.unitsPerWeek, s.hoursPerWeek, 5],
          month: [b.unitsPerMonth, d.hoursPerYear / 12, d.daysPerYear / 12],
          year: [b.unitsPerYear, b.totalHours, b.totalDays],
        }
      : {
          day: [NaN, d.hoursPerDay, 1],
          week: [NaN, s.hoursPerWeek, 5],
          month: [NaN, d.hoursPerYear / 12, d.daysPerYear / 12],
          year: [NaN, d.hoursPerYear, d.daysPerYear],
        };
    for (const [period, [units, hours, days]] of Object.entries(rows)) {
      countUp(cells[`${period}-units`], units, formatCount);
      countUp(cells[`${period}-hours`], hours, formatCount);
      countUp(cells[`${period}-days`], days, formatCount);
    }
    els.colUnits.textContent = unitItem ? capitalize(words.plural) : "Units";

    // Identity sentence.
    if (b) {
      const total = `${nfWhole.format(Math.round(b.totalHours))} hours you will work this year: ${nfWhole.format(Math.round(b.totalDays))} working days, ${nfWhole.format(s.weeksPerYear)} weeks`;
      els.identity.textContent = largeUnit
        ? `Together they add up to all ${total}.`
        : `Every one of those ${formatCount(b.unitsPerYear)} ${words.plural} is ${formatDuration(b.timePerUnitHours, d)}. Stack them end to end and you get all ${total}.`;
    } else {
      els.identity.textContent = "";
    }

    renderMilestones(els.milestones, {
      items: getItems(),
      unitItem,
      state: s,
      count: b ? b.unitsPerYear : NaN,
      onPromote: promote,
    });

    dotField.set(
      unitItem && {
        count: b ? b.unitsPerYear : NaN,
        words,
        weeksPerYear: s.weeksPerYear,
      }
    );
  }

  function renderCompare() {
    const s = state.get();
    const d = computeDerived(s);
    const items = getItems();
    const hasSalary = Number.isFinite(s.salary) && s.salary > 0;
    els.compareRows.textContent = "";
    els.compareHint.textContent = hasSalary
      ? "Pick up to five units above. Bars show the working time one unit costs."
      : "Pick up to five units above, and enter a salary to fill the rows in.";
    const rows = s.compare
      .map((id) => items.find((i) => i.id === id))
      .filter((i) => i && priceIn(i, s.currency) !== null)
      .map((item) => {
        const price = priceIn(item, s.currency);
        return {
          item,
          words: unitWords(item),
          count: hasSalary ? d.effectiveWage / price : NaN,
          time: hasSalary ? hoursFor(price, d.hourlyRate) : NaN,
        };
      })
      .sort((a, b) => (b.count || 0) - (a.count || 0));
    const maxTime = Math.max(...rows.map((r) => r.time || 0), 0);
    for (const r of rows) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "compare-name";
      name.textContent = capitalize(r.words.plural);
      const count = document.createElement("span");
      count.className = "compare-count";
      count.textContent = Number.isFinite(r.count) ? formatCount(r.count) : "…";
      const small = document.createElement("small");
      small.textContent = " a year";
      count.appendChild(small);
      const bar = document.createElement("span");
      bar.className = "compare-bar";
      const fill = document.createElement("span");
      if (Number.isFinite(r.time) && maxTime > 0) {
        fill.style.width = `${Math.max(0.4, (r.time / maxTime) * 100)}%`;
      }
      bar.appendChild(fill);
      const time = document.createElement("span");
      time.className = "compare-time";
      time.textContent = Number.isFinite(r.time)
        ? `${formatDuration(r.time, d)} each`
        : "";
      li.append(name, count, bar, time);
      els.compareRows.appendChild(li);
    }
  }

  els.compareToggle.addEventListener("click", () => {
    const s = state.get();
    if (!s.compareOn) {
      let seed = s.compare;
      if (seed.length < 2) {
        const items = getItems();
        const priced = (id) =>
          items.some((i) => i.id === id && priceIn(i, s.currency) !== null);
        seed = [s.unit, ...config.compareSeed]
          .filter((id, idx, arr) => arr.indexOf(id) === idx && priced(id))
          .slice(0, config.compareMax);
      }
      state.patch({ compareOn: true, compare: seed });
    } else {
      state.patch({ compareOn: false });
    }
  });

  function update() {
    const s = state.get();
    const unitItem = resolveUnit(getItems(), s, config);
    els.compareToggle.setAttribute("aria-pressed", String(s.compareOn));
    els.heroSingle.hidden = s.compareOn;
    els.heroCompare.hidden = !s.compareOn;
    renderChips(unitItem);
    if (s.compareOn) renderCompare();
    else renderSingle(unitItem);
  }

  return { update };
}
