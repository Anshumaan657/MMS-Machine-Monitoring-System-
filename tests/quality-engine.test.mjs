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
    rejectedQuantity: 5,
    reworkedQuantity: 5,
    estimatedScrap: 50,
  });
  assert.equal(analytics.period.missingEntries.rejectionQuantity, 1);
  assert.equal(analytics.period.missingEntries.scrapPerPart, 1);
  assert.equal(analytics.oeeQualityStatus, "not_calculated");
  assert.equal(analytics.finalOeeStatus, "not_calculated");
});
