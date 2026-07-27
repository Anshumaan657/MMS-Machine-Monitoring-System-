import type {
  CanonicalMmsData,
  DowntimeEvent,
  ProductionInterval,
} from "./mms.ts";
import { queryMmsAnalytics } from "./mms.ts";

export type VerificationMetric =
  | "actual_quantity"
  | "achieved_cycle_time_seconds"
  | "operative_time_target"
  | "production_loss"
  | "downtime_duration_seconds"
  | "machine_hour_loss";

export type VerificationComparisonStatus =
  | "match"
  | "mismatch"
  | "not_comparable";

export type VerificationComparison = {
  metric: VerificationMetric;
  source: "Product Log Book" | "Down Time Details";
  recordId: string;
  sourceRow: number;
  machine: string;
  shift: string;
  date: string | null;
  reported: number | null;
  calculated: number | null;
  absoluteDifference: number | null;
  allowedDifference: number;
  status: VerificationComparisonStatus;
  correction: string | null;
};

export type VerificationMetricSummary = {
  metric: VerificationMetric;
  matches: number;
  mismatches: number;
  notComparable: number;
  comparable: number;
  agreementPercentage: number | null;
};

export type InternalVerificationCheck = {
  id: string;
  category:
    | "parsing"
    | "time"
    | "availability"
    | "performance"
    | "duplicates"
    | "quality_policy";
  status: "pass" | "fail" | "warning";
  checkedRecords: number;
  failedRecords: number;
  message: string;
};

export type MmsVerificationReport = {
  schemaVersion: "1.0";
  generatedAt: string;
  source: {
    company: string;
    fileName: string;
    referenceType: "3d_workbook_export";
  };
  thresholdPercentage: number;
  overall: {
    matches: number;
    mismatches: number;
    notComparable: number;
    comparable: number;
    agreementPercentage: number | null;
    status: "provisional_pass" | "below_target" | "insufficient_reference";
    final3dSignoffRequired: true;
  };
  metrics: VerificationMetricSummary[];
  internalChecks: InternalVerificationCheck[];
  mismatches: VerificationComparison[];
  corrections: Array<{
    metric: VerificationMetric;
    mismatchCount: number;
    action: string;
  }>;
  selected3dVerification: {
    providedCases: number;
    comparableChecks: number;
    matches: number;
    mismatches: number;
    agreementPercentage: number | null;
    status: "pending_reference" | "meets_target" | "below_target";
    comparisons: Selected3dComparison[];
  };
  importStats: CanonicalMmsData["importStats"];
};

export type Selected3dMetric =
  | "production"
  | "shiftTarget"
  | "availabilityPercent"
  | "performancePercent"
  | "downtimeHours"
  | "machineHourLoss";

export type Selected3dReferenceCase = {
  id: string;
  filters: {
    dateFrom?: string | null;
    dateTo?: string | null;
    shift?: string | null;
    machine?: string | null;
  };
  expected: Partial<Record<Selected3dMetric, number>>;
};

export type Selected3dComparison = {
  caseId: string;
  metric: Selected3dMetric;
  expected: number;
  calculated: number | null;
  absoluteDifference: number | null;
  allowedDifference: number;
  status: VerificationComparisonStatus;
};

type Tolerance = {
  absolute: number;
  relative: number;
};

export type MmsVerificationOptions = {
  thresholdPercentage?: number;
  tolerances?: Partial<Record<VerificationMetric, Partial<Tolerance>>>;
  generatedAt?: string;
  selected3dReferences?: Selected3dReferenceCase[];
};

const DEFAULT_TOLERANCES: Record<VerificationMetric, Tolerance> = {
  actual_quantity: { absolute: 0.01, relative: 0.0001 },
  achieved_cycle_time_seconds: { absolute: 0.1, relative: 0.005 },
  operative_time_target: { absolute: 0.5, relative: 0.001 },
  production_loss: { absolute: 0.5, relative: 0.001 },
  downtime_duration_seconds: { absolute: 60, relative: 0.005 },
  machine_hour_loss: { absolute: 1, relative: 0.01 },
};

