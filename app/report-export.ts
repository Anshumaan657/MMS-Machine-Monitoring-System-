import * as XLSX from "xlsx";
import type { FilteredMmsAnalytics } from "./mms.ts";

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
};

function hours(seconds: number): number {
  return Math.round(((seconds / 3_600) + Number.EPSILON) * 100) / 100;
}

function byLabel<T extends { label: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.label, item]));
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
}: FilteredReportInput): XLSX.WorkBook {
  const period = analytics.availabilityPerformance.period;
  const overview = XLSX.utils.aoa_to_sheet([
    ["MMS INTELLIGENCE — FILTERED OPERATIONS REPORT"],
    ["Company", company],
    ["Source workbook", sourceFileName],
    ["Date from", analytics.scope.dateFrom ?? "All"],
    ["Date to", analytics.scope.dateTo ?? "All"],
    ["Shift", selectedShift || "All"],
    ["Machine", selectedMachine || "All"],
    ["Calculation policy", analytics.calculationPolicy.id],
    ["Policy version", analytics.calculationPolicy.version],
    ["Policy status", analytics.calculationPolicy.status],
    ["Policy description", analytics.calculationPolicy.description],
    [
      "Policy warning",
      analytics.calculationPolicy.warning ?? "Confirmed production policy",
    ],
    [],
    ["Metric", "Value", "Unit / status"],
    ["Production", analytics.production.totals.producedQuantity, "Quantity"],
    ["Shift target", analytics.production.totals.shiftTarget, "Quantity"],
    [
      "Target attainment",
      analytics.production.targetAttainment ?? "Not available",
      "Percent",
    ],
    [
      "Availability",
      period.availability == null ? "Not available" : period.availability * 100,
      "Percent",
    ],
    [
      "Performance",
      period.performance == null ? "Not available" : period.performance * 100,
      "Percent",
    ],
    [
      "Quality",
      analytics.oee.period.quality == null
        ? "Not available"
        : analytics.oee.period.quality * 100,
      "Percent",
    ],
    [
      "Final OEE",
      analytics.oee.period.finalOee == null
        ? "Not available"
        : analytics.oee.period.finalOee * 100,
      "Percent",
    ],
    [
      "Downtime",
      hours(analytics.downtime.period.totals.downtimeSeconds),
      "Hours",
    ],
    [
      "Calculated machine-hour loss",
      analytics.downtime.period.totals.calculatedMachineHourLoss,
      "INR",
    ],
    [
      "Rejected quantity",
      analytics.quality.period.totals.rejectedQuantity,
      "Quantity",
    ],
    [
      "Rework quantity",
      analytics.quality.period.totals.reworkedQuantity,
      "Quantity",
    ],
    [
      "Estimated scrap",
      analytics.quality.period.totals.estimatedScrap,
      "Source scrap unit",
    ],
    ["Data-quality errors", analytics.dataQuality.errorCount, "Count"],
    ["Data-quality warnings", analytics.dataQuality.warningCount, "Count"],
  ]);
  overview["!cols"] = [{ wch: 36 }, { wch: 24 }, { wch: 30 }];

  const productionByMachine = byLabel(analytics.production.machineWise);
  const oeeByMachine = byLabel(
    analytics.availabilityPerformance.machineWise,
  );
  const downtimeByMachine = byLabel(analytics.downtime.machineWise);
  const qualityByMachine = byLabel(analytics.quality.machineWise);
  const policyOeeByMachine = byLabel(analytics.oee.machineWise);
  const machineRows = machines.map((machine) => ({
    Machine: machine.name,
    "Calculated State": machine.status,
    Production:
      productionByMachine.get(machine.name)?.totals.producedQuantity ?? 0,
    Target: productionByMachine.get(machine.name)?.totals.shiftTarget ?? 0,
    "Target Attainment (%)":
      productionByMachine.get(machine.name)?.targetAttainment ??
      "Not available",
    "Availability (%)":
      oeeByMachine.get(machine.name)?.availability == null
        ? "Not available"
        : (oeeByMachine.get(machine.name)?.availability ?? 0) * 100,
    "Performance (%)":
      oeeByMachine.get(machine.name)?.performance == null
        ? "Not available"
        : (oeeByMachine.get(machine.name)?.performance ?? 0) * 100,
    "Quality (%)":
      policyOeeByMachine.get(machine.name)?.quality == null
        ? "Not available"
        : (policyOeeByMachine.get(machine.name)?.quality ?? 0) * 100,
    "Final OEE (%)":
      policyOeeByMachine.get(machine.name)?.finalOee == null
        ? "Not available"
        : (policyOeeByMachine.get(machine.name)?.finalOee ?? 0) * 100,
    "Downtime (hours)": hours(
      downtimeByMachine.get(machine.name)?.totals.downtimeSeconds ?? 0,
    ),
    "Calculated Financial Loss":
      downtimeByMachine.get(machine.name)?.totals.calculatedMachineHourLoss ??
      0,
    Rejected:
      qualityByMachine.get(machine.name)?.totals.rejectedQuantity ?? 0,
    Rework: qualityByMachine.get(machine.name)?.totals.reworkedQuantity ?? 0,
    "Estimated Scrap":
      qualityByMachine.get(machine.name)?.totals.estimatedScrap ?? 0,
  }));

  const productionByShift = byLabel(analytics.production.shiftWise);
  const oeeByShift = byLabel(analytics.availabilityPerformance.shiftWise);
  const downtimeByShift = byLabel(analytics.downtime.shiftWise);
  const qualityByShift = byLabel(analytics.quality.shiftWise);
  const policyOeeByShift = byLabel(analytics.oee.shiftWise);
  const shiftNames = new Set([
    ...productionByShift.keys(),
    ...oeeByShift.keys(),
    ...downtimeByShift.keys(),
    ...qualityByShift.keys(),
  ]);
  const shiftRows = [...shiftNames].map((shift) => ({
    Shift: shift,
    Production: productionByShift.get(shift)?.totals.producedQuantity ?? 0,
    Target: productionByShift.get(shift)?.totals.shiftTarget ?? 0,
    "Target Attainment (%)":
      productionByShift.get(shift)?.targetAttainment ?? "Not available",
    "Availability (%)":
      oeeByShift.get(shift)?.availability == null
        ? "Not available"
        : (oeeByShift.get(shift)?.availability ?? 0) * 100,
    "Performance (%)":
      oeeByShift.get(shift)?.performance == null
        ? "Not available"
        : (oeeByShift.get(shift)?.performance ?? 0) * 100,
    "Quality (%)":
      policyOeeByShift.get(shift)?.quality == null
        ? "Not available"
        : (policyOeeByShift.get(shift)?.quality ?? 0) * 100,
    "Final OEE (%)":
      policyOeeByShift.get(shift)?.finalOee == null
        ? "Not available"
        : (policyOeeByShift.get(shift)?.finalOee ?? 0) * 100,
    "Downtime (hours)": hours(
      downtimeByShift.get(shift)?.totals.downtimeSeconds ?? 0,
    ),
    "Financial Loss":
      downtimeByShift.get(shift)?.totals.calculatedMachineHourLoss ?? 0,
    Rejected: qualityByShift.get(shift)?.totals.rejectedQuantity ?? 0,
    Rework: qualityByShift.get(shift)?.totals.reworkedQuantity ?? 0,
    "Estimated Scrap":
      qualityByShift.get(shift)?.totals.estimatedScrap ?? 0,
  }));

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
    "Additional Over Time Threshold (seconds)":
      event.additionalOvertimeThresholdSeconds,
    "Machine-Hour Cost": event.machineHourCost,
    "Calculated Loss": event.calculatedMachineHourLoss,
    "Reported Loss": event.reportedMachineHourLoss,
    "Validation Findings": event.issueCodes.join(", "),
  }));

  const financialRows = [
    ...analytics.downtime.machineWise.map((item) => ({
      "Scope Type": "Machine",
      Scope: item.label,
      "Downtime (hours)": hours(item.totals.downtimeSeconds),
      "Calculated Loss": item.totals.calculatedMachineHourLoss,
      "Reported Loss": item.totals.reportedMachineHourLoss,
      "Unpriced Downtime (hours)": hours(
        item.totals.unpricedDowntimeSeconds,
      ),
    })),
    ...analytics.downtime.shiftWise.map((item) => ({
      "Scope Type": "Shift",
      Scope: item.label,
      "Downtime (hours)": hours(item.totals.downtimeSeconds),
      "Calculated Loss": item.totals.calculatedMachineHourLoss,
      "Reported Loss": item.totals.reportedMachineHourLoss,
      "Unpriced Downtime (hours)": hours(
        item.totals.unpricedDowntimeSeconds,
      ),
    })),
    ...analytics.downtime.daily.map((item) => ({
      "Scope Type": "Date",
      Scope: item.label,
      "Downtime (hours)": hours(item.totals.downtimeSeconds),
      "Calculated Loss": item.totals.calculatedMachineHourLoss,
      "Reported Loss": item.totals.reportedMachineHourLoss,
      "Unpriced Downtime (hours)": hours(
        item.totals.unpricedDowntimeSeconds,
      ),
    })),
  ];

  const qualityRows = analytics.quality.records.map((record) => ({
    "Record ID": record.id,
    Date: record.date,
    Machine: record.machine,
    Shift: record.shift,
    "Produced Quantity": record.producedQuantity,
    "Rejected Quantity": record.rejectedQuantity,
    "Rework Quantity": record.reworkedQuantity,
    "Scrap per Part": record.scrapPerPart,
    "Estimated Scrap": record.estimatedScrap,
    "Missing Entry": record.hasMissingEntry ? "Yes" : "No",
    "Possibly Unreported": record.isPossiblyUnreported ? "Yes" : "No",
    Findings: record.issueCodes.join(", "),
  }));
  const dataQualityRows = analytics.dataQuality.findings.map((finding) => ({
    Source: finding.source,
    Severity: finding.severity,
    Code: finding.code,
    Count: finding.count,
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, overview, "Daily Overview");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(machineRows),
    "Machine Performance",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(shiftRows),
    "Shift Performance",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(downtimeRows),
    "Downtime Events",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(financialRows),
    "Financial Losses",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(dataQualityRows),
    "Data Quality",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(qualityRows),
    "Rejection Rework Scrap",
  );
  return workbook;
}

export function downloadFilteredReport(input: FilteredReportInput): void {
  XLSX.writeFile(
    buildFilteredReportWorkbook(input),
    filteredReportFileName(input.analytics),
    { compression: true },
  );
}
