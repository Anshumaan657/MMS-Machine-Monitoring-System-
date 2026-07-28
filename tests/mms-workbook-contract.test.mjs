import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";

import {
  inspectMmsWorkbookCompatibility,
  MMS_WORKBOOK_CONTRACT_VERSION,
  MMS_WORKBOOK_LIMITS,
  MmsWorkbookCompatibilityError,
  normalizeMmsWorkbookLabel,
} from "../app/mms-workbook-contract.ts";
import { parseMmsCanonicalFile } from "../app/mms.ts";

const productionHeaders = [
  " production date ",
  "MACHINE NAME",
  "Shift Name",
  "Start Time",
  "End Time",
  "Actual Qty",
  "Operative Time",
  "Standard Cycle Time",
  "Product",
  "Operator Name",
  "Rejected Qty",
  "Reworked Qty",
];

const downtimeHeaders = [
  "Event Date",
  "Machine Name",
  "Shift Name",
  "Start Time",
  "End Time",
  "Stop Duration",
  "Reason Type",
  "Root Cause",
];

function compatibleWorkbook({ omitOptional = false } = {}) {
  const workbook = XLSX.utils.book_new();
  const productColumns = omitOptional
    ? productionHeaders.slice(0, 8)
    : productionHeaders;
  const production = [
    ["Alias Factory"],
    productColumns,
    [
      "2026-07-01",
      "M-01",
      "Shift 1",
      "2026-07-01 07:00:00",
      "2026-07-01 19:00:00",
      120,
      "08:00",
      120,
      "PRODUCT-A",
      "OP-1",
      2,
      1,
    ].slice(0, productColumns.length),
    ["", "TOTAL", "TOTAL", "", "", 120, "", ""].slice(
      0,
      productColumns.length,
    ),
  ];
  const downtime = [
    ["Alias Factory"],
    downtimeHeaders,
    [
      "01-07-2026",
      "M-01",
      "Shift 1",
      "01-07-2026 09:00",
      "01-07-2026 10:00",
      "01:00:00",
      "Breakdown",
      "Tool failure",
    ],
    ["", "TOTAL", "TOTAL", "", "", "01:00:00", "", ""],
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(production),
    " Production Log ",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(downtime),
    "DOWNTIME DETAILS",
  );
  return workbook;
}

function workbookBytes(workbook, bookType) {
  return XLSX.write(workbook, { bookType, type: "array" });
}

test("normalizes capitalization, whitespace, punctuation, and minor aliases", () => {
  assert.equal(normalizeMmsWorkbookLabel("  Opr._Time  "), "opr time");
  const report = inspectMmsWorkbookCompatibility(compatibleWorkbook(), {
    fileName: "alias-input.xlsx",
  });

  assert.equal(report.contractVersion, MMS_WORKBOOK_CONTRACT_VERSION);
  assert.equal(report.status, "compatible");
  assert.equal(report.sheets[0].actualName, " Production Log ");
  assert.equal(report.sheets[0].mappedColumns["Actual Qty"], "Qty");
  assert.equal(
    report.sheets[0].mappedColumns["Standard Cycle Time"],
    "Std. Cycle Time",
  );
  assert.equal(report.sheets[1].mappedColumns["Root Cause"], "Reason");
});

for (const format of ["xls", "xlsx"]) {
  test(`imports a compatible .${format} workbook through the same contract`, () => {
    const bytes = workbookBytes(compatibleWorkbook(), format);
    const before = new Uint8Array(bytes).slice();
    const data = parseMmsCanonicalFile(bytes, `alias-input.${format}`);

    assert.equal(data.importCompatibility?.file.format, format);
    assert.equal(data.importCompatibility?.file.originalFilePreserved, true);
    assert.equal(data.productionIntervals.length, 1);
    assert.equal(data.downtimeEvents.length, 1);
    assert.equal(data.importStats.productTotalRowsExcluded, 1);
    assert.equal(data.importStats.downtimeTotalRowsExcluded, 1);
    assert.equal(data.productionIntervals[0].date, "2026-07-01");
    assert.equal(data.productionIntervals[0].timesSeconds.operative, 28_800);
    assert.equal(data.productionIntervals[0].quantities.reported, 120);
    assert.equal(data.productionIntervals[0].quantities.rejected, 2);
    assert.equal(data.downtimeEvents[0].date, "2026-07-01");
    assert.equal(data.downtimeEvents[0].durationSeconds, 3_600);
    assert.deepEqual(new Uint8Array(bytes), before);
  });
}

test("accepts absent optional columns without crashing and reports them", () => {
  const bytes = workbookBytes(compatibleWorkbook({ omitOptional: true }), "xlsx");
  const data = parseMmsCanonicalFile(bytes, "minimal.xlsx");

  assert.equal(data.productionIntervals.length, 1);
  assert.equal(data.productionIntervals[0].quantities.rejected, null);
  assert.equal(data.productionIntervals[0].operator.isMissing, true);
  assert.ok(
    data.importCompatibility?.issues.some(
      (issue) =>
        issue.code === "OPTIONAL_COLUMN_MISSING" &&
        issue.column === "Reject Qty",
    ),
  );
});

test("rejects an unrelated workbook with a structured compatibility report", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Name", "Email"], ["A", "a@example.com"]]),
    "Contacts",
  );
  const bytes = workbookBytes(workbook, "xlsx");

  assert.throws(
    () => parseMmsCanonicalFile(bytes, "contacts.xlsx"),
    (error) => {
      assert.ok(error instanceof MmsWorkbookCompatibilityError);
      assert.equal(error.report.status, "rejected");
      assert.equal(
        error.report.issues.filter(
          (issue) => issue.code === "MISSING_REQUIRED_SHEET",
        ).length,
        2,
      );
      return true;
    },
  );
});

test("rejects a workbook when a mandatory column is missing", () => {
  const workbook = compatibleWorkbook();
  const sheet = workbook.Sheets[" Production Log "];
  const grid = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  grid[1] = grid[1].filter((header) => header !== "Actual Qty");
  for (let index = 2; index < grid.length; index += 1) {
    grid[index].splice(5, 1);
  }
  workbook.Sheets[" Production Log "] = XLSX.utils.aoa_to_sheet(grid);

  assert.throws(
    () =>
      parseMmsCanonicalFile(
        workbookBytes(workbook, "xlsx"),
        "missing-quantity.xlsx",
      ),
    (error) => {
      assert.ok(error instanceof MmsWorkbookCompatibilityError);
      assert.ok(
        error.report.issues.some(
          (issue) =>
            issue.code === "MISSING_REQUIRED_COLUMN" &&
            issue.column === "Qty",
        ),
      );
      return true;
    },
  );
});

test("rejects unsupported file names before parsing bytes", () => {
  assert.throws(
    () => parseMmsCanonicalFile(new ArrayBuffer(8), "input.csv"),
    (error) => {
      assert.ok(error instanceof MmsWorkbookCompatibilityError);
      assert.equal(error.report.issues[0].code, "UNSUPPORTED_FILE_FORMAT");
      return true;
    },
  );
});

test("enforces row limits before expanding a large worksheet", () => {
  const workbook = compatibleWorkbook();
  workbook.Sheets[" Production Log "]["!ref"] = `A1:L${
    MMS_WORKBOOK_LIMITS.maximumRowsPerSheet + 1
  }`;
  const report = inspectMmsWorkbookCompatibility(workbook, {
    fileName: "oversized.xlsx",
  });

  assert.equal(report.status, "rejected");
  assert.ok(
    report.issues.some(
      (issue) => issue.code === "SHEET_ROW_LIMIT_EXCEEDED",
    ),
  );
});
