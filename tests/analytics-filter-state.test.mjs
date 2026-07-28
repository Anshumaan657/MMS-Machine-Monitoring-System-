import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeMmsAnalyticsFilters,
  emptyMmsAnalyticsFilters,
  encodeMmsAnalyticsFilters,
  persistMmsAnalyticsFilters,
  restoreMmsAnalyticsFilters,
} from "../app/analytics-filter-state.ts";
import { normalizeMmsAnalyticsFilters } from "../app/analytics-query-engine.ts";

test("round-trips every supported filter through URL-safe state", () => {
  const filters = {
    dateRange: { from: "2026-07-01", to: "2026-07-03" },
    shift: ["Shift 1", "Shift 2"],
    machine: ["M-01"],
    product: ["PRODUCT A"],
    operator: ["OP A"],
    downtimeReason: ["Tool failure"],
    alertSeverity: ["critical", "warning"],
    dataQualityStatus: ["invalid", "questionable"],
  };
  const encoded = encodeMmsAnalyticsFilters(filters);
  const decoded = decodeMmsAnalyticsFilters(encoded);

  assert.equal(encoded.includes(" "), false);
  assert.deepEqual(
    normalizeMmsAnalyticsFilters(decoded),
    normalizeMmsAnalyticsFilters(filters),
  );
});

test("persists, restores, and clears filter state safely", () => {
  const values = new Map();
  const storage = {
    setItem(key, value) {
      values.set(key, value);
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
  };

  persistMmsAnalyticsFilters(storage, { machine: ["M-01", "M-02"] });
  assert.deepEqual(
    normalizeMmsAnalyticsFilters(restoreMmsAnalyticsFilters(storage)).machines,
    ["M-01", "M-02"],
  );
  persistMmsAnalyticsFilters(storage, {});
  assert.deepEqual(emptyMmsAnalyticsFilters().machines, []);
  assert.equal(values.size, 0);
});
