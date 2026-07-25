export type OeeExclusionReason =
  | "planned_break"
  | "holiday"
  | "no_production_plan"
  | "no_load";

export type OeeComponentIssueCode =
  | "ALLOWED_TIME_EXCEEDS_SHIFT_TIME"
  | "AVAILABILITY_ABOVE_100_PERCENT"
  | "EXCLUDED_FROM_OEE"
  | "INVALID_INPUT"
  | "MISSING_OPERATIVE_TIME"
  | "MISSING_OPERATIVE_TIME_TARGET"
  | "MISSING_PLANNED_PRODUCTION_TIME"
  | "MISSING_PRODUCED_QUANTITY"
  | "PERFORMANCE_ABOVE_100_PERCENT"
  | "ZERO_OPERATIVE_TIME_TARGET"
  | "ZERO_PLANNED_PRODUCTION_TIME";

export type PendingOeeMetric = {
  status: "pending";
  value: null;
};

export type AvailabilityPerformanceInput = {
  shiftTimeSeconds: number | null;
  allowedTimeSeconds: number | null;
  operativeTimeSeconds: number | null;
  producedQuantity: number | null;
  operativeTimeTarget: number | null;
  exclusionReason?: OeeExclusionReason | null;
};

export type AvailabilityPerformanceResult = {
  isEligible: boolean;
  exclusionReason: OeeExclusionReason | null;
  plannedProductionTimeSeconds: number | null;
  availability: number | null;
  performance: number | null;
  quality: PendingOeeMetric;
  finalOee: PendingOeeMetric;
  normalizedInputs: {
    shiftTimeSeconds: number | null;
    allowedTimeSeconds: number | null;
    operativeTimeSeconds: number | null;
    producedQuantity: number | null;
    operativeTimeTarget: number | null;
  };
  issueCodes: OeeComponentIssueCode[];
};

export type AvailabilityPerformanceRecord = AvailabilityPerformanceResult & {
  id: string;
  machine: string;
  shift: string;
  date: string | null;
};

export type OeeAggregate = {
  key: string;
  label: string;
  machine: string | null;
  shift: string | null;
  date: string | null;
  recordCount: number;
  eligibleRecordCount: number;
  excludedRecordCount: number;
  totals: {
    shiftTimeSeconds: number;
    allowedTimeSeconds: number;
    plannedProductionTimeSeconds: number;
    operativeTimeSeconds: number;
    producedQuantity: number;
    operativeTimeTarget: number;
  };
  availability: number | null;
  performance: number | null;
  quality: PendingOeeMetric;
  finalOee: PendingOeeMetric;
  issueCodes: OeeComponentIssueCode[];
};

export type AvailabilityPerformanceAnalytics = {
  machineWise: OeeAggregate[];
  shiftWise: OeeAggregate[];
  daily: OeeAggregate[];
  period: OeeAggregate;
};

const pendingMetric = (): PendingOeeMetric => ({
  status: "pending",
  value: null,
});

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function rounded(value: number, digits = 8): number {
  const power = 10 ** digits;
  return Math.round((value + Number.EPSILON) * power) / power;
}

