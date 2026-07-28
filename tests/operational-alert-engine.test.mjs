import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_OPERATIONAL_ALERT_CONFIG,
  buildOperationalAlerts,
  normalizeOperationalAlertConfig,
} from "../app/operational-alert-engine.ts";

function production(overrides = {}) {
  return {
    id: "PI-1",
    sourceSheet: "Product Log Book",
    sourceRow: 7,
    date: "2026-07-01",
    startAt: "2026-07-01T06:00:00",
    endAt: "2026-07-01T18:00:00",
    startEpochMs: 1,
    endEpochMs: 2,
    machine: "",
    machineType: "VMC",
    shift: "Shift 1",
    product: {
      partNumber: "PART-1",
      partName: "Part",
      partErpCode: "ERP-1",
      productName: "PRODUCT-A",
      erpCode: "ERP-1",
    },
    operator: { raw: "NO OPERATOR", names: [], isMissing: true },
    timesSeconds: {
      shift: 43_200,
      allowed: 7_200,
      operative: 28_800,
      nonOperative: 0,
      downtime: 3_600,
      systemOff: 600,
      setup: 0,
      additionalOvertime: 300,
      productionGap: 30,
    },
    cycleTimesSeconds: { standard: 100, approved: 100, achieved: 200 },
    quantities: {
      stroke: 30,
      multiplier: 1,
      reported: 30,
      calculatedFromStroke: 30,
      shiftTarget: 100,
      operativeTimeTarget: 288,
      productionLoss: 70,
      rejected: 0,
      reworked: 0,
      errorStroke: 0,
    },
    calculations: {
      producedQuantityUsed: 30,
      achievedCycleTimeSeconds: 200,
      productionLoss: 70,
    },
    oeeComponents: {},
    costs: {
      part: null,
      component: null,
      machinePerHour: 2_000,
      operatorPerHour: null,
    },
    scrapPerPart: 0,
    qualityInterlock: "",
    processDependency: "",
    proxy: "",
    toolRequired: "",
    issueCodes: ["MISSING_MACHINE", "MISSING_OPERATOR"],
    isValid: false,
    ...overrides,
  };
}

function downtime(overrides = {}) {
  return {
    id: "DT-1",
    sourceSheet: "Down Time Details",
    sourceRow: 9,
    date: "2026-07-01",
    startAt: "2026-07-01T08:00:00",
    endAt: "2026-07-01T10:00:00",
    startEpochMs: 1,
    endEpochMs: 2,
    durationSeconds: 7_200,
    machine: "M-01",
    shift: "Shift 1",
    productName: "PRODUCT-A",
    operator: { raw: "NO OPERATOR", names: [], isMissing: true },
    reasonType: "BREAKDOWN",
    reason: "UNREPORTED",
    isUnreported: true,
    reportedMachineHourLoss: 4_000,
    issueCodes: ["MISSING_OPERATOR", "UNREPORTED_DOWNTIME"],
    isValid: true,
    ...overrides,
  };
}

function intelligence(event, overrides = {}) {
  return {
    id: event.id,
    machine: event.machine,
    shift: event.shift,
    date: event.date,
    startEpochMs: event.startEpochMs,
    endEpochMs: event.endEpochMs,
    startAt: event.startAt,
    endAt: event.endAt,
    durationSeconds: event.durationSeconds,
    productName: event.productName,
    reasonType: event.reasonType,
    reason: event.reason,
    isUnreported: event.isUnreported,
    hasOverlap: false,
    reportedMachineHourLoss: event.reportedMachineHourLoss,
    sourceEventIds: [event.id],
    sourceEventCount: 1,
    contextIntervalId: "PI-1",
    classification: "downtime",
    additionalOvertimeThresholdSeconds: 300,
    machineHourCost: 2_000,
    calculatedMachineHourLoss: 4_000,
    financialLossComparison: {
      reported: 4_000,
      calculated: 4_000,
      difference: 0,
      matches: true,
    },
    issueCodes: [],
    ...overrides,
  };
}

function canonicalData() {
  const event = downtime();
  const invalid = downtime({
    id: "DT-2",
    sourceRow: 10,
    startAt: "2026-07-01T11:00:00",
    durationSeconds: null,
    issueCodes: ["INVALID_DURATION"],
    operator: { raw: "OP-1", names: ["OP-1"], isMissing: false },
    reason: "Tool failure",
    isUnreported: false,
  });
  return {
    source: {
      company: "Factory",
      fileName: "sample.xlsx",
      parsedAt: "2026-07-26T00:00:00.000Z",
    },
    productionIntervals: [
      production({
        machine: "M-01",
        issueCodes: ["MISSING_OPERATOR"],
        isValid: true,
      }),
      production({
        id: "PI-2",
        sourceRow: 8,
        issueCodes: ["MISSING_MACHINE", "MISSING_OPERATOR"],
      }),
    ],
    downtimeEvents: [event, invalid],
    availabilityPerformance: null,
    qualityAnalytics: null,
    downtimeAnalytics: {
      events: [
        intelligence(event),
        intelligence(invalid, {
          durationSeconds: null,
          calculatedMachineHourLoss: null,
        }),
      ],
      mergedEvents: [],
      machineWise: [],
      shiftWise: [],
      daily: [],
      period: null,
      machineRanking: [],
      reasonPareto: [],
      mergeRule: {
        enabled: true,
        maximumGapSeconds: 0,
        requireSameReason: true,
      },
    },
    validationIssues: [],
    importStats: {
      productRowsRead: 1,
      downtimeRowsRead: 2,
      productTotalRowsExcluded: 0,
      downtimeTotalRowsExcluded: 0,
      errorCount: 1,
      warningCount: 2,
    },
  };
}

