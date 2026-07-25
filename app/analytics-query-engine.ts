import {
  aggregateAvailabilityPerformance,
  type AvailabilityPerformanceAnalytics,
} from "./availability-performance-engine.ts";
import {
  buildDowntimeAnalytics,
  type DowntimeAnalytics,
} from "./downtime-engine.ts";
import {
  buildQualityAnalytics,
  type QualityAnalytics,
} from "./quality-engine.ts";
import type {
  CanonicalMmsData,
  DowntimeEvent,
  ProductionInterval,
  ValidationIssue,
} from "./mms.ts";

export type AnalyticsFilterValue = string | string[];

export type MmsAnalyticsFilters = {
  date?: string | null;
  dateRange?: {
    from?: string | null;
    to?: string | null;
  } | null;
  shift?: AnalyticsFilterValue | null;
  machine?: AnalyticsFilterValue | null;
  product?: AnalyticsFilterValue | null;
  operator?: AnalyticsFilterValue | null;
  downtimeReason?: AnalyticsFilterValue | null;
};

export type NormalizedMmsAnalyticsFilters = {
  dateFrom: string | null;
  dateTo: string | null;
  shifts: string[];
  machines: string[];
  products: string[];
  operators: string[];
  downtimeReasons: string[];
};

export type ProductionQueryAggregate = {
  key: string;
  label: string;
  recordCount: number;
  totals: {
    producedQuantity: number;
    reportedQuantity: number;
    calculatedQuantity: number;
    shiftTarget: number;
    operativeTimeTarget: number;
    productionLoss: number;
  };
  targetAttainment: number | null;
};

export type ProductionQueryAnalytics = {
  recordCount: number;
  totals: ProductionQueryAggregate["totals"];
  targetAttainment: number | null;
  machineWise: ProductionQueryAggregate[];
  shiftWise: ProductionQueryAggregate[];
  daily: ProductionQueryAggregate[];
  productWise: ProductionQueryAggregate[];
  operatorWise: ProductionQueryAggregate[];
};

export type DataQualityFinding = {
  code: string;
  count: number;
  severity: "error" | "warning" | "information";
  source:
    | "canonical"
    | "production"
    | "availability_performance"
    | "quality"
    | "downtime";
};

export type FilteredDataQuality = {
  validationIssues: ValidationIssue[];
  findings: DataQualityFinding[];
  errorCount: number;
  warningCount: number;
  invalidProductionRecords: number;
  invalidDowntimeRecords: number;
  quantityMismatchRecords: number;
  missingQualityRecords: number;
  possiblyUnreportedQualityRecords: number;
  unreportedDowntimeEvents: number;
  overlappingDowntimeEvents: number;
};

export type MmsFilterOptions = {
  dates: string[];
  shifts: string[];
  machines: string[];
  products: string[];
  operators: string[];
  downtimeReasons: string[];
};

export type FilteredMmsAnalytics = {
  filters: NormalizedMmsAnalyticsFilters;
  activeFilterCount: number;
  scope: {
    dateFrom: string | null;
    dateTo: string | null;
    productionRecordCount: number;
    downtimeEventCount: number;
  };
  records: {
    productionIntervals: ProductionInterval[];
    downtimeEvents: DowntimeEvent[];
  };
  production: ProductionQueryAnalytics;
  availabilityPerformance: AvailabilityPerformanceAnalytics;
  quality: QualityAnalytics;
  downtime: DowntimeAnalytics;
  dataQuality: FilteredDataQuality;
};

function normalized(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizedValues(value: AnalyticsFilterValue | null | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map(normalized).filter(Boolean))];
}

function normalizedDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function normalizeMmsAnalyticsFilters(
  filters: MmsAnalyticsFilters = {},
): NormalizedMmsAnalyticsFilters {
  const exactDate = normalizedDate(filters.date);
  let dateFrom = exactDate ?? normalizedDate(filters.dateRange?.from);
  let dateTo = exactDate ?? normalizedDate(filters.dateRange?.to);
  if (dateFrom && dateTo && dateFrom > dateTo) {
    [dateFrom, dateTo] = [dateTo, dateFrom];
  }
  return {
    dateFrom,
    dateTo,
    shifts: normalizedValues(filters.shift),
    machines: normalizedValues(filters.machine),
    products: normalizedValues(filters.product),
    operators: normalizedValues(filters.operator),
    downtimeReasons: normalizedValues(filters.downtimeReason),
  };
}

function matchesSelection(values: string[], selections: string[]): boolean {
  if (!selections.length) return true;
  const normalizedCandidates = values.map(normalized);
  return selections.some((selection) =>
    normalizedCandidates.includes(selection),
  );
}

