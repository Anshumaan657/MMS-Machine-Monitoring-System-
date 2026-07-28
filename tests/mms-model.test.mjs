import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";

import {
  canonicalizeWorkbook,
  isMissingText,
  parseMmsCanonicalFile,
  summarizeCanonicalData,
} from "../app/mms.ts";

const productHeaders = [
  "Date",
  "Machine",
  "Shift",
  "From Time",
  "Till Time",
  "Part No.",
  "Part Name",
  "Part ERP Code",
  "Part Cost",
  "Product Name",
  "Machine Type",
  "Running Hrs Cost",
  "Setup Time",
  "M. Factor",
  "Prod Gap Between",
  "Additional Over Time",
  "Std. Cycle Time",
  "Component Cost",
  "Scrap part",
  "Approved Cycle Time",
  "Quality Interlock",
  "ERP Code",
  "Process Dependency",
  "Operator",
  "Address",
  "Mobile",
  "Operator Per Hrs Cost",
  "Stroke",
  "Qty",
  "Achieve Cycle Time",
  "Shift Target",
  "Opr. Time Target",
  "Proxy",
  "Shift Time",
  "Allowed Time",
  "Opr. Time",
  "Non Opr. Time",
  "Down Time",
  "System Off",
  "Product Loss",
  "Reject Qty",
  "Rework Qty",
  "Error Stroke",
  "Tool Yes/No",
];

const downtimeHeaders = [
  "Date",
  "Machine",
  "Shift",
  "From Time",
  "Till Time",
  "Duration",
  "Revenue",
  "Reason_Type",
  "Reason",
  "Product Name",
  "Operator Name",
];

function row(headers, values) {
  return headers.map((header) => values[header] ?? null);
}

function testWorkbook() {
  const workbook = XLSX.utils.book_new();
  const productGrid = [
    ["Test Factory"],
    [],
    [],
    [],
    [],
    productHeaders,
    row(productHeaders, {
      Date: "01/07/2026",
      Machine: "M-01",
      Shift: "Shift 1",
      "From Time": "01/07/2026 07:00 AM",
      "Till Time": "01/07/2026 07:00 PM",
      "Part No.": "P-NULL",
      "Part Name": "Null product",
      "Product Name": "NULL",
      "Machine Type": "VMC",
      "Running Hrs Cost": 600,
      "Setup Time": 7200,
      "M. Factor": 2,
      "Prod Gap Between": 80,
      "Additional Over Time": 300,
      "Std. Cycle Time": 120,
      "Scrap part": 0.25,
      "Approved Cycle Time": 125,
      Operator: "OPERATOR A",
      Stroke: 25,
      Qty: 50,
      "Achieve Cycle Time": 121,
      "Shift Target": 300,
      "Opr. Time Target": 250,
      "Shift Time": "12:00",
      "Allowed Time": "02:00",
      "Opr. Time": "08:25",
      "Non Opr. Time": "00:08",
      "Down Time": "03:27",
      "System Off": "00:00",
      "Product Loss": 250,
      "Reject Qty": 2,
      "Rework Qty": 1,
      "Error Stroke": 0,
      "Tool Yes/No": "No",
    }),
    row(productHeaders, {
      Date: "01/07/2026",
      Machine: "M-01",
      Shift: "Shift 2",
      "From Time": "01/07/2026 06:30 PM",
      "Till Time": "02/07/2026 06:30 AM",
      "Part No.": "P-02",
      "Product Name": "NULL TURN",
      "Machine Type": "No Type",
      Operator: "NO OPERATOR,OPERATOR B",
      Stroke: 10,
      "M. Factor": 1,
      Qty: 10,
      "Shift Time": "12:00",
      "Allowed Time": "02:00",
      "Opr. Time": "09:00",
      "Non Opr. Time": "00:30",
      "Down Time": "00:30",
      "System Off": "00:00",
      "Reject Qty": 0,
      "Rework Qty": 0,
    }),
    row(productHeaders, {
      Date: "01/07/2026",
      Machine: "TOTAL",
      Shift: "TOTAL",
      "Part No.": "TOTAL === >",
      Qty: 60,
    }),
  ];

  const downtimeGrid = [
    ["Test Factory"],
    [],
    [],
    [],
    [],
    downtimeHeaders,
    row(downtimeHeaders, {
      Date: "01/07/2026",
      Machine: "M-01",
      Shift: "Shift 1",
      "From Time": "01/07/2026 09:00 AM",
      "Till Time": "01/07/2026 10:00 AM",
      Duration: "01:00:00",
      Revenue: 600,
      Reason_Type: "BREAKDOWN",
      Reason: "Tool failure",
      "Product Name": "NULL",
      "Operator Name": "OPERATOR A",
    }),
    row(downtimeHeaders, {
      Date: "01/07/2026",
      Machine: "M-01",
      Shift: "Shift 1",
      "From Time": "01/07/2026 09:30 AM",
      "Till Time": "01/07/2026 10:30 AM",
      Duration: "01:00:00",
      Revenue: 600,
      Reason_Type: "UNREPORTED",
      Reason: "UNREPORTED",
      "Product Name": "NULL TURN",
      "Operator Name": "NO OPERATOR",
    }),
    row(downtimeHeaders, {
      Date: "01/07/2026",
      Machine: "M-02",
      Shift: "Shift 1",
      "From Time": "01/07/2026 11:00 AM",
      "Till Time": "01/07/2026 10:00 AM",
      Duration: "not-a-duration",
      Revenue: 0,
      Reason_Type: "UNREPORTED",
      Reason: "UNREPORTED",
      "Product Name": "",
      "Operator Name": "",
    }),
    row(downtimeHeaders, {
      Machine: "TOTAL",
      Shift: "TOTAL",
      Duration: "02:00:00",
      Revenue: 1200,
    }),
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(productGrid),
    "Product Log Book",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(downtimeGrid),
    "Down Time Details",
  );
  return workbook;
}

