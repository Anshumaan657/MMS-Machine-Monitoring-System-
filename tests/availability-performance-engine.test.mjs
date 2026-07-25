import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateAvailabilityPerformance,
  calculateAvailabilityPerformance,
  classifyOeeExclusion,
} from "../app/availability-performance-engine.ts";

function record(id, machine, shift, date, input) {
  return {
    id,
    machine,
    shift,
    date,
    ...calculateAvailabilityPerformance(input),
  };
}

test("calculates planned production time, Availability, and Performance", () => {
  const result = calculateAvailabilityPerformance({
    shiftTimeSeconds: 43_200,
    allowedTimeSeconds: 7_200,
    operativeTimeSeconds: 28_800,
    producedQuantity: 240,
    operativeTimeTarget: 300,
  });

  assert.equal(result.plannedProductionTimeSeconds, 36_000);
  assert.equal(result.availability, 0.8);
  assert.equal(result.performance, 0.8);
  assert.deepEqual(result.quality, { status: "pending", value: null });
  assert.deepEqual(result.finalOee, { status: "pending", value: null });
  assert.equal(result.isEligible, true);
});

test("subtracts planned breaks through Allowed Time", () => {
  const result = calculateAvailabilityPerformance({
    shiftTimeSeconds: 43_200,
    allowedTimeSeconds: 7_200,
    operativeTimeSeconds: 36_000,
    producedQuantity: 100,
    operativeTimeTarget: 100,
  });

  assert.equal(result.plannedProductionTimeSeconds, 36_000);
  assert.equal(result.availability, 1);
});

test("classifies only explicit confirmed exclusion markers", () => {
  assert.equal(classifyOeeExclusion(["PLANNED BREAK"]), "planned_break");
  assert.equal(classifyOeeExclusion(["Holiday"]), "holiday");
  assert.equal(
    classifyOeeExclusion(["NO PRODUCTION PLAN"]),
    "no_production_plan",
  );
  assert.equal(classifyOeeExclusion(["NO LOAD"]), "no_load");
  assert.equal(classifyOeeExclusion(["MARSH PRELOAD 41MM"]), null);
  assert.equal(classifyOeeExclusion(["NO PRODUCT"]), null);
});

test("excludes holidays, no-plan, no-load, and planned-break records", () => {
  for (const exclusionReason of [
    "planned_break",
    "holiday",
    "no_production_plan",
    "no_load",
  ]) {
    const result = calculateAvailabilityPerformance({
      shiftTimeSeconds: 43_200,
      allowedTimeSeconds: 0,
      operativeTimeSeconds: 0,
      producedQuantity: 0,
      operativeTimeTarget: 100,
      exclusionReason,
    });

    assert.equal(result.isEligible, false);
    assert.equal(result.exclusionReason, exclusionReason);
    assert.equal(result.availability, null);
    assert.equal(result.performance, null);
    assert.ok(result.issueCodes.includes("EXCLUDED_FROM_OEE"));
  }
});

