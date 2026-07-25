import assert from "node:assert/strict";
import test from "node:test";

import { buildDowntimeAnalytics } from "../app/downtime-engine.ts";

function context(overrides = {}) {
  return {
    id: "P-1",
    machine: "M-01",
    shift: "Shift 1",
    date: "2026-07-01",
    startEpochMs: 0,
    endEpochMs: 100_000_000,
    productName: "PART-A",
    additionalOvertimeThresholdSeconds: 300,
    machineHourCost: 600,
    reportedNonOperativeSeconds: 120,
    reportedSystemOffSeconds: 60,
    ...overrides,
  };
}

function event(id, startSeconds, durationSeconds, overrides = {}) {
  return {
    id,
    machine: "M-01",
    shift: "Shift 1",
    date: "2026-07-01",
    startEpochMs: startSeconds * 1_000,
    endEpochMs: (startSeconds + durationSeconds) * 1_000,
    startAt: `start-${startSeconds}`,
    endAt: `end-${startSeconds + durationSeconds}`,
    durationSeconds,
    productName: "PART-A",
    reasonType: "BREAKDOWN",
    reason: "Tool failure",
    isUnreported: false,
    hasOverlap: false,
    reportedMachineHourLoss: null,
    ...overrides,
  };
}

test("applies the Additional Over Time threshold", () => {
  const analytics = buildDowntimeAnalytics(
    [event("short", 0, 300), event("long", 600, 301)],
    [context()],
    { mergeConsecutiveEvents: false },
  );

  assert.equal(analytics.events[0].classification, "short_non_operative");
  assert.equal(analytics.events[1].classification, "downtime");
});

test("keeps System Off separate from downtime and non-operative time", () => {
  const analytics = buildDowntimeAnalytics(
    [
      event("off", 0, 600, {
        reasonType: "SYSTEM OFF",
        reason: "Communication unavailable",
      }),
    ],
    [context()],
  );

  assert.equal(analytics.events[0].classification, "system_off");
  assert.equal(analytics.period.totals.systemOffEventSeconds, 600);
  assert.equal(analytics.period.totals.downtimeSeconds, 0);
  assert.equal(analytics.period.totals.shortNonOperativeSeconds, 0);
  assert.equal(analytics.period.totals.reportedSystemOffSeconds, 60);
});

test("calculates machine-hour loss from downtime hours and cost", () => {
  const analytics = buildDowntimeAnalytics(
    [
      event("loss", 0, 3_600, {
        reportedMachineHourLoss: 600,
      }),
    ],
    [context()],
  );
  const result = analytics.events[0];

  assert.equal(result.classification, "downtime");
  assert.equal(result.machineHourCost, 600);
  assert.equal(result.calculatedMachineHourLoss, 600);
  assert.equal(result.financialLossComparison.matches, true);
});

test("merges exactly consecutive compatible events without deleting raw events", () => {
  const analytics = buildDowntimeAnalytics(
    [event("D-1", 0, 600), event("D-2", 600, 600)],
    [context()],
  );

  assert.equal(analytics.events.length, 2);
  assert.equal(analytics.mergedEvents.length, 1);
  assert.deepEqual(analytics.mergedEvents[0].sourceEventIds, ["D-1", "D-2"]);
  assert.equal(analytics.mergedEvents[0].sourceEventCount, 2);
  assert.equal(analytics.mergedEvents[0].durationSeconds, 1_200);
  assert.equal(analytics.mergedEvents[0].calculatedMachineHourLoss, 200);
  assert.ok(
    analytics.mergedEvents[0].issueCodes.includes(
      "MERGED_CONSECUTIVE_EVENTS",
    ),
  );
});

test("does not merge overlapping events and flags them", () => {
  const analytics = buildDowntimeAnalytics(
    [
      event("D-1", 0, 600, { hasOverlap: true }),
      event("D-2", 300, 600, { hasOverlap: true }),
    ],
    [context()],
  );

  assert.equal(analytics.mergedEvents.length, 2);
  assert.equal(analytics.period.overlappingEventCount, 2);
  assert.ok(
    analytics.events.every((item) =>
      item.issueCodes.includes("OVERLAPPING_DOWNTIME_RECORD"),
    ),
  );
});

test("flags missing context and UNREPORTED reasons", () => {
  const analytics = buildDowntimeAnalytics(
    [
      event("D-1", 0, 600, {
        machine: "UNKNOWN",
        reasonType: "UNREPORTED",
        reason: "UNREPORTED",
        isUnreported: true,
      }),
    ],
    [],
  );
  const result = analytics.events[0];

  assert.equal(result.classification, "unclassified");
  assert.ok(result.issueCodes.includes("CONTEXT_NOT_FOUND"));
  assert.ok(
    result.issueCodes.includes("MISSING_ADDITIONAL_OVERTIME_THRESHOLD"),
  );
  assert.ok(result.issueCodes.includes("UNREPORTED_REASON"));
});

test("creates machine rankings, reason Pareto, and financial summaries", () => {
  const contexts = [
    context(),
    context({
      id: "P-2",
      machine: "M-02",
      shift: "Shift 2",
      date: "2026-07-02",
      productName: "PART-B",
      machineHourCost: 300,
      reportedNonOperativeSeconds: 30,
      reportedSystemOffSeconds: 15,
    }),
  ];
  const events = [
    event("D-1", 0, 3_600),
    event("D-2", 7_200, 1_800, { reason: "Power failure" }),
    event("D-3", 0, 1_800, {
      machine: "M-02",
      shift: "Shift 2",
      date: "2026-07-02",
      productName: "PART-B",
      reason: "Tool failure",
    }),
  ];
  const analytics = buildDowntimeAnalytics(events, contexts, {
    mergeConsecutiveEvents: false,
  });

  assert.equal(analytics.machineWise.length, 2);
  assert.equal(analytics.shiftWise.length, 2);
  assert.equal(analytics.daily.length, 2);
  assert.equal(analytics.machineRanking[0].machine, "M-01");
  assert.equal(analytics.machineRanking[0].totals.downtimeSeconds, 5_400);
  assert.equal(analytics.period.totals.downtimeSeconds, 7_200);
  assert.equal(analytics.period.totals.calculatedMachineHourLoss, 1_050);
  assert.equal(analytics.period.totals.reportedNonOperativeSeconds, 150);
  assert.equal(analytics.period.totals.reportedSystemOffSeconds, 75);
  assert.equal(analytics.reasonPareto[0].reason, "Tool failure");
  assert.equal(analytics.reasonPareto[0].downtimeSeconds, 5_400);
  assert.equal(analytics.reasonPareto.at(-1).cumulativePercentage, 100);
});
