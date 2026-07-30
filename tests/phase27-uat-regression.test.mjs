import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as XLSX from "xlsx";

import {
  getMmsFilterOptions,
  queryMmsAnalytics,
} from "../app/analytics-query-engine.ts";
import {
  resolveCalculationPolicy,
} from "../app/calculation-policy.ts";
import {
  generateManagementSummaryWithFallback,
} from "../app/ai-management-summary-provider.ts";
import {
  buildVerifiedManagementEvidence,
} from "../app/management-summary-engine.ts";
import {
  ExcelMmsDataSource,
  MmsDataSourceError,
  validateMmsWorkbookUpload,
} from "../app/mms-data-source.ts";
import {
  buildOperationalAlerts,
  reconcileOperationalAlertLifecycle,
} from "../app/operational-alert-engine.ts";
import {
  buildFilteredReportWorkbook,
} from "../app/report-export.ts";
import {
  MmsSynchronizationEngine,
} from "../app/synchronization-engine.ts";
import { exactCanonicalFixture } from "./phase12-fixture.mjs";

const PROVISIONAL_POLICY_ID = "mms-reconciled-99-37-v1";

test("Phase 27 filter matrix keeps every output on one record selection", () => {
  const data = exactCanonicalFixture();
  const options = getMmsFilterOptions(data);
  const cases = [
    { date: options.dates[0] },
    { dateRange: { from: options.dates[0], to: options.dates.at(-1) } },
    { shift: options.shifts },
    { machine: options.machines },
    { product: options.products },
    { operator: options.operators },
    { downtimeReason: options.downtimeReasons },
    { alertSeverity: options.alertSeverities },
    { dataQualityStatus: options.dataQualityStatuses },
  ];
  for (const filters of cases) {
    const analytics = queryMmsAnalytics(data, filters);
    assert.equal(
      analytics.production.recordCount,
      analytics.records.productionIntervals.length,
    );
    assert.equal(
      analytics.downtime.period.rawEventCount,
      analytics.records.downtimeEvents.length,
    );
    assert.equal(
      analytics.policyCalculations.production.length,
      analytics.records.productionIntervals.length,
    );
    assert.equal(analytics.calculationPolicy.status, "confirmed");
  }
});

test("Phase 27 workbook boundary conditions fail safely", async () => {
  assert.doesNotThrow(() =>
    validateMmsWorkbookUpload("factory-export.xls", 1_024),
  );
  assert.doesNotThrow(() =>
    validateMmsWorkbookUpload("factory-export.xlsx", 1_024),
  );
  assert.throws(
    () => validateMmsWorkbookUpload("unrelated.csv", 1_024),
    /Only .xls and .xlsx/,
  );
  assert.throws(
    () => validateMmsWorkbookUpload("empty.xlsx", 0),
    /empty/,
  );
  assert.throws(
    () => validateMmsWorkbookUpload("oversized.xlsx", 2_048, 1_024),
    /safety limit/,
  );

  const invalidSource = new ExcelMmsDataSource(
    "invalid.xlsx",
    new ArrayBuffer(16),
  );
  await assert.rejects(
    () => invalidSource.load(),
    /could not be read or normalized|unrelated|required/i,
  );
});

test("Phase 27 alerts support acknowledgement, deduplication, and resolution", () => {
  const data = exactCanonicalFixture();
  const analytics = queryMmsAnalytics(data);
  const first = buildOperationalAlerts(data, {}, {
    analytics,
    synchronization: {
      sourceKind: "database",
      sourceName: "Read-only MySQL",
      status: "error",
      lastAttemptAt: "2026-07-30T00:00:00.000Z",
      error: "Database unavailable.",
    },
    generatedAt: "2026-07-30T00:00:00.000Z",
  });
  assert.equal(
    new Set(first.map((alert) => alert.id)).size,
    first.length,
  );
  assert.ok(
    first.some((alert) => alert.type === "DATABASE_SYNC_FAILURE"),
  );

  const target = first[0];
  const acknowledged = buildOperationalAlerts(data, {}, {
    analytics,
    synchronization: {
      sourceKind: "database",
      sourceName: "Read-only MySQL",
      status: "error",
      lastAttemptAt: "2026-07-30T00:05:00.000Z",
      error: "Database unavailable.",
    },
    acknowledgements: {
      [target.id]: "2026-07-30T00:05:00.000Z",
    },
    generatedAt: "2026-07-30T00:05:00.000Z",
  });
  assert.equal(
    acknowledged.find((alert) => alert.id === target.id)
      ?.acknowledgementState,
    "acknowledged",
  );

  const resolved = reconcileOperationalAlertLifecycle(
    [],
    [target],
    "2026-07-30T00:10:00.000Z",
  );
  assert.equal(resolved[0].status, "resolved");
});

