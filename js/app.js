// Bootstrap: load data, build state, wire controls, route updates.

import { loadCatalog, getCustomItems, addCustomItem, removeCustomItem, priceIn } from "./items.js";
import { createState, parseSalaryInput } from "./state.js";
import { computeDerived, formatRate } from "./calc.js";
import { initSummary } from "./summary.js";
import { renderGridLayout, updateGridValues, renderLedger } from "./render.js";

const $ = (id) => document.getElementById(id);
const nfWhole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function collectEls() {
  const els = {
    salaryForm: $("salary-form"),
    salary: $("salary"),
    currency: $("currency"),
    rateLine: $("rate-line"),
    hoursWeek: $("hours-week"),
    weeksYear: $("weeks-year"),
    basisGross: $("basis-gross"),
    basisTakehome: $("basis-takehome"),
    takehomePct: $("takehome-pct"),
    remember: $("remember"),
    forget: $("forget"),
    unitChips: $("unit-chips"),
    compareToggle: $("compare-toggle"),
    heroSingle: $("hero-single"),
    heroCompare: $("hero-compare"),
    compareRows: $("compare-rows"),
    compareHint: document.querySelector(".compare-hint"),
    hlIntro: $("hl-intro"),
    hlHoursLine: $("hl-hours-line"),
    hlHours: $("hl-hours"),
    hlHoursLabel: $("hl-hours-label"),
    hlBridge: $("hl-bridge"),
    hlUnitsLine: $("hl-units-line"),
    hlUnits: $("hl-units"),
    hlUnitsLabel: $("hl-units-label"),
    unitFacts: $("unit-facts"),
    colUnits: $("col-units"),
    identity: $("identity"),
    milestones: $("milestones"),
    dotCanvas: $("dot-canvas"),
    tileField: $("tile-field"),
    dotTip: $("dot-tip"),
    fieldLegend: $("field-legend"),
    fieldAlt: $("field-alt"),
    ratebar: $("ratebar"),
    ratebarText: $("ratebar-text"),
    search: $("search"),
    category: $("category"),
    sort: $("sort"),
    logToggle: $("log-toggle"),
    grid: $("grid"),
    gridEmpty: $("grid-empty"),
    customForm: $("custom-form"),
    customName: $("custom-name"),
    customPrice: $("custom-price"),
    customCurrencyTag: $("custom-currency-tag"),
    customNote: $("custom-note"),
    ledger: $("ledger"),
    copyLink: $("copy-link"),
    includeSalary: $("include-salary"),
    shareWarning: $("share-warning"),
    copyDone: $("copy-done"),
    dataAsof: $("data-asof"),
    picker: $("picker"),
    pickerSearch: $("picker-search"),
    pickerList: $("picker-list"),
    pickerClose: $("picker-close"),
  };
  els.breakdownCells = {};
  for (const td of document.querySelectorAll("#breakdown [data-cell]")) {
    els.breakdownCells[td.dataset.cell] = td;
  }
  return els;
}

