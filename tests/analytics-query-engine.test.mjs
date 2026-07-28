import assert from "node:assert/strict";
import test from "node:test";

import {
  getMmsFilterOptions,
  normalizeMmsAnalyticsFilters,
  queryMmsAnalytics,
} from "../app/analytics-query-engine.ts";
import { calculateAvailabilityPerformance } from "../app/availability-performance-engine.ts";
import { calculateProductionMetrics } from "../app/production-engine.ts";
import { summarizeCanonicalData } from "../app/mms.ts";

const DAY = 86_400_000;

function interval({
  id,
  day,
  machine,
  shift,
  product,
  operator,
  produced,
  shiftTarget,
  operativeSeconds,
  operativeTarget,
  rejected = 0,
  reworked = 0,
  scrapPerPart = 0.1,
  issueCodes = [],
}) {
  const startEpochMs = day * DAY;
  const calculations = calculateProductionMetrics({
    stroke: produced,
    multiplier: 1,
    reportedQuantity: produced,
    operativeTimeSeconds: operativeSeconds,
    standardCycleTimeSeconds: operativeSeconds / operativeTarget,
    shiftTarget,
  });
  const oeeComponents = calculateAvailabilityPerformance({
    shiftTimeSeconds: 43_200,
    allowedTimeSeconds: 7_200,
    operativeTimeSeconds: operativeSeconds,
    producedQuantity: calculations.producedQuantityUsed,
    operativeTimeTarget: calculations.operativeTimeTarget,
  });
  const missingOperator = operator === "NO OPERATOR";
  return {
    id,
    sourceSheet: "Product Log Book",
    sourceRow: day,
    date: `2026-07-0${day}`,
    startAt: null,
    endAt: null,
    startEpochMs,
    endEpochMs: startEpochMs + 43_200_000,
    machine,
    machineType: "VMC",
    shift,
    product: {
      partNumber: `${product}-PART`,
      partName: `${product} Part`,
      partErpCode: `${product}-ERP`,
      productName: product,
      erpCode: `${product}-ERP`,
    },
    operator: {
      raw: operator,
      names: missingOperator ? [] : [operator],
      isMissing: missingOperator,
    },
    timesSeconds: {
      shift: 43_200,
      allowed: 7_200,
      operative: operativeSeconds,
      nonOperative: 120,
      downtime: 3_600,
      systemOff: 60,
      setup: 300,
      additionalOvertime: 300,
      productionGap: 30,
    },
    cycleTimesSeconds: {
      standard: operativeSeconds / operativeTarget,
      approved: null,
      achieved: operativeSeconds / produced,
    },
    quantities: {
      stroke: produced,
      multiplier: 1,
      reported: produced,
      calculatedFromStroke: produced,
      shiftTarget,
      operativeTimeTarget: operativeTarget,
      productionLoss: shiftTarget - produced,
      rejected,
      reworked,
      errorStroke: 0,
    },
    calculations,
    oeeComponents,
    costs: {
      part: null,
      component: null,
      machinePerHour: 600,
      operatorPerHour: null,
    },
    scrapPerPart,
    qualityInterlock: "",
    processDependency: "",
    proxy: "",
    toolRequired: "",
    issueCodes,
    isValid: !issueCodes.includes("INVALID_INTERVAL"),
  };
}

function downtime({
  id,
  day,
  machine,
  shift,
  product,
  operator,
  reason,
  reasonType = "BREAKDOWN",
  duration = 3_600,
  issueCodes = [],
}) {
  const startEpochMs = day * DAY + 3_600_000;
  const missingOperator = operator === "NO OPERATOR";
  return {
    id,
    sourceSheet: "Down Time Details",
    sourceRow: day,
    date: `2026-07-0${day}`,
    startAt: null,
    endAt: null,
    startEpochMs,
    endEpochMs: startEpochMs + duration * 1_000,
    durationSeconds: duration,
    machine,
    shift,
    productName: product,
    operator: {
      raw: operator,
      names: missingOperator ? [] : [operator],
      isMissing: missingOperator,
    },
    reasonType,
    reason,
    isUnreported: reason === "UNREPORTED",
    reportedMachineHourLoss: (duration / 3_600) * 600,
    issueCodes,
    isValid: !issueCodes.includes("INVALID_INTERVAL"),
  };
}

