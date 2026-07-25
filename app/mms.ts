import * as XLSX from "xlsx";
import {
  queryMmsAnalytics,
  type MmsAnalyticsFilters,
} from "./analytics-query-engine.ts";
import {
  aggregateAvailabilityPerformance,
  calculateAvailabilityPerformance,
  classifyOeeExclusion,
  type AvailabilityPerformanceAnalytics,
  type AvailabilityPerformanceResult,
} from "./availability-performance-engine.ts";
import {
  buildDowntimeAnalytics,
  type DowntimeAnalytics,
} from "./downtime-engine.ts";
import {
  calculateProductionMetrics,
  type ProductionCalculationResult,
} from "./production-engine.ts";
import {
  buildQualityAnalytics,
  type QualityAnalytics,
} from "./quality-engine.ts";

export type {
  AvailabilityPerformanceAnalytics,
  AvailabilityPerformanceInput,
  AvailabilityPerformanceRecord,
  AvailabilityPerformanceResult,
  OeeAggregate,
  OeeComponentIssueCode,
  OeeExclusionReason,
  PendingOeeMetric,
} from "./availability-performance-engine.ts";
export {
  getMmsFilterOptions,
  normalizeMmsAnalyticsFilters,
  queryMmsAnalytics,
} from "./analytics-query-engine.ts";
export type {
  AnalyticsFilterValue,
  DataQualityFinding,
  FilteredDataQuality,
  FilteredMmsAnalytics,
  MmsAnalyticsFilters,
  MmsFilterOptions,
  NormalizedMmsAnalyticsFilters,
  ProductionQueryAggregate,
  ProductionQueryAnalytics,
} from "./analytics-query-engine.ts";
export type {
  DowntimeAggregate,
  DowntimeAnalytics,
  DowntimeClassification,
  DowntimeContextInterval,
  DowntimeEngineEventInput,
  DowntimeEngineOptions,
  DowntimeEventIntelligence,
  DowntimeIntelligenceIssueCode,
  DowntimeReasonPareto,
  FinancialLossComparison,
} from "./downtime-engine.ts";
export type {
  MetricComparison,
  ProductionCalculationInput,
  ProductionCalculationIssueCode,
  ProductionCalculationResult,
  ProductionEngineOptions,
  QuantitySource,
  StandardizedCycleTimes,
} from "./production-engine.ts";
export type {
  QualityAggregate,
  QualityAnalytics,
  QualityIssueCode,
  QualityRecordInput,
  QualityRecordResult,
} from "./quality-engine.ts";

export type ValidationSeverity = "error" | "warning";

export type ValidationCode =
  | "CROSS_MIDNIGHT_END_INFERRED"
  | "DUPLICATE_DOWNTIME_EVENT"
  | "DUPLICATE_PRODUCTION_INTERVAL"
  | "INVALID_DATE"
  | "INVALID_DURATION"
  | "INVALID_INTERVAL"
  | "INVALID_NUMBER"
  | "MISSING_MACHINE"
  | "MISSING_MACHINE_TYPE"
  | "MISSING_OPERATOR"
  | "MISSING_PRODUCT"
  | "MISSING_PRODUCT_NAME"
  | "MISSING_REASON"
  | "MISSING_SHIFT"
  | "OVERLAPPING_DOWNTIME_EVENT"
  | "OVERLAPPING_PRODUCTION_INTERVAL"
  | "QUANTITY_MISMATCH"
  | "UNREPORTED_DOWNTIME";

export type ValidationIssue = {
  code: ValidationCode;
  severity: ValidationSeverity;
  message: string;
  sheet: "Product Log Book" | "Down Time Details";
  rowNumber: number;
  recordId: string;
  field?: string;
};

export type OperatorReference = {
  raw: string;
  names: string[];
  isMissing: boolean;
};

export type ProductReference = {
  partNumber: string;
  partName: string;
  partErpCode: string;
  productName: string;
  erpCode: string;
};

export type ProductionTimeSeconds = {
  shift: number | null;
  allowed: number | null;
  operative: number | null;
  nonOperative: number | null;
  downtime: number | null;
  systemOff: number | null;
  setup: number | null;
  additionalOvertime: number | null;
  productionGap: number | null;
};

export type CycleTimeSeconds = {
  standard: number | null;
  approved: number | null;
  achieved: number | null;
};

export type ProductionQuantities = {
  stroke: number | null;
  multiplier: number | null;
  reported: number | null;
  calculatedFromStroke: number | null;
  shiftTarget: number | null;
  operativeTimeTarget: number | null;
  productionLoss: number | null;
  rejected: number | null;
  reworked: number | null;
  errorStroke: number | null;
};

export type ProductionCosts = {
  part: number | null;
  component: number | null;
  machinePerHour: number | null;
  operatorPerHour: number | null;
};

export type ProductionInterval = {
  id: string;
  sourceSheet: "Product Log Book";
  sourceRow: number;
  date: string | null;
  startAt: string | null;
  endAt: string | null;
  startEpochMs: number | null;
  endEpochMs: number | null;
  machine: string;
  machineType: string | null;
  shift: string;
  product: ProductReference;
  operator: OperatorReference;
  timesSeconds: ProductionTimeSeconds;
  cycleTimesSeconds: CycleTimeSeconds;
  quantities: ProductionQuantities;
  calculations: ProductionCalculationResult;
  oeeComponents: AvailabilityPerformanceResult;
  costs: ProductionCosts;
  scrapPerPart: number | null;
  qualityInterlock: string;
  processDependency: string;
  proxy: string;
  toolRequired: string;
  issueCodes: ValidationCode[];
  isValid: boolean;
};