test("handles missing values, invalid planned time, and zero denominators", () => {
  const missing = calculateAvailabilityPerformance({
    shiftTimeSeconds: null,
    allowedTimeSeconds: null,
    operativeTimeSeconds: null,
    producedQuantity: null,
    operativeTimeTarget: null,
  });
  assert.equal(missing.plannedProductionTimeSeconds, null);
  assert.equal(missing.availability, null);
  assert.equal(missing.performance, null);
  assert.ok(missing.issueCodes.includes("MISSING_PLANNED_PRODUCTION_TIME"));
  assert.ok(missing.issueCodes.includes("MISSING_OPERATIVE_TIME"));
  assert.ok(missing.issueCodes.includes("MISSING_PRODUCED_QUANTITY"));
  assert.ok(missing.issueCodes.includes("MISSING_OPERATIVE_TIME_TARGET"));

  const invalid = calculateAvailabilityPerformance({
    shiftTimeSeconds: 3_600,
    allowedTimeSeconds: 7_200,
    operativeTimeSeconds: 0,
    producedQuantity: 0,
    operativeTimeTarget: 0,
  });
  assert.equal(invalid.plannedProductionTimeSeconds, null);
  assert.equal(invalid.availability, null);
  assert.equal(invalid.performance, null);
  assert.ok(invalid.issueCodes.includes("ALLOWED_TIME_EXCEEDS_SHIFT_TIME"));
  assert.ok(invalid.issueCodes.includes("ZERO_OPERATIVE_TIME_TARGET"));

  const zeroPlanned = calculateAvailabilityPerformance({
    shiftTimeSeconds: 0,
    allowedTimeSeconds: 0,
    operativeTimeSeconds: 600,
    producedQuantity: 10,
    operativeTimeTarget: 10,
  });
  assert.equal(zeroPlanned.availability, null);
  assert.ok(zeroPlanned.issueCodes.includes("ZERO_PLANNED_PRODUCTION_TIME"));
});

test("flags component values above 100 percent without hiding them", () => {
  const result = calculateAvailabilityPerformance({
    shiftTimeSeconds: 100,
    allowedTimeSeconds: 0,
    operativeTimeSeconds: 110,
    producedQuantity: 120,
    operativeTimeTarget: 100,
  });

  assert.equal(result.availability, 1.1);
  assert.equal(result.performance, 1.2);
  assert.ok(result.issueCodes.includes("AVAILABILITY_ABOVE_100_PERCENT"));
  assert.ok(result.issueCodes.includes("PERFORMANCE_ABOVE_100_PERCENT"));
});

test("calculates weighted machine, shift, daily, and period results", () => {
  const records = [
    record("1", "M-01", "Shift 1", "2026-07-01", {
      shiftTimeSeconds: 43_200,
      allowedTimeSeconds: 7_200,
      operativeTimeSeconds: 28_800,
      producedQuantity: 240,
      operativeTimeTarget: 300,
    }),
    record("2", "M-01", "Shift 1", "2026-07-01", {
      shiftTimeSeconds: 0,
      allowedTimeSeconds: 0,
      operativeTimeSeconds: 3_600,
      producedQuantity: 30,
      operativeTimeTarget: 37.5,
    }),
    record("3", "M-02", "Shift 2", "2026-07-01", {
      shiftTimeSeconds: 43_200,
      allowedTimeSeconds: 7_200,
      operativeTimeSeconds: 18_000,
      producedQuantity: 100,
      operativeTimeTarget: 200,
    }),
    record("4", "M-02", "Shift 2", "2026-07-01", {
      shiftTimeSeconds: 43_200,
      allowedTimeSeconds: 0,
      operativeTimeSeconds: 43_200,
      producedQuantity: 1_000,
      operativeTimeTarget: 1_000,
      exclusionReason: "holiday",
    }),
  ];
  const analytics = aggregateAvailabilityPerformance(records);
  const machineOne = analytics.machineWise.find(
    (item) => item.machine === "M-01",
  );
  const shiftTwo = analytics.shiftWise.find(
    (item) => item.shift === "Shift 2",
  );

  assert.equal(machineOne.availability, 0.9);
  assert.equal(machineOne.performance, 0.8);
  assert.equal(shiftTwo.availability, 0.5);
  assert.equal(shiftTwo.performance, 0.5);
  assert.equal(shiftTwo.excludedRecordCount, 1);
  assert.equal(analytics.daily[0].availability, 0.7);
  assert.equal(analytics.daily[0].performance, 0.68837209);
  assert.equal(analytics.period.availability, 0.7);
  assert.equal(analytics.period.performance, 0.68837209);
  assert.deepEqual(analytics.period.quality, {
    status: "pending",
    value: null,
  });
  assert.deepEqual(analytics.period.finalOee, {
    status: "pending",
    value: null,
  });
});