function normalizedMarker(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Matches only explicit MMS exclusion labels. It deliberately does not treat
 * similar product names (for example "PRELOAD") as exclusions.
 */
export function classifyOeeExclusion(
  values: Array<string | null | undefined>,
): OeeExclusionReason | null {
  const markers = new Set(
    values
      .filter((value): value is string => typeof value === "string")
      .map(normalizedMarker)
      .filter(Boolean),
  );

  if (markers.has("PLANNED BREAK") || markers.has("PLANNED BREAKS")) {
    return "planned_break";
  }
  if (markers.has("HOLIDAY") || markers.has("HOLIDAYS")) return "holiday";
  if (
    markers.has("NO PRODUCTION PLAN") ||
    markers.has("NO PRODUCTION PLANNED") ||
    markers.has("NO PRODUCTION") ||
    markers.has("NO PLAN")
  ) {
    return "no_production_plan";
  }
  if (markers.has("NO LOAD") || markers.has("MACHINE NO LOAD")) {
    return "no_load";
  }
  return null;
}

export function calculateAvailabilityPerformance(
  input: AvailabilityPerformanceInput,
): AvailabilityPerformanceResult {
  const issues = new Set<OeeComponentIssueCode>();
  const shiftTimeSeconds = finiteNonNegative(input.shiftTimeSeconds);
  const allowedTimeSeconds = finiteNonNegative(input.allowedTimeSeconds);
  const operativeTimeSeconds = finiteNonNegative(input.operativeTimeSeconds);
  const producedQuantity = finiteNonNegative(input.producedQuantity);
  const operativeTimeTarget = finiteNonNegative(input.operativeTimeTarget);

  const rawValues = [
    input.shiftTimeSeconds,
    input.allowedTimeSeconds,
    input.operativeTimeSeconds,
    input.producedQuantity,
    input.operativeTimeTarget,
  ];
  if (
    rawValues.some(
      (value) =>
        value != null &&
        (typeof value !== "number" || !Number.isFinite(value) || value < 0),
    )
  ) {
    issues.add("INVALID_INPUT");
  }

  if (input.exclusionReason) {
    issues.add("EXCLUDED_FROM_OEE");
    return {
      isEligible: false,
      exclusionReason: input.exclusionReason,
      plannedProductionTimeSeconds: null,
      availability: null,
      performance: null,
      quality: pendingMetric(),
      finalOee: pendingMetric(),
      normalizedInputs: {
        shiftTimeSeconds,
        allowedTimeSeconds,
        operativeTimeSeconds,
        producedQuantity,
        operativeTimeTarget,
      },
      issueCodes: [...issues],
    };
  }

  let plannedProductionTimeSeconds: number | null = null;
  if (shiftTimeSeconds == null || allowedTimeSeconds == null) {
    issues.add("MISSING_PLANNED_PRODUCTION_TIME");
  } else if (allowedTimeSeconds > shiftTimeSeconds) {
    issues.add("ALLOWED_TIME_EXCEEDS_SHIFT_TIME");
  } else {
    plannedProductionTimeSeconds = rounded(
      shiftTimeSeconds - allowedTimeSeconds,
    );
  }

  let availability: number | null = null;
  if (operativeTimeSeconds == null) {
    issues.add("MISSING_OPERATIVE_TIME");
  } else if (plannedProductionTimeSeconds === 0) {
    issues.add("ZERO_PLANNED_PRODUCTION_TIME");
  } else if (plannedProductionTimeSeconds != null) {
    availability = rounded(
      operativeTimeSeconds / plannedProductionTimeSeconds,
    );
    if (availability > 1) issues.add("AVAILABILITY_ABOVE_100_PERCENT");
  }

  let performance: number | null = null;
  if (producedQuantity == null) {
    issues.add("MISSING_PRODUCED_QUANTITY");
  }
  if (operativeTimeTarget == null) {
    issues.add("MISSING_OPERATIVE_TIME_TARGET");
  } else if (operativeTimeTarget === 0) {
    issues.add("ZERO_OPERATIVE_TIME_TARGET");
  } else if (producedQuantity != null) {
    performance = rounded(producedQuantity / operativeTimeTarget);
    if (performance > 1) issues.add("PERFORMANCE_ABOVE_100_PERCENT");
  }

  return {
    isEligible: true,
    exclusionReason: null,
    plannedProductionTimeSeconds,
    availability,
    performance,
    quality: pendingMetric(),
    finalOee: pendingMetric(),
    normalizedInputs: {
      shiftTimeSeconds,
      allowedTimeSeconds,
      operativeTimeSeconds,
      producedQuantity,
      operativeTimeTarget,
    },
    issueCodes: [...issues],
  };
}

type AggregateDimension = "machine" | "shift" | "date" | "period";

function aggregateGroup(
  key: string,
  label: string,
  records: AvailabilityPerformanceRecord[],
  dimension: AggregateDimension,
): OeeAggregate {
  const eligible = records.filter((record) => record.isEligible);
  const totals = {
    shiftTimeSeconds: 0,
    allowedTimeSeconds: 0,
    plannedProductionTimeSeconds: 0,
    operativeTimeSeconds: 0,
    producedQuantity: 0,
    operativeTimeTarget: 0,
  };
  let hasPlannedTime = false;
  let hasOperativeTime = false;
  let hasProducedQuantity = false;
  let hasOperativeTarget = false;

  for (const record of eligible) {
    const values = record.normalizedInputs;
    if (values.shiftTimeSeconds != null) {
      totals.shiftTimeSeconds += values.shiftTimeSeconds;
    }
    if (values.allowedTimeSeconds != null) {
      totals.allowedTimeSeconds += values.allowedTimeSeconds;
    }
    if (record.plannedProductionTimeSeconds != null) {
      totals.plannedProductionTimeSeconds +=
        record.plannedProductionTimeSeconds;
      hasPlannedTime = true;
    }
    if (values.operativeTimeSeconds != null) {
      totals.operativeTimeSeconds += values.operativeTimeSeconds;
      hasOperativeTime = true;
    }
    if (
      values.producedQuantity != null &&
      values.operativeTimeTarget != null &&
      values.operativeTimeTarget > 0
    ) {
      totals.producedQuantity += values.producedQuantity;
      hasProducedQuantity = true;
    }
    if (values.operativeTimeTarget != null && values.operativeTimeTarget > 0) {
      totals.operativeTimeTarget += values.operativeTimeTarget;
      hasOperativeTarget = true;
    }
  }

  const availability =
    hasPlannedTime &&
    hasOperativeTime &&
    totals.plannedProductionTimeSeconds > 0
      ? rounded(
          totals.operativeTimeSeconds /
            totals.plannedProductionTimeSeconds,
        )
      : null;
  const performance =
    hasProducedQuantity &&
    hasOperativeTarget &&
    totals.operativeTimeTarget > 0
      ? rounded(totals.producedQuantity / totals.operativeTimeTarget)
      : null;
  const issueCodes = new Set<OeeComponentIssueCode>();
  for (const record of records) {
    for (const code of record.issueCodes) issueCodes.add(code);
  }
  if (availability != null && availability > 1) {
    issueCodes.add("AVAILABILITY_ABOVE_100_PERCENT");
  }
  if (performance != null && performance > 1) {
    issueCodes.add("PERFORMANCE_ABOVE_100_PERCENT");
  }

  return {
    key,
    label,
    machine: dimension === "machine" ? label : null,
    shift: dimension === "shift" ? label : null,
    date: dimension === "date" ? label : null,
    recordCount: records.length,
    eligibleRecordCount: eligible.length,
    excludedRecordCount: records.length - eligible.length,
    totals: {
      shiftTimeSeconds: rounded(totals.shiftTimeSeconds),
      allowedTimeSeconds: rounded(totals.allowedTimeSeconds),
      plannedProductionTimeSeconds: rounded(
        totals.plannedProductionTimeSeconds,
      ),
      operativeTimeSeconds: rounded(totals.operativeTimeSeconds),
      producedQuantity: rounded(totals.producedQuantity),
      operativeTimeTarget: rounded(totals.operativeTimeTarget),
    },
    availability,
    performance,
    quality: pendingMetric(),
    finalOee: pendingMetric(),
    issueCodes: [...issueCodes],
  };
}

function groupedAggregates(
  records: AvailabilityPerformanceRecord[],
  dimension: Exclude<AggregateDimension, "period">,
): OeeAggregate[] {
  const grouped = new Map<string, AvailabilityPerformanceRecord[]>();
  for (const record of records) {
    const value =
      dimension === "machine"
        ? record.machine
        : dimension === "shift"
          ? record.shift
          : record.date;
    const key = value || "UNKNOWN";
    const bucket = grouped.get(key) ?? [];
    bucket.push(record);
    grouped.set(key, bucket);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => aggregateGroup(key, key, group, dimension));
}

export function aggregateAvailabilityPerformance(
  records: AvailabilityPerformanceRecord[],
): AvailabilityPerformanceAnalytics {
  return {
    machineWise: groupedAggregates(records, "machine"),
    shiftWise: groupedAggregates(records, "shift"),
    daily: groupedAggregates(records, "date"),
    period: aggregateGroup("period", "Entire period", records, "period"),
  };
}
