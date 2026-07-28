import assert from "node:assert/strict";
import test from "node:test";

import { compareFormulaPolicies } from "../app/formula-policy-sandbox.ts";
import { exactCanonicalFixture } from "./phase12-fixture.mjs";

test("compares confirmed and provisional results without changing authority", () => {
  const data = exactCanonicalFixture();
  const original = structuredClone(data);
  const result = compareFormulaPolicies(data, {
    purpose: "diagnostic_comparison",
    runtimeEnvironment: "test",
  });

  assert.equal(result.mode, "diagnostic_comparison_only");
  assert.equal(result.officialPolicyId, "mms-direct-quantity-v2");
  assert.equal(result.provisionalPolicyId, "mms-reconciled-99-37-v1");
  assert.equal(result.productionActivationAllowed, false);
  assert.ok(result.recordsAffected > 0);
  assert.equal(result.records[0].comparisons[0].confirmedResult, 200);
  assert.equal(result.records[0].comparisons[0].provisionalResult, 200);
  assert.equal(
    result.records[0].comparisons.find(
      (item) => item.metric === "achievedCycleTimeSeconds",
    ).provisionalResult,
    36,
  );
  assert.deepEqual(data, original);
});

test("reports absolute and percentage differences by formula", () => {
  const result = compareFormulaPolicies(exactCanonicalFixture(), {
    purpose: "diagnostic_comparison",
    runtimeEnvironment: "test",
  });
  const target = result.summary.find(
    (item) => item.metric === "operativeTimeTarget",
  );

  assert.equal(target.recordsCompared, 1);
  assert.equal(target.recordsAffected, 1);
  assert.equal(target.confirmedTotal, 200);
  assert.equal(target.provisionalTotal, 400);
  assert.equal(target.absoluteDifference, 200);
  assert.equal(target.percentageDifference, 100);
});

test("uses stable machine cost for event financial-loss comparison", () => {
  const data = exactCanonicalFixture();
  const result = compareFormulaPolicies(data, {
    purpose: "diagnostic_comparison",
    runtimeEnvironment: "test",
  });
  const financial = result.financialLoss.records[0];

  assert.equal(
    result.financialLoss.formula,
    "Event Duration Hours × Stable Machine Master Cost",
  );
  assert.equal(financial.stableMachineHourCost, 600);
  assert.equal(financial.durationHours, 0.5);
  assert.equal(financial.confirmedResult, 300);
  assert.equal(financial.provisionalResult, 300);
});

test("cannot execute the provisional comparison sandbox in production", () => {
  assert.throws(
    () =>
      compareFormulaPolicies(exactCanonicalFixture(), {
        purpose: "diagnostic_comparison",
        runtimeEnvironment: "production",
      }),
    /cannot run in production/,
  );
});