test("keeps NULL product names and preserves canonical production fields", () => {
  const data = canonicalizeWorkbook(testWorkbook(), "fixture.xls");
  assert.equal(data.productionIntervals.length, 2);
  assert.equal(data.importStats.productTotalRowsExcluded, 1);

  const first = data.productionIntervals[0];
  assert.equal(first.product.productName, "NULL");
  assert.equal(first.timesSeconds.shift, 43_200);
  assert.equal(first.timesSeconds.allowed, 7_200);
  assert.equal(first.timesSeconds.setup, 7_200);
  assert.equal(first.timesSeconds.productionGap, 80);
  assert.equal(first.cycleTimesSeconds.standard, 120);
  assert.equal(first.quantities.calculatedFromStroke, 50);
  assert.equal(first.quantities.rejected, 2);
  assert.equal(first.quantities.reworked, 1);
  assert.equal(first.scrapPerPart, 0.25);
  assert.equal(first.costs.machinePerHour, 600);
  assert.equal(first.issueCodes.includes("MISSING_PRODUCT"), false);
  assert.equal(isMissingText("NULL"), false);
  assert.equal(isMissingText("NULL TURN"), false);
  assert.equal(isMissingText(""), true);
});

test("marks NO OPERATOR and No Type without discarding valid product records", () => {
  const data = canonicalizeWorkbook(testWorkbook(), "fixture.xls");
  const second = data.productionIntervals[1];
  assert.equal(second.product.productName, "NULL TURN");
  assert.equal(second.machineType, null);
  assert.deepEqual(second.operator.names, ["OPERATOR B"]);
  assert.equal(second.operator.isMissing, true);
  assert.ok(second.issueCodes.includes("MISSING_OPERATOR"));
  assert.ok(second.issueCodes.includes("MISSING_MACHINE_TYPE"));
});

test("preserves downtime events in seconds and detects invalid overlaps", () => {
  const data = canonicalizeWorkbook(testWorkbook(), "fixture.xls");
  assert.equal(data.downtimeEvents.length, 3);
  assert.equal(data.importStats.downtimeTotalRowsExcluded, 1);
  assert.equal(data.downtimeEvents[0].durationSeconds, 3_600);
  assert.equal(data.downtimeEvents[0].productName, "NULL");
  assert.equal(data.downtimeEvents[1].isUnreported, true);
  assert.equal(data.downtimeEvents[1].operator.isMissing, true);
  assert.ok(data.downtimeEvents[0].issueCodes.includes("OVERLAPPING_DOWNTIME_EVENT"));
  assert.ok(data.downtimeEvents[1].issueCodes.includes("OVERLAPPING_DOWNTIME_EVENT"));
  assert.ok(data.downtimeEvents[2].issueCodes.includes("INVALID_DURATION"));
  assert.ok(data.downtimeEvents[2].issueCodes.includes("INVALID_INTERVAL"));
  assert.equal(data.downtimeEvents[2].isValid, false);
});

test("detects overlapping production intervals on the same machine", () => {
  const data = canonicalizeWorkbook(testWorkbook(), "fixture.xls");
  assert.ok(
    data.productionIntervals[0].issueCodes.includes(
      "OVERLAPPING_PRODUCTION_INTERVAL",
    ),
  );
  assert.ok(
    data.productionIntervals[1].issueCodes.includes(
      "OVERLAPPING_PRODUCTION_INTERVAL",
    ),
  );
});

test("supports ArrayBuffer parsing and backwards-compatible summaries", () => {
  const workbook = testWorkbook();
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const canonical = parseMmsCanonicalFile(bytes, "fixture.xlsx");
  const summary = summarizeCanonicalData(canonical);

  assert.equal(canonical.productionIntervals.length, 2);
  assert.equal(canonical.downtimeEvents.length, 3);
  assert.equal(summary.overview.productRecords, 2);
  assert.equal(summary.overview.downtimeEvents, 3);
  assert.equal(summary.overview.totalProduction, 60);
  assert.equal(summary.overview.reportedRevenueLoss, 1200);
});

