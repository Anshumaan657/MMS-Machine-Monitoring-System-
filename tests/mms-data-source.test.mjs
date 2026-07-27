import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import {
  ExcelMmsDataSource,
  MmsDataSourceError,
  loadMmsDataWithFallback,
} from "../app/mms-data-source.ts";
import {
  describeReadonlyMmsDatabaseEnvironment,
  loadReadonlyMmsDatabaseEnvironment,
} from "../db/mms-database-config.ts";
import {
  MmsDatabaseDataSource,
} from "../db/mms-readonly-data-source.ts";

const productionHeaders = [
  "Date",
  "Machine",
  "Shift",
  "From Time",
  "Till Time",
  "Part No.",
  "Part Name",
  "Part ERP Code",
  "Product Name",
  "ERP Code",
  "Operator",
  "Machine Type",
  "Shift Time",
  "Allowed Time",
  "Opr. Time",
  "Non Opr. Time",
  "Down Time",
  "System Off",
  "Setup Time",
  "Additional Over Time",
  "Prod Gap Between",
  "Std. Cycle Time",
  "Approved Cycle Time",
  "Achieve Cycle Time",
  "Stroke",
  "M. Factor",
  "Qty",
  "Shift Target",
  "Opr. Time Target",
  "Product Loss",
  "Reject Qty",
  "Rework Qty",
  "Error Stroke",
  "Part Cost",
  "Component Cost",
  "Running Hrs Cost",
  "Operator Per Hrs Cost",
  "Scrap part",
  "Quality Interlock",
  "Process Dependency",
  "Proxy",
  "Tool Yes/No",
];

const productionValues = [
  "01/07/2026",
  "M-01",
  "Shift 1",
  "01/07/2026 06:00",
  "01/07/2026 18:00",
  "PART-1",
  "Part One",
  "PERP-1",
  "PRODUCT-A",
  "ERP-1",
  "OP-1",
  "VMC",
  "12:00",
  "02:00",
  "08:00",
  "00:30",
  "01:00",
  "00:30",
  300,
  600,
  30,
  288,
  288,
  288,
  100,
  2,
  200,
  125,
  100,
  -75,
  2,
  1,
  0,
  10,
  4,
  600,
  100,
  0.2,
  "YES",
  "NO",
  "",
  "YES",
];

const downtimeHeaders = [
  "Date",
  "Machine",
  "Shift",
  "From Time",
  "Till Time",
  "Duration",
  "Product Name",
  "Operator Name",
  "Reason_Type",
  "Reason",
  "Revenue",
];

const downtimeValues = [
  "01/07/2026",
  "M-01",
  "Shift 1",
  "01/07/2026 10:00",
  "01/07/2026 11:00",
  "01:00",
  "PRODUCT-A",
  "OP-1",
  "BREAKDOWN",
  "Tool failure",
  600,
];

function record(headers, values, prefix) {
  return Object.fromEntries(
    headers.map((header, index) => [`${prefix}${index}`, values[index]]),
  );
}

function mapping(headers, prefix) {
  return Object.fromEntries(
    headers.map((header, index) => [header, `${prefix}${index}`]),
  );
}

function workbookBuffer() {
  const workbook = XLSX.utils.book_new();
  const productionSheet = XLSX.utils.aoa_to_sheet([
    ["Parity Factory"],
    productionHeaders,
    productionValues,
  ]);
  const downtimeSheet = XLSX.utils.aoa_to_sheet([
    ["Parity Factory"],
    downtimeHeaders,
    downtimeValues,
  ]);
  XLSX.utils.book_append_sheet(workbook, productionSheet, "Product Log Book");
  XLSX.utils.book_append_sheet(workbook, downtimeSheet, "Down Time Details");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
}

function comparable(data) {
  return {
    production: data.productionIntervals.map((item) => ({
      id: item.id,
      date: item.date,
      machine: item.machine,
      shift: item.shift,
      product: item.product,
      operator: item.operator,
      timesSeconds: item.timesSeconds,
      cycleTimesSeconds: item.cycleTimesSeconds,
      quantities: item.quantities,
      calculations: item.calculations,
      oeeComponents: item.oeeComponents,
      costs: item.costs,
      scrapPerPart: item.scrapPerPart,
      issueCodes: item.issueCodes,
      isValid: item.isValid,
    })),
    downtime: data.downtimeEvents.map((item) => ({
      id: item.id,
      date: item.date,
      machine: item.machine,
      shift: item.shift,
      durationSeconds: item.durationSeconds,
      productName: item.productName,
      operator: item.operator,
      reasonType: item.reasonType,
      reason: item.reason,
      reportedMachineHourLoss: item.reportedMachineHourLoss,
      issueCodes: item.issueCodes,
      isValid: item.isValid,
    })),
    availabilityPerformance: data.availabilityPerformance,
    qualityAnalytics: data.qualityAnalytics,
    downtimeAnalytics: data.downtimeAnalytics,
    issueCodes: data.validationIssues.map((issue) => issue.code),
    stats: {
      productRowsRead: data.importStats.productRowsRead,
      downtimeRowsRead: data.importStats.downtimeRowsRead,
      productTotalRowsExcluded: data.importStats.productTotalRowsExcluded,
      downtimeTotalRowsExcluded: data.importStats.downtimeTotalRowsExcluded,
      errorCount: data.importStats.errorCount,
      warningCount: data.importStats.warningCount,
    },
  };
}

