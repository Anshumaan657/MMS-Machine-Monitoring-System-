import assert from "node:assert/strict";
import test from "node:test";

import {
  buildQualityAnalytics,
  processQualityRecord,
} from "../app/quality-engine.ts";

test("keeps rejection, rework, and scrap separate", () => {
  const result = processQualityRecord({
    id: "P-1",
    machine: "M-01",
    shift: "Shift 1",
    date: "2026-07-01",
    producedQuantity: 100,
    rejectedQuantity: 4,
    reworkedQuantity: 3,
    scrapPerPart: 0.25,
  });

  assert.equal(result.rejectedQuantity, 4);
  assert.equal(result.reworkedQuantity, 3);
  assert.equal(result.scrapPerPart, 0.25);
  assert.equal(result.estimatedScrap, 25);
  assert.equal(result.goodQuantity, 93);
  assert.equal(result.quality, 0.93);
  assert.equal(result.rejectionRate, 0.04);
  assert.equal(result.reworkRate, 0.03);
  assert.equal(result.qualityStatus, "calculated");
  assert.equal(result.qualityConfidence, "high");
  assert.equal(result.finalOeeReadiness, "ready");
  assert.equal(result.hasMissingEntry, false);
});

test("identifies every missing quality field", () => {
  const result = processQualityRecord({
    id: "P-1",
    machine: "M-01",
    shift: "Shift 1",
    date: "2026-07-01",
    producedQuantity: null,
    rejectedQuantity: null,
    reworkedQuantity: null,
    scrapPerPart: null,
  });

  assert.equal(result.estimatedScrap, null);
  assert.equal(result.hasMissingEntry, true);
  assert.equal(result.quality, null);
  assert.equal(result.qualityStatus, "blocked_missing_data");
  assert.equal(result.finalOeeReadiness, "blocked");
  assert.ok(result.issueCodes.includes("MISSING_PRODUCED_QUANTITY"));
  assert.ok(result.issueCodes.includes("MISSING_REJECTION_QUANTITY"));
  assert.ok(result.issueCodes.includes("MISSING_REWORK_QUANTITY"));
  assert.ok(result.issueCodes.includes("MISSING_SCRAP_PER_PART"));
});

test("flags zero rejection and rework as possibly unreported", () => {
  const result = processQualityRecord({
    id: "P-1",
    machine: "M-01",
    shift: "Shift 1",
    date: "2026-07-01",
    producedQuantity: 100,
    rejectedQuantity: 0,
    reworkedQuantity: 0,
    scrapPerPart: 0.2,
  });

  assert.equal(result.isPossiblyUnreported, true);
  assert.equal(result.qualityConfidence, "low");
  assert.ok(result.issueCodes.includes("POSSIBLY_UNREPORTED_QUALITY"));
});

test("detects impossible rejection and rework quantities", () => {
  const result = processQualityRecord({
    id: "P-1",
    machine: "M-01",
    shift: "Shift 1",
    date: "2026-07-01",
    producedQuantity: 10,
    rejectedQuantity: 8,
    reworkedQuantity: 5,
    scrapPerPart: 0,
  });

  assert.ok(result.issueCodes.includes("QUALITY_LOSS_EXCEEDS_PRODUCTION"));
  assert.equal(result.goodQuantity, null);
  assert.equal(result.qualityStatus, "blocked_invalid_data");
  assert.equal(result.issueCodes.includes("REJECTION_EXCEEDS_PRODUCTION"), false);
  assert.equal(result.issueCodes.includes("REWORK_EXCEEDS_PRODUCTION"), false);
});

test("produces machine, shift, daily, and period quality summaries", () => {
  const analytics = buildQualityAnalytics([
    {
      id: "P-1",
      machine: "M-01",
      shift: "Shift 1",
      date: "2026-07-01",
      producedQuantity: 100,
      rejectedQuantity: 4,
      reworkedQuantity: 3,
      scrapPerPart: 0.25,
    },
    {
      id: "P-2",
      machine: "M-01",
      shift: "Shift 2",
      date: "2026-07-01",
      producedQuantity: 50,
      rejectedQuantity: 1,
      reworkedQuantity: 2,
      scrapPerPart: 0.5,
    },
    {
      id: "P-3",
      machine: "M-02",
      shift: "Shift 1",
      date: "2026-07-02",
      producedQuantity: 25,
      rejectedQuantity: null,
      reworkedQuantity: 0,
      scrapPerPart: null,
    },
  ]);

  assert.equal(analytics.machineWise.length, 2);
  assert.equal(analytics.shiftWise.length, 2);
  assert.equal(analytics.daily.length, 2);
  assert.deepEqual(analytics.period.totals, {
    producedQuantity: 175,
    goodQuantity: 140,
    rejectedQuantity: 5,
    reworkedQuantity: 5,
    estimatedScrap: 50,
  });
  assert.equal(analytics.period.missingEntries.rejectionQuantity, 1);
  assert.equal(analytics.period.missingEntries.scrapPerPart, 1);
  assert.equal(analytics.period.rates.rejection, 0.02857143);
  assert.equal(analytics.period.rates.rework, 0.02857143);
  assert.equal(analytics.oeeQualityStatus, "blocked_missing_data");
  assert.equal(analytics.finalOeeStatus, "blocked");
});

test("blocks Quality and Final OEE readiness under a provisional policy", () => {
  const result = processQualityRecord({
    id: "P-1",
    machine: "M-01",
    shift: "Shift 1",
    date: "2026-07-01",
    producedQuantity: 100,
    rejectedQuantity: 2,
    reworkedQuantity: 1,
    scrapPerPart: 0.25,
    policyStatus: "provisional",
  });

  assert.equal(result.goodQuantity, null);
  assert.equal(result.quality, null);
  assert.equal(result.qualityStatus, "blocked_provisional_policy");
  assert.equal(result.finalOeeReadiness, "blocked");
  assert.ok(result.issueCodes.includes("PROVISIONAL_POLICY_NOT_OFFICIAL"));
});

test("blocks official Quality when required source data is unreliable", () => {
  const result = processQualityRecord({
    id: "P-1",
    machine: "M-01",
    shift: "Shift 1",
    date: "2026-07-01",
    producedQuantity: 100,
    rejectedQuantity: 2,
    reworkedQuantity: 1,
    scrapPerPart: null,
    requiredDataReliable: false,
  });

  assert.equal(result.estimatedScrap, null);
  assert.equal(result.quality, null);
  assert.equal(result.qualityStatus, "blocked_unreliable_data");
  assert.ok(result.issueCodes.includes("UNRELIABLE_REQUIRED_DATA"));
});
