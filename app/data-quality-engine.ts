import type {
  CanonicalMmsData,
  DowntimeEvent,
  ProductionInterval,
  ValidationSeverity,
} from "./mms.ts";

export type DataQualityFindingCode =
  | "REPORTED_QUANTITY_MISMATCH"
  | "ZERO_QUANTITY_WITH_POSITIVE_STROKE"
  | "IMPLICIT_PRODUCT_MULTIPLIER"
  | "MISSING_MULTIPLIER"
  | "MISSING_STANDARD_CYCLE_TIME"
  | "INVALID_OR_ZERO_DURATION"
  | "MISSING_MACHINE"
  | "MISSING_SHIFT"
  | "MISSING_PRODUCT"
  | "MISSING_OPERATOR"
  | "PRODUCT_PLACEHOLDER"
  | "MISSING_DOWNTIME_REASON"
  | "OVERLAPPING_INTERVAL"
  | "DUPLICATE_RECORD"
  | "INCOMPLETE_ACTIVE_SHIFT"
  | "INCONSISTENT_MACHINE_HOUR_COST"
  | "MISSING_REJECTION_ENTRY"
  | "MISSING_REWORK_ENTRY"
  | "STALE_OR_DELAYED_DATA";

export type DataQualityFindingStatus =
  | "valid"
  | "questionable"
  | "invalid"
  | "informational";

export type StructuredDataQualityFinding = {
  id: string;
  code: DataQualityFindingCode;
  severity: ValidationSeverity | "information";
  status: DataQualityFindingStatus;
  machine: string;
  shift: string;
  date: string | null;
  time: string | null;
  product: string;
  sourceSheet: "Product Log Book" | "Down Time Details";
  sourceRow: number;
  recordId: string;
  fieldName: string;
  reportedValue: string | number | null;
  expectedValue: string | number | null;
  recommendedAction: string;
};

export type AdvancedDataQualityOptions = {
  nowEpochMs?: number;
  staleAfterMs?: number;
  activeShiftWindowMs?: number;
  quantityTolerance?: number;
};

export type AdvancedDataQualityAnalytics = {
  generatedAt: string;
  findings: StructuredDataQualityFinding[];
  bySeverity: {
    error: number;
    warning: number;
    information: number;
  };
  byStatus: Record<DataQualityFindingStatus, number>;
  affectedRecordCount: number;
  trustworthyRecordCount: number;
  totalRecordCount: number;
};

type MmsRecord = ProductionInterval | DowntimeEvent;

const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1_000;
const DEFAULT_ACTIVE_SHIFT_WINDOW_MS = 24 * 60 * 60 * 1_000;
const PLACEHOLDER_PRODUCTS = new Set(["NULL", "NULL TURN"]);

