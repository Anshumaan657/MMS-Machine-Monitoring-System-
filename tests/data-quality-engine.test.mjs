import assert from "node:assert/strict";
import test from "node:test";

import { buildAdvancedDataQualityAnalytics } from "../app/data-quality-engine.ts";
import { exactCanonicalFixture } from "./phase12-fixture.mjs";

function findingFixture() {
  const data = structuredClone(exactCanonicalFixture());
  const production = data.productionIntervals[0];
  production.endEpochMs = Date.parse("2026-07-28T10:00:00.000Z");
  production.endAt = "2026-07-28T10:00:00";
  production.startEpochMs = production.endEpochMs - 3_600_000;
  production.startAt = "2026-07-28T09:00:00";
  production.date = "2026-07-28";
  production.quantities.reported = 0;
  production.quantities.stroke = 100;
  production.quantities.multiplier = null;
  production.quantities.calculatedFromStroke = 200;
  production.quantities.rejected = null;
  production.quantities.reworked = null;
  production.cycleTimesSeconds.standard = null;
  production.product.productName = "NULL TURN";
  production.operator = { raw: "NO OPERATOR", names: [], isMissing: true };
  production.costs.machinePerHour = 700;
  production.issueCodes.push(
    "QUANTITY_MISMATCH",
    "OVERLAPPING_PRODUCTION_INTERVAL",
    "DUPLICATE_PRODUCTION_INTERVAL",
  );

  const second = structuredClone(production);
  second.id = "PI-SECOND";
  second.sourceRow += 1;
  second.quantities.reported = 100;
  second.quantities.stroke = 50;
  second.quantities.multiplier = 1;
  second.costs.machinePerHour = 600;
  second.issueCodes = [];
  second.endEpochMs -= 60_000;
  data.productionIntervals.push(second);

  const downtime = data.downtimeEvents[0];
  downtime.durationSeconds = 0;
  downtime.reason = "UNREPORTED";
  downtime.isUnreported = true;
  downtime.operator = { raw: "", names: [], isMissing: true };
  downtime.issueCodes.push(
    "OVERLAPPING_DOWNTIME_EVENT",
    "DUPLICATE_DOWNTIME_EVENT",
  );
  return data;
}

test("emits record-level evidence for every required quality category", () => {
  const analytics = buildAdvancedDataQualityAnalytics(findingFixture(), {
    nowEpochMs: Date.parse("2026-07-28T10:05:00.000Z"),
    staleAfterMs: 60_000,
  });
  const codes = new Set(analytics.findings.map((finding) => finding.code));

  for (const code of [
    "REPORTED_QUANTITY_MISMATCH",
    "ZERO_QUANTITY_WITH_POSITIVE_STROKE",
    "IMPLICIT_PRODUCT_MULTIPLIER",
    "MISSING_MULTIPLIER",
    "MISSING_STANDARD_CYCLE_TIME",
    "MISSING_OPERATOR",
    "PRODUCT_PLACEHOLDER",
    "MISSING_DOWNTIME_REASON",
    "OVERLAPPING_INTERVAL",
    "DUPLICATE_RECORD",
    "INCOMPLETE_ACTIVE_SHIFT",
    "INCONSISTENT_MACHINE_HOUR_COST",
    "MISSING_REJECTION_ENTRY",
    "MISSING_REWORK_ENTRY",
    "STALE_OR_DELAYED_DATA",
    "INVALID_OR_ZERO_DURATION",
  ]) {
    assert.ok(codes.has(code), `Expected ${code}`);
  }
});

test("every finding contains traceable evidence and a recommended action", () => {
  const analytics = buildAdvancedDataQualityAnalytics(findingFixture(), {
    nowEpochMs: Date.parse("2026-07-28T10:05:00.000Z"),
    staleAfterMs: 60_000,
  });

  for (const finding of analytics.findings) {
    assert.ok(finding.id);
    assert.ok(["error", "warning", "information"].includes(finding.severity));
    assert.ok(finding.machine);
    assert.ok(finding.shift);
    assert.ok(finding.product);
    assert.ok(finding.sourceSheet);
    assert.ok(finding.sourceRow > 0);
    assert.ok(finding.recordId);
    assert.ok(finding.fieldName);
    assert.ok(finding.expectedValue != null);
    assert.ok(finding.recommendedAction.length > 10);
  }
});

test("does not mutate or silently correct canonical records", () => {
  const data = findingFixture();
  const before = structuredClone(data);
  buildAdvancedDataQualityAnalytics(data, {
    nowEpochMs: Date.parse("2026-07-28T10:05:00.000Z"),
  });
  assert.deepEqual(data, before);
});