export type DowntimeEvent = {
  id: string;
  sourceSheet: "Down Time Details";
  sourceRow: number;
  date: string | null;
  startAt: string | null;
  endAt: string | null;
  startEpochMs: number | null;
  endEpochMs: number | null;
  durationSeconds: number | null;
  machine: string;
  shift: string;
  productName: string;
  operator: OperatorReference;
  reasonType: string;
  reason: string;
  isUnreported: boolean;
  reportedMachineHourLoss: number | null;
  issueCodes: ValidationCode[];
  isValid: boolean;
};

export type CanonicalMmsData = {
  source: {
    company: string;
    fileName: string;
    parsedAt: string;
  };
  productionIntervals: ProductionInterval[];
  downtimeEvents: DowntimeEvent[];
  availabilityPerformance: AvailabilityPerformanceAnalytics;
  qualityAnalytics: QualityAnalytics;
  downtimeAnalytics: DowntimeAnalytics;
  validationIssues: ValidationIssue[];
  importStats: {
    productRowsRead: number;
    downtimeRowsRead: number;
    productTotalRowsExcluded: number;
    downtimeTotalRowsExcluded: number;
    errorCount: number;
    warningCount: number;
  };
};

export type MachineSummary = {
  machine: string;
  production: number;
  target: number;
  attainment: number | null;
  downtimeHours: number;
  revenueLoss: number;
  downtimeEvents: number;
  unreportedRate: number;
};

export type ShiftSummary = {
  shift: string;
  production: number;
  target: number;
  attainment: number | null;
  downtimeHours: number;
  revenueLoss: number;
};

export type MonthlySummary = ShiftSummary & { month: string };

export type MmsSummary = {
  selection: {
    dateFrom: string | null;
    dateTo: string | null;
    activeFilterCount: number;
  };
  source: {
    company: string;
    fileName: string;
    generatedAt: string;
    productDateRange: [string, string];
    downtimeDateRange: [string, string];
  };
  overview: {
    machines: number;
    productRecords: number;
    downtimeEvents: number;
    totalProduction: number;
    totalTarget: number;
    targetAttainment: number | null;
    downtimeHours: number;
    reportedRevenueLoss: number;
  };
  quality: {
    unreportedDowntimeEvents: number;
    unreportedDowntimeRate: number;
    missingProductRecords: number;
    missingDowntimeProducts: number;
    noOperatorProductRecords: number;
    noOperatorDowntimeEvents: number;
    invalidDurations: number;
    zeroRejectRecords: number;
    zeroReworkRecords: number;
  };
  machines: MachineSummary[];
  shifts: ShiftSummary[];
  monthly: MonthlySummary[];
  latestDay: {
    date: string;
    production: number;
    target: number;
    attainment: number | null;
    downtimeHours: number;
    reportedRevenueLoss: number;
    topDowntimeMachine: string;
    topDowntimeMachineHours: number;
  };
};

export type MmsSourceRow = {
  rowNumber: number;
  values: Record<string, unknown>;
};

export type CanonicalMmsRowsInput = {
  company: string;
  sourceName: string;
  productionRows: MmsSourceRow[];
  downtimeRows: MmsSourceRow[];
  parsedAt?: string;
};

type TimelineRecord = {
  id: string;
  machine: string;
  startEpochMs: number | null;
  endEpochMs: number | null;
  sourceSheet: "Product Log Book" | "Down Time Details";
  sourceRow: number;
  issueCodes: ValidationCode[];
};

type Accumulator = {
  production: number;
  target: number;
  downtimeHours: number;
  revenueLoss: number;
  productRecords: number;
  downtimeEvents: number;
  unreportedEvents: number;
};

const TEXT_MISSING_MARKERS = new Set(["", "NONE", "N/A", "NA", "-"]);
const PRODUCT_SHEET = "Product Log Book" as const;
const DOWNTIME_SHEET = "Down Time Details" as const;
const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3_600;

function clean(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function normalized(value: unknown): string {
  return clean(value).toUpperCase();
}

/**
 * `NULL` and `NULL TURN` are intentionally not missing markers. 3D confirmed
 * that both are user-defined product names in MMS.
 */
export function isMissingText(value: unknown): boolean {
  return TEXT_MISSING_MARKERS.has(normalized(value));
}

function isBlankCell(value: unknown): boolean {
  return value == null || clean(value) === "";
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = clean(value).replaceAll(",", "");
  if (!raw || TEXT_MISSING_MARKERS.has(raw.toUpperCase())) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsedTimestamp(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const decoded = XLSX.SSF.parse_date_code(value);
    if (decoded) {
      return new Date(decoded.y, decoded.m - 1, decoded.d, decoded.H, decoded.M, decoded.S);
    }
  }

  const raw = clean(value).replace(/\s+/g, " ");
  const match = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i,
  );
  if (!match) return null;

  const [, dd, mm, yyyy, hh = "0", min = "0", sec = "0", meridiem] = match;
  let hour = Number(hh);
  if (meridiem?.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (meridiem?.toUpperCase() === "AM" && hour === 12) hour = 0;

  const result = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    hour,
    Number(min),
    Number(sec),
  );
  if (
    Number.isNaN(result.getTime()) ||
    result.getFullYear() !== Number(yyyy) ||
    result.getMonth() !== Number(mm) - 1 ||
    result.getDate() !== Number(dd)
  ) {
    return null;
  }
  return result;
}

