// Settings state, URL hash sync, and opt-in device storage.
// The salary lives in memory only, unless "remember on this device" is ticked.

export const defaults = {
  salary: null,
  currency: "USD",
  hoursPerWeek: 40,
  weeksPerYear: 48,
  payBasis: "gross",
  takeHomePct: 70,
  unit: "coffee",
  compareOn: false,
  compare: [],
  category: "all",
  sort: "time",
  search: "",
  logScale: false,
  includeSalaryInLink: false,
  remember: false,
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function parseSalaryInput(raw) {
  if (typeof raw !== "string") return null;
  let s = raw.trim().toLowerCase().replace(/[,\s]/g, "").replace(/^[^0-9.]+/, "");
  let mult = 1;
  if (s.endsWith("k")) {
    mult = 1000;
    s = s.slice(0, -1);
  }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * mult;
}

export function sanitize(patch, config) {
  const out = {};
  if ("salary" in patch) {
    const n = patch.salary;
    out.salary = Number.isFinite(n) && n > 0 ? n : null;
  }
  if ("currency" in patch && config.currencies.includes(patch.currency)) {
    out.currency = patch.currency;
  }
  if ("hoursPerWeek" in patch) {
    const n = Number(patch.hoursPerWeek);
    if (Number.isFinite(n)) out.hoursPerWeek = clamp(n, 1, 100);
  }
  if ("weeksPerYear" in patch) {
    const n = Number(patch.weeksPerYear);
    if (Number.isFinite(n)) out.weeksPerYear = clamp(n, 1, 52);
  }
  if ("payBasis" in patch && ["gross", "takeHome"].includes(patch.payBasis)) {
    out.payBasis = patch.payBasis;
  }
  if ("takeHomePct" in patch) {
    const n = Number(patch.takeHomePct);
    if (Number.isFinite(n)) out.takeHomePct = clamp(n, 1, 100);
  }
  if ("unit" in patch && typeof patch.unit === "string") out.unit = patch.unit;
  if ("compareOn" in patch) out.compareOn = Boolean(patch.compareOn);
  if ("compare" in patch && Array.isArray(patch.compare)) {
    out.compare = patch.compare
      .filter((x) => typeof x === "string" && x)
      .slice(0, config.compareMax || 5);
  }
  if ("category" in patch && typeof patch.category === "string") {
    out.category = patch.category;
  }
  if ("sort" in patch && ["time", "price", "name"].includes(patch.sort)) {
    out.sort = patch.sort;
  }
  if ("search" in patch) out.search = String(patch.search).slice(0, 80);
  if ("logScale" in patch) out.logScale = Boolean(patch.logScale);
  if ("includeSalaryInLink" in patch) {
    out.includeSalaryInLink = Boolean(patch.includeSalaryInLink);
  }
  if ("remember" in patch) out.remember = Boolean(patch.remember);
  return out;
}

// Hash codec. Only non-default values are written, so shared URLs stay short.
export function encodeHash(state) {
  const p = new URLSearchParams();
  if (state.currency !== defaults.currency) p.set("c", state.currency);
  if (state.hoursPerWeek !== defaults.hoursPerWeek) p.set("hw", String(state.hoursPerWeek));
  if (state.weeksPerYear !== defaults.weeksPerYear) p.set("wy", String(state.weeksPerYear));
  if (state.payBasis === "takeHome") {
    p.set("pb", "t");
    p.set("th", String(state.takeHomePct));
  }
  if (state.unit !== defaults.unit) p.set("u", state.unit);
  if (state.compareOn) p.set("cm", "1");
  if (state.compare.length) p.set("cmp", state.compare.join(","));
  if (state.category !== defaults.category) p.set("cat", state.category);
  if (state.sort !== defaults.sort) p.set("srt", state.sort);
  if (state.search) p.set("q", state.search);
  if (state.logScale) p.set("log", "1");
  if (state.includeSalaryInLink && state.salary) p.set("s", String(state.salary));
  const s = p.toString();
  return s ? "#" + s : "";
}

export function decodeHash(hash) {
  const patch = {};
  const raw = (hash || "").replace(/^#/, "");
  if (!raw) return patch;
  let p;
  try {
    p = new URLSearchParams(raw);
  } catch {
    return patch;
  }
  if (p.has("c")) patch.currency = p.get("c");
  if (p.has("hw")) patch.hoursPerWeek = Number(p.get("hw"));
  if (p.has("wy")) patch.weeksPerYear = Number(p.get("wy"));
  if (p.get("pb") === "t") patch.payBasis = "takeHome";
  if (p.has("th")) patch.takeHomePct = Number(p.get("th"));
  if (p.has("u")) patch.unit = p.get("u");
  if (p.has("cm")) patch.compareOn = true;
  if (p.has("cmp")) patch.compare = p.get("cmp").split(",").filter(Boolean);
  if (p.has("cat")) patch.category = p.get("cat");
  if (p.has("srt")) patch.sort = p.get("srt");
  if (p.has("q")) patch.search = p.get("q");
  if (p.has("log")) patch.logScale = true;
  if (p.has("s")) {
    patch.salary = Number(p.get("s"));
    patch.includeSalaryInLink = true;
  }
  return patch;
}

const LS_KEY = "realcost.remembered";

function readStorage(kind) {
  try {
    const raw = (kind === "local" ? localStorage : sessionStorage).getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(kind, value) {
  try {
    const store = kind === "local" ? localStorage : sessionStorage;
    if (value === null) store.removeItem(LS_KEY);
    else store.setItem(LS_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, blocked). The site works without it.
  }
}

export function createState(config, env = globalThis) {
  const listeners = new Set();
  const state = { ...defaults };
  let lastWrittenHash = null;

  // Boot order: remembered salary first, then the URL hash on top.
  const remembered = readStorage("local");
  if (remembered && Number.isFinite(remembered.salary)) {
    state.salary = remembered.salary;
    state.remember = true;
  }
  Object.assign(state, sanitize(decodeHash(env.location?.hash), config));

  function notify(changed) {
    for (const fn of listeners) fn(state, changed);
  }

  function syncHash() {
    if (!env.history?.replaceState) return;
    const next = encodeHash(state);
    const current = env.location.hash || "";
    if (next === current || (next === "" && current === "")) return;
    lastWrittenHash = next;
    env.history.replaceState(null, "", next || env.location.pathname + env.location.search);
  }

  function syncStorage() {
    if (state.remember && state.salary) {
      writeStorage("local", { salary: state.salary });
    } else {
      writeStorage("local", null);
    }
  }

  const api = {
    get: () => state,
    patch(rawPatch) {
      const clean = sanitize(rawPatch, config);
      const changed = new Set();
      for (const [k, v] of Object.entries(clean)) {
        const same = Array.isArray(v)
          ? JSON.stringify(v) === JSON.stringify(state[k])
          : state[k] === v;
        if (!same) {
          state[k] = v;
          changed.add(k);
        }
      }
      if (changed.size === 0) return changed;
      syncHash();
      if (changed.has("salary") || changed.has("remember")) syncStorage();
      notify(changed);
      return changed;
    },
    forget() {
      writeStorage("local", null);
      writeStorage("session", null);
      api.patch({ remember: false });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  env.addEventListener?.("hashchange", () => {
    if (env.location.hash === lastWrittenHash) return;
    api.patch(decodeHash(env.location.hash));
  });

  return api;
}