function normalized(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function rounded(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function product(record: MmsRecord): string {
  return record.sourceSheet === "Product Log Book"
    ? record.product.productName || record.product.partNumber
    : record.productName;
}

function finding(
  record: MmsRecord,
  input: Omit<
    StructuredDataQualityFinding,
    | "id"
    | "machine"
    | "shift"
    | "date"
    | "time"
    | "product"
    | "sourceSheet"
    | "sourceRow"
    | "recordId"
  >,
): StructuredDataQualityFinding {
  return {
    id: `DQ-${stableHash(
      [input.code, record.id, input.fieldName].join("|"),
    )}`,
    ...input,
    machine: record.machine || "Not provided",
    shift: record.shift || "Not provided",
    date: record.date,
    time: record.startAt ?? record.date,
    product: product(record) || "Not provided",
    sourceSheet: record.sourceSheet,
    sourceRow: record.sourceRow,
    recordId: record.id,
  };
}

function productionFindings(
  interval: ProductionInterval,
  quantityTolerance: number,
): StructuredDataQualityFinding[] {
  const results: StructuredDataQualityFinding[] = [];
  const add = (
    input: Parameters<typeof finding>[1],
  ): void => {
    results.push(finding(interval, input));
  };
  const reported = interval.quantities.reported;
  const stroke = interval.quantities.stroke;
  const multiplier = interval.quantities.multiplier;
  const calculated = interval.quantities.calculatedFromStroke;
  const intervalDuration =
    interval.startEpochMs != null && interval.endEpochMs != null
      ? (interval.endEpochMs - interval.startEpochMs) / 1_000
      : null;

  if (
    reported != null &&
    calculated != null &&
    Math.abs(reported - calculated) > quantityTolerance
  ) {
    add({
      code: "REPORTED_QUANTITY_MISMATCH",
      severity: "warning",
      status: "questionable",
      fieldName: "Qty",
      reportedValue: reported,
      expectedValue: calculated,
      recommendedAction:
        "Keep Reported Qty as authoritative and verify Stroke or M. Factor in the source record.",
    });
  }
  if (reported === 0 && stroke != null && stroke > 0) {
    add({
      code: "ZERO_QUANTITY_WITH_POSITIVE_STROKE",
      severity: "warning",
      status: "questionable",
      fieldName: "Qty",
      reportedValue: reported,
      expectedValue: "Review positive Stroke count",
      recommendedAction:
        "Confirm whether production quantity was omitted or the stroke counter should be ignored.",
    });
  }
  if (multiplier == null) {
    add({
      code: "MISSING_MULTIPLIER",
      severity: "warning",
      status: "questionable",
      fieldName: "M. Factor",
      reportedValue: null,
      expectedValue: "Configured product multiplier",
      recommendedAction:
        "Enter the product M. Factor so Stroke × M. Factor can be used as a validation check.",
    });
  }
  if (stroke != null && stroke > 0 && reported != null && reported > 0) {
    const inferred = rounded(reported / stroke);
    if (
      inferred !== 1 &&
      (multiplier == null || Math.abs(inferred - multiplier) > quantityTolerance)
    ) {
      add({
        code: "IMPLICIT_PRODUCT_MULTIPLIER",
        severity: "information",
        status: "informational",
        fieldName: "M. Factor",
        reportedValue: multiplier,
        expectedValue: inferred,
        recommendedAction:
          "Review the inferred Qty ÷ Stroke ratio and configure it explicitly only if it is the approved product multiplier.",
      });
    }
  }
  if (
    interval.cycleTimesSeconds.standard == null ||
    interval.cycleTimesSeconds.standard <= 0
  ) {
    add({
      code: "MISSING_STANDARD_CYCLE_TIME",
      severity: "error",
      status: "invalid",
      fieldName: "Std. Cycle Time",
      reportedValue: interval.cycleTimesSeconds.standard,
      expectedValue: "Positive cycle time in seconds",
      recommendedAction:
        "Enter the management-approved Standard Cycle Time before calculating targets or Performance.",
    });
  }
  if (intervalDuration == null || intervalDuration <= 0) {
    add({
      code: "INVALID_OR_ZERO_DURATION",
      severity: "error",
      status: "invalid",
      fieldName: "From Time / Till Time",
      reportedValue: intervalDuration,
      expectedValue: "Positive interval duration",
      recommendedAction:
        "Correct the production interval timestamps in the source workbook.",
    });
  }
  if (!interval.machine) {
    add({
      code: "MISSING_MACHINE",
      severity: "error",
      status: "invalid",
      fieldName: "Machine",
      reportedValue: null,
      expectedValue: "Machine identifier",
      recommendedAction: "Assign the production record to a valid machine.",
    });
  }
  if (!interval.shift) {
    add({
      code: "MISSING_SHIFT",
      severity: "error",
      status: "invalid",
      fieldName: "Shift",
      reportedValue: null,
      expectedValue: "Shift identifier",
      recommendedAction: "Assign the production record to a valid shift.",
    });
  }
  const productValue =
    interval.product.productName || interval.product.partNumber;
  if (!productValue) {
    add({
      code: "MISSING_PRODUCT",
      severity: "warning",
      status: "questionable",
      fieldName: "Product Name",
      reportedValue: null,
      expectedValue: "Product or part identifier",
      recommendedAction: "Enter the product or part used during this interval.",
    });
  } else if (PLACEHOLDER_PRODUCTS.has(normalized(productValue))) {
    add({
      code: "PRODUCT_PLACEHOLDER",
      severity: "information",
      status: "informational",
      fieldName: "Product Name",
      reportedValue: productValue,
      expectedValue: "Confirmed user-defined placeholder",
      recommendedAction:
        "No automatic correction is applied; verify that this user-defined MMS product is intentional.",
    });
  }
  if (interval.operator.isMissing) {
    add({
      code: "MISSING_OPERATOR",
      severity: "warning",
      status: "questionable",
      fieldName: "Operator",
      reportedValue: interval.operator.raw || null,
      expectedValue: "Operator name",
      recommendedAction: "Enter the responsible operator in MMS.",
    });
  }
  if (interval.quantities.rejected == null) {
    add({
      code: "MISSING_REJECTION_ENTRY",
      severity: "warning",
      status: "questionable",
      fieldName: "Reject Qty",
      reportedValue: null,
      expectedValue: "Recorded quantity, including zero",
      recommendedAction:
        "Complete the rejection entry after the shift; do not assume a blank value means zero.",
    });
  }
  if (interval.quantities.reworked == null) {
    add({
      code: "MISSING_REWORK_ENTRY",
      severity: "warning",
      status: "questionable",
      fieldName: "Rework Qty",
      reportedValue: null,
      expectedValue: "Recorded quantity, including zero",
      recommendedAction:
        "Complete the rework entry after the shift; do not assume a blank value means zero.",
    });
  }
  if (
    interval.issueCodes.includes("OVERLAPPING_PRODUCTION_INTERVAL")
  ) {
    add({
      code: "OVERLAPPING_INTERVAL",
      severity: "error",
      status: "invalid",
      fieldName: "From Time / Till Time",
      reportedValue: `${interval.startAt ?? "?"} – ${interval.endAt ?? "?"}`,
      expectedValue: "No overlap for the same machine",
      recommendedAction:
        "Correct or split the overlapping machine intervals before aggregation.",
    });
  }
  if (
    interval.issueCodes.includes("DUPLICATE_PRODUCTION_INTERVAL")
  ) {
    add({
      code: "DUPLICATE_RECORD",
      severity: "error",
      status: "invalid",
      fieldName: "Record",
      reportedValue: interval.id,
      expectedValue: "Unique production interval",
      recommendedAction:
        "Remove or correct the duplicate at its source; the module will not silently discard it.",
    });
  }
  return results;
}

function downtimeFindings(
  event: DowntimeEvent,
): StructuredDataQualityFinding[] {
  const results: StructuredDataQualityFinding[] = [];
  const add = (input: Parameters<typeof finding>[1]): void => {
    results.push(finding(event, input));
  };
  if (event.durationSeconds == null || event.durationSeconds <= 0) {
    add({
      code: "INVALID_OR_ZERO_DURATION",
      severity: "error",
      status: "invalid",
      fieldName: "Duration",
      reportedValue: event.durationSeconds,
      expectedValue: "Positive duration in seconds",
      recommendedAction: "Correct the downtime event duration.",
    });
  }
  if (!event.machine) {
    add({
      code: "MISSING_MACHINE",
      severity: "error",
      status: "invalid",
      fieldName: "Machine",
      reportedValue: null,
      expectedValue: "Machine identifier",
      recommendedAction: "Assign the downtime event to a valid machine.",
    });
  }
  if (!event.shift) {
    add({
      code: "MISSING_SHIFT",
      severity: "error",
      status: "invalid",
      fieldName: "Shift",
      reportedValue: null,
      expectedValue: "Shift identifier",
      recommendedAction: "Assign the downtime event to a valid shift.",
    });
  }
  if (event.operator.isMissing) {
    add({
      code: "MISSING_OPERATOR",
      severity: "warning",
      status: "questionable",
      fieldName: "Operator Name",
      reportedValue: event.operator.raw || null,
      expectedValue: "Operator name",
      recommendedAction: "Enter the responsible operator in MMS.",
    });
  }
  if (!event.reason || event.isUnreported) {
    add({
      code: "MISSING_DOWNTIME_REASON",
      severity: "warning",
      status: "questionable",
      fieldName: "Reason",
      reportedValue: event.reason || null,
      expectedValue: "Reported root cause",
      recommendedAction:
        "Classify the continuous stop event with an approved downtime reason.",
    });
  }
  if (event.issueCodes.includes("OVERLAPPING_DOWNTIME_EVENT")) {
    add({
      code: "OVERLAPPING_INTERVAL",
      severity: "error",
      status: "invalid",
      fieldName: "From Time / Till Time",
      reportedValue: `${event.startAt ?? "?"} – ${event.endAt ?? "?"}`,
      expectedValue: "No overlap for the same machine",
      recommendedAction:
        "Correct overlapping downtime events before duration aggregation.",
    });
  }
  if (event.issueCodes.includes("DUPLICATE_DOWNTIME_EVENT")) {
    add({
      code: "DUPLICATE_RECORD",
      severity: "error",
      status: "invalid",
      fieldName: "Record",
      reportedValue: event.id,
      expectedValue: "Unique downtime event",
      recommendedAction:
        "Remove or correct the duplicate at its source; the module will not silently discard it.",
    });
  }
  return results;
}

function mode(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort(
    ([leftValue, leftCount], [rightValue, rightCount]) =>
      rightCount - leftCount || leftValue - rightValue,
  )[0]?.[0] ?? null;
}

export function buildAdvancedDataQualityAnalytics(
  data: Pick<CanonicalMmsData, "productionIntervals" | "downtimeEvents">,
  options: AdvancedDataQualityOptions = {},
): AdvancedDataQualityAnalytics {
  const nowEpochMs = options.nowEpochMs ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const activeWindowMs =
    options.activeShiftWindowMs ?? DEFAULT_ACTIVE_SHIFT_WINDOW_MS;
  const quantityTolerance = options.quantityTolerance ?? 0.000001;
  const findings = [
    ...data.productionIntervals.flatMap((interval) =>
      productionFindings(interval, quantityTolerance),
    ),
    ...data.downtimeEvents.flatMap(downtimeFindings),
  ];

  const costsByMachine = new Map<string, number[]>();
  for (const record of data.productionIntervals) {
    if (
      record.machine &&
      record.costs.machinePerHour != null &&
      record.costs.machinePerHour >= 0
    ) {
      const costs = costsByMachine.get(record.machine) ?? [];
      costs.push(record.costs.machinePerHour);
      costsByMachine.set(record.machine, costs);
    }
  }
  for (const record of data.productionIntervals) {
    const costs = costsByMachine.get(record.machine) ?? [];
    const stableCost = mode(costs);
    if (
      stableCost != null &&
      record.costs.machinePerHour != null &&
      record.costs.machinePerHour !== stableCost
    ) {
      findings.push(
        finding(record, {
          code: "INCONSISTENT_MACHINE_HOUR_COST",
          severity: "warning",
          status: "questionable",
          fieldName: "Running Hrs Cost",
          reportedValue: record.costs.machinePerHour,
          expectedValue: stableCost,
          recommendedAction:
            "Verify the machine master hourly cost; financial loss uses the stable machine cost without modifying this source value.",
        }),
      );
    }
  }

  const timeline = [
    ...data.productionIntervals,
    ...data.downtimeEvents,
  ].filter(
    (record): record is MmsRecord & { endEpochMs: number } =>
      record.endEpochMs != null,
  );
  const latest = timeline.sort(
    (left, right) => right.endEpochMs - left.endEpochMs,
  )[0];
  if (latest) {
    const delay = Math.max(0, nowEpochMs - latest.endEpochMs);
    if (delay > staleAfterMs) {
      findings.push(
        finding(latest, {
          code: "STALE_OR_DELAYED_DATA",
          severity: "warning",
          status: "questionable",
          fieldName: "Till Time",
          reportedValue: latest.endAt,
          expectedValue: `Data newer than ${Math.round(staleAfterMs / 60_000)} minutes`,
          recommendedAction:
            "Check the workbook export or synchronization source before treating the dashboard as current.",
        }),
      );
    }
    if (
      latest.sourceSheet === "Product Log Book" &&
      delay <= activeWindowMs
    ) {
      const elapsed =
        latest.startEpochMs == null
          ? null
          : (latest.endEpochMs - latest.startEpochMs) / 1_000;
      const planned =
        latest.timesSeconds.shift != null &&
        latest.timesSeconds.allowed != null
          ? latest.timesSeconds.shift - latest.timesSeconds.allowed
          : latest.timesSeconds.shift;
      if (elapsed != null && planned != null && elapsed < planned * 0.99) {
        findings.push(
          finding(latest, {
            code: "INCOMPLETE_ACTIVE_SHIFT",
            severity: "information",
            status: "informational",
            fieldName: "Till Time",
            reportedValue: elapsed,
            expectedValue: planned,
            recommendedAction:
              "Treat this as an active snapshot and re-evaluate after the shift or product interval is completed.",
          }),
        );
      }
    }
  }

  findings.sort(
    (left, right) =>
      ({ error: 0, warning: 1, information: 2 })[left.severity] -
        ({ error: 0, warning: 1, information: 2 })[right.severity] ||
      (right.time ?? "").localeCompare(left.time ?? "") ||
      left.id.localeCompare(right.id),
  );
  const allRecordIds = new Set([
    ...data.productionIntervals.map((record) => record.id),
    ...data.downtimeEvents.map((record) => record.id),
  ]);
  const statusByRecordId = new Map<string, DataQualityFindingStatus>();
  for (const id of allRecordIds) statusByRecordId.set(id, "valid");
  const rank: Record<DataQualityFindingStatus, number> = {
    valid: 0,
    informational: 1,
    questionable: 2,
    invalid: 3,
  };
  for (const item of findings) {
    const current = statusByRecordId.get(item.recordId) ?? "valid";
    if (rank[item.status] > rank[current]) {
      statusByRecordId.set(item.recordId, item.status);
    }
  }
  const affected = new Set(findings.map((item) => item.recordId));
  const totalRecordCount =
    data.productionIntervals.length + data.downtimeEvents.length;
  return {
    generatedAt: new Date(nowEpochMs).toISOString(),
    findings,
    bySeverity: {
      error: findings.filter((item) => item.severity === "error").length,
      warning: findings.filter((item) => item.severity === "warning").length,
      information: findings.filter(
        (item) => item.severity === "information",
      ).length,
    },
    byStatus: {
      valid: [...statusByRecordId.values()].filter(
        (status) => status === "valid",
      ).length,
      questionable: [...statusByRecordId.values()].filter(
        (status) => status === "questionable",
      ).length,
      invalid: [...statusByRecordId.values()].filter(
        (status) => status === "invalid",
      ).length,
      informational: [...statusByRecordId.values()].filter(
        (status) => status === "informational",
      ).length,
    },
    affectedRecordCount: affected.size,
    trustworthyRecordCount: [...statusByRecordId.values()].filter(
      (status) => status === "valid" || status === "informational",
    ).length,
    totalRecordCount,
  };
}