test("attaches verified production calculations to canonical intervals", () => {
  const data = canonicalizeWorkbook(testWorkbook(), "fixture.xls");
  const first = data.productionIntervals[0];

  assert.equal(first.calculations.actualQuantity, 50);
  assert.equal(first.calculations.producedQuantityUsed, 50);
  assert.equal(first.calculations.quantitySource, "stroke_x_multiplier");
  assert.equal(first.calculations.achievedCycleTimeSeconds, 606);
  assert.equal(first.calculations.operativeTimeTarget, 252.5);
  assert.equal(first.calculations.productionLoss, 250);
  assert.equal(first.calculations.comparisons.quantity.matches, true);
});

test("adds a canonical warning when calculated and reported quantities differ", () => {
  const workbook = testWorkbook();
  const qtyColumn = productHeaders.indexOf("Qty");
  const firstProductExcelRow = 7;
  const qtyCell = XLSX.utils.encode_cell({
    r: firstProductExcelRow - 1,
    c: qtyColumn,
  });
  workbook.Sheets["Product Log Book"][qtyCell].v = 49;

  const data = canonicalizeWorkbook(workbook, "fixture.xls");
  const first = data.productionIntervals[0];

  assert.equal(first.calculations.actualQuantity, 50);
  assert.equal(first.calculations.comparisons.quantity.reported, 49);
  assert.equal(first.calculations.comparisons.quantity.matches, false);
  assert.ok(first.issueCodes.includes("QUANTITY_MISMATCH"));
  assert.ok(
    data.validationIssues.some(
      (issue) =>
        issue.recordId === first.id && issue.code === "QUANTITY_MISMATCH",
    ),
  );
});

test("attaches Availability and Performance while keeping OEE pending", () => {
  const data = canonicalizeWorkbook(testWorkbook(), "fixture.xls");
  const first = data.productionIntervals[0];

  assert.equal(first.oeeComponents.plannedProductionTimeSeconds, 36_000);
  assert.equal(first.oeeComponents.availability, 0.84166667);
  assert.equal(first.oeeComponents.performance, 0.1980198);
  assert.deepEqual(first.oeeComponents.quality, {
    status: "pending",
    value: null,
  });
  assert.deepEqual(first.oeeComponents.finalOee, {
    status: "pending",
    value: null,
  });

  assert.equal(data.availabilityPerformance.machineWise.length, 1);
  assert.equal(data.availabilityPerformance.shiftWise.length, 2);
  assert.equal(data.availabilityPerformance.daily.length, 1);
  assert.equal(
    data.availabilityPerformance.period.totals.plannedProductionTimeSeconds,
    72_000,
  );
  assert.equal(data.availabilityPerformance.period.quality.status, "pending");
  assert.equal(data.availabilityPerformance.period.finalOee.status, "pending");
});

test("builds separate quality, scrap, rework, and readiness analytics", () => {
  const data = canonicalizeWorkbook(testWorkbook(), "fixture.xls");
  const first = data.qualityAnalytics.records[0];

  assert.equal(first.rejectedQuantity, 2);
  assert.equal(first.reworkedQuantity, 1);
  assert.equal(first.scrapPerPart, 0.25);
  assert.equal(first.estimatedScrap, 12.5);
  assert.equal(data.qualityAnalytics.period.totals.rejectedQuantity, 2);
  assert.equal(data.qualityAnalytics.period.totals.reworkedQuantity, 1);
  assert.equal(data.qualityAnalytics.period.totals.estimatedScrap, 12.5);
  assert.equal(first.goodQuantity, null);
  assert.equal(first.quality, null);
  assert.equal(first.qualityStatus, "blocked_unreliable_data");
  assert.equal(data.qualityAnalytics.oeeQualityStatus, "blocked_unreliable_data");
  assert.equal(data.qualityAnalytics.finalOeeStatus, "blocked");
});

test("builds event-level downtime and financial-loss intelligence", () => {
  const data = canonicalizeWorkbook(testWorkbook(), "fixture.xls");

  assert.equal(data.downtimeAnalytics.events.length, 3);
  assert.equal(data.downtimeAnalytics.mergedEvents.length, 3);
  assert.equal(data.downtimeAnalytics.events[0].classification, "downtime");
  assert.equal(
    data.downtimeAnalytics.events[0].calculatedMachineHourLoss,
    600,
  );
  assert.equal(data.downtimeAnalytics.events[1].classification, "downtime");
  assert.equal(data.downtimeAnalytics.events[2].classification, "unclassified");
  assert.equal(data.downtimeAnalytics.period.totals.downtimeSeconds, 7_200);
  assert.equal(
    data.downtimeAnalytics.period.totals.calculatedMachineHourLoss,
    1_200,
  );
  assert.equal(data.downtimeAnalytics.period.overlappingEventCount, 2);
  assert.equal(data.downtimeAnalytics.machineRanking[0].machine, "M-01");
  assert.equal(data.downtimeAnalytics.reasonPareto[0].downtimeSeconds, 3_600);
});