function normalizedIntervalEnd(
  start: Date | null,
  end: Date | null,
  shift: string,
): { value: Date | null; crossMidnightInferred: boolean } {
  if (!start || !end || end.getTime() > start.getTime()) {
    return { value: end, crossMidnightInferred: false };
  }

  const looksLikeNightShift =
    normalized(shift).includes("SHIFT 2") ||
    (start.getHours() >= 12 && end.getHours() < 12);
  if (!looksLikeNightShift) return { value: end, crossMidnightInferred: false };

  const adjusted = new Date(end.getTime());
  adjusted.setDate(adjusted.getDate() + 1);
  const durationMs = adjusted.getTime() - start.getTime();
  if (durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) {
    return { value: end, crossMidnightInferred: false };
  }
  return { value: adjusted, crossMidnightInferred: true };
}

function clockDurationSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * SECONDS_PER_DAY);
  }
  const match = clean(value).match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (minutes > 59 || seconds > 59) return null;
  return hours * SECONDS_PER_HOUR + minutes * 60 + seconds;
}

/**
 * Setup, gap, overtime and cycle fields are seconds in the MMS export when
 * numeric. If an H:M[:S] string appears, it is normalized to seconds as well.
 */
function secondsValue(value: unknown): number | null {
  const number = numeric(value);
  if (number != null) return number >= 0 ? number : null;
  return clockDurationSeconds(value);
}

function localIsoTimestamp(date: Date | null): string | null {
  if (!date) return null;
  return [
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`,
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
      2,
      "0",
    )}:${String(date.getSeconds()).padStart(2, "0")}`,
  ].join("T");
}

function isoDay(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function monthKey(day: string): string {
  return day.slice(0, 7);
}

function rounded(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function recordId(prefix: "PI" | "DT", fingerprint: string): string {
  return `${prefix}-${stableHash(fingerprint)}`;
}

function operatorReference(value: unknown): OperatorReference {
  const raw = clean(value);
  const tokens = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const names = tokens.filter((item) => normalized(item) !== "NO OPERATOR");
  return {
    raw,
    names,
    isMissing: !raw || tokens.some((item) => normalized(item) === "NO OPERATOR"),
  };
}

function isTotalLabel(value: unknown): boolean {
  return normalized(value).replace(/[=>\s]/g, "") === "TOTAL";
}

function isProductTotalRow(row: MmsSourceRow): boolean {
  return (
    isTotalLabel(row.values["Part No."]) ||
    isTotalLabel(row.values.Machine) ||
    isTotalLabel(row.values.Shift)
  );
}

function isDowntimeTotalRow(row: MmsSourceRow): boolean {
  return isTotalLabel(row.values.Shift) || isTotalLabel(row.values.Machine);
}

function extractRows(
  workbook: XLSX.WorkBook,
  requestedName: "Product Log Book" | "Down Time Details",
): MmsSourceRow[] {
  const sheetName =
    workbook.SheetNames.find(
      (name) => name.trim().toLowerCase() === requestedName.toLowerCase(),
    ) ??
    workbook.SheetNames.find((name) =>
      name.toLowerCase().includes(requestedName.toLowerCase()),
    );
  if (!sheetName) throw new Error(`The workbook does not contain a “${requestedName}” sheet.`);

  const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });
  const headerIndex = grid.findIndex(
    (row) =>
      clean(row?.[0]).toLowerCase() === "date" &&
      clean(row?.[1]).toLowerCase() === "machine",
  );
  if (headerIndex < 0) throw new Error(`Could not find the data headers in “${sheetName}”.`);

  const headers = grid[headerIndex].map(clean);
  return grid
    .slice(headerIndex + 1)
    .map((row, index) => ({
      rowNumber: headerIndex + index + 2,
      values: Object.fromEntries(headers.map((header, column) => [header, row[column]])),
    }))
    .filter((row) => Object.values(row.values).some((value) => !isBlankCell(value)));
}

function addIssue(
  issues: ValidationIssue[],
  record: TimelineRecord,
  code: ValidationCode,
  severity: ValidationSeverity,
  message: string,
  field?: string,
): void {
  if (!record.issueCodes.includes(code)) record.issueCodes.push(code);
  issues.push({
    code,
    severity,
    message,
    sheet: record.sourceSheet,
    rowNumber: record.sourceRow,
    recordId: record.id,
    field,
  });
}

function addRequiredFieldIssues(
  issues: ValidationIssue[],
  record: TimelineRecord,
  values: {
    machine: string;
    shift: string;
    date: Date | null;
    rawDate: unknown;
    start: Date | null;
    rawStart: unknown;
    end: Date | null;
    rawEnd: unknown;
  },
): void {
  if (!values.machine) {
    addIssue(issues, record, "MISSING_MACHINE", "error", "Machine is blank.", "Machine");
  }
  if (!values.shift) {
    addIssue(issues, record, "MISSING_SHIFT", "error", "Shift is blank.", "Shift");
  }
  if (!values.date) {
    addIssue(
      issues,
      record,
      "INVALID_DATE",
      "error",
      isBlankCell(values.rawDate) ? "Date is blank." : "Date could not be parsed.",
      "Date",
    );
  }
  if (!values.start) {
    addIssue(
      issues,
      record,
      "INVALID_DATE",
      "error",
      isBlankCell(values.rawStart) ? "From Time is blank." : "From Time could not be parsed.",
      "From Time",
    );
  }
  if (!values.end) {
    addIssue(
      issues,
      record,
      "INVALID_DATE",
      "error",
      isBlankCell(values.rawEnd) ? "Till Time is blank." : "Till Time could not be parsed.",
      "Till Time",
    );
  }
  if (values.start && values.end && values.end.getTime() <= values.start.getTime()) {
    addIssue(
      issues,
      record,
      "INVALID_INTERVAL",
      "error",
      "Till Time must be later than From Time.",
      "Till Time",
    );
  }
}