const CORRECTIONS: Record<VerificationMetric, string> = {
  actual_quantity:
    "Confirm Stroke and M. Factor for the affected interval, then correct either the reported Qty or the source counter/multiplier mapping.",
  achieved_cycle_time_seconds:
    "Confirm that operative time excludes the intended breaks and that Achieved Cycle Time is stored in seconds; align the rounding rule after 3D review.",
  operative_time_target:
    "Confirm Standard Cycle Time and operative-time units, then align the target rounding rule with MMS.",
  production_loss:
    "Confirm the interval Shift Target and authoritative produced quantity before correcting the exported Product Loss.",
  downtime_duration_seconds:
    "Confirm From/Till timestamps, cross-midnight handling and duration rounding; correct the event duration when the timestamps are authoritative.",
  machine_hour_loss:
    "Confirm the machine-hour cost and downtime classification/context used by MMS, then align the financial-loss calculation.",
};

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rounded(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function toleranceFor(
  metric: VerificationMetric,
  reported: number | null,
  options: MmsVerificationOptions,
): number {
  const configured = options.tolerances?.[metric];
  const base = DEFAULT_TOLERANCES[metric];
  const absolute =
    typeof configured?.absolute === "number" &&
    Number.isFinite(configured.absolute) &&
    configured.absolute >= 0
      ? configured.absolute
      : base.absolute;
  const relative =
    typeof configured?.relative === "number" &&
    Number.isFinite(configured.relative) &&
    configured.relative >= 0
      ? configured.relative
      : base.relative;
  return rounded(
    Math.max(absolute, Math.abs(reported ?? 0) * relative),
  );
}

function comparison(
  metric: VerificationMetric,
  record: ProductionInterval | DowntimeEvent,
  reportedValue: number | null | undefined,
  calculatedValue: number | null | undefined,
  options: MmsVerificationOptions,
): VerificationComparison {
  const reported = finite(reportedValue);
  const calculated = finite(calculatedValue);
  const allowedDifference = toleranceFor(metric, reported, options);
  const absoluteDifference =
    reported == null || calculated == null
      ? null
      : rounded(Math.abs(calculated - reported));
  const status: VerificationComparisonStatus =
    absoluteDifference == null
      ? "not_comparable"
      : absoluteDifference <= allowedDifference
        ? "match"
        : "mismatch";
  return {
    metric,
    source: record.sourceSheet,
    recordId: record.id,
    sourceRow: record.sourceRow,
    machine: record.machine,
    shift: record.shift,
    date: record.date,
    reported,
    calculated,
    absoluteDifference,
    allowedDifference,
    status,
    correction: status === "mismatch" ? CORRECTIONS[metric] : null,
  };
}

function derivedDuration(event: DowntimeEvent): number | null {
  if (
    event.startEpochMs == null ||
    event.endEpochMs == null ||
    event.endEpochMs < event.startEpochMs
  ) {
    return null;
  }
  return rounded((event.endEpochMs - event.startEpochMs) / 1_000);
}

function buildComparisons(
  data: CanonicalMmsData,
  options: MmsVerificationOptions,
): VerificationComparison[] {
  const results: VerificationComparison[] = [];
  for (const interval of data.productionIntervals) {
    results.push(
      comparison(
        "actual_quantity",
        interval,
        interval.quantities.reported,
        interval.calculations.actualQuantity,
        options,
      ),
      comparison(
        "achieved_cycle_time_seconds",
        interval,
        interval.cycleTimesSeconds.achieved,
        interval.calculations.achievedCycleTimeSeconds,
        options,
      ),
      comparison(
        "operative_time_target",
        interval,
        interval.quantities.operativeTimeTarget,
        interval.calculations.operativeTimeTarget,
        options,
      ),
      comparison(
        "production_loss",
        interval,
        interval.quantities.productionLoss,
        interval.calculations.productionLoss,
        options,
      ),
    );
  }

  const downtimeIntelligence = new Map(
    data.downtimeAnalytics.events.map((event) => [event.id, event]),
  );
  for (const event of data.downtimeEvents) {
    results.push(
      comparison(
        "downtime_duration_seconds",
        event,
        event.durationSeconds,
        derivedDuration(event),
        options,
      ),
      comparison(
        "machine_hour_loss",
        event,
        event.reportedMachineHourLoss,
        downtimeIntelligence.get(event.id)?.calculatedMachineHourLoss,
        options,
      ),
    );
  }
  return results;
}

function metricSummary(
  metric: VerificationMetric,
  comparisons: VerificationComparison[],
): VerificationMetricSummary {
  const selected = comparisons.filter((item) => item.metric === metric);
  const matches = selected.filter((item) => item.status === "match").length;
  const mismatches = selected.filter(
    (item) => item.status === "mismatch",
  ).length;
  const notComparable = selected.filter(
    (item) => item.status === "not_comparable",
  ).length;
  const comparable = matches + mismatches;
  return {
    metric,
    matches,
    mismatches,
    notComparable,
    comparable,
    agreementPercentage:
      comparable > 0 ? rounded((matches / comparable) * 100, 4) : null,
  };
}

function formulaFailureCount(
  data: CanonicalMmsData,
  component: "availability" | "performance",
): number {
  return data.productionIntervals.filter((interval) => {
    const result = interval.oeeComponents;
    if (!result.isEligible) return false;
    if (component === "availability") {
      const planned = result.plannedProductionTimeSeconds;
      const operative = result.normalizedInputs.operativeTimeSeconds;
      if (planned == null || planned === 0 || operative == null) {
        return result.availability != null;
      }
      return (
        result.availability == null ||
        Math.abs(result.availability - operative / planned) > 0.000001
      );
    }
    const target = result.normalizedInputs.operativeTimeTarget;
    const produced = result.normalizedInputs.producedQuantity;
    if (target == null || target === 0 || produced == null) {
      return result.performance != null;
    }
    return (
      result.performance == null ||
      Math.abs(result.performance - produced / target) > 0.000001
    );
  }).length;
}

function buildInternalChecks(
  data: CanonicalMmsData,
): InternalVerificationCheck[] {
  const durationFailures = data.downtimeEvents.filter(
    (event) =>
      event.durationSeconds != null &&
      (!Number.isFinite(event.durationSeconds) || event.durationSeconds < 0),
  ).length;
  const availabilityFailures = formulaFailureCount(data, "availability");
  const performanceFailures = formulaFailureCount(data, "performance");
  const ids = [
    ...data.productionIntervals.map((record) => record.id),
    ...data.downtimeEvents.map((record) => record.id),
  ];
  const duplicateIdCount = ids.length - new Set(ids).size;
  const qualityPolicyFailures = data.productionIntervals.filter(
    (record) =>
      record.oeeComponents.quality.status !== "pending" ||
      record.oeeComponents.finalOee.status !== "pending",
  ).length;
  const totalRecords =
    data.productionIntervals.length + data.downtimeEvents.length;
  return [
    {
      id: "canonical_parse",
      category: "parsing",
      status: totalRecords > 0 ? "pass" : "fail",
      checkedRecords: totalRecords,
      failedRecords: totalRecords > 0 ? 0 : 1,
      message:
        totalRecords > 0
          ? "The workbook produced canonical production and downtime records."
          : "No canonical records were produced.",
    },
    {
      id: "duration_seconds",
      category: "time",
      status: durationFailures === 0 ? "pass" : "fail",
      checkedRecords: data.downtimeEvents.length,
      failedRecords: durationFailures,
      message:
        "Parsed downtime durations must be finite, non-negative seconds.",
    },
    {
      id: "availability_formula",
      category: "availability",
      status: availabilityFailures === 0 ? "pass" : "fail",
      checkedRecords: data.productionIntervals.length,
      failedRecords: availabilityFailures,
      message:
        "Availability must equal Operative Time divided by Planned Production Time for eligible records.",
    },
    {
      id: "performance_formula",
      category: "performance",
      status: performanceFailures === 0 ? "pass" : "fail",
      checkedRecords: data.productionIntervals.length,
      failedRecords: performanceFailures,
      message:
        "Performance must equal Produced Quantity divided by Operative Time Target for eligible records.",
    },
    {
      id: "stable_unique_ids",
      category: "duplicates",
      status: duplicateIdCount === 0 ? "pass" : "warning",
      checkedRecords: ids.length,
      failedRecords: duplicateIdCount,
      message:
        "Duplicate canonical IDs identify repeated source records and must not be processed twice during synchronization.",
    },
    {
      id: "pending_quality_and_oee",
      category: "quality_policy",
      status: qualityPolicyFailures === 0 ? "pass" : "fail",
      checkedRecords: data.productionIntervals.length,
      failedRecords: qualityPolicyFailures,
      message:
        "Official Quality and Final OEE must remain pending during this verification phase.",
    },
  ];
}

function selectedMetricValue(
  metric: Selected3dMetric,
  data: ReturnType<typeof queryMmsAnalytics>,
): number | null {
  if (metric === "production")
    return data.production.totals.producedQuantity;
  if (metric === "shiftTarget") return data.production.totals.shiftTarget;
  if (metric === "availabilityPercent") {
    return data.availabilityPerformance.period.availability == null
      ? null
      : rounded(data.availabilityPerformance.period.availability * 100);
  }
  if (metric === "performancePercent") {
    return data.availabilityPerformance.period.performance == null
      ? null
      : rounded(data.availabilityPerformance.period.performance * 100);
  }
  if (metric === "downtimeHours") {
    return rounded(data.downtime.period.totals.downtimeSeconds / 3_600);
  }
  return rounded(data.downtime.period.totals.calculatedMachineHourLoss);
}

function compareSelected3dReferences(
  data: CanonicalMmsData,
  references: Selected3dReferenceCase[],
  thresholdPercentage: number,
): MmsVerificationReport["selected3dVerification"] {
  const comparisons: Selected3dComparison[] = [];
  for (const reference of references) {
    const analytics = queryMmsAnalytics(data, {
      dateRange: {
        from: reference.filters.dateFrom ?? null,
        to: reference.filters.dateTo ?? null,
      },
      shift: reference.filters.shift ?? null,
      machine: reference.filters.machine ?? null,
    });
    for (const [metric, expected] of Object.entries(reference.expected)) {
      if (
        typeof expected !== "number" ||
        !Number.isFinite(expected) ||
        ![
          "production",
          "shiftTarget",
          "availabilityPercent",
          "performancePercent",
          "downtimeHours",
          "machineHourLoss",
        ].includes(metric)
      ) {
        continue;
      }
      const typedMetric = metric as Selected3dMetric;
      const calculated = selectedMetricValue(typedMetric, analytics);
      const allowedDifference =
        typedMetric === "availabilityPercent" ||
        typedMetric === "performancePercent"
          ? 0.1
          : typedMetric === "downtimeHours"
            ? 0.02
            : Math.max(0.5, Math.abs(expected) * 0.001);
      const absoluteDifference =
        calculated == null ? null : rounded(Math.abs(calculated - expected));
      comparisons.push({
        caseId: reference.id,
        metric: typedMetric,
        expected,
        calculated,
        absoluteDifference,
        allowedDifference,
        status:
          absoluteDifference == null
            ? "not_comparable"
            : absoluteDifference <= allowedDifference
              ? "match"
              : "mismatch",
      });
    }
  }
  const matches = comparisons.filter((item) => item.status === "match").length;
  const mismatches = comparisons.filter(
    (item) => item.status === "mismatch",
  ).length;
  const comparableChecks = matches + mismatches;
  const agreementPercentage =
    comparableChecks > 0
      ? rounded((matches / comparableChecks) * 100, 4)
      : null;
  return {
    providedCases: references.length,
    comparableChecks,
    matches,
    mismatches,
    agreementPercentage,
    status:
      agreementPercentage == null
        ? "pending_reference"
        : agreementPercentage >= thresholdPercentage
          ? "meets_target"
          : "below_target",
    comparisons,
  };
}

export function buildMmsVerificationReport(
  data: CanonicalMmsData,
  options: MmsVerificationOptions = {},
): MmsVerificationReport {
  const thresholdPercentage =
    typeof options.thresholdPercentage === "number" &&
    Number.isFinite(options.thresholdPercentage) &&
    options.thresholdPercentage >= 0 &&
    options.thresholdPercentage <= 100
      ? options.thresholdPercentage
      : 95;
  const comparisons = buildComparisons(data, options);
  const metricNames = Object.keys(
    DEFAULT_TOLERANCES,
  ) as VerificationMetric[];
  const metrics = metricNames.map((metric) =>
    metricSummary(metric, comparisons),
  );
  const matches = metrics.reduce((sum, item) => sum + item.matches, 0);
  const mismatches = metrics.reduce((sum, item) => sum + item.mismatches, 0);
  const notComparable = metrics.reduce(
    (sum, item) => sum + item.notComparable,
    0,
  );
  const comparable = matches + mismatches;
  const agreementPercentage =
    comparable > 0 ? rounded((matches / comparable) * 100, 4) : null;
  const mismatchRows = comparisons.filter(
    (item) => item.status === "mismatch",
  );
  const corrections = metrics
    .filter((item) => item.mismatches > 0)
    .map((item) => ({
      metric: item.metric,
      mismatchCount: item.mismatches,
      action: CORRECTIONS[item.metric],
    }));
  const selected3dVerification = compareSelected3dReferences(
    data,
    options.selected3dReferences ?? [],
    thresholdPercentage,
  );

  return {
    schemaVersion: "1.0",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    source: {
      company: data.source.company,
      fileName: data.source.fileName,
      referenceType: "3d_workbook_export",
    },
    thresholdPercentage,
    overall: {
      matches,
      mismatches,
      notComparable,
      comparable,
      agreementPercentage,
      status:
        agreementPercentage == null
          ? "insufficient_reference"
          : agreementPercentage >= thresholdPercentage
            ? "provisional_pass"
            : "below_target",
      final3dSignoffRequired: true,
    },
    metrics,
    internalChecks: buildInternalChecks(data),
    mismatches: mismatchRows,
    corrections,
    selected3dVerification,
    importStats: data.importStats,
  };
}

export function verificationReportMarkdown(
  report: MmsVerificationReport,
): string {
  const agreement =
    report.overall.agreementPercentage == null
      ? "Not available"
      : `${report.overall.agreementPercentage.toFixed(2)}%`;
  const lines = [
    "# Phase 12 MMS Verification Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Reference: values reported in the 3D MMS workbook export`,
    "",
    "## Acceptance status",
    "",
    `- Provisional status: ${report.overall.status}`,
    `- Calculation agreement: ${agreement}`,
    `- Acceptance target: ${report.thresholdPercentage}%`,
    `- Comparable checks: ${report.overall.comparable}`,
    `- Matches: ${report.overall.matches}`,
    `- Mismatches: ${report.overall.mismatches}`,
    `- Not comparable because a reference or calculation was unavailable: ${report.overall.notComparable}`,
    "- Final acceptance: pending selected-result confirmation by 3D",
    "",
    "## Metric agreement",
    "",
    "| Metric | Matches | Mismatches | Not comparable | Agreement |",
    "|---|---:|---:|---:|---:|",
    ...report.metrics.map(
      (metric) =>
        `| ${metric.metric} | ${metric.matches} | ${metric.mismatches} | ${metric.notComparable} | ${
          metric.agreementPercentage == null
            ? "N/A"
            : `${metric.agreementPercentage.toFixed(2)}%`
        } |`,
    ),
    "",
    "## Internal verification",
    "",
    "| Check | Status | Checked | Failed |",
    "|---|---|---:|---:|",
    ...report.internalChecks.map(
      (check) =>
        `| ${check.id} | ${check.status} | ${check.checkedRecords} | ${check.failedRecords} |`,
    ),
    "",
    "## Mismatches and correction actions",
    "",
    ...(report.corrections.length
      ? report.corrections.flatMap((correction) => [
          `### ${correction.metric}`,
          "",
          `Affected comparisons: ${correction.mismatchCount}`,
          "",
          correction.action,
          "",
        ])
      : ["No calculation mismatches were detected.", ""]),
    "The machine/date/shift-level mismatch records are retained in the local JSON report. They should not be committed because they contain client operational identifiers.",
    "",
    "## 3D sign-off still required",
    "",
    `- Selected reference cases provided: ${report.selected3dVerification.providedCases}`,
    `- Selected-result status: ${report.selected3dVerification.status}`,
    `- Selected-result agreement: ${
      report.selected3dVerification.agreementPercentage == null
        ? "N/A"
        : `${report.selected3dVerification.agreementPercentage.toFixed(2)}%`
    }`,
    "",
    "3D should select representative machine, shift and date combinations in their MMS and confirm the displayed production, target, Availability, Performance, downtime and financial-loss values. Workbook agreement is provisional evidence and is not a substitute for this final review.",
    "",
  ];
  return lines.join("\n");
}
