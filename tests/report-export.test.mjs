import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { queryMmsAnalytics } from "../app/mms.ts";
import {
  buildFilteredReportWorkbook,
  filteredReportFileName,
} from "../app/report-export.ts";
import { exactCanonicalFixture } from "./phase12-fixture.mjs";

function rowByLabel(rows, label) {
  return rows.find((row) => row[0] === label);
}

test("exports all seven filtered analytics worksheets", () => {
  const data = exactCanonicalFixture();
  const analytics = queryMmsAnalytics(data, {
    date: "2024-01-01",
    shift: "Shift 1",
    machine: "MACHINE A",
  });
  const workbook = buildFilteredReportWorkbook({
    analytics,
    company: data.source.company,
    sourceFileName: data.source.fileName,
    selectedShift: "Shift 1",
    selectedMachine: "MACHINE A",
    machines: [{ name: "MACHINE A", status: "Running" }],
  });
  assert.deepEqual(workbook.SheetNames, [
    "Daily Overview",
    "Machine Performance",
    "Shift Performance",
    "Downtime Events",
    "Financial Losses",
    "Data Quality",
    "Rejection Rework Scrap",
  ]);

  const bytes = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });
  const reopened = XLSX.read(bytes, { type: "buffer" });
  const overview = XLSX.utils.sheet_to_json(
    reopened.Sheets["Daily Overview"],
    { header: 1 },
  );
  assert.deepEqual(rowByLabel(overview, "Shift"), ["Shift", "Shift 1"]);
  assert.deepEqual(rowByLabel(overview, "Machine"), ["Machine", "MACHINE A"]);
  assert.deepEqual(rowByLabel(overview, "Calculation policy"), [
    "Calculation policy",
    "mms-direct-quantity-v2",
  ]);
  assert.deepEqual(rowByLabel(overview, "Policy status"), [
    "Policy status",
    "confirmed",
  ]);
  assert.deepEqual(rowByLabel(overview, "Production"), [
    "Production",
    200,
    "Quantity",
  ]);
  assert.deepEqual(rowByLabel(overview, "Final OEE"), [
    "Final OEE",
    9.85,
    "Percent",
  ]);
  assert.equal(
    filteredReportFileName(analytics),
    "MMS-Analytics-2024-01-01-2024-01-01.xlsx",
  );
});

test("export contents change when the analytics filter changes", () => {
  const data = exactCanonicalFixture();
  const analytics = queryMmsAnalytics(data, {
    machine: "MACHINE THAT DOES NOT EXIST",
  });
  const workbook = buildFilteredReportWorkbook({
    analytics,
    company: data.source.company,
    sourceFileName: data.source.fileName,
    selectedMachine: "MACHINE THAT DOES NOT EXIST",
    machines: [],
  });
  const overview = XLSX.utils.sheet_to_json(
    workbook.Sheets["Daily Overview"],
    { header: 1 },
  );
  assert.deepEqual(rowByLabel(overview, "Machine"), [
    "Machine",
    "MACHINE THAT DOES NOT EXIST",
  ]);
  assert.deepEqual(rowByLabel(overview, "Production"), [
    "Production",
    0,
    "Quantity",
  ]);
});