async function boot() {
  const els = collectEls();
  const { items: catalog, config } = await loadCatalog();
  const state = createState(config, globalThis);
  const getItems = () => [...catalog, ...getCustomItems()];

  // Static bits derived from data.
  for (const cur of config.currencies) {
    const opt = document.createElement("option");
    opt.value = cur;
    opt.textContent = cur;
    els.currency.appendChild(opt);
  }
  els.dataAsof.textContent = catalog.map((i) => i.asOf).sort().at(-1);

  function rebuildCategories() {
    const current = state.get().category;
    const cats = [...new Set(getItems().map((i) => i.category))];
    els.category.textContent = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "All categories";
    els.category.appendChild(all);
    for (const c of cats) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      els.category.appendChild(opt);
    }
    els.category.value = cats.includes(current) ? current : "all";
  }

  const summary = initSummary({ els, state, config, getItems });

  const promote = (id) => {
    state.patch({ compareOn: false, unit: id });
    document.querySelector(".hero").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  };

  const removeCustom = (id) => {
    removeCustomItem(id);
    const s = state.get();
    const patch = {};
    if (s.unit === id) patch.unit = config.defaultUnit;
    if (s.compare.includes(id)) patch.compare = s.compare.filter((x) => x !== id);
    rebuildCategories();
    doGridLayout();
    doGridValues();
    doLedger();
    if (Object.keys(patch).length) state.patch(patch);
    else summary.update();
  };

  const doGridLayout = () =>
    renderGridLayout(els.grid, els.gridEmpty, {
      items: getItems(),
      state: state.get(),
      onRemove: removeCustom,
    });
  const doGridValues = () =>
    updateGridValues(els.grid, { items: getItems(), state: state.get() });
  const doLedger = () =>
    renderLedger(els.ledger, {
      items: getItems(),
      state: state.get(),
      onPromote: promote,
      unitId: state.get().unit,
    });

  function updateRateLine() {
    const s = state.get();
    const d = computeDerived(s);
    els.rateLine.textContent = "";
    if (Number.isFinite(s.salary) && s.salary > 0 && Number.isFinite(d.hourlyRate)) {
      const strong = document.createElement("strong");
      strong.textContent = formatRate(d.hourlyRate, s.currency);
      els.rateLine.append("You earn about ", strong, " per working hour.");
      els.ratebarText.textContent = "";
      const strong2 = document.createElement("strong");
      strong2.textContent = formatRate(d.hourlyRate, s.currency);
      els.ratebarText.append(
        strong2,
        ` per working hour · ${nfWhole.format(d.hoursPerYear)} working hours across ${s.weeksPerYear} weeks`
      );
    } else {
      els.rateLine.textContent = "Enter a salary to see your hourly rate.";
      els.ratebarText.textContent = "";
    }
  }

  function syncControls(s) {
    const active = document.activeElement;
    if (active !== els.salary) {
      const shown = parseSalaryInput(els.salary.value);
      if (s.salary === null && els.salary.value.trim() === "") {
        // leave the empty field alone
      } else if (shown !== s.salary) {
        els.salary.value = s.salary === null ? "" : nfWhole.format(s.salary);
      }
      els.salary.removeAttribute("aria-invalid");
    }
    els.currency.value = s.currency;
    if (active !== els.hoursWeek) els.hoursWeek.value = String(s.hoursPerWeek);
    if (active !== els.weeksYear) els.weeksYear.value = String(s.weeksPerYear);
    els.basisGross.checked = s.payBasis === "gross";
    els.basisTakehome.checked = s.payBasis === "takeHome";
    els.takehomePct.disabled = s.payBasis !== "takeHome";
    if (active !== els.takehomePct) els.takehomePct.value = String(s.takeHomePct);
    els.remember.checked = s.remember;
    els.includeSalary.checked = s.includeSalaryInLink;
    els.shareWarning.hidden = !s.includeSalaryInLink;
    els.logToggle.setAttribute("aria-pressed", String(s.logScale));
    if (active !== els.search) els.search.value = s.search;
    els.sort.value = s.sort;
    els.category.value = [...els.category.options].some((o) => o.value === s.category)
      ? s.category
      : "all";
    els.customCurrencyTag.textContent = `(${s.currency})`;
  }

  // ---- Events --------------------------------------------------------------

  els.salaryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    els.salary.blur();
  });
  els.salary.addEventListener("input", () => {
    const raw = els.salary.value;
    const n = parseSalaryInput(raw);
    if (raw.trim() && n === null) els.salary.setAttribute("aria-invalid", "true");
    else els.salary.removeAttribute("aria-invalid");
    state.patch({ salary: n === null ? NaN : n });
  });
  els.currency.addEventListener("change", () => state.patch({ currency: els.currency.value }));
  els.hoursWeek.addEventListener("input", () => {
    const n = els.hoursWeek.valueAsNumber;
    if (Number.isFinite(n)) state.patch({ hoursPerWeek: n });
  });
  els.weeksYear.addEventListener("input", () => {
    const n = els.weeksYear.valueAsNumber;
    if (Number.isFinite(n)) state.patch({ weeksPerYear: n });
  });
  for (const radio of [els.basisGross, els.basisTakehome]) {
    radio.addEventListener("change", () => {
      state.patch({ payBasis: els.basisTakehome.checked ? "takeHome" : "gross" });
    });
  }
  els.takehomePct.addEventListener("input", () => {
    const n = els.takehomePct.valueAsNumber;
    if (Number.isFinite(n)) state.patch({ takeHomePct: n });
  });
  els.remember.addEventListener("change", () => state.patch({ remember: els.remember.checked }));
  els.forget.addEventListener("click", () => state.forget());

  els.search.addEventListener("input", () => state.patch({ search: els.search.value }));
  els.category.addEventListener("change", () => state.patch({ category: els.category.value }));
  els.sort.addEventListener("change", () => state.patch({ sort: els.sort.value }));
  els.logToggle.addEventListener("click", () =>
    state.patch({ logScale: !state.get().logScale })
  );

  els.customForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const price = parseSalaryInput(els.customPrice.value);
    const item = price === null
      ? null
      : addCustomItem({ name: els.customName.value, price, currency: state.get().currency });
    if (!item) {
      els.customNote.classList.add("error");
      els.customNote.textContent = "A name and a price above zero are needed.";
      return;
    }
    els.customNote.classList.remove("error");
    els.customNote.textContent = `Added ${item.name}. It stays in this browser tab.`;
    els.customForm.reset();
    rebuildCategories();
    doGridLayout();
    doGridValues();
    doLedger();
    summary.update();
  });

  els.includeSalary.addEventListener("change", () =>
    state.patch({ includeSalaryInLink: els.includeSalary.checked })
  );
  els.copyLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      els.copyDone.textContent = "Copied.";
    } catch {
      els.copyDone.textContent = "Copy blocked; use the address bar.";
    }
    clearTimeout(els.copyDone._t);
    els.copyDone._t = setTimeout(() => (els.copyDone.textContent = ""), 2500);
  });

  // Sticky rate bar once the hero has scrolled past.
  let pastHero = false;
  const applyRatebar = () => {
    const s = state.get();
    els.ratebar.classList.toggle("shown", pastHero && Number.isFinite(s.salary) && s.salary > 0);
  };
  els.ratebar.hidden = false;
  new IntersectionObserver(
    ([entry]) => {
      pastHero = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      applyRatebar();
    },
    { threshold: 0 }
  ).observe(document.querySelector(".hero"));

  // ---- Update routing ------------------------------------------------------

  const WAGE_KEYS = ["salary", "currency", "hoursPerWeek", "weeksPerYear", "payBasis", "takeHomePct"];
  const LAYOUT_KEYS = ["currency", "category", "sort", "search", "logScale"];
  state.subscribe((s, changed) => {
    const has = (keys) => keys.some((k) => changed.has(k));
    if (has(LAYOUT_KEYS)) doGridLayout();
    if (has(WAGE_KEYS)) {
      updateRateLine();
      summary.update();
      doGridValues();
      doLedger();
      applyRatebar();
    } else if (has(LAYOUT_KEYS)) {
      doGridValues();
    }
    if (has(["unit", "compareOn", "compare"])) {
      summary.update();
      doLedger();
    }
    syncControls(s);
  });

  // ---- First paint ---------------------------------------------------------

  rebuildCategories();
  syncControls(state.get());
  updateRateLine();
  summary.update();
  doGridLayout();
  doGridValues();
  doLedger();
}

boot().catch((err) => {
  console.error(err);
  const rateLine = document.getElementById("rate-line");
  if (rateLine) {
    rateLine.textContent =
      "The price catalog could not be loaded. If you opened index.html as a file, serve the folder over HTTP instead.";
  }
});