function addNumericIssue(
  issues: ValidationIssue[],
  record: TimelineRecord,
  raw: unknown,
  parsed: number | null,
  field: string,
  isDuration = false,
): void {
  if (!isBlankCell(raw) && parsed == null) {
    addIssue(
      issues,
      record,
      isDuration ? "INVALID_DURATION" : "INVALID_NUMBER",
      "error",
      `${field} could not be parsed.`,
      field,
    );
  }
}

function validateTimeline(
  records: TimelineRecord[],
  issues: ValidationIssue[],
  overlapCode:
    | "OVERLAPPING_PRODUCTION_INTERVAL"
    | "OVERLAPPING_DOWNTIME_EVENT",
): void {
  const byMachine = new Map<string, TimelineRecord[]>();
  for (const record of records) {
    if (!record.machine || record.startEpochMs == null || record.endEpochMs == null) continue;
    const key = normalized(record.machine);
    const group = byMachine.get(key) ?? [];
    group.push(record);
    byMachine.set(key, group);
  }

  for (const group of byMachine.values()) {
    group.sort((a, b) => (a.startEpochMs ?? 0) - (b.startEpochMs ?? 0));
    let active: TimelineRecord | null = null;
    for (const current of group) {
      if (
        active &&
        current.startEpochMs != null &&
        active.endEpochMs != null &&
        current.startEpochMs < active.endEpochMs
      ) {
        addIssue(
          issues,
          current,
          overlapCode,
          "error",
          `Interval overlaps ${active.id} on the same machine.`,
        );
        if (!active.issueCodes.includes(overlapCode)) {
          addIssue(
            issues,
            active,
            overlapCode,
            "error",
            `Interval overlaps ${current.id} on the same machine.`,
          );
        }
      }
      if (!active || (current.endEpochMs ?? 0) > (active.endEpochMs ?? 0)) active = current;
    }
  }
}

function validateDuplicates(
  records: TimelineRecord[],
  issues: ValidationIssue[],
  duplicateCode:
    | "DUPLICATE_PRODUCTION_INTERVAL"
    | "DUPLICATE_DOWNTIME_EVENT",
): void {
  const seen = new Map<string, TimelineRecord>();
  for (const current of records) {
    const fingerprint = [
      normalized(current.machine),
      current.startEpochMs,
      current.endEpochMs,
    ].join("|");
    const previous = seen.get(fingerprint);
    if (previous) {
      addIssue(
        issues,
        current,
        duplicateCode,
        "error",
        `Record duplicates ${previous.id}.`,
      );
    } else {
      seen.set(fingerprint, current);
    }
  }
}

function finalizeValidity(
  records: Array<ProductionInterval | DowntimeEvent>,
  issues: ValidationIssue[],
): void {
  const invalidIds = new Set(
    issues.filter((issue) => issue.severity === "error").map((issue) => issue.recordId),
  );
  for (const record of records) record.isValid = !invalidIds.has(record.id);
}

