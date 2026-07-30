import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPhase29AcceptanceReport,
  PHASE29_REQUIRED_SCENARIOS,
  phase29MetricSnapshot,
} from "../app/phase29-acceptance-engine.ts";
import { exactCanonicalFixture } from "./phase12-fixture.mjs";

const FILTERS = {
  date: "2024-01-01",
  machines: ["MACHINE A"],
  shifts: ["Shift 1"],
};

function confirmedInput({
  expected,
  finalSignoff = {
    status: "approved",
    approvedBy: "3D verifier",
    approvedAt: "2026-07-30T00:00:00.000Z",
    statement: "Selected results approved.",
  },
  mismatchExplanations,
} = {}) {
  const data = exactCanonicalFixture();
  const snapshot = expected ?? phase29MetricSnapshot(data, FILTERS);
  const metrics = Object.entries(snapshot).filter(([, value]) =>
    typeof value === "number"
  );
  const cases = PHASE29_REQUIRED_SCENARIOS.map((scenario, index) => ({
    id: `CASE-${index + 1}`,
    scenario,
    filters: FILTERS,
    expected: Object.fromEntries(
      metrics.filter((_, metricIndex) => metricIndex % 8 === index),
    ),
    mismatchExplanations,
    evidenceReferences: [`private-reference:${scenario}`],
  }));

  // The gate requires at least 20 comparisons. The first representative case
  // exercises every metric while the remaining cases prove scenario coverage.
  cases[0].expected = { ...snapshot };

  return {
    schemaVersion: "1.0",
    policy: {
      id: "mms-direct-quantity-v2",
      version: "2.0.0",
      status: "confirmed",
      confirmationReference: "verification/PHASE_29_CONFIRMATION.md",
    },
    acceptanceTargetPercentage: 95,
    minimumComparableChecks: 20,
    cases,
    finalSignoff,
  };
}

test("accepts confirmed policy after representative coverage and sign-off", () => {
  const data = exactCanonicalFixture();
  const report = buildPhase29AcceptanceReport(
    data,
    confirmedInput(),
    { generatedAt: "2026-07-30T00:00:00.000Z" },
  );

  assert.equal(report.policyAudit.passed, true);
  assert.equal(report.coverage.missingScenarios.length, 0);
  assert.ok(report.results.comparableChecks >= 20);
  assert.equal(report.results.agreementPercentage, 100);
  assert.equal(report.status, "accepted");
  assert.equal(report.strictPass, true);
});

test("keeps acceptance pending when 3D reference values are absent", () => {
  const data = exactCanonicalFixture();
  const input = confirmedInput();
  input.cases = input.cases.map((item) => ({ ...item, expected: {} }));
  input.finalSignoff = { status: "pending" };

  const report = buildPhase29AcceptanceReport(data, input);

  assert.equal(report.status, "pending_reference");
  assert.equal(report.strictPass, false);
});

test("blocks acceptance when selected-case agreement is below 95 percent", () => {
  const data = exactCanonicalFixture();
  const snapshot = phase29MetricSnapshot(data, FILTERS);
  const incorrect = Object.fromEntries(
    Object.entries(snapshot).map(([metric, value]) => [
      metric,
      typeof value === "number" ? value + 1000 : 1000,
    ]),
  );
  const input = confirmedInput({
    expected: incorrect,
    mismatchExplanations: Object.fromEntries(
      Object.keys(incorrect).map((metric) => [
        metric,
        "Deliberately different verification value.",
      ]),
    ),
  });

  const report = buildPhase29AcceptanceReport(data, input);

  assert.equal(report.results.agreementPercentage, 0);
  assert.equal(report.status, "below_target");
  assert.equal(report.strictPass, false);
});

test("requires written final sign-off even after 100 percent agreement", () => {
  const data = exactCanonicalFixture();
  const report = buildPhase29AcceptanceReport(
    data,
    confirmedInput({ finalSignoff: { status: "pending" } }),
  );

  assert.equal(report.results.agreementPercentage, 100);
  assert.equal(report.status, "pending_signoff");
  assert.equal(report.strictPass, false);
});
