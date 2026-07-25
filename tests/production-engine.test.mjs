import assert from "node:assert/strict";
import test from "node:test";

import { calculateProductionMetrics } from "../app/production-engine.ts";

test("calculates every confirmed MMS production formula", () => {
  const result = calculateProductionMetrics({
    stroke: 10,
    multiplier: 2.5,
    reportedQuantity: 25,
    operativeTimeSeconds: 3_600,
    standardCycleTimeSeconds: 120,
    approvedCycleTimeSeconds: 125,
    reportedAchievedCycleTimeSeconds: 144,
    reportedOperativeTimeTarget: 30,
    shiftTarget: 100,
    reportedProductionLoss: 75,
  });

  assert.equal(result.actualQuantity, 25);
  assert.equal(result.producedQuantityUsed, 25);
  assert.equal(result.quantitySource, "stroke_x_multiplier");
  assert.equal(result.achievedCycleTimeSeconds, 144);
  assert.equal(result.operativeTimeTarget, 30);
  assert.equal(result.productionLoss, 75);
  assert.equal(result.comparisons.quantity.matches, true);
  assert.equal(result.comparisons.achievedCycleTime.matches, true);
  assert.equal(result.comparisons.operativeTimeTarget.matches, true);
  assert.equal(result.comparisons.productionLoss.matches, true);
  assert.deepEqual(result.issueCodes, []);
});

test("detects a mismatch between reported Qty and Stroke times M. Factor", () => {
  const result = calculateProductionMetrics({
    stroke: 10,
    multiplier: 2.5,
    reportedQuantity: 24,
    operativeTimeSeconds: 3_600,
    standardCycleTimeSeconds: 120,
    shiftTarget: 100,
  });

  assert.equal(result.actualQuantity, 25);
  assert.equal(result.producedQuantityUsed, 25);
  assert.equal(result.comparisons.quantity.difference, 1);
  assert.equal(result.comparisons.quantity.absoluteDifference, 1);
  assert.equal(result.comparisons.quantity.matches, false);
  assert.ok(result.issueCodes.includes("QUANTITY_MISMATCH"));
});

test("uses reported Qty as a fallback when stroke inputs are missing", () => {
  const result = calculateProductionMetrics({
    stroke: null,
    multiplier: null,
    reportedQuantity: 20,
    operativeTimeSeconds: 3_600,
    standardCycleTimeSeconds: 120,
    shiftTarget: 100,
  });

  assert.equal(result.actualQuantity, null);
  assert.equal(result.producedQuantityUsed, 20);
  assert.equal(result.quantitySource, "reported");
  assert.equal(result.achievedCycleTimeSeconds, 180);
  assert.equal(result.operativeTimeTarget, 30);
  assert.equal(result.productionLoss, 80);
  assert.equal(result.comparisons.quantity.matches, null);
});

test("handles zero divisors without returning Infinity or NaN", () => {
  const result = calculateProductionMetrics({
    stroke: 0,
    multiplier: 2,
    reportedQuantity: 0,
    operativeTimeSeconds: 3_600,
    standardCycleTimeSeconds: 0,
    shiftTarget: 100,
  });

  assert.equal(result.actualQuantity, 0);
  assert.equal(result.achievedCycleTimeSeconds, null);
  assert.equal(result.operativeTimeTarget, null);
  assert.equal(result.productionLoss, 100);
  assert.ok(result.issueCodes.includes("ZERO_PRODUCED_QUANTITY"));
  assert.ok(result.issueCodes.includes("ZERO_STANDARD_CYCLE_TIME"));
});

test("returns null calculations and explicit issues for missing values", () => {
  const result = calculateProductionMetrics({
    stroke: null,
    multiplier: null,
    reportedQuantity: null,
    operativeTimeSeconds: null,
    standardCycleTimeSeconds: null,
    shiftTarget: null,
  });

  assert.equal(result.actualQuantity, null);
  assert.equal(result.producedQuantityUsed, null);
  assert.equal(result.quantitySource, "unavailable");
  assert.equal(result.achievedCycleTimeSeconds, null);
  assert.equal(result.operativeTimeTarget, null);
  assert.equal(result.productionLoss, null);
  assert.ok(result.issueCodes.includes("MISSING_PRODUCED_QUANTITY"));
  assert.ok(result.issueCodes.includes("MISSING_OPERATIVE_TIME"));
  assert.ok(result.issueCodes.includes("MISSING_STANDARD_CYCLE_TIME"));
  assert.ok(result.issueCodes.includes("MISSING_SHIFT_TARGET"));
});

test("standardizes cycle-time values in seconds and rejects invalid inputs", () => {
  const result = calculateProductionMetrics({
    stroke: 4,
    multiplier: 2,
    reportedQuantity: 8,
    operativeTimeSeconds: 960,
    standardCycleTimeSeconds: 120,
    approvedCycleTimeSeconds: 125,
    reportedAchievedCycleTimeSeconds: 120,
    shiftTarget: -1,
    reportedProductionLoss: -2,
  });

  assert.deepEqual(result.cycleTimesSeconds, {
    standard: 120,
    approved: 125,
    reportedAchieved: 120,
    calculatedAchieved: 120,
  });
  assert.equal(result.productionLoss, null);
  assert.equal(result.comparisons.productionLoss.reported, null);
  assert.ok(result.issueCodes.includes("INVALID_INPUT"));
  assert.ok(result.issueCodes.includes("MISSING_SHIFT_TARGET"));
});

test("supports an explicit comparison tolerance for fractional quantities", () => {
  const result = calculateProductionMetrics(
    {
      stroke: 3,
      multiplier: 0.3333,
      reportedQuantity: 1,
      operativeTimeSeconds: 60,
      standardCycleTimeSeconds: 20,
      shiftTarget: 2,
    },
    { absoluteTolerance: 0.001 },
  );

  assert.equal(result.actualQuantity, 0.9999);
  assert.equal(result.comparisons.quantity.matches, true);
  assert.equal(result.issueCodes.includes("QUANTITY_MISMATCH"), false);
});
