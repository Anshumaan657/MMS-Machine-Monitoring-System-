import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CALCULATION_POLICY_ID,
  evaluateCalculationPolicy,
  listCalculationPolicies,
  resolveCalculationPolicy,
} from "../app/calculation-policy.ts";
import { exactCanonicalFixture } from "./phase12-fixture.mjs";

const PROVISIONAL_POLICY_ID = "mms-reconciled-99-37-v1";
const PENDING_POLICY_ID = "mms-3d-confirmation-pending-v1";

test("publishes versioned metadata for every policy lifecycle state", () => {
  const policies = listCalculationPolicies();

  assert.deepEqual(
    policies.map((policy) => policy.status).sort(),
    ["confirmed", "pending_confirmation", "provisional", "provisional"],
  );
  for (const policy of policies) {
    assert.ok(policy.version);
    assert.ok(policy.description);
    assert.ok(policy.formulas.producedQuantity);
  }
});

test("uses the confirmed calculation policy by default", () => {
  const policy = resolveCalculationPolicy();

  assert.equal(DEFAULT_CALCULATION_POLICY_ID, "mms-direct-quantity-v2");
  assert.equal(policy.id, DEFAULT_CALCULATION_POLICY_ID);
  assert.equal(policy.status, "confirmed");
  assert.equal(policy.productionAllowed, true);
  assert.equal(policy.warning, null);
});

test("requires explicit opt-in for provisional calculations", () => {
  assert.throws(
    () => resolveCalculationPolicy({ policyId: PROVISIONAL_POLICY_ID }),
    /requires explicit non-production opt-in/,
  );

  const policy = resolveCalculationPolicy({
    policyId: PROVISIONAL_POLICY_ID,
    allowProvisional: true,
    runtimeEnvironment: "test",
  });
  assert.equal(policy.status, "provisional");
  assert.match(policy.warning, /not official MMS results/);
});

test("never permits the provisional policy in production", () => {
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

test("keeps the pending confirmation policy non-executable", () => {
  assert.throws(
    () =>
      resolveCalculationPolicy({
        policyId: PENDING_POLICY_ID,
        allowProvisional: true,
        runtimeEnvironment: "test",
      }),
    /pending 3D confirmation/,
  );
});

test("switches formula sets without mutating canonical records", () => {
  const canonical = exactCanonicalFixture();
  const record = canonical.productionIntervals[0];
  const original = structuredClone(record);

  const confirmed = evaluateCalculationPolicy(canonical.productionIntervals);
  const provisional = evaluateCalculationPolicy(canonical.productionIntervals, {
    policyId: PROVISIONAL_POLICY_ID,
    allowProvisional: true,
    runtimeEnvironment: "test",
  });
  const confirmedMetrics = confirmed.productionByRecordId.get(record.id);
  const provisionalMetrics = provisional.productionByRecordId.get(record.id);

  assert.equal(confirmedMetrics?.producedQuantity, 200);
  assert.equal(confirmedMetrics?.achievedCycleTimeSeconds, 18);
  assert.equal(confirmedMetrics?.operativeTimeTarget, 200);
  assert.equal(confirmedMetrics?.shiftTarget, 2_000);
  assert.equal(confirmedMetrics?.productionLoss, 1_800);
  assert.equal(confirmedMetrics?.goodQuantity, 197);
  assert.equal(confirmedMetrics?.quality, 0.985);
  assert.equal(confirmedMetrics?.finalOee, 0.0985);

  assert.equal(provisionalMetrics?.producedQuantity, 200);
  assert.equal(provisionalMetrics?.achievedCycleTimeSeconds, 36);
  assert.equal(provisionalMetrics?.operativeTimeTarget, 400);
  assert.equal(provisionalMetrics?.shiftTarget, 4_000);
  assert.equal(provisionalMetrics?.productionLoss, 50);
  assert.deepEqual(record, original);
});
