// Item grid and the everything-else ledger.

import {
  computeDerived,
  hoursFor,
  formatDuration,
  formatCount,
  formatMoney,
} from "./calc.js";
import { priceIn, sourceFor, unitWords } from "./items.js";

export function visibleItems(items, state) {
  const q = state.search.trim().toLowerCase();
  const rows = items.filter((i) => {
    if (priceIn(i, state.currency) === null) return false;
    if (state.category !== "all" && i.category !== state.category) return false;
    if (q && !i.name.toLowerCase().includes(q)) return false;
    return true;
  });
  const price = (i) => priceIn(i, state.currency);
  if (state.sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name));
  else rows.sort((a, b) => price(a) - price(b));
  return rows;
}

// Cross-fade a value change per SPEC 6.5; instant under reduced motion.
function crossSet(el, text) {
  if (el.textContent === text) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = text;
    return;
  }
  el.classList.add("dim");
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.textContent = text;
    el.classList.remove("dim");
  }, 90);
}

export function renderGridLayout(gridEl, emptyEl, { items, state, onRemove }) {
  const rows = visibleItems(items, state);
  gridEl.textContent = "";
  emptyEl.hidden = rows.length > 0;
  for (const item of rows) {
    const li = document.createElement("li");
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = item.id;

    const time = document.createElement("p");
    time.className = "time placeholder";
    const timeShort = document.createElement("span");
    timeShort.setAttribute("aria-hidden", "true");
    timeShort.textContent = "…";
    const timeLong = document.createElement("span");
    timeLong.className = "visually-hidden";
    time.append(timeShort, timeLong);

    const what = document.createElement("p");
    what.className = "what";
    const price = document.createElement("strong");
    price.textContent = formatMoney(priceIn(item, state.currency), state.currency);
    what.append(price, ` ${item.name}`);

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("aria-hidden", "true");
    bar.appendChild(document.createElement("span"));

    const meta = document.createElement("p");
    meta.className = "meta";
    const cat = document.createElement("span");
    cat.className = "cat";
    cat.textContent = item.custom ? "custom" : item.category;
    meta.appendChild(cat);
    if (item.custom) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.textContent = "remove";
      remove.setAttribute("aria-label", `Remove ${item.name}`);
      remove.addEventListener("click", () => onRemove(item.id));
      meta.appendChild(remove);
    } else {
      const src = document.createElement("span");
      src.className = "src";
      const a = document.createElement("a");
      a.href = sourceFor(item, state.currency);
      a.rel = "noopener";
      a.textContent = "source";
      if (item.note) a.title = item.note;
      src.append(a, ` · ${item.asOf}`);
      meta.appendChild(src);
    }

    card.append(time, what, bar, meta);
    li.appendChild(card);
    gridEl.appendChild(li);
  }
}

export function updateGridValues(gridEl, { items, state }) {
  const s = state;
  const d = computeDerived(s);
  const byId = new Map(items.map((i) => [i.id, i]));
  const hasSalary = Number.isFinite(s.salary) && s.salary > 0;
  const cards = [...gridEl.querySelectorAll(".card")];

  const hoursById = new Map();
  if (hasSalary) {
    for (const card of cards) {
      const item = byId.get(card.dataset.id);
      if (!item) continue;
      hoursById.set(item.id, hoursFor(priceIn(item, s.currency), d.hourlyRate));
    }
  }
  const values = [...hoursById.values()];
  const max = Math.max(...values, 0);
  const min = Math.min(...values, Infinity);

  for (const card of cards) {
    const timeEl = card.querySelector(".time");
    const [shortEl, longEl] = timeEl.children;
    const fill = card.querySelector(".bar span");
    const h = hoursById.get(card.dataset.id);
    if (!hasSalary || !Number.isFinite(h)) {
      timeEl.classList.add("placeholder");
      crossSet(shortEl, "…");
      longEl.textContent = "";
      fill.style.width = "0";
      continue;
    }
    timeEl.classList.remove("placeholder");
    crossSet(shortEl, formatDuration(h, d));
    longEl.textContent = formatDuration(h, d, "long");
    let frac;
    if (max === min) frac = 1;
    else if (s.logScale) {
      frac = (Math.log10(h) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
    } else {
      frac = h / max;
    }
    fill.style.width = `${Math.max(1.5, Math.min(100, frac * 100))}%`;
  }
}

export function renderLedger(ledgerEl, { items, state, onPromote, unitId }) {
  const s = state;
  const d = computeDerived(s);
  const hasSalary = Number.isFinite(s.salary) && s.salary > 0;
  ledgerEl.textContent = "";
  if (!hasSalary) {
    const li = document.createElement("li");
    li.className = "ledger-empty";
    li.textContent = "Enter a salary above to fill this ledger in.";
    ledgerEl.appendChild(li);
    return;
  }
  const rows = items
    .filter((i) => priceIn(i, s.currency) !== null)
    .map((item) => {
      const price = priceIn(item, s.currency);
      return { item, count: d.effectiveWage / price, hours: hoursFor(price, d.hourlyRate) };
    })
    .sort((a, b) => b.count - a.count);
  for (const r of rows) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    if (r.item.id === unitId) btn.setAttribute("aria-current", "true");
    const count = document.createElement("span");
    count.className = "ledger-count";
    count.textContent = formatCount(r.count);
    const name = document.createElement("span");
    name.className = "ledger-name";
    name.textContent = r.item.custom
      ? `${r.item.name} (yours)`
      : unitWords(r.item).plural;
    const time = document.createElement("span");
    time.className = "ledger-time";
    time.textContent = `${formatDuration(r.hours, d)} each`;
    btn.append(count, name, time);
    btn.setAttribute(
      "aria-label",
      `${formatCount(r.count)} ${name.textContent}, ${formatDuration(r.hours, d, "long")} each. Make it the summary unit.`
    );
    btn.addEventListener("click", () => onPromote(r.item.id));
    li.appendChild(btn);
    ledgerEl.appendChild(li);
  }
}