function canonicalData() {
  const productionIntervals = [
    interval({
      id: "P-1",
      day: 1,
      machine: "M-01",
      shift: "Shift 1",
      product: "PRODUCT-A",
      operator: "OP-A",
      produced: 100,
      shiftTarget: 120,
      operativeSeconds: 28_800,
      operativeTarget: 125,
      rejected: 2,
      reworked: 1,
      issueCodes: ["QUANTITY_MISMATCH"],
    }),
    interval({
      id: "P-2",
      day: 1,
      machine: "M-01",
      shift: "Shift 2",
      product: "PRODUCT-B",
      operator: "NO OPERATOR",
      produced: 50,
      shiftTarget: 80,
      operativeSeconds: 18_000,
      operativeTarget: 100,
      rejected: 1,
      reworked: 2,
      scrapPerPart: 0.2,
    }),
    interval({
      id: "P-3",
      day: 2,
      machine: "M-02",
      shift: "Shift 1",
      product: "PRODUCT-A",
      operator: "OP-B",
      produced: 200,
      shiftTarget: 200,
      operativeSeconds: 36_000,
      operativeTarget: 200,
      rejected: 4,
      reworked: 0,
    }),
  ];
  const downtimeEvents = [
    downtime({
      id: "D-1",
      day: 1,
      machine: "M-01",
      shift: "Shift 1",
      product: "PRODUCT-A",
      operator: "OP-A",
      reason: "Tool failure",
    }),
    downtime({
      id: "D-2",
      day: 2,
      machine: "M-02",
      shift: "Shift 1",
      product: "PRODUCT-A",
      operator: "OP-B",
      reason: "UNREPORTED",
      issueCodes: ["UNREPORTED_DOWNTIME"],
    }),
  ];
  return {
    source: {
      company: "Test Factory",
      fileName: "fixture.xlsx",
      parsedAt: "2026-07-25T00:00:00.000Z",
    },
    productionIntervals,
    downtimeEvents,
    availabilityPerformance: null,
    qualityAnalytics: null,
    downtimeAnalytics: null,
    validationIssues: [
      {
        code: "QUANTITY_MISMATCH",
        severity: "warning",
        message: "Mismatch",
        sheet: "Product Log Book",
        rowNumber: 1,
        recordId: "P-1",
        field: "Qty",
      },
      {
        code: "UNREPORTED_DOWNTIME",
        severity: "warning",
        message: "Unreported",
        sheet: "Down Time Details",
        rowNumber: 2,
        recordId: "D-2",
        field: "Reason",
      },
    ],
    importStats: {
      productRowsRead: 3,
      downtimeRowsRead: 2,
      productTotalRowsExcluded: 0,
      downtimeTotalRowsExcluded: 0,
      errorCount: 0,
      warningCount: 2,
    },
  };
}

test("recalculates every analytics area for an exact date", () => {
  const result = queryMmsAnalytics(canonicalData(), { date: "2026-07-01" });

  assert.equal(result.records.productionIntervals.length, 2);
  assert.equal(result.records.downtimeEvents.length, 1);
  assert.equal(result.production.totals.producedQuantity, 150);
  assert.equal(result.production.totals.shiftTarget, 356.25);
  assert.equal(result.production.targetAttainment, 42.105263);
  assert.equal(
    result.availabilityPerformance.period.totals.operativeTimeSeconds,
    46_800,
  );
  assert.equal(result.quality.period.totals.rejectedQuantity, 3);
  assert.equal(result.quality.period.totals.reworkedQuantity, 3);
  assert.equal(result.quality.period.totals.estimatedScrap, 20);
  assert.equal(result.oee.period.quality, 0.96);
  assert.equal(result.oee.period.finalOee, 0.416);
  assert.equal(result.downtime.period.totals.downtimeSeconds, 3_600);
  assert.equal(result.downtime.period.totals.calculatedMachineHourLoss, 600);
  assert.equal(result.dataQuality.quantityMismatchRecords, 1);
  assert.equal(result.dataQuality.unreportedDowntimeEvents, 0);
});

test("supports inclusive and reversed date ranges", () => {
  const normalized = normalizeMmsAnalyticsFilters({
    dateRange: { from: "2026-07-02", to: "2026-07-01" },
  });
  assert.equal(normalized.dateFrom, "2026-07-01");
  assert.equal(normalized.dateTo, "2026-07-02");

  const result = queryMmsAnalytics(canonicalData(), {
    dateRange: { from: "2026-07-01", to: "2026-07-02" },
  });
  assert.equal(result.production.totals.producedQuantity, 350);
  assert.equal(result.records.downtimeEvents.length, 2);
});