test("database and Excel sources produce equivalent canonical analytics", async () => {
  const requests = [];
  const databaseClient = {
    technology: "MySQL",
    async select(request) {
      requests.push(request);
      if (request.table === "mms.production_log") {
        return [record(productionHeaders, productionValues, "p_")];
      }
      if (request.table === "mms.downtime_log") {
        return [record(downtimeHeaders, downtimeValues, "d_")];
      }
      throw new Error("Unexpected table");
    },
  };
  const database = new MmsDatabaseDataSource({
    client: databaseClient,
    company: "Parity Factory",
    sourceName: "MySQL read-only MMS database",
    now: () => new Date("2026-07-25T00:00:00.000Z"),
    schema: {
      production: {
        table: "mms.production_log",
        columns: mapping(productionHeaders, "p_"),
      },
      downtime: {
        table: "mms.downtime_log",
        columns: mapping(downtimeHeaders, "d_"),
      },
    },
  });
  const excel = new ExcelMmsDataSource("parity.xlsx", workbookBuffer());

  const [databaseData, excelData] = await Promise.all([
    database.load(),
    excel.load(),
  ]);

  assert.deepEqual(comparable(databaseData), comparable(excelData));
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.operation === "select"));
  assert.deepEqual(
    requests.map((request) => request.table).sort(),
    ["mms.downtime_log", "mms.production_log"],
  );
});

test("database source rejects unsafe or incomplete schema mappings", () => {
  const client = { technology: "TestSQL", async select() { return []; } };
  assert.throws(
    () =>
      new MmsDatabaseDataSource({
        client,
        company: "Factory",
        schema: {
          production: {
            table: "production; DROP TABLE production",
            columns: {},
          },
          downtime: { table: "downtime", columns: {} },
        },
      }),
    (error) =>
      error instanceof MmsDataSourceError &&
      error.code === "CONFIGURATION_ERROR",
  );
});

test("database connection failures are safe and retryable", async () => {
  const required = Object.fromEntries(
    ["Date", "Machine", "Shift", "From Time", "Till Time"].map((field) => [
      field,
      field.toLowerCase().replaceAll(" ", "_"),
    ]),
  );
  const source = new MmsDatabaseDataSource({
    client: {
      technology: "TestSQL",
      async select() {
        throw new Error("password=do-not-leak");
      },
    },
    company: "Factory",
    schema: {
      production: { table: "production_log", columns: required },
      downtime: { table: "downtime_log", columns: required },
    },
  });

  await assert.rejects(
    () => source.load(),
    (error) =>
      error instanceof MmsDataSourceError &&
      error.code === "CONNECTION_ERROR" &&
      error.retryable &&
      !error.message.includes("do-not-leak"),
  );
});

test("Excel remains an explicit offline fallback after a database failure", async () => {
  const primary = {
    kind: "database",
    name: "Unavailable MMS database",
    async load() {
      throw new MmsDataSourceError(
        "CONNECTION_ERROR",
        "Database unavailable.",
        { retryable: true },
      );
    },
  };
  const result = await loadMmsDataWithFallback(
    primary,
    new ExcelMmsDataSource("fallback.xlsx", workbookBuffer()),
  );

  assert.equal(result.source.kind, "excel");
  assert.equal(result.source.usedFallback, true);
  assert.equal(result.primaryError?.code, "CONNECTION_ERROR");
  assert.equal(result.data.productionIntervals.length, 1);
  assert.equal(result.data.downtimeEvents.length, 1);
});

test("database environment requires explicit read-only mode and redacts passwords", () => {
  assert.throws(
    () => loadReadonlyMmsDatabaseEnvironment({ MMS_DB_READ_ONLY: "false" }),
    (error) =>
      error instanceof MmsDataSourceError &&
      error.code === "CONFIGURATION_ERROR",
  );

  const config = loadReadonlyMmsDatabaseEnvironment({
    MMS_DB_READ_ONLY: "true",
    MMS_DB_TECHNOLOGY: "MySQL",
    MMS_DB_HOST: "mms.internal",
    MMS_DB_PORT: "3306",
    MMS_DB_NAME: "mms",
    MMS_DB_USERNAME: "mms_analytics_ro",
    MMS_DB_PASSWORD: "secret",
    MMS_DB_SSL: "true",
  });
  assert.equal(config.port, 3306);
  assert.equal(config.technology, "MySQL");
  assert.equal(config.ssl, true);
  assert.equal(config.password, "secret");
  assert.deepEqual(describeReadonlyMmsDatabaseEnvironment(config), {
    ...config,
    password: "[REDACTED]",
  });
});
