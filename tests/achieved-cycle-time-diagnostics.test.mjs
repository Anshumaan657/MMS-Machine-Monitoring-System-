import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseAchievedCycleTime } from "../app/achieved-cycle-time-diagnostics.ts";
import { canonicalizeMmsRows } from "../app/mms.ts";

function productionRow(rowNumber, overrides = {}) {
  return {
    rowNumber,
    values: {
      Date: new Date("2024-01-01T00:00:00"),
      Machine: "MACHINE A",
      Shift: "Shift 1",
      "From Time": new Date("2024-01-01T07:00:00"),
      "Till Time": new Date("2024-01-01T19:00:00"),
      "Part No.": `PART-${rowNumber}`,
      "Product Name": `PRODUCT-${rowNumber}`,
      Operator: "OPERATOR A",
      "Machine Type": "PRESS",
      "Shift Time": "12:00:00",
      "Allowed Time": "02:00:00",
      "Opr. Time": "00:30:00",
      "Std. Cycle Time": 9,
      "Approved Cycle Time": 9,
      "Achieve Cycle Time": 9,
      Stroke: 100,
      "M. Factor": 2,
      Qty: 200,
      "Shift Target": 250,
      "Opr. Time Target": 200,
      "Product Loss": 50,
      "Running Hrs Cost": 600,
      ...overrides,
    },
  };
}

test("groups mismatches and tests the reported-quantity explanation", () => {
  const data = canonicalizeMmsRows({
    company: "Diagnostic Fixture",
    sourceName: "diagnostic.xlsx",
    parsedAt: "2026-07-27T00:00:00.000Z",
    productionRows: [
      productionRow(7),
      productionRow(8, {
        Machine: "MACHINE B",
        Shift: "Shift 2",
        "Part No.": "PART-B",
        "Product Name": "PRODUCT-B",
        Qty: 100,
        "Achieve Cycle Time": 18,
      }),
    ],
    downtimeRows: [],
  });
  const diagnostic = diagnoseAchievedCycleTime(
    data,
    "2026-07-27T00:00:00.000Z",
  );

  assert.deepEqual(diagnostic.baseline, {
    productionRecords: 2,
    comparableRecords: 2,
    matches: 1,
    mismatches: 1,
    notComparable: 0,
    agreementPercentage: 50,
  });
  const reportedQuantityCandidate = diagnostic.candidates.find(
    (candidate) => candidate.id === "operative_div_reported_quantity",
  );
  assert.equal(reportedQuantityCandidate?.currentMismatchesExplained, 1);
  assert.equal(diagnostic.groups.byMachine[0].key, "MACHINE B");
  assert.equal(diagnostic.groups.byShift[0].key, "Shift 2");
  assert.equal(diagnostic.groups.byProduct[0].key, "PRODUCT-B");
  assert.equal(diagnostic.representativeExamples.length, 1);
  assert.ok(
    diagnostic.representativeExamples[0].selectionReasons.some((reason) =>
      reason.includes("reported_quantity"),
    ),
  );
});

test("keeps missing reported cycle times out of the agreement denominator", () => {
  const data = canonicalizeMmsRows({
    company: "Diagnostic Fixture",
    sourceName: "diagnostic.xlsx",
    productionRows: [
      productionRow(7, { "Achieve Cycle Time": null }),
    ],
    downtimeRows: [],
  });
  const diagnostic = diagnoseAchievedCycleTime(data);
  assert.equal(diagnostic.baseline.comparableRecords, 0);
  assert.equal(diagnostic.baseline.notComparable, 1);
  assert.equal(diagnostic.baseline.agreementPercentage, null);
  assert.equal(diagnostic.allMismatches.length, 0);
});