function parseProductionInterval(
  row: MmsSourceRow,
  issues: ValidationIssue[],
): ProductionInterval {
  const values = row.values;
  const machine = clean(values.Machine);
  const shift = clean(values.Shift);
  const date = parsedTimestamp(values.Date);
  const start = parsedTimestamp(values["From Time"]);
  const parsedEnd = parsedTimestamp(values["Till Time"]);
  const { value: end, crossMidnightInferred } = normalizedIntervalEnd(
    start,
    parsedEnd,
    shift,
  );
  const productName = clean(values["Product Name"]);
  const partNumber = clean(values["Part No."]);
  const partName = clean(values["Part Name"]);
  const operator = operatorReference(values.Operator);
  const rawMachineType = clean(values["Machine Type"]);
  const machineType =
    !rawMachineType || normalized(rawMachineType) === "NO TYPE" ? null : rawMachineType;
  const stroke = numeric(values.Stroke);
  const multiplier = numeric(values["M. Factor"]);
  const reportedQuantity = numeric(values.Qty);
  const shiftTimeSeconds = clockDurationSeconds(values["Shift Time"]);
  const allowedTimeSeconds = clockDurationSeconds(values["Allowed Time"]);
  const operativeTimeSeconds = clockDurationSeconds(values["Opr. Time"]);
  const standardCycleTimeSeconds = secondsValue(values["Std. Cycle Time"]);
  const approvedCycleTimeSeconds = secondsValue(values["Approved Cycle Time"]);
  const reportedAchievedCycleTimeSeconds = secondsValue(
    values["Achieve Cycle Time"],
  );
  const shiftTarget = numeric(values["Shift Target"]);
  const reportedOperativeTimeTarget = numeric(values["Opr. Time Target"]);
  const reportedProductionLoss = numeric(values["Product Loss"]);
  const calculations = calculateProductionMetrics({
    stroke,
    multiplier,
    reportedQuantity,
    operativeTimeSeconds,
    standardCycleTimeSeconds,
    approvedCycleTimeSeconds,
    reportedAchievedCycleTimeSeconds,
    reportedOperativeTimeTarget,
    shiftTarget,
    reportedProductionLoss,
  });
  const oeeComponents = calculateAvailabilityPerformance({
    shiftTimeSeconds,
    allowedTimeSeconds,
    operativeTimeSeconds,
    producedQuantity: calculations.producedQuantityUsed,
    operativeTimeTarget: calculations.operativeTimeTarget,
    exclusionReason: classifyOeeExclusion([
      productName,
      partName,
      partNumber,
    ]),
  });

  const fingerprint = [
    machine,
    shift,
    localIsoTimestamp(start),
    localIsoTimestamp(end),
    partNumber,
    productName,
  ].join("|");
  const interval: ProductionInterval = {
    id: recordId("PI", fingerprint),
    sourceSheet: PRODUCT_SHEET,
    sourceRow: row.rowNumber,
    date: date ? isoDay(date) : null,
    startAt: localIsoTimestamp(start),
    endAt: localIsoTimestamp(end),
    startEpochMs: start?.getTime() ?? null,
    endEpochMs: end?.getTime() ?? null,
    machine,
    machineType,
    shift,
    product: {
      partNumber,
      partName,
      partErpCode: clean(values["Part ERP Code"]),
      productName,
      erpCode: clean(values["ERP Code"]),
    },
    operator,
    timesSeconds: {
      shift: shiftTimeSeconds,
      allowed: allowedTimeSeconds,
      operative: operativeTimeSeconds,
      nonOperative: clockDurationSeconds(values["Non Opr. Time"]),
      downtime: clockDurationSeconds(values["Down Time"]),
      systemOff: clockDurationSeconds(values["System Off"]),
      setup: secondsValue(values["Setup Time"]),
      additionalOvertime: secondsValue(values["Additional Over Time"]),
      productionGap: secondsValue(values["Prod Gap Between"]),
    },
    cycleTimesSeconds: {
      standard: standardCycleTimeSeconds,
      approved: approvedCycleTimeSeconds,
      achieved: reportedAchievedCycleTimeSeconds,
    },
    quantities: {
      stroke,
      multiplier,
      reported: reportedQuantity,
      calculatedFromStroke: calculations.actualQuantity,
      shiftTarget,
      operativeTimeTarget: reportedOperativeTimeTarget,
      productionLoss: reportedProductionLoss,
      rejected: numeric(values["Reject Qty"]),
      reworked: numeric(values["Rework Qty"]),
      errorStroke: numeric(values["Error Stroke"]),
    },
    calculations,
    oeeComponents,
    costs: {
      part: numeric(values["Part Cost"]),
      component: numeric(values["Component Cost"]),
      machinePerHour: numeric(values["Running Hrs Cost"]),
      operatorPerHour: numeric(values["Operator Per Hrs Cost"]),
    },
    scrapPerPart: numeric(values["Scrap part"]),
    qualityInterlock: clean(values["Quality Interlock"]),
    processDependency: clean(values["Process Dependency"]),
    proxy: clean(values.Proxy),
    toolRequired: clean(values["Tool Yes/No"]),
    issueCodes: [],
    isValid: true,
  };

  addRequiredFieldIssues(issues, interval, {
    machine,
    shift,
    date,
    rawDate: values.Date,
    start,
    rawStart: values["From Time"],
    end,
    rawEnd: values["Till Time"],
  });
  if (crossMidnightInferred) {
    addIssue(
      issues,
      interval,
      "CROSS_MIDNIGHT_END_INFERRED",
      "warning",
      "Till Time was interpreted as the following day for a night-shift interval.",
      "Till Time",
    );
  }
  if (!partNumber && !productName) {
    addIssue(
      issues,
      interval,
      "MISSING_PRODUCT",
      "warning",
      "Part number and product name are both blank.",
      "Product Name",
    );
  } else if (!productName) {
    addIssue(
      issues,
      interval,
      "MISSING_PRODUCT_NAME",
      "warning",
      "Product Name is blank.",
      "Product Name",
    );
  }
  if (operator.isMissing) {
    addIssue(
      issues,
      interval,
      "MISSING_OPERATOR",
      "warning",
      "Operator was not entered.",
      "Operator",
    );
  }
  if (!machineType) {
    addIssue(
      issues,
      interval,
      "MISSING_MACHINE_TYPE",
      "warning",
      "Machine Type was not entered.",
      "Machine Type",
    );
  }

  const durationFields: Array<[string, unknown, number | null]> = [
    ["Shift Time", values["Shift Time"], interval.timesSeconds.shift],
    ["Allowed Time", values["Allowed Time"], interval.timesSeconds.allowed],
    ["Opr. Time", values["Opr. Time"], interval.timesSeconds.operative],
    ["Non Opr. Time", values["Non Opr. Time"], interval.timesSeconds.nonOperative],
    ["Down Time", values["Down Time"], interval.timesSeconds.downtime],
    ["System Off", values["System Off"], interval.timesSeconds.systemOff],
    ["Setup Time", values["Setup Time"], interval.timesSeconds.setup],
    [
      "Additional Over Time",
      values["Additional Over Time"],
      interval.timesSeconds.additionalOvertime,
    ],
    ["Prod Gap Between", values["Prod Gap Between"], interval.timesSeconds.productionGap],
    ["Std. Cycle Time", values["Std. Cycle Time"], interval.cycleTimesSeconds.standard],
    [
      "Approved Cycle Time",
      values["Approved Cycle Time"],
      interval.cycleTimesSeconds.approved,
    ],
    [
      "Achieve Cycle Time",
      values["Achieve Cycle Time"],
      interval.cycleTimesSeconds.achieved,
    ],
  ];
  for (const [field, raw, parsed] of durationFields) {
    addNumericIssue(issues, interval, raw, parsed, field, true);
  }

  const numericFields: Array<[string, unknown, number | null]> = [
    ["M. Factor", values["M. Factor"], interval.quantities.multiplier],
    ["Stroke", values.Stroke, interval.quantities.stroke],
    ["Qty", values.Qty, interval.quantities.reported],
    ["Shift Target", values["Shift Target"], interval.quantities.shiftTarget],
    [
      "Opr. Time Target",
      values["Opr. Time Target"],
      interval.quantities.operativeTimeTarget,
    ],
    ["Product Loss", values["Product Loss"], interval.quantities.productionLoss],
    ["Reject Qty", values["Reject Qty"], interval.quantities.rejected],
    ["Rework Qty", values["Rework Qty"], interval.quantities.reworked],
    ["Error Stroke", values["Error Stroke"], interval.quantities.errorStroke],
    ["Scrap part", values["Scrap part"], interval.scrapPerPart],
  ];
  for (const [field, raw, parsed] of numericFields) {
    addNumericIssue(issues, interval, raw, parsed, field);
  }
  if (calculations.comparisons.quantity.matches === false) {
    addIssue(
      issues,
      interval,
      "QUANTITY_MISMATCH",
      "warning",
      `Reported Qty ${calculations.comparisons.quantity.reported} does not match Stroke × M. Factor ${calculations.actualQuantity}.`,
      "Qty",
    );
  }

  return interval;
}