test("Phase 27 AI fallback remains factual and works without a network", async () => {
  const analytics = queryMmsAnalytics(exactCanonicalFixture());
  const evidence = buildVerifiedManagementEvidence(
    analytics,
    "2026-07-30T00:00:00.000Z",
  );
  let networkCalls = 0;
  const result = await generateManagementSummaryWithFallback(evidence, {
    fetchImplementation: async () => {
      networkCalls += 1;
      throw new Error("Network unavailable.");
    },
  });

  assert.equal(networkCalls, 0);
  assert.equal(result.summary.source, "deterministic");
  assert.equal(result.summary.evidenceDigest, evidence.evidenceDigest);
  assert.match(result.fallbackReason ?? "", /deterministic verified summary/);
});

test("Phase 27 synchronization exposes source failures and retries safely", async () => {
  let attempts = 0;
  const source = {
    kind: "database",
    name: "Read-only MySQL",
    async load() {
      attempts += 1;
      throw new MmsDataSourceError(
        "CONNECTION_ERROR",
        "Database unavailable.",
        { retryable: true },
      );
    },
  };
  const engine = new MmsSynchronizationEngine(source, {
    retryDelaysMs: [1, 1],
    wait: async () => {},
  });

  await engine.syncNow();
  assert.equal(attempts, 3);
  assert.equal(engine.state.status, "error");
  assert.equal(engine.state.consecutiveFailures, 1);
  assert.equal(engine.state.history.at(-1)?.status, "failed");
  assert.match(engine.state.error ?? "", /Database unavailable/);
});

test("Phase 27 provisional formulas remain warning-only and production-blocked", () => {
  const comparison = resolveCalculationPolicy({
    policyId: PROVISIONAL_POLICY_ID,
    allowProvisional: true,
    runtimeEnvironment: "test",
  });
  assert.equal(comparison.status, "provisional");
  assert.match(comparison.warning ?? "", /not official MMS results/);
  assert.throws(
    () =>
      resolveCalculationPolicy({
        policyId: PROVISIONAL_POLICY_ID,
        allowProvisional: true,
        runtimeEnvironment: "production",
      }),
    /disabled in production/,
  );
});

test("Phase 27 Excel acceptance export matches filtered dashboard totals", () => {
  const data = exactCanonicalFixture();
  const analytics = queryMmsAnalytics(data, {
    date: "2024-01-01",
    machine: "MACHINE A",
    shift: "Shift 1",
  });
  const workbook = buildFilteredReportWorkbook({
    analytics,
    company: data.source.company,
    sourceFileName: data.source.fileName,
    machines: [{ name: "MACHINE A", status: "Running" }],
    generatedAt: "2026-07-30T00:00:00.000Z",
  });
  assert.equal(workbook.SheetNames.length, 11);
  const rows = XLSX.utils.sheet_to_json(
    workbook.Sheets["Daily Overview"],
    { header: 1 },
  );
  const production = rows.find((row) => row[0] === "Production");
  const policyStatus = rows.find((row) => row[0] === "Policy status");
  assert.equal(production?.[1], analytics.production.totals.producedQuantity);
  assert.equal(policyStatus?.[1], "confirmed");
});

test("Phase 27 accessibility, keyboard, responsive, and print contracts remain present", async () => {
  const [page, dashboardUi, printableReport, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-ui.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/printable-report.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /aria-label="Dashboard navigation"/);
  assert.match(page, /aria-current=/);
  assert.match(page, /aria-label="Advanced analytics filters"/);
  assert.match(page, /window\.print\(\)/);
  assert.match(dashboardUi, /aria-label=/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width: 80rem\)/);
  assert.match(css, /@media \(min-width: 120rem\)/);
  assert.match(css, /@media print/);
  assert.match(css, /size: A4 portrait/);
  assert.match(css, /table-header-group/);
  assert.match(printableReport, /aria-label="Printable MMS report"/);
  assert.match(printableReport, /print-landscape/);
});