function matchesDate(
  date: string | null,
  filters: NormalizedMmsAnalyticsFilters,
): boolean {
  if (!filters.dateFrom && !filters.dateTo) return true;
  if (!date) return false;
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  return true;
}

function operatorValues(
  names: string[],
  raw: string,
  isMissing: boolean,
): string[] {
  return isMissing ? [...names, raw, "NO OPERATOR", "MISSING"] : [...names, raw];
}

function matchesProduction(
  interval: ProductionInterval,
  filters: NormalizedMmsAnalyticsFilters,
): boolean {
  return (
    matchesDate(interval.date, filters) &&
    matchesSelection([interval.shift], filters.shifts) &&
    matchesSelection([interval.machine], filters.machines) &&
    matchesSelection(
      [
        interval.product.productName,
        interval.product.partNumber,
        interval.product.partName,
        interval.product.partErpCode,
        interval.product.erpCode,
      ],
      filters.products,
    ) &&
    matchesSelection(
      operatorValues(
        interval.operator.names,
        interval.operator.raw,
        interval.operator.isMissing,
      ),
      filters.operators,
    )
  );
}

function matchesDowntime(
  event: DowntimeEvent,
  filters: NormalizedMmsAnalyticsFilters,
): boolean {
  return (
    matchesDate(event.date, filters) &&
    matchesSelection([event.shift], filters.shifts) &&
    matchesSelection([event.machine], filters.machines) &&
    matchesSelection([event.productName], filters.products) &&
    matchesSelection(
      operatorValues(event.operator.names, event.operator.raw, event.operator.isMissing),
      filters.operators,
    ) &&
    matchesSelection(
      [event.reason, event.reasonType],
      filters.downtimeReasons,
    )
  );
}

function rounded(value: number, digits = 6): number {
  const power = 10 ** digits;
  return Math.round((value + Number.EPSILON) * power) / power;
}

function aggregateProductionGroup(
  key: string,
  label: string,
  records: ProductionInterval[],
): ProductionQueryAggregate {
  const totals = {
    producedQuantity: 0,
    reportedQuantity: 0,
    calculatedQuantity: 0,
    shiftTarget: 0,
    operativeTimeTarget: 0,
    productionLoss: 0,
  };
  for (const interval of records) {
    totals.producedQuantity += interval.calculations.producedQuantityUsed ?? 0;
    totals.reportedQuantity += interval.quantities.reported ?? 0;
    totals.calculatedQuantity += interval.calculations.actualQuantity ?? 0;
    totals.shiftTarget += interval.quantities.shiftTarget ?? 0;
    totals.operativeTimeTarget += interval.calculations.operativeTimeTarget ?? 0;
    totals.productionLoss += interval.calculations.productionLoss ?? 0;
  }
  const roundedTotals = Object.fromEntries(
    Object.entries(totals).map(([name, value]) => [name, rounded(value)]),
  ) as ProductionQueryAggregate["totals"];
  return {
    key,
    label,
    recordCount: records.length,
    totals: roundedTotals,
    targetAttainment: roundedTotals.shiftTarget
      ? rounded(
          (roundedTotals.producedQuantity / roundedTotals.shiftTarget) * 100,
        )
      : null,
  };
}

type ProductionDimension =
  | "machine"
  | "shift"
  | "date"
  | "product"
  | "operator";

function productionDimensionValue(
  interval: ProductionInterval,
  dimension: ProductionDimension,
): string {
  if (dimension === "machine") return interval.machine || "UNKNOWN";
  if (dimension === "shift") return interval.shift || "UNKNOWN";
  if (dimension === "date") return interval.date || "UNKNOWN";
  if (dimension === "product") {
    return (
      interval.product.productName ||
      interval.product.partNumber ||
      "UNKNOWN"
    );
  }
  return interval.operator.isMissing
    ? "NO OPERATOR"
    : interval.operator.names.join(", ") || interval.operator.raw || "UNKNOWN";
}

function groupedProduction(
  records: ProductionInterval[],
  dimension: ProductionDimension,
): ProductionQueryAggregate[] {
  const groups = new Map<string, ProductionInterval[]>();
  for (const interval of records) {
    const key = productionDimensionValue(interval, dimension);
    const group = groups.get(key) ?? [];
    group.push(interval);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => aggregateProductionGroup(key, key, group));
}