test("filters by shift, machine, product, and operator", () => {
  const data = canonicalData();

  assert.equal(
    queryMmsAnalytics(data, { shift: "shift 2" }).production.totals
      .producedQuantity,
    50,
  );
  assert.equal(
    queryMmsAnalytics(data, { machine: "m-02" }).production.totals
      .producedQuantity,
    200,
  );
  assert.equal(
    queryMmsAnalytics(data, { product: "product-a" }).production.totals
      .producedQuantity,
    300,
  );
  assert.equal(
    queryMmsAnalytics(data, { operator: "op-b" }).production.totals
      .producedQuantity,
    200,
  );
  assert.equal(
    queryMmsAnalytics(data, { operator: "NO OPERATOR" }).production.totals
      .producedQuantity,
    50,
  );
});

test("supports multi-value filters with OR matching", () => {
  const result = queryMmsAnalytics(canonicalData(), {
    machine: ["M-01", "M-02"],
    product: ["PRODUCT-A", "PRODUCT-B"],
  });
  assert.equal(result.production.totals.producedQuantity, 350);
  assert.equal(result.activeFilterCount, 2);
});

test("filters downtime reasons without corrupting production totals", () => {
  const result = queryMmsAnalytics(canonicalData(), {
    downtimeReason: "UNREPORTED",
  });

  assert.equal(result.production.totals.producedQuantity, 350);
  assert.equal(result.records.downtimeEvents.length, 1);
  assert.equal(result.downtime.period.unreportedEventCount, 1);
  assert.equal(result.dataQuality.unreportedDowntimeEvents, 1);
  assert.equal(result.dataQuality.quantityMismatchRecords, 1);
});

test("returns filter options for every supported dimension", () => {
  const options = getMmsFilterOptions(canonicalData());

  assert.deepEqual(options.dates, ["2026-07-01", "2026-07-02"]);
  assert.deepEqual(options.shifts, ["Shift 1", "Shift 2"]);
  assert.deepEqual(options.machines, ["M-01", "M-02"]);
  assert.ok(options.products.includes("PRODUCT-A"));
  assert.ok(options.operators.includes("NO OPERATOR"));
  assert.ok(options.downtimeReasons.includes("Tool failure"));
  assert.ok(options.downtimeReasons.includes("UNREPORTED"));
});

test("legacy summary uses the complete selected period instead of latest day", () => {
  const data = canonicalData();
  const complete = summarizeCanonicalData(data);
  const filtered = summarizeCanonicalData(data, { date: "2026-07-01" });

  assert.equal(complete.latestDay.production, 350);
  assert.equal(complete.latestDay.date, "2026-07-01 to 2026-07-02");
  assert.equal(filtered.latestDay.production, 150);
  assert.equal(filtered.latestDay.date, "2026-07-01");
  assert.equal(filtered.selection.activeFilterCount, 1);
});

test("keeps filtered record selection identical across calculation policies", () => {
  const data = canonicalData();
  const filters = {
    dateRange: { from: "2026-07-01", to: "2026-07-02" },
    machine: "M-01",
    shift: "Shift 1",
    product: "PRODUCT-A",
    operator: "OP-A",
    downtimeReason: "Tool failure",
  };
  const confirmed = queryMmsAnalytics(data, filters);
  const provisional = queryMmsAnalytics(data, filters, {
    policyId: "mms-reconciled-99-37-v1",
    allowProvisional: true,
    runtimeEnvironment: "test",
  });

  assert.equal(confirmed.calculationPolicy.status, "confirmed");
  assert.equal(provisional.calculationPolicy.status, "provisional");
  assert.deepEqual(
    confirmed.records.productionIntervals.map((record) => record.id),
    provisional.records.productionIntervals.map((record) => record.id),
  );
  assert.deepEqual(
    confirmed.records.downtimeEvents.map((record) => record.id),
    provisional.records.downtimeEvents.map((record) => record.id),
  );
  assert.deepEqual(confirmed.filters, provisional.filters);
  assert.deepEqual(confirmed.scope, provisional.scope);
  assert.notEqual(
    confirmed.production.totals.productionLoss,
    provisional.production.totals.productionLoss,
  );
});
