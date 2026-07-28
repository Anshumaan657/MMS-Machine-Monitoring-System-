import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMmsVerificationReport,
  verificationReportMarkdown,
} from "../app/verification-engine.ts";
import { exactCanonicalFixture } from "./phase12-fixture.mjs";

test("scores reported workbook calculations and reaches the acceptance target", () => {
  const report = buildMmsVerificationReport(exactCanonicalFixture(), {
    generatedAt: "2026-07-26T00:00:00.000Z",
  });
  assert.equal(report.overall.agreementPercentage, 100);
  assert.equal(report.overall.status, "provisional_pass");
  assert.equal(report.overall.final3dSignoffRequired, true);
  assert.equal(report.overall.mismatches, 0);
  assert.equal(
    report.internalChecks.every((check) => check.status === "pass"),
    true,
  );
});

test("documents mismatches without counting missing references as matches", () => {
  const data = exactCanonicalFixture();
  data.productionIntervals[0].quantities.reported = 175;
  data.productionIntervals[0].cycleTimesSeconds.achieved = null;
  const report = buildMmsVerificationReport(data);
  assert.ok(report.overall.mismatches >= 1);
  assert.ok(report.overall.notComparable >= 1);
  assert.equal(report.overall.status, "below_target");
  assert.ok(
    report.corrections.some(
      (correction) => correction.metric === "actual_quantity",
    ),
  );
  assert.match(
    verificationReportMarkdown(report),
    /Final acceptance: pending selected-result confirmation by 3D/,
  );
});

test("compares selected dashboard results supplied by 3D", () => {
  const report = buildMmsVerificationReport(exactCanonicalFixture(), {
    selected3dReferences: [
      {
        id: "machine-a-shift-one",
        filters: {
          dateFrom: "2024-01-01",
          dateTo: "2024-01-01",
          shift: "Shift 1",
          machine: "MACHINE A",
        },
        expected: {
          production: 200,
          shiftTarget: 2_000,
          availabilityPercent: 10,
          performancePercent: 100,
          downtimeHours: 0.5,
          machineHourLoss: 300,
        },
      },
    ],
  });
  assert.equal(report.selected3dVerification.providedCases, 1);
  assert.equal(report.selected3dVerification.comparableChecks, 6);
  assert.equal(report.selected3dVerification.agreementPercentage, 100);
  assert.equal(report.selected3dVerification.status, "meets_target");
});

test("marks final 3D comparison pending when no selected references exist", () => {
  const report = buildMmsVerificationReport(exactCanonicalFixture());
  assert.equal(report.selected3dVerification.providedCases, 0);
  assert.equal(report.selected3dVerification.status, "pending_reference");
  assert.equal(report.selected3dVerification.agreementPercentage, null);
});