function buildProductionAnalytics(
  records: ProductionInterval[],
): ProductionQueryAnalytics {
  const period = aggregateProductionGroup("period", "Entire selection", records);
  return {
    recordCount: records.length,
    totals: period.totals,
    targetAttainment: period.targetAttainment,
    machineWise: groupedProduction(records, "machine"),
    shiftWise: groupedProduction(records, "shift"),
    daily: groupedProduction(records, "date"),
    productWise: groupedProduction(records, "product"),
    operatorWise: groupedProduction(records, "operator"),
  };
}

function incrementFinding(
  map: Map<string, DataQualityFinding>,
  code: string,
  severity: DataQualityFinding["severity"],
  source: DataQualityFinding["source"],
): void {
  const key = `${source}:${severity}:${code}`;
  const finding = map.get(key);
  if (finding) finding.count += 1;
  else map.set(key, { code, count: 1, severity, source });
}

function buildFilteredDataQuality(
  productionIntervals: ProductionInterval[],
  downtimeEvents: DowntimeEvent[],
  validationIssues: ValidationIssue[],
  quality: QualityAnalytics,
  downtime: DowntimeAnalytics,
): FilteredDataQuality {
  const recordIds = new Set([
    ...productionIntervals.map((record) => record.id),
    ...downtimeEvents.map((record) => record.id),
  ]);
  const selectedValidationIssues = validationIssues.filter((issue) =>
    recordIds.has(issue.recordId),
  );
  const findings = new Map<string, DataQualityFinding>();
  for (const issue of selectedValidationIssues) {
    incrementFinding(findings, issue.code, issue.severity, "canonical");
  }
  for (const interval of productionIntervals) {
    for (const code of interval.calculations.issueCodes) {
      incrementFinding(findings, code, "warning", "production");
    }
    for (const code of interval.oeeComponents.issueCodes) {
      incrementFinding(
        findings,
        code,
        code === "INVALID_INPUT" ? "error" : "warning",
        "availability_performance",
      );
    }
  }
  for (const record of quality.records) {
    for (const code of record.issueCodes) {
      incrementFinding(
        findings,
        code,
        code === "INVALID_QUALITY_INPUT" ? "error" : "warning",
        "quality",
      );
    }
  }
  for (const event of downtime.events) {
    for (const code of event.issueCodes) {
      incrementFinding(
        findings,
        code,
        code === "INVALID_DOWNTIME_DURATION" ? "error" : "warning",
        "downtime",
      );
    }
  }
  const findingList = [...findings.values()].sort(
    (left, right) =>
      right.count - left.count || left.code.localeCompare(right.code),
  );
  return {
    validationIssues: selectedValidationIssues,
    findings: findingList,
    errorCount:
      selectedValidationIssues.filter((issue) => issue.severity === "error")
        .length +
      findingList
        .filter(
          (finding) =>
            finding.severity === "error" && finding.source !== "canonical",
        )
        .reduce((sum, finding) => sum + finding.count, 0),
    warningCount:
      selectedValidationIssues.filter((issue) => issue.severity === "warning")
        .length +
      findingList
        .filter(
          (finding) =>
            finding.severity === "warning" && finding.source !== "canonical",
        )
        .reduce((sum, finding) => sum + finding.count, 0),
    invalidProductionRecords: productionIntervals.filter((record) => !record.isValid)
      .length,
    invalidDowntimeRecords: downtimeEvents.filter((record) => !record.isValid).length,
    quantityMismatchRecords: productionIntervals.filter((record) =>
      record.issueCodes.includes("QUANTITY_MISMATCH"),
    ).length,
    missingQualityRecords: quality.records.filter(
      (record) => record.hasMissingEntry,
    ).length,
    possiblyUnreportedQualityRecords: quality.records.filter(
      (record) => record.isPossiblyUnreported,
    ).length,
    unreportedDowntimeEvents: downtime.events.filter(
      (event) => event.isUnreported,
    ).length,
    overlappingDowntimeEvents: downtime.events.filter(
      (event) => event.hasOverlap,
    ).length,
  };
}

function selectedDateRange(
  production: ProductionInterval[],
  downtime: DowntimeEvent[],
): { dateFrom: string | null; dateTo: string | null } {
  const dates = [
    ...production.map((record) => record.date),
    ...downtime.map((record) => record.date),
  ]
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    dateFrom: dates[0] ?? null,
    dateTo: dates.at(-1) ?? null,
  };
}