test("creates every record-based operational alert type", () => {
  const alerts = buildOperationalAlerts(canonicalData());
  const types = new Set(alerts.map((alert) => alert.type));

  for (const type of [
    "EXCESSIVE_DOWNTIME",
    "SYSTEM_OFF",
    "PRODUCTION_BELOW_TARGET",
    "ABNORMAL_CYCLE_TIME",
    "HIGH_PRODUCTION_LOSS",
    "HIGH_MACHINE_HOUR_LOSS",
    "MISSING_MACHINE_DATA",
    "MISSING_OPERATOR",
    "MISSING_DOWNTIME_REASON",
    "INVALID_DURATION",
  ]) {
    assert.equal(types.has(type), true, `${type} was not generated`);
  }
});

test("creates a database synchronization failure alert only for database sources", () => {
  const databaseAlerts = buildOperationalAlerts(canonicalData(), {}, {
    synchronization: {
      sourceKind: "database",
      sourceName: "MySQL MMS",
      status: "stale",
      lastAttemptAt: "2026-07-26T10:00:00.000Z",
      error: "Connection unavailable.",
    },
  });
  assert.equal(
    databaseAlerts.some(
      (alert) => alert.type === "DATABASE_SYNC_FAILURE",
    ),
    true,
  );

  const excelAlerts = buildOperationalAlerts(canonicalData(), {}, {
    synchronization: {
      sourceKind: "excel",
      sourceName: "sample.xlsx",
      status: "error",
      lastAttemptAt: "2026-07-26T10:00:00.000Z",
      error: "Workbook unavailable.",
    },
  });
  assert.equal(
    excelAlerts.some((alert) => alert.type === "DATABASE_SYNC_FAILURE"),
    false,
  );
});

test("includes complete supporting context on every alert", () => {
  const alerts = buildOperationalAlerts(canonicalData(), {}, {
    synchronization: {
      sourceKind: "database",
      sourceName: "MySQL MMS",
      status: "error",
      lastAttemptAt: "2026-07-26T10:00:00.000Z",
      error: "Connection unavailable.",
    },
  });

  assert.ok(alerts.length > 0);
  for (const alert of alerts) {
    assert.ok(alert.machine);
    assert.ok(alert.shift);
    assert.ok(alert.time);
    assert.notEqual(alert.triggeringValue.value, undefined);
    assert.notEqual(alert.threshold.value, undefined);
    assert.ok(alert.supportingRecord.id);
    assert.equal(alert.status, "active");
    assert.equal(alert.acknowledgementState, "unacknowledged");
  }
});

test("applies acknowledgements using stable alert IDs", () => {
  const initial = buildOperationalAlerts(canonicalData());
  const target = initial[0];
  const acknowledgedAt = "2026-07-26T11:00:00.000Z";
  const next = buildOperationalAlerts(canonicalData(), {}, {
    acknowledgements: { [target.id]: acknowledgedAt },
  });
  const acknowledged = next.find((alert) => alert.id === target.id);

  assert.equal(acknowledged?.acknowledgementState, "acknowledged");
  assert.equal(acknowledged?.acknowledgedAt, acknowledgedAt);
});

test("uses configurable thresholds and per-alert enable switches", () => {
  const alerts = buildOperationalAlerts(canonicalData(), {
    enabled: {
      MISSING_OPERATOR: false,
      MISSING_MACHINE_DATA: false,
    },
    thresholds: {
      excessiveDowntimeSeconds: 10_000,
      systemOffSeconds: 1_000,
      minimumProductionAttainment: 0.05,
      maximumCycleTimeRatio: 10,
      highProductionLossQuantity: 500,
      highMachineHourLoss: 5_000,
    },
  });

  const types = new Set(alerts.map((alert) => alert.type));
  for (const disabled of [
    "EXCESSIVE_DOWNTIME",
    "SYSTEM_OFF",
    "PRODUCTION_BELOW_TARGET",
    "ABNORMAL_CYCLE_TIME",
    "HIGH_PRODUCTION_LOSS",
    "HIGH_MACHINE_HOUR_LOSS",
    "MISSING_OPERATOR",
    "MISSING_MACHINE_DATA",
  ]) {
    assert.equal(types.has(disabled), false);
  }
});

test("normalizes invalid threshold values to safe defaults", () => {
  const normalized = normalizeOperationalAlertConfig({
    thresholds: {
      excessiveDowntimeSeconds: -1,
      minimumProductionAttainment: Number.NaN,
    },
  });
  assert.equal(
    normalized.thresholds.excessiveDowntimeSeconds,
    DEFAULT_OPERATIONAL_ALERT_CONFIG.thresholds.excessiveDowntimeSeconds,
  );
  assert.equal(
    normalized.thresholds.minimumProductionAttainment,
    DEFAULT_OPERATIONAL_ALERT_CONFIG.thresholds.minimumProductionAttainment,
  );
});
