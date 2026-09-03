// Catalog loading and validation, plus custom (user-added) items.
// Invalid catalog entries are dropped with a console warning, never guessed at.

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const AS_OF_RE = /^\d{4}-\d{2}$/;

export function validateItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const { id, name, category, prices, source, asOf } = raw;
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  if (typeof name !== "string" || !name.trim()) return null;
  if (typeof category !== "string" || !category.trim()) return null;
  if (typeof source !== "string" || !source.startsWith("https://")) return null;
  if (typeof asOf !== "string" || !AS_OF_RE.test(asOf)) return null;
  if (!prices || typeof prices !== "object") return null;
  const clean = {};
  for (const [cur, val] of Object.entries(prices)) {
    if (/^[A-Z]{3}$/.test(cur) && Number.isFinite(val) && val > 0) clean[cur] = val;
  }
  if (Object.keys(clean).length === 0) return null;
  const item = { id, name, category, prices: clean, source, asOf };
  if (raw.sources && typeof raw.sources === "object") item.sources = raw.sources;
  if (typeof raw.unitSingular === "string") item.unitSingular = raw.unitSingular;
  if (typeof raw.unitPlural === "string") item.unitPlural = raw.unitPlural;
  if (typeof raw.short === "string") item.short = raw.short;
  if (typeof raw.note === "string") item.note = raw.note;
  return item;
}

export async function loadCatalog() {
  const [itemsRes, configRes] = await Promise.all([
    fetch("data/items.json"),
    fetch("data/summary.json"),
  ]);
  if (!itemsRes.ok || !configRes.ok) {
    throw new Error("Could not load catalog data");
  }
  const rawItems = await itemsRes.json();
  const config = await configRes.json();
  const items = [];
  const seen = new Set();
  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    const item = validateItem(raw);
    if (!item) {
      console.warn("Dropping invalid catalog entry", raw && raw.id);
      continue;
    }
    if (seen.has(item.id)) {
      console.warn("Dropping duplicate catalog id", item.id);
      continue;
    }
    seen.add(item.id);
    items.push(item);
  }
  return { items, config };
}

export function priceIn(item, currency) {
  const p = item.prices[currency];
  return Number.isFinite(p) ? p : null;
}

export function sourceFor(item, currency) {
  if (item.sources && typeof item.sources[currency] === "string") {
    return item.sources[currency];
  }
  return item.source;
}

// Words used in prose: "6,400 coffees", "4.3 months of rent".
export function unitWords(item) {
  if (item.unitSingular || item.unitPlural) {
    const singular = item.unitSingular || item.unitPlural;
    return { singular, plural: item.unitPlural || item.unitSingular };
  }
  const base = item.name.replace(/\s*\(.*\)\s*$/, "").trim();
  return { singular: base, plural: base };
}

// ---- Custom items ----------------------------------------------------------
// Live in sessionStorage (this tab's session). Never sent anywhere.

const CUSTOM_KEY = "realcost.customItems";

function readCustom() {
  try {
    const raw = sessionStorage.getItem(CUSTOM_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeCustom(list) {
  try {
    sessionStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable; custom items simply last until reload.
  }
}

let customCache = null;

export function getCustomItems() {
  if (customCache === null) customCache = readCustom();
  return customCache;
}

export function addCustomItem({ name, price, currency }) {
  const trimmed = String(name || "").trim().slice(0, 60);
  const value = Number(price);
  if (!trimmed || !Number.isFinite(value) || value <= 0) return null;
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
  let id = `custom-${slug}`;
  const existing = new Set(getCustomItems().map((i) => i.id));
  let n = 2;
  while (existing.has(id)) id = `custom-${slug}-${n++}`;
  const item = {
    id,
    name: trimmed,
    category: "Custom",
    prices: { [currency]: value },
    custom: true,
  };
  customCache = [...getCustomItems(), item];
  writeCustom(customCache);
  return item;
}

export function removeCustomItem(id) {
  customCache = getCustomItems().filter((i) => i.id !== id);
  writeCustom(customCache);
}
