import assert from "node:assert/strict";
import test from "node:test";

import { MmsDataSourceError } from "../app/mms-data-source.ts";
import {
  MmsSynchronizationEngine,
  reconcileMmsSnapshots,
} from "../app/synchronization-engine.ts";

function production(overrides = {}) {
  return {
    id: "PI-1",
    sourceSheet: "Product Log Book",
    sourceRow: 1,
    date: "2026-07-01",
    startAt: "2026-07-01T06:00:00",
    endAt: "2026-07-01T18:00:00",
    startEpochMs: 1_782_886_800_000,
    endEpochMs: 1_782_930_000_000,
    machine: "M-01",
    shift: "Shift 1",
    product: {
      partNumber: "PART-1",
      partName: "Part One",
      partErpCode: "ERP-1",
      productName: "PRODUCT-A",
      erpCode: "ERP-1",
    },
    operator: { raw: "OP-1", names: ["OP-1"], isMissing: false },
    timesSeconds: {
      shift: 43_200,
      allowed: 7_200,
      operative: 28_800,
      nonOperative: 0,
      downtime: 3_600,
      systemOff: 0,
      setup: 300,
      additionalOvertime: 600,
      productionGap: 30,
    },
    cycleTimesSeconds: { standard: 288, approved: 288, achieved: 288 },
    quantities: {
      stroke: 100,
      multiplier: 2,
      reported: 200,
      calculatedFromStroke: 200,
      shiftTarget: 125,
      operativeTimeTarget: 100,
      productionLoss: -75,
      rejected: 2,
      reworked: 1,
      errorStroke: 0,
    },
    calculations: {},
    oeeComponents: {},
    costs: {
      part: 10,
      component: 4,
      machinePerHour: 600,
      operatorPerHour: 100,
    },
    scrapPerPart: 0.2,
    qualityInterlock: "YES",
    processDependency: "",
    proxy: "",
    toolRequired: "YES",
    issueCodes: [],
    isValid: true,
    ...overrides,
  };
}

function downtime(overrides = {}) {
  return {
    id: "DT-1",
    sourceSheet: "Down Time Details",
    sourceRow: 1,
    date: "2026-07-01",
    startAt: "2026-07-01T10:00:00",
    endAt: "2026-07-01T11:00:00",
    startEpochMs: 1_782_901_200_000,
    endEpochMs: 1_782_904_800_000,
    durationSeconds: 3_600,
    machine: "M-01",
    shift: "Shift 1",
    productName: "PRODUCT-A",
    operator: { raw: "OP-1", names: ["OP-1"], isMissing: false },
    reasonType: "BREAKDOWN",
    reason: "UNREPORTED",
    isUnreported: true,
    reportedMachineHourLoss: 600,
    issueCodes: ["UNREPORTED_DOWNTIME"],
    isValid: true,
    ...overrides,
  };
}

function snapshot({
  productionIntervals = [production()],
  downtimeEvents = [downtime()],
} = {}) {
  return {
    source: {
      company: "Factory",
      fileName: "sample.xlsx",
      parsedAt: "2026-07-25T00:00:00.000Z",
    },
    productionIntervals,
    downtimeEvents,
    availabilityPerformance: null,
    qualityAnalytics: null,
    downtimeAnalytics: null,
    validationIssues: [],
    importStats: {
      productRowsRead: productionIntervals.length,
      downtimeRowsRead: downtimeEvents.length,
      productTotalRowsExcluded: 0,
      downtimeTotalRowsExcluded: 0,
      errorCount: 0,
      warningCount: 0,
    },
  };
}

test("reconciles new, unchanged, modified, and removed Excel records", () => {
  const initial = reconcileMmsSnapshots(null, snapshot());
  assert.equal(initial.changes.added, 2);
  assert.equal(initial.changes.changed, true);

  const unchanged = reconcileMmsSnapshots(initial.index, snapshot());
  assert.equal(unchanged.changes.unchanged, 2);
  assert.equal(unchanged.changes.changed, false);

  const changed = reconcileMmsSnapshots(
    unchanged.index,
    snapshot({
      productionIntervals: [
        production({
          quantities: {
            ...production().quantities,
            reported: 210,
          },
        }),
        production({
          id: "PI-2",
          sourceRow: 2,
          startAt: "2026-07-02T06:00:00",
          endAt: "2026-07-02T18:00:00",
          startEpochMs: 1_782_973_200_000,
          endEpochMs: 1_783_016_400_000,
        }),
      ],
      downtimeEvents: [],
    }),
  );
  assert.equal(changed.changes.modified, 1);
  assert.equal(changed.changes.added, 1);
  assert.equal(changed.changes.removed, 1);
});