function parseDowntimeEvent(
  row: MmsSourceRow,
  issues: ValidationIssue[],
): DowntimeEvent {
  const values = row.values;
  const machine = clean(values.Machine);
  const shift = clean(values.Shift);
  const date = parsedTimestamp(values.Date);
  const start = parsedTimestamp(values["From Time"]);
  const parsedEnd = parsedTimestamp(values["Till Time"]);
  const { value: end, crossMidnightInferred } = normalizedIntervalEnd(
    start,
    parsedEnd,
    shift,
  );
  const durationSeconds = clockDurationSeconds(values.Duration);
  const reason = clean(values.Reason);
  const reasonType = clean(values.Reason_Type);
  const productName = clean(values["Product Name"]);
  const operator = operatorReference(values["Operator Name"]);

  const fingerprint = [
    machine,
    shift,
    localIsoTimestamp(start),
    localIsoTimestamp(end),
    reasonType,
    reason,
  ].join("|");
  const event: DowntimeEvent = {
    id: recordId("DT", fingerprint),
    sourceSheet: DOWNTIME_SHEET,
    sourceRow: row.rowNumber,
    date: date ? isoDay(date) : null,
    startAt: localIsoTimestamp(start),
    endAt: localIsoTimestamp(end),
    startEpochMs: start?.getTime() ?? null,
    endEpochMs: end?.getTime() ?? null,
    durationSeconds,
    machine,
    shift,
    productName,
    operator,
    reasonType,
    reason,
    isUnreported: normalized(reason) === "UNREPORTED",
    reportedMachineHourLoss: numeric(values.Revenue),
    issueCodes: [],
    isValid: true,
  };

  addRequiredFieldIssues(issues, event, {
    machine,
    shift,
    date,
    rawDate: values.Date,
    start,
    rawStart: values["From Time"],
    end,
    rawEnd: values["Till Time"],
  });
  if (crossMidnightInferred) {
    addIssue(
      issues,
      event,
      "CROSS_MIDNIGHT_END_INFERRED",
      "warning",
      "Till Time was interpreted as the following day for a night-shift event.",
      "Till Time",
    );
  }
  addNumericIssue(issues, event, values.Duration, durationSeconds, "Duration", true);
  addNumericIssue(
    issues,
    event,
    values.Revenue,
    event.reportedMachineHourLoss,
    "Revenue",
  );
  if (!productName) {
    addIssue(
      issues,
      event,
      "MISSING_PRODUCT_NAME",
      "warning",
      "Product Name is blank.",
      "Product Name",
    );
  }
  if (operator.isMissing) {
    addIssue(
      issues,
      event,
      "MISSING_OPERATOR",
      "warning",
      "Operator was not entered.",
      "Operator Name",
    );
  }
  if (!reason) {
    addIssue(
      issues,
      event,
      "MISSING_REASON",
      "warning",
      "Downtime reason is blank.",
      "Reason",
    );
  } else if (event.isUnreported) {
    addIssue(
      issues,
      event,
      "UNREPORTED_DOWNTIME",
      "warning",
      "Downtime reason is UNREPORTED.",
      "Reason",
    );
  }

  return event;
}