export function queryMmsAnalytics(
  data: CanonicalMmsData,
  filters: MmsAnalyticsFilters = {},
): FilteredMmsAnalytics {
  const normalizedFilters = normalizeMmsAnalyticsFilters(filters);
  const productionIntervals = data.productionIntervals.filter((interval) =>
    matchesProduction(interval, normalizedFilters),
  );
  const downtimeEvents = data.downtimeEvents.filter((event) =>
    matchesDowntime(event, normalizedFilters),
  );
  const availabilityPerformance = aggregateAvailabilityPerformance(
    productionIntervals.map((interval) => ({
      id: interval.id,
      machine: interval.machine,
      shift: interval.shift,
      date: interval.date,
      ...interval.oeeComponents,
    })),
  );
  const quality = buildQualityAnalytics(
    productionIntervals.map((interval) => ({
      id: interval.id,
      machine: interval.machine,
      shift: interval.shift,
      date: interval.date,
      producedQuantity: interval.calculations.producedQuantityUsed,
      rejectedQuantity: interval.quantities.rejected,
      reworkedQuantity: interval.quantities.reworked,
      scrapPerPart: interval.scrapPerPart,
    })),
  );
  const downtime = buildDowntimeAnalytics(
    downtimeEvents.map((event) => ({
      id: event.id,
      machine: event.machine,
      shift: event.shift,
      date: event.date,
      startEpochMs: event.startEpochMs,
      endEpochMs: event.endEpochMs,
      startAt: event.startAt,
      endAt: event.endAt,
      durationSeconds: event.durationSeconds,
      productName: event.productName,
      reasonType: event.reasonType,
      reason: event.reason,
      isUnreported: event.isUnreported,
      hasOverlap: event.issueCodes.includes("OVERLAPPING_DOWNTIME_EVENT"),
      reportedMachineHourLoss: event.reportedMachineHourLoss,
    })),
    productionIntervals.map((interval) => ({
      id: interval.id,
      machine: interval.machine,
      shift: interval.shift,
      date: interval.date,
      startEpochMs: interval.startEpochMs,
      endEpochMs: interval.endEpochMs,
      productName: interval.product.productName,
      additionalOvertimeThresholdSeconds:
        interval.timesSeconds.additionalOvertime,
      machineHourCost: interval.costs.machinePerHour,
      reportedNonOperativeSeconds: interval.timesSeconds.nonOperative,
      reportedSystemOffSeconds: interval.timesSeconds.systemOff,
    })),
  );
  const selectionRange = selectedDateRange(productionIntervals, downtimeEvents);
  const activeFilterCount = [
    normalizedFilters.dateFrom || normalizedFilters.dateTo,
    normalizedFilters.shifts.length,
    normalizedFilters.machines.length,
    normalizedFilters.products.length,
    normalizedFilters.operators.length,
    normalizedFilters.downtimeReasons.length,
  ].filter(Boolean).length;

  return {
    filters: normalizedFilters,
    activeFilterCount,
    scope: {
      ...selectionRange,
      productionRecordCount: productionIntervals.length,
      downtimeEventCount: downtimeEvents.length,
    },
    records: { productionIntervals, downtimeEvents },
    production: buildProductionAnalytics(productionIntervals),
    availabilityPerformance,
    quality,
    downtime,
    dataQuality: buildFilteredDataQuality(
      productionIntervals,
      downtimeEvents,
      data.validationIssues,
      quality,
      downtime,
    ),
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function getMmsFilterOptions(data: CanonicalMmsData): MmsFilterOptions {
  return {
    dates: uniqueSorted([
      ...data.productionIntervals.flatMap((record) =>
        record.date ? [record.date] : [],
      ),
      ...data.downtimeEvents.flatMap((record) =>
        record.date ? [record.date] : [],
      ),
    ]),
    shifts: uniqueSorted([
      ...data.productionIntervals.map((record) => record.shift),
      ...data.downtimeEvents.map((record) => record.shift),
    ]),
    machines: uniqueSorted([
      ...data.productionIntervals.map((record) => record.machine),
      ...data.downtimeEvents.map((record) => record.machine),
    ]),
    products: uniqueSorted([
      ...data.productionIntervals.map(
        (record) =>
          record.product.productName ||
          record.product.partNumber ||
          "UNKNOWN",
      ),
      ...data.downtimeEvents.map((record) => record.productName || "UNKNOWN"),
    ]),
    operators: uniqueSorted([
      ...data.productionIntervals.map((record) =>
        record.operator.isMissing
          ? "NO OPERATOR"
          : record.operator.names.join(", ") || record.operator.raw,
      ),
      ...data.downtimeEvents.map((record) =>
        record.operator.isMissing
          ? "NO OPERATOR"
          : record.operator.names.join(", ") || record.operator.raw,
      ),
    ]),
    downtimeReasons: uniqueSorted(
      data.downtimeEvents.flatMap((record) =>
        uniqueSorted([record.reason, record.reasonType]),
      ),
    ),
  };
}
