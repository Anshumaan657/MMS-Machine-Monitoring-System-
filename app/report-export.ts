import * as XLSX from "xlsx";
import type { FilteredMmsAnalytics } from "./mms.ts";
import type { OperationalAlert } from "./operational-alert-engine.ts";
import type { ManagementSummary } from "./management-summary-engine.ts";
import { sanitizeSpreadsheetText } from "./security.ts";

export type ReportMachineState = {
  name: string;
  status: string;
};

export type FilteredReportInput = {
  analytics: FilteredMmsAnalytics;
  company: string;
  sourceFileName: string;
  selectedShift?: string | null;
  selectedMachine?: string | null;
  machines: ReportMachineState[];
  alerts?: OperationalAlert[];
  managementSummary?: ManagementSummary | null;
  generatedAt?: string;
  lastSuccessfulSyncAt?: string | null;
  dataSource?: string;
};

const MAX_EXCEL_DATA_ROWS = 1_048_575;

function hours(seconds: number): number {
  return Math.round(((seconds / 3_600) + Number.EPSILON) * 100) / 100;
}

function byLabel<T extends { label: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.label, item]));
}

function safeWorksheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim()
    .slice(0, 31) || "Sheet";
  let candidate = base;
  let suffix = 1;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${base.slice(0, 27)} ${suffix}`.slice(0, 31);
  }
  used.add(candidate);
  return candidate;
}

function applySheetDesign(sheet: XLSX.WorkSheet): XLSX.WorkSheet {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
  sheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2" };
  const widths: number[] = [];
  for (let row = range.s.r; row <= Math.min(range.e.r, 500); row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const value = sheet[address]?.v;
      const length = value == null ? 0 : String(value).length;
      widths[column] = Math.max(widths[column] ?? 10, Math.min(length + 2, 42));
    }
  }
  sheet["!cols"] = widths.map((wch) => ({ wch }));

  const headers = new Map<number, string>();
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const address = XLSX.utils.encode_cell({ r: range.s.r, c: column });
    headers.set(column, String(sheet[address]?.v ?? ""));
  }
  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[address];
      if (!cell || cell.t !== "n") continue;
      const header = headers.get(column) ?? "";
      if (/%|Percentage|Attainment|Availability|Performance|Quality|OEE|Rate/i.test(header)) {
        cell.z = "0.00";
      } else if (/Cost|Loss|Revenue|INR/i.test(header)) {
        cell.z = "₹#,##0.00";
      } else if (/Hours/i.test(header)) {
        cell.z = "0.00";
      } else {
        cell.z = "#,##0.00";
      }
    }
  }
  return sheet;
}

function jsonSheet(rows: Record<string, unknown>[]): XLSX.WorkSheet {
  const safeRows = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "string" ? sanitizeSpreadsheetText(value) : value,
      ]),
    ),
  );
  return applySheetDesign(
    XLSX.utils.json_to_sheet(safeRows.slice(0, MAX_EXCEL_DATA_ROWS)),
  );
}

function append(
  workbook: XLSX.WorkBook,
  usedNames: Set<string>,
  name: string,
  sheet: XLSX.WorkSheet,
): void {
  XLSX.utils.book_append_sheet(
    workbook,
    sheet,
    safeWorksheetName(name, usedNames),
  );
}

function values(values: string[]): string {
  return values.length ? values.join(", ") : "All";
}

export function filteredReportFileName(
  analytics: FilteredMmsAnalytics,
): string {
  return `MMS-Analytics-${analytics.scope.dateFrom ?? "all"}-${
    analytics.scope.dateTo ?? "all"
  }.xlsx`;
}

export function buildFilteredReportWorkbook({
  analytics,
  company,
  sourceFileName,
  selectedShift,
  selectedMachine,
  machines,
  alerts = [],
  managementSummary = null,
  generatedAt = new Date().toISOString(),
  lastSuccessfulSyncAt = null,
  dataSource = "Excel workbook",
}: FilteredReportInput): XLSX.WorkBook {
  const period = analytics.availabilityPerformance.period;
  const overview = XLSX.utils.aoa_to_sheet([
    ["MMS INTELLIGENCE — FILTERED OPERATIONS REPORT"],
    ["Company", company],
    ["Source workbook", sourceFileName],
    ["Data source", dataSource],
    ["Generated at", generatedAt],
    ["Last successful synchronization", lastSuccessfulSyncAt ?? "Not available"],
    ["Date from", analytics.scope.dateFrom ?? "All"],
    ["Date to", analytics.scope.dateTo ?? "All"],
    ["Shift", selectedShift || values(analytics.filters.shifts)],
    ["Machine", selectedMachine || values(analytics.filters.machines)],
    ["Products", values(analytics.filters.products)],
    ["Operators", values(analytics.filters.operators)],
    ["Downtime reasons", values(analytics.filters.downtimeReasons)],
    ["Alert severities", values(analytics.filters.alertSeverities)],
    ["Data-quality statuses", values(analytics.filters.dataQualityStatuses)],
    ["Calculation policy", analytics.calculationPolicy.id],
    ["Policy version", analytics.calculationPolicy.version],
    ["Policy status", analytics.calculationPolicy.status],
    ["Policy description", analytics.calculationPolicy.description],
    ["Policy warning", analytics.calculationPolicy.warning ?? "Confirmed production policy"],
    [],
    ["Metric", "Value", "Unit / status"],
    ["Production", analytics.production.totals.producedQuantity, "Quantity"],
    ["Shift target", analytics.production.totals.shiftTarget, "Quantity"],
    ["Production loss", analytics.production.totals.productionLoss, "Quantity"],
    ["Target attainment", analytics.production.targetAttainment ?? "Not available", "Percent"],
    ["Availability", period.availability == null ? "Not available" : period.availability * 100, "Percent"],
    ["Performance", period.performance == null ? "Not available" : period.performance * 100, "Percent"],
    ["Quality", analytics.oee.period.quality == null ? "Not available" : analytics.oee.period.quality * 100, analytics.oee.period.status],
    ["Final OEE", analytics.oee.period.finalOee == null ? "Not available" : analytics.oee.period.finalOee * 100, analytics.oee.period.finalOeeReadiness],
    ["Downtime", hours(analytics.downtime.period.totals.downtimeSeconds), "Hours"],
    ["System Off", hours(analytics.downtime.period.totals.reportedSystemOffSeconds), "Hours"],
    ["Calculated machine-hour loss", analytics.downtime.period.totals.calculatedMachineHourLoss, "INR"],
    ["Rejected quantity", analytics.quality.period.totals.rejectedQuantity, "Quantity"],
    ["Rework quantity", analytics.quality.period.totals.reworkedQuantity, "Quantity"],
    ["Estimated scrap", analytics.quality.period.totals.estimatedScrap, "Source scrap unit"],
    ["Operational alerts", alerts.length, "Count"],
    ["Data-quality errors", analytics.dataQuality.errorCount, "Count"],
    ["Data-quality warnings", analytics.dataQuality.warningCount, "Count"],
  ]);
  overview["!cols"] = [{ wch: 40 }, { wch: 32 }, { wch: 28 }];

  const productionByMachine = byLabel(analytics.production.machineWise);
  const availabilityByMachine = byLabel(analytics.availabilityPerformance.machineWise);
  const downtimeByMachine = byLabel(analytics.downtime.machineWise);
  const qualityByMachine = byLabel(analytics.quality.machineWise);
  const oeeByMachine = byLabel(analytics.oee.machineWise);
  const machineRows = machines.map((machine) => ({
    Machine: machine.name,
    "Calculated State": machine.status,
    Production: productionByMachine.get(machine.name)?.totals.producedQuantity ?? 0,
    Target: productionByMachine.get(machine.name)?.totals.shiftTarget ?? 0,
    "Production Loss": productionByMachine.get(machine.name)?.totals.productionLoss ?? 0,
    "Target Attainment (%)": productionByMachine.get(machine.name)?.targetAttainment ?? "Not available",
    "Availability (%)": availabilityByMachine.get(machine.name)?.availability == null ? "Not available" : (availabilityByMachine.get(machine.name)?.availability ?? 0) * 100,
    "Performance (%)": availabilityByMachine.get(machine.name)?.performance == null ? "Not available" : (availabilityByMachine.get(machine.name)?.performance ?? 0) * 100,
    "Quality (%)": oeeByMachine.get(machine.name)?.quality == null ? "Not available" : (oeeByMachine.get(machine.name)?.quality ?? 0) * 100,
    "Final OEE (%)": oeeByMachine.get(machine.name)?.finalOee == null ? "Not available" : (oeeByMachine.get(machine.name)?.finalOee ?? 0) * 100,
    "OEE Readiness": oeeByMachine.get(machine.name)?.finalOeeReadiness ?? "blocked",
    "Downtime (hours)": hours(downtimeByMachine.get(machine.name)?.totals.downtimeSeconds ?? 0),
    "System Off (hours)": hours(downtimeByMachine.get(machine.name)?.totals.reportedSystemOffSeconds ?? 0),
    "Calculated Financial Loss": downtimeByMachine.get(machine.name)?.totals.calculatedMachineHourLoss ?? 0,
    Rejected: qualityByMachine.get(machine.name)?.totals.rejectedQuantity ?? 0,
    Rework: qualityByMachine.get(machine.name)?.totals.reworkedQuantity ?? 0,
    "Estimated Scrap": qualityByMachine.get(machine.name)?.totals.estimatedScrap ?? 0,
  }));

  const productionByShift = byLabel(analytics.production.shiftWise);
  const availabilityByShift = byLabel(analytics.availabilityPerformance.shiftWise);
  const downtimeByShift = byLabel(analytics.downtime.shiftWise);
  const qualityByShift = byLabel(analytics.quality.shiftWise);
  const oeeByShift = byLabel(analytics.oee.shiftWise);
  const shiftNames = new Set([
    ...productionByShift.keys(),
    ...availabilityByShift.keys(),
    ...downtimeByShift.keys(),
    ...qualityByShift.keys(),
  ]);
  const shiftRows = [...shiftNames].map((shift) => ({
    Shift: shift,
    Production: productionByShift.get(shift)?.totals.producedQuantity ?? 0,
    Target: productionByShift.get(shift)?.totals.shiftTarget ?? 0,
    "Production Loss": productionByShift.get(shift)?.totals.productionLoss ?? 0,
    "Target Attainment (%)": productionByShift.get(shift)?.targetAttainment ?? "Not available",
    "Availability (%)": availabilityByShift.get(shift)?.availability == null ? "Not available" : (availabilityByShift.get(shift)?.availability ?? 0) * 100,
    "Performance (%)": availabilityByShift.get(shift)?.performance == null ? "Not available" : (availabilityByShift.get(shift)?.performance ?? 0) * 100,
    "Quality (%)": oeeByShift.get(shift)?.quality == null ? "Not available" : (oeeByShift.get(shift)?.quality ?? 0) * 100,
    "Final OEE (%)": oeeByShift.get(shift)?.finalOee == null ? "Not available" : (oeeByShift.get(shift)?.finalOee ?? 0) * 100,
    "OEE Readiness": oeeByShift.get(shift)?.finalOeeReadiness ?? "blocked",
    "Downtime (hours)": hours(downtimeByShift.get(shift)?.totals.downtimeSeconds ?? 0),
    "System Off (hours)": hours(downtimeByShift.get(shift)?.totals.reportedSystemOffSeconds ?? 0),
    "Financial Loss": downtimeByShift.get(shift)?.totals.calculatedMachineHourLoss ?? 0,
    Rejected: qualityByShift.get(shift)?.totals.rejectedQuantity ?? 0,
    Rework: qualityByShift.get(shift)?.totals.reworkedQuantity ?? 0,
    "Estimated Scrap": qualityByShift.get(shift)?.totals.estimatedScrap ?? 0,
  }));

  const productionRows = analytics.records.productionIntervals.map((record) => {
    const calculation = analytics.policyCalculations.production.find(
      (item) => item.recordId === record.id,
    );
    return {
      "Record ID": record.id,
      Date: record.date,
      From: record.startAt,
      To: record.endAt,
      Machine: record.machine,
      "Machine Type": record.machineType,
      Shift: record.shift,
      Product: record.product.productName,
      "Part Number": record.product.partNumber,
      Operator: record.operator.raw,
      "Reported Qty": record.quantities.reported,
      Stroke: record.quantities.stroke,
      "M. Factor": record.quantities.multiplier,
      "Stroke × M. Factor": record.quantities.calculatedFromStroke,
      "Produced Quantity": calculation?.producedQuantity,
      "Shift Target": calculation?.shiftTarget,
      "Opr. Time Target": calculation?.operativeTimeTarget,
      "Production Loss": calculation?.productionLoss,
      "Operative Time (seconds)": record.timesSeconds.operative,
      "Standard Cycle Time (seconds)": record.cycleTimesSeconds.standard,
      "Achieved Cycle Time (seconds)": calculation?.achievedCycleTimeSeconds,
      Rejected: record.quantities.rejected,
      Rework: record.quantities.reworked,
      "Scrap per Part": record.scrapPerPart,
      "Source Sheet": record.sourceSheet,
      "Source Row": record.sourceRow,
      "Validation Findings": record.issueCodes.join(", "),
    };
  });

  const downtimeSourceById = new Map(
    analytics.records.downtimeEvents.map((event) => [event.id, event]),
  );
  const downtimeRows = analytics.downtime.events.map((event) => ({
    "Event ID": event.id,
    Date: event.date,
    Machine: event.machine,
    Shift: event.shift,
    Product: event.productName,
    From: event.startAt,
    To: event.endAt,
    Classification: event.classification,
    "Duration (seconds)": event.durationSeconds,
    "Duration (hours)": hours(event.durationSeconds ?? 0),
    "Reason Type": event.reasonType,
    Reason: event.reason,
    Unreported: event.isUnreported ? "Yes" : "No",
    "Additional Over Time Threshold (seconds)": event.additionalOvertimeThresholdSeconds,
    "Machine-Hour Cost": event.machineHourCost,
    "Calculated Loss": event.calculatedMachineHourLoss,
    "Reported Loss": event.reportedMachineHourLoss,
    "Source Sheet":
      downtimeSourceById.get(event.id)?.sourceSheet ?? "Down Time Details",
    "Source Row": downtimeSourceById.get(event.id)?.sourceRow ?? null,
    "Validation Findings": event.issueCodes.join(", "),
  }));

  const financialRows = [
    ...analytics.downtime.machineWise.map((item) => ({
      "Scope Type": "Machine", Scope: item.label,
      "Downtime (hours)": hours(item.totals.downtimeSeconds),
      "System Off (hours)": hours(item.totals.reportedSystemOffSeconds),
      "Calculated Loss": item.totals.calculatedMachineHourLoss,
      "Reported Loss": item.totals.reportedMachineHourLoss,
      "Unpriced Downtime (hours)": hours(item.totals.unpricedDowntimeSeconds),
    })),
    ...analytics.downtime.shiftWise.map((item) => ({
      "Scope Type": "Shift", Scope: item.label,
      "Downtime (hours)": hours(item.totals.downtimeSeconds),
      "System Off (hours)": hours(item.totals.reportedSystemOffSeconds),
      "Calculated Loss": item.totals.calculatedMachineHourLoss,
      "Reported Loss": item.totals.reportedMachineHourLoss,
      "Unpriced Downtime (hours)": hours(item.totals.unpricedDowntimeSeconds),
    })),
    ...analytics.downtime.daily.map((item) => ({
      "Scope Type": "Date", Scope: item.label,
      "Downtime (hours)": hours(item.totals.downtimeSeconds),
      "System Off (hours)": hours(item.totals.reportedSystemOffSeconds),
      "Calculated Loss": item.totals.calculatedMachineHourLoss,
      "Reported Loss": item.totals.reportedMachineHourLoss,
      "Unpriced Downtime (hours)": hours(item.totals.unpricedDowntimeSeconds),
    })),
  ];

  const qualityRows = analytics.quality.records.map((record) => ({
    "Record ID": record.id,
    Date: record.date,
    Machine: record.machine,
    Shift: record.shift,
    "Produced Quantity": record.producedQuantity,
    "Rejected Quantity": record.rejectedQuantity,
    "Rejection Rate (%)": record.rejectionRate == null ? "Not available" : record.rejectionRate * 100,
    "Rework Quantity": record.reworkedQuantity,
    "Rework Rate (%)": record.reworkRate == null ? "Not available" : record.reworkRate * 100,
    "Scrap per Part": record.scrapPerPart,
    "Estimated Scrap": record.estimatedScrap,
    "Missing Entry": record.hasMissingEntry ? "Yes" : "No",
    "Possibly Unreported": record.isPossiblyUnreported ? "Yes" : "No",
    Findings: record.issueCodes.join(", "),
  }));

  const findingRows = analytics.dataQuality.structuredFindings.map((finding) => ({
    "Finding ID": finding.id,
    Severity: finding.severity,
    Status: finding.status,
    Code: finding.code,
    Machine: finding.machine,
    Shift: finding.shift,
    Date: finding.date,
    Time: finding.time,
    Product: finding.product,
    "Source Sheet": finding.sourceSheet,
    "Source Row": finding.sourceRow,
    "Record ID": finding.recordId,
    Field: finding.fieldName,
    "Reported Value": finding.reportedValue,
    "Expected Value": finding.expectedValue,
    "Recommended Action": finding.recommendedAction,
  }));

  const alertRows = alerts.map((alert) => ({
    "Alert ID": alert.id,
    Severity: alert.severity,
    Type: alert.type,
    Title: alert.title,
    Machine: alert.machine,
    Shift: alert.shift,
    Date: alert.date,
    Time: alert.time,
    "Triggering Value": alert.triggeringValue.value,
    "Triggering Unit": alert.triggeringValue.unit,
    Threshold: alert.threshold.value,
    "Threshold Unit": alert.threshold.unit,
    Status: alert.status,
    "Acknowledgement State": alert.acknowledgementState,
    "Acknowledged At": alert.acknowledgedAt,
    "Source Sheet": alert.supportingRecord.sheet,
    "Source Row": alert.supportingRecord.rowNumber,
    "Supporting Record": alert.supportingRecord.id,
    Message: alert.message,
  }));
  const managementRows = managementSummary
    ? [
        ...managementSummary.executiveSummary.map((item) => ({
          Section: "Executive summary",
          Statement: item.text,
          "Evidence IDs": item.evidenceIds.join(", "),
          Priority: "",
        })),
        ...managementSummary.productionLosses.map((item) => ({
          Section: "Production losses",
          Statement: item.text,
          "Evidence IDs": item.evidenceIds.join(", "),
          Priority: "",
        })),
        ...managementSummary.comparisons.map((item) => ({
          Section: "Comparisons",
          Statement: item.text,
          "Evidence IDs": item.evidenceIds.join(", "),
          Priority: "",
        })),
        ...managementSummary.bottlenecks.map((item) => ({
          Section: "Bottlenecks",
          Statement: item.text,
          "Evidence IDs": item.evidenceIds.join(", "),
          Priority: "",
        })),
        ...managementSummary.dataCaveats.map((item) => ({
          Section: "Data caveats",
          Statement: item.text,
          "Evidence IDs": item.evidenceIds.join(", "),
          Priority: "",
        })),
        ...managementSummary.recommendations.map((item) => ({
          Section: "Recommendations",
          Statement: item.text,
          "Evidence IDs": item.evidenceIds.join(", "),
          Priority: item.priority,
        })),
      ]
    : [];

  const metadataRows = [
    ["Metadata", "Value"],
    ["Company", company],
    ["Source filename", sourceFileName],
    ["Data source", dataSource],
    ["Generation timestamp", generatedAt],
    ["Last successful synchronization", lastSuccessfulSyncAt ?? "Not available"],
    ["Date from", analytics.scope.dateFrom ?? "All"],
    ["Date to", analytics.scope.dateTo ?? "All"],
    ["Shifts", values(analytics.filters.shifts)],
    ["Machines", values(analytics.filters.machines)],
    ["Products", values(analytics.filters.products)],
    ["Operators", values(analytics.filters.operators)],
    ["Downtime reasons", values(analytics.filters.downtimeReasons)],
    ["Alert severities", values(analytics.filters.alertSeverities)],
    ["Data-quality statuses", values(analytics.filters.dataQualityStatuses)],
    ["Policy ID", analytics.calculationPolicy.id],
    ["Policy version", analytics.calculationPolicy.version],
    ["Policy status", analytics.calculationPolicy.status],
    ["Policy description", analytics.calculationPolicy.description],
    ["Policy warning", analytics.calculationPolicy.warning ?? "None"],
    ["Produced quantity source", analytics.calculationPolicy.formulas.producedQuantity],
    ["M. Factor treatment", "Validation-only under the confirmed policy"],
    ["Quality formula", analytics.calculationPolicy.formulas.quality],
    ["Final OEE readiness", analytics.oee.period.finalOeeReadiness],
    ["Maximum rows per worksheet", MAX_EXCEL_DATA_ROWS],
    ["Production rows exported", Math.min(productionRows.length, MAX_EXCEL_DATA_ROWS)],
    ["Production rows available", productionRows.length],
    ["Downtime rows exported", Math.min(downtimeRows.length, MAX_EXCEL_DATA_ROWS)],
    ["Downtime rows available", downtimeRows.length],
    ["Finding rows exported", Math.min(findingRows.length, MAX_EXCEL_DATA_ROWS)],
    ["Finding rows available", findingRows.length],
    ["Alert rows exported", Math.min(alertRows.length, MAX_EXCEL_DATA_ROWS)],
    ["Alert rows available", alertRows.length],
  ];

  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  append(workbook, usedNames, "Daily Overview", overview);
  append(workbook, usedNames, "Machine Performance", jsonSheet(machineRows));
  append(workbook, usedNames, "Shift Performance", jsonSheet(shiftRows));
  append(workbook, usedNames, "Production Intervals", jsonSheet(productionRows));
  append(workbook, usedNames, "Downtime Events", jsonSheet(downtimeRows));
  append(workbook, usedNames, "Financial Losses", jsonSheet(financialRows));
  append(workbook, usedNames, "Data-Quality Findings", jsonSheet(findingRows));
  append(workbook, usedNames, "Alerts", jsonSheet(alertRows));
  append(
    workbook,
    usedNames,
    "Management Summary",
    jsonSheet(managementRows),
  );
  append(workbook, usedNames, "Rejection Rework Scrap", jsonSheet(qualityRows));
  const metadata = XLSX.utils.aoa_to_sheet(metadataRows);
  metadata["!cols"] = [{ wch: 36 }, { wch: 72 }];
  append(workbook, usedNames, "Formula Policy and Metadata", metadata);
  workbook.Props = {
    Title: "MMS Intelligence Filtered Operations Report",
    Subject: `Verified analytics for ${company}`,
    Author: "MMS Intelligence",
    Company: company,
    CreatedDate: new Date(generatedAt),
  };
  return workbook;
}

export function downloadFilteredReport(input: FilteredReportInput): void {
  XLSX.writeFile(
    buildFilteredReportWorkbook(input),
    filteredReportFileName(input.analytics),
    { compression: true },
  );
}
