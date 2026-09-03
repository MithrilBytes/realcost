// Validates data/items.json against data/items.schema.json with a small
// built-in checker for the schema subset this project uses, then applies the
// catalog rules the schema alone cannot express (duplicate ids, config links).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const items = JSON.parse(await readFile(new URL("../data/items.json", import.meta.url), "utf8"));
const schema = JSON.parse(await readFile(new URL("../data/items.schema.json", import.meta.url), "utf8"));
const config = JSON.parse(await readFile(new URL("../data/summary.json", import.meta.url), "utf8"));

// Minimal JSON Schema evaluator covering: type, required, properties,
// additionalProperties, propertyNames, pattern, minLength, maxLength,
// minProperties, exclusiveMinimum, items.
function check(value, sch, path, errors) {
  if (sch.type === "array") {
    if (!Array.isArray(value)) return errors.push(`${path}: expected array`);
    if (sch.items) value.forEach((v, i) => check(v, sch.items, `${path}[${i}]`, errors));
    return;
  }
  if (sch.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return errors.push(`${path}: expected object`);
    }
    const keys = Object.keys(value);
    for (const req of sch.required ?? []) {
      if (!(req in value)) errors.push(`${path}: missing required "${req}"`);
    }
    if (sch.minProperties && keys.length < sch.minProperties) {
      errors.push(`${path}: needs at least ${sch.minProperties} properties`);
    }
    if (sch.propertyNames?.pattern) {
      const re = new RegExp(sch.propertyNames.pattern);
      for (const k of keys) if (!re.test(k)) errors.push(`${path}.${k}: bad property name`);
    }
    for (const k of keys) {
      if (sch.properties && k in sch.properties) {
        check(value[k], sch.properties[k], `${path}.${k}`, errors);
      } else if (typeof sch.additionalProperties === "object") {
        check(value[k], sch.additionalProperties, `${path}.${k}`, errors);
      } else if (sch.additionalProperties === false) {
        errors.push(`${path}.${k}: unexpected property`);
      }
    }
    return;
  }
  if (sch.type === "string") {
    if (typeof value !== "string") return errors.push(`${path}: expected string`);
    if (sch.pattern && !new RegExp(sch.pattern).test(value)) {
      errors.push(`${path}: does not match ${sch.pattern}`);
    }
    if (sch.minLength && value.length < sch.minLength) errors.push(`${path}: too short`);
    if (sch.maxLength && value.length > sch.maxLength) errors.push(`${path}: too long`);
    return;
  }
  if (sch.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return errors.push(`${path}: expected finite number`);
    }
    if ("exclusiveMinimum" in sch && value <= sch.exclusiveMinimum) {
      errors.push(`${path}: must be > ${sch.exclusiveMinimum}`);
    }
  }
}

test("items.json conforms to items.schema.json", () => {
  const errors = [];
  check(items, schema, "items", errors);
  assert.deepEqual(errors, []);
});

test("no duplicate ids", () => {
  const seen = new Set();
  for (const item of items) {
    assert.ok(!seen.has(item.id), `duplicate id: ${item.id}`);
    seen.add(item.id);
  }
});

test("all currencies are configured", () => {
  const allowed = new Set(config.currencies);
  for (const item of items) {
    for (const cur of Object.keys(item.prices)) {
      assert.ok(allowed.has(cur), `${item.id}: unconfigured currency ${cur}`);
    }
    for (const cur of Object.keys(item.sources ?? {})) {
      assert.ok(allowed.has(cur), `${item.id}: unconfigured source currency ${cur}`);
    }
  }
});

test("every default chip and compare seed exists and has a USD price", () => {
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const id of [...config.chips, ...config.compareSeed, config.defaultUnit]) {
    const item = byId.get(id);
    assert.ok(item, `config references missing item: ${id}`);
    assert.ok(item.prices.USD, `${id}: default chips need a USD price`);
  }
});

test("catalog is reasonably sized and multi-category", () => {
  assert.ok(items.length >= 25, `only ${items.length} items`);
  const categories = new Set(items.map((i) => i.category));
  assert.ok(categories.size >= 8, `only ${categories.size} categories`);
});