test("does not publish duplicate processing for an unchanged snapshot", async () => {
  const published = [];
  const source = {
    kind: "excel",
    name: "sample.xlsx",
    async load() {
      return snapshot();
    },
  };
  const engine = new MmsSynchronizationEngine(source, {
    onData(data, changes) {
      published.push({ data, changes });
    },
  });

  await engine.syncNow();
  await engine.syncNow();

  assert.equal(published.length, 1);
  assert.equal(engine.state.cursor.snapshotSequence, 2);
  assert.equal(engine.state.lastChanges.changed, false);
  assert.equal(engine.state.cursor.productionRecordCount, 1);
  assert.equal(engine.state.cursor.downtimeRecordCount, 1);
  assert.equal(engine.state.history.length, 2);
  assert.deepEqual(
    engine.state.history.map((entry) => entry.status),
    ["changed", "unchanged"],
  );
  assert.match(engine.state.cursor.lastProcessedRecordKey, /downtime|production/);
});

test("retries temporary connection failures and then succeeds", async () => {
  let attempts = 0;
  const waits = [];
  const source = {
    kind: "database",
    name: "MySQL MMS",
    async load() {
      attempts += 1;
      if (attempts < 3) {
        throw new MmsDataSourceError(
          "CONNECTION_ERROR",
          "Temporary connection failure.",
          { retryable: true },
        );
      }
      return snapshot();
    },
  };
  const engine = new MmsSynchronizationEngine(source, {
    retryDelaysMs: [5, 15, 30],
    async wait(milliseconds) {
      waits.push(milliseconds);
    },
  });

  await engine.syncNow();

  assert.equal(attempts, 3);
  assert.deepEqual(waits, [5, 15]);
  assert.equal(engine.state.consecutiveFailures, 0);
  assert.equal(engine.state.error, null);
});

test("marks data stale after repeated source failure beyond the threshold", async () => {
  let currentTime = new Date("2026-07-25T10:00:00.000Z");
  let shouldFail = false;
  const source = {
    kind: "database",
    name: "MySQL MMS",
    async load() {
      if (shouldFail) {
        throw new MmsDataSourceError(
          "CONNECTION_ERROR",
          "Database unavailable.",
          { retryable: false },
        );
      }
      return snapshot();
    },
  };
  const engine = new MmsSynchronizationEngine(source, {
    pollIntervalMs: 60_000,
    staleAfterMs: 300_000,
    now: () => currentTime,
  });

  await engine.syncNow();
  shouldFail = true;
  currentTime = new Date("2026-07-25T10:06:00.000Z");
  await engine.syncNow();

  assert.equal(engine.state.status, "stale");
  assert.equal(engine.state.lastSuccessfulSyncAt, "2026-07-25T10:00:00.000Z");
  assert.match(engine.state.error, /Database unavailable/);
});

test("bounds synchronization logs by count and retention", async () => {
  let currentTime = new Date("2026-07-25T10:00:00.000Z");
  const source = {
    kind: "excel",
    name: "sample.xlsx",
    async load() {
      return snapshot();
    },
  };
  const engine = new MmsSynchronizationEngine(source, {
    maxLogEntries: 3,
    logRetentionMs: 60_000,
    now: () => currentTime,
  });

  await engine.syncNow();
  await engine.syncNow();
  currentTime = new Date("2026-07-25T10:02:00.000Z");
  await engine.syncNow();

  assert.ok(engine.state.logs.length <= 3);
  assert.ok(
    engine.state.logs.every(
      (entry) =>
        new Date(entry.timestamp).getTime() >=
        currentTime.getTime() - 60_000,
    ),
  );
});

test("bounds import history and records failed attempts safely", async () => {
  let currentTime = new Date("2026-07-25T10:00:00.000Z");
  let fail = false;
  const source = {
    kind: "excel",
    name: "sample.xlsx",
    async load() {
      if (fail) {
        throw new MmsDataSourceError("FILE_ERROR", "Workbook unavailable.");
      }
      return snapshot();
    },
  };
  const engine = new MmsSynchronizationEngine(source, {
    maxHistoryEntries: 2,
    historyRetentionMs: 60_000,
    now: () => currentTime,
  });
  await engine.syncNow();
  currentTime = new Date("2026-07-25T10:00:30.000Z");
  await engine.syncNow();
  fail = true;
  currentTime = new Date("2026-07-25T10:00:45.000Z");
  await engine.syncNow();
  assert.equal(engine.state.history.length, 2);
  assert.equal(engine.state.history.at(-1)?.status, "failed");
  assert.equal(engine.state.history.at(-1)?.error, "Workbook unavailable.");
});