export function canonicalizeMmsRows({
  company,
  sourceName,
  productionRows,
  downtimeRows,
  parsedAt = new Date().toISOString(),
}: CanonicalMmsRowsInput): CanonicalMmsData {
  const productDataRows = productionRows.filter(
    (row) => !isProductTotalRow(row),
  );
  const downtimeDataRows = downtimeRows.filter(
    (row) => !isDowntimeTotalRow(row),
  );
  const validationIssues: ValidationIssue[] = [];

  const productionIntervals = productDataRows.map((row) =>
    parseProductionInterval(row, validationIssues),
  );
  const downtimeEvents = downtimeDataRows.map((row) =>
    parseDowntimeEvent(row, validationIssues),
  );

  validateDuplicates(
    productionIntervals,
    validationIssues,
    "DUPLICATE_PRODUCTION_INTERVAL",
  );
  validateDuplicates(downtimeEvents, validationIssues, "DUPLICATE_DOWNTIME_EVENT");
  validateTimeline(
    productionIntervals,
    validationIssues,
    "OVERLAPPING_PRODUCTION_INTERVAL",
  );
  validateTimeline(downtimeEvents, validationIssues, "OVERLAPPING_DOWNTIME_EVENT");
  finalizeValidity([...productionIntervals, ...downtimeEvents], validationIssues);
  const availabilityPerformance = aggregateAvailabilityPerformance(
    productionIntervals.map((interval) => ({
      id: interval.id,
      machine: interval.machine,
      shift: interval.shift,
      date: interval.date,
      ...interval.oeeComponents,
    })),
  );
  const qualityAnalytics = buildQualityAnalytics(
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
  const downtimeAnalytics = buildDowntimeAnalytics(
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

  return {
    source: {
      company: clean(company) || "Imported MMS dataset",
      fileName: sourceName,
      parsedAt,
    },
    productionIntervals,
    downtimeEvents,
    availabilityPerformance,
    qualityAnalytics,
    downtimeAnalytics,
    validationIssues,
    importStats: {
      productRowsRead: productionRows.length,
      downtimeRowsRead: downtimeRows.length,
      productTotalRowsExcluded:
        productionRows.length - productDataRows.length,
      downtimeTotalRowsExcluded: downtimeRows.length - downtimeDataRows.length,
      errorCount: validationIssues.filter((issue) => issue.severity === "error").length,
      warningCount: validationIssues.filter((issue) => issue.severity === "warning").length,
    },
  };
}

export function canonicalizeWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
): CanonicalMmsData {
  return canonicalizeMmsRows({
    company:
      clean(workbook.Sheets[workbook.SheetNames[0]]?.A1?.v) ||
      "Imported MMS dataset",
    sourceName: fileName,
    productionRows: extractRows(workbook, PRODUCT_SHEET),
    downtimeRows: extractRows(workbook, DOWNTIME_SHEET),
  });
}

const emptyAccumulator = (): Accumulator => ({
  production: 0,
  target: 0,
  downtimeHours: 0,
  revenueLoss: 0,
  productRecords: 0,
  downtimeEvents: 0,
  unreportedEvents: 0,
});

function canonicalDateRange(days: Array<string | null>): [string, string] {
  const valid = days.filter((day): day is string => Boolean(day)).sort();
  return valid.length ? [valid[0], valid.at(-1)!] : ["Not available", "Not available"];
}

export function summarizeCanonicalData(
  sourceData: CanonicalMmsData,
  filters: MmsAnalyticsFilters = {},
): MmsSummary {
  const query = queryMmsAnalytics(sourceData, filters);
  const data: CanonicalMmsData = {
    ...sourceData,
    productionIntervals: query.records.productionIntervals,
    downtimeEvents: query.records.downtimeEvents,
    validationIssues: query.dataQuality.validationIssues,
  };
  const machines = new Map<string, Accumulator>();
  const shifts = new Map<string, Accumulator>();
  const months = new Map<string, Accumulator>();
  const days = new Map<string, Accumulator>();

  const get = (map: Map<string, Accumulator>, key: string) => {
    if (!map.has(key)) map.set(key, emptyAccumulator());
    return map.get(key)!;
  };

  for (const interval of data.productionIntervals) {
    if (!interval.machine) continue;
    const production =
      interval.quantities.reported ?? interval.quantities.calculatedFromStroke ?? 0;
    const target = interval.quantities.shiftTarget ?? 0;

    const machineValue = get(machines, interval.machine);
    machineValue.production += production;
    machineValue.target += target;
    machineValue.productRecords += 1;

    if (interval.shift) {
      const shiftValue = get(shifts, interval.shift);
      shiftValue.production += production;
      shiftValue.target += target;
    }
    if (interval.date) {
      const monthValue = get(months, monthKey(interval.date));
      monthValue.production += production;
      monthValue.target += target;
      const dayValue = get(days, interval.date);
      dayValue.production += production;
      dayValue.target += target;
    }
  }

  for (const event of data.downtimeEvents) {
    if (!event.machine) continue;
    const durationHours = (event.durationSeconds ?? 0) / SECONDS_PER_HOUR;
    const loss = event.reportedMachineHourLoss ?? 0;

    const machineValue = get(machines, event.machine);
    machineValue.downtimeHours += durationHours;
    machineValue.revenueLoss += loss;
    machineValue.downtimeEvents += 1;
    if (event.isUnreported) machineValue.unreportedEvents += 1;

    if (event.shift) {
      const shiftValue = get(shifts, event.shift);
      shiftValue.downtimeHours += durationHours;
      shiftValue.revenueLoss += loss;
    }
    if (event.date) {
      const monthValue = get(months, monthKey(event.date));
      monthValue.downtimeHours += durationHours;
      monthValue.revenueLoss += loss;
      const dayValue = get(days, event.date);
      dayValue.downtimeHours += durationHours;
      dayValue.revenueLoss += loss;
    }
  }

  const machineSummaries: MachineSummary[] = Array.from(
    machines,
    ([machine, value]) => ({
      machine,
      production: Math.round(value.production),
      target: rounded(value.target),
      attainment: value.target ? rounded((value.production / value.target) * 100) : null,
      downtimeHours: rounded(value.downtimeHours),
      revenueLoss: Math.round(value.revenueLoss),
      downtimeEvents: value.downtimeEvents,
      unreportedRate: value.downtimeEvents
        ? rounded((value.unreportedEvents / value.downtimeEvents) * 100, 2)
        : 0,
    }),
  ).sort((a, b) => b.downtimeHours - a.downtimeHours);

  const shiftSummaries: ShiftSummary[] = Array.from(shifts, ([shift, value]) => ({
    shift,
    production: Math.round(value.production),
    target: rounded(value.target),
    attainment: value.target ? rounded((value.production / value.target) * 100) : null,
    downtimeHours: rounded(value.downtimeHours),
    revenueLoss: Math.round(value.revenueLoss),
  }));

  const monthlySummaries: MonthlySummary[] = Array.from(months, ([month, value]) => ({
    month,
    shift: month,
    production: Math.round(value.production),
    target: rounded(value.target),
    attainment: value.target ? rounded((value.production / value.target) * 100) : null,
    downtimeHours: rounded(value.downtimeHours),
    revenueLoss: Math.round(value.revenueLoss),
  })).sort((a, b) => a.month.localeCompare(b.month));

  const totalProduction = machineSummaries.reduce((sum, item) => sum + item.production, 0);
  const totalTarget = machineSummaries.reduce((sum, item) => sum + item.target, 0);
  const totalDowntimeHours = machineSummaries.reduce(
    (sum, item) => sum + item.downtimeHours,
    0,
  );
  const totalRevenueLoss = machineSummaries.reduce(
    (sum, item) => sum + item.revenueLoss,
    0,
  );

  const selectedPeriod = Array.from(days.values()).reduce(
    (total, day) => ({
      production: total.production + day.production,
      target: total.target + day.target,
      downtimeHours: total.downtimeHours + day.downtimeHours,
      revenueLoss: total.revenueLoss + day.revenueLoss,
      productRecords: total.productRecords + day.productRecords,
      downtimeEvents: total.downtimeEvents + day.downtimeEvents,
      unreportedEvents: total.unreportedEvents + day.unreportedEvents,
    }),
    emptyAccumulator(),
  );
  const selectedMachineDowntime = new Map<string, number>();
  for (const event of data.downtimeEvents) {
    if (!event.machine) continue;
    selectedMachineDowntime.set(
      event.machine,
      (selectedMachineDowntime.get(event.machine) ?? 0) +
        (event.durationSeconds ?? 0) / SECONDS_PER_HOUR,
    );
  }
  const [topDowntimeMachine = "Not available", topDowntimeMachineHours = 0] =
    Array.from(selectedMachineDowntime.entries()).sort((a, b) => b[1] - a[1])[0] ??
    [];
  const selectedDateLabel =
    query.scope.dateFrom && query.scope.dateFrom === query.scope.dateTo
      ? query.scope.dateFrom
      : [query.scope.dateFrom, query.scope.dateTo].filter(Boolean).join(" to ");

  const unreported = data.downtimeEvents.filter((event) => event.isUnreported).length;
  const invalidDurations = data.validationIssues.filter(
    (issue) => issue.code === "INVALID_DURATION" && issue.field === "Duration",
  ).length;

  return {
    selection: {
      dateFrom: query.scope.dateFrom,
      dateTo: query.scope.dateTo,
      activeFilterCount: query.activeFilterCount,
    },
    source: {
      company: data.source.company,
      fileName: data.source.fileName,
      generatedAt: data.source.parsedAt,
      productDateRange: canonicalDateRange(
        data.productionIntervals.map((interval) => interval.date),
      ),
      downtimeDateRange: canonicalDateRange(
        data.downtimeEvents.map((event) => event.date),
      ),
    },
    overview: {
      machines: machineSummaries.length,
      productRecords: data.productionIntervals.length,
      downtimeEvents: data.downtimeEvents.length,
      totalProduction,
      totalTarget: rounded(totalTarget),
      targetAttainment: totalTarget
        ? rounded((totalProduction / totalTarget) * 100)
        : null,
      downtimeHours: rounded(totalDowntimeHours),
      reportedRevenueLoss: Math.round(totalRevenueLoss),
    },
    quality: {
      unreportedDowntimeEvents: unreported,
      unreportedDowntimeRate: data.downtimeEvents.length
        ? rounded((unreported / data.downtimeEvents.length) * 100, 2)
        : 0,
      missingProductRecords: data.productionIntervals.filter(
        (interval) => !interval.product.partNumber && !interval.product.productName,
      ).length,
      missingDowntimeProducts: data.downtimeEvents.filter(
        (event) => !event.productName,
      ).length,
      noOperatorProductRecords: data.productionIntervals.filter(
        (interval) => interval.operator.isMissing,
      ).length,
      noOperatorDowntimeEvents: data.downtimeEvents.filter(
        (event) => event.operator.isMissing,
      ).length,
      invalidDurations,
      zeroRejectRecords: data.productionIntervals.filter(
        (interval) => interval.quantities.rejected === 0,
      ).length,
      zeroReworkRecords: data.productionIntervals.filter(
        (interval) => interval.quantities.reworked === 0,
      ).length,
    },
    machines: machineSummaries,
    shifts: shiftSummaries,
    monthly: monthlySummaries,
    latestDay: {
      date: selectedDateLabel,
      production: Math.round(selectedPeriod.production),
      target: rounded(selectedPeriod.target),
      attainment: selectedPeriod.target
        ? rounded((selectedPeriod.production / selectedPeriod.target) * 100)
        : null,
      downtimeHours: rounded(selectedPeriod.downtimeHours),
      reportedRevenueLoss: Math.round(selectedPeriod.revenueLoss),
      topDowntimeMachine,
      topDowntimeMachineHours: rounded(topDowntimeMachineHours),
    },
  };
}

export function summarizeWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
  filters: MmsAnalyticsFilters = {},
): MmsSummary {
  return summarizeCanonicalData(canonicalizeWorkbook(workbook, fileName), filters);
}

export function parseMmsCanonicalFile(
  buffer: ArrayBuffer,
  fileName: string,
): CanonicalMmsData {
  const workbook = XLSX.read(buffer, { cellDates: true, type: "array" });
  return canonicalizeWorkbook(workbook, fileName);
}

export function parseMmsFileWithRecords(
  buffer: ArrayBuffer,
  fileName: string,
  filters: MmsAnalyticsFilters = {},
): { canonical: CanonicalMmsData; summary: MmsSummary } {
  const canonical = parseMmsCanonicalFile(buffer, fileName);
  return { canonical, summary: summarizeCanonicalData(canonical, filters) };
}

/**
 * Backwards-compatible dashboard API. Existing UI consumers continue to
 * receive MmsSummary while future calculation phases can use canonical data.
 */
export function parseMmsFile(
  buffer: ArrayBuffer,
  fileName: string,
  filters: MmsAnalyticsFilters = {},
): MmsSummary {
  return parseMmsFileWithRecords(buffer, fileName, filters).summary;
}
