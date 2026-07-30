import {
  queryMmsAnalytics,
  type MmsAnalyticsFilters,
} from "./analytics-query-engine.ts";
import {
  DEFAULT_CALCULATION_POLICY_ID,
  calculationPolicyMetadata,
  resolveCalculationPolicy,
} from "./calculation-policy.ts";
import type { CanonicalMmsData } from "./mms.ts";

export const PHASE29_POLICY = Object.freeze({
  id: "mms-direct-quantity-v2",
  version: "2.0.0",
  status: "confirmed",
});

export const PHASE29_REQUIRED_SCENARIOS = [
  "complete_single_product_shift",
  "completed_product_change_interval",
  "active_unfinished_interval",
  "quantity_mismatch",
  "production_above_target",
  "quality_readiness",
  "priced_downtime_event",
  "system_off_or_unreported",
] as const;

export type Phase29Scenario =
  (typeof PHASE29_REQUIRED_SCENARIOS)[number];

export type Phase29Metric =
  | "productionQuantity"
  | "shiftTarget"
  | "operativeTimeTarget"
  | "productionLoss"
  | "availabilityPercent"
  | "performancePercent"
  | "goodQuantity"
  | "qualityPercent"
  | "finalOeePercent"
  | "rejectedQuantity"
  | "reworkedQuantity"
  | "estimatedScrap"
  | "downtimeHours"
  | "systemOffHours"
  | "financialLoss"
  | "productionRecordCount"
  | "downtimeEventCount";

export type Phase29MetricSnapshot = Record<Phase29Metric, number | null>;

export type Phase29AcceptanceCase = {
  id: string;
  scenario: Phase29Scenario;
  filters: MmsAnalyticsFilters;
  expected: Partial<Record<Phase29Metric, number>>;
  mismatchExplanations?: Partial<Record<Phase29Metric, string>>;
  evidenceReferences?: string[];
  notes?: string;
};

export type Phase29Signoff = {
  status: "pending" | "approved" | "rejected";
  approvedBy?: string | null;
  approvedAt?: string | null;
  statement?: string | null;
};

export type Phase29AcceptanceInput = {
  schemaVersion: "1.0";
  policy: {
    id: string;
    version: string;
    status: "confirmed";
    confirmationReference: string;
  };
  acceptanceTargetPercentage?: number;
  minimumComparableChecks?: number;
  tolerances?: Partial<Record<Phase29Metric, number>>;
  cases: Phase29AcceptanceCase[];
  finalSignoff: Phase29Signoff;
};

export type Phase29ComparisonStatus =
  | "match"
  | "mismatch"
  | "not_comparable";

export type Phase29Comparison = {
  caseId: string;
  scenario: Phase29Scenario;
  metric: Phase29Metric;
  expected: number;
  calculated: number | null;
  absoluteDifference: number | null;
  allowedDifference: number;
  status: Phase29ComparisonStatus;
  explanation: string | null;
};

export type Phase29AcceptanceStatus =
  | "invalid_policy"
  | "incomplete_coverage"
  | "pending_reference"
  | "below_target"
  | "unexplained_mismatch"
  | "pending_signoff"
  | "accepted";

export type Phase29AcceptanceReport = {
  schemaVersion: "1.0";
  generatedAt: string;
  source: CanonicalMmsData["source"];
  policyAudit: {
    expected: typeof PHASE29_POLICY;
    activeId: string;
    activeVersion: string;
    activeStatus: string;
    defaultPolicyMatches: boolean;
    productionAllowed: boolean;
    provisionalPolicyProductionBlocked: boolean;
    passed: boolean;
  };
  requirements: {
    targetPercentage: number;
    minimumComparableChecks: number;
    requiredScenarios: Phase29Scenario[];
  };
  coverage: {
    providedCases: number;
    coveredScenarios: Phase29Scenario[];
    missingScenarios: Phase29Scenario[];
  };
  results: {
    comparableChecks: number;
    matches: number;
    mismatches: number;
    notComparable: number;
    unexplainedMismatches: number;
    agreementPercentage: number | null;
  };
  comparisons: Phase29Comparison[];
  finalSignoff: Phase29Signoff;
  status: Phase29AcceptanceStatus;
  strictPass: boolean;
};

const DEFAULT_TOLERANCES: Record<Phase29Metric, number> = {
  productionQuantity: 0.01,
  shiftTarget: 0.01,
  operativeTimeTarget: 0.01,
  productionLoss: 0.01,
  availabilityPercent: 0.1,
  performancePercent: 0.1,
  goodQuantity: 0.01,
  qualityPercent: 0.1,
  finalOeePercent: 0.1,
  rejectedQuantity: 0.01,
  reworkedQuantity: 0.01,
  estimatedScrap: 0.01,
  downtimeHours: 0.02,
  systemOffHours: 0.02,
  financialLoss: 1,
  productionRecordCount: 0,
  downtimeEventCount: 0,
};

const METRICS = Object.keys(DEFAULT_TOLERANCES) as Phase29Metric[];

function rounded(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function percentage(value: number | null): number | null {
  return value == null ? null : rounded(value * 100);
}

function finiteNonNegative(
  value: number | null | undefined,
): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function normalizedTarget(value: unknown, fallback: number): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : fallback;
}

function normalizedMinimumChecks(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : 20;
}

function tolerance(
  metric: Phase29Metric,
  input: Phase29AcceptanceInput,
): number {
  const configured = input.tolerances?.[metric];
  return typeof configured === "number" &&
    Number.isFinite(configured) &&
    configured >= 0
    ? configured
    : DEFAULT_TOLERANCES[metric];
}

export function phase29MetricSnapshot(
  data: CanonicalMmsData,
  filters: MmsAnalyticsFilters = {},
): Phase29MetricSnapshot {
  const analytics = queryMmsAnalytics(data, filters, {
    policyId: "mms-direct-quantity-v2",
    runtimeEnvironment: "production",
  });
  return {
    productionQuantity: analytics.production.totals.producedQuantity,
    shiftTarget: analytics.production.totals.shiftTarget,
    operativeTimeTarget: analytics.production.totals.operativeTimeTarget,
    productionLoss: analytics.production.totals.productionLoss,
    availabilityPercent: percentage(analytics.oee.period.availability),
    performancePercent: percentage(analytics.oee.period.performance),
    goodQuantity: analytics.oee.period.goodQuantity,
    qualityPercent: percentage(analytics.oee.period.quality),
    finalOeePercent: percentage(analytics.oee.period.finalOee),
    rejectedQuantity: analytics.quality.period.totals.rejectedQuantity,
    reworkedQuantity: analytics.quality.period.totals.reworkedQuantity,
    estimatedScrap: analytics.quality.period.totals.estimatedScrap,
    downtimeHours: rounded(
      analytics.downtime.period.totals.downtimeSeconds / 3_600,
    ),
    systemOffHours: rounded(
      analytics.downtime.period.totals.reportedSystemOffSeconds / 3_600,
    ),
    financialLoss:
      analytics.downtime.period.totals.calculatedMachineHourLoss,
    productionRecordCount: analytics.scope.productionRecordCount,
    downtimeEventCount: analytics.scope.downtimeEventCount,
  };
}

function auditPolicy(): Phase29AcceptanceReport["policyAudit"] {
  const active = resolveCalculationPolicy({
    runtimeEnvironment: "production",
  });
  const provisional = calculationPolicyMetadata(
    "mms-reconciled-99-37-v1",
  );
  const defaultPolicyMatches =
    DEFAULT_CALCULATION_POLICY_ID === PHASE29_POLICY.id;
  const productionAllowed =
    active.productionAllowed &&
    active.status === PHASE29_POLICY.status;
  const provisionalPolicyProductionBlocked =
    !provisional.productionAllowed &&
    provisional.status === "provisional";
  const passed =
    active.id === PHASE29_POLICY.id &&
    active.version === PHASE29_POLICY.version &&
    active.status === PHASE29_POLICY.status &&
    defaultPolicyMatches &&
    productionAllowed &&
    provisionalPolicyProductionBlocked;
  return {
    expected: PHASE29_POLICY,
    activeId: active.id,
    activeVersion: active.version,
    activeStatus: active.status,
    defaultPolicyMatches,
    productionAllowed,
    provisionalPolicyProductionBlocked,
    passed,
  };
}

function compareCase(
  data: CanonicalMmsData,
  item: Phase29AcceptanceCase,
  input: Phase29AcceptanceInput,
): Phase29Comparison[] {
  const snapshot = phase29MetricSnapshot(data, item.filters);
  return Object.entries(item.expected).flatMap(([rawMetric, rawExpected]) => {
    if (!METRICS.includes(rawMetric as Phase29Metric)) return [];
    const metric = rawMetric as Phase29Metric;
    const expected = finiteNonNegative(rawExpected);
    if (expected == null) return [];
    const calculated = finiteNonNegative(snapshot[metric]);
    const allowedDifference = tolerance(metric, input);
    const absoluteDifference =
      calculated == null
        ? null
        : rounded(Math.abs(calculated - expected));
    const status: Phase29ComparisonStatus =
      absoluteDifference == null
        ? "not_comparable"
        : absoluteDifference <= allowedDifference
          ? "match"
          : "mismatch";
    const explanation = item.mismatchExplanations?.[metric]?.trim() || null;
    return [{
      caseId: item.id,
      scenario: item.scenario,
      metric,
      expected,
      calculated,
      absoluteDifference,
      allowedDifference,
      status,
      explanation,
    }];
  });
}

export function buildPhase29AcceptanceReport(
  data: CanonicalMmsData,
  input: Phase29AcceptanceInput,
  options: { generatedAt?: string } = {},
): Phase29AcceptanceReport {
  const targetPercentage = normalizedTarget(
    input.acceptanceTargetPercentage,
    95,
  );
  const minimumComparableChecks = normalizedMinimumChecks(
    input.minimumComparableChecks,
  );
  const policyAudit = auditPolicy();
  const coveredScenarios = PHASE29_REQUIRED_SCENARIOS.filter((scenario) =>
    input.cases.some((item) => item.scenario === scenario),
  );
  const missingScenarios = PHASE29_REQUIRED_SCENARIOS.filter(
    (scenario) => !coveredScenarios.includes(scenario),
  );
  const comparisons = input.cases.flatMap((item) =>
    compareCase(data, item, input),
  );
  const matches = comparisons.filter(
    (item) => item.status === "match",
  ).length;
  const mismatches = comparisons.filter(
    (item) => item.status === "mismatch",
  ).length;
  const notComparable = comparisons.filter(
    (item) => item.status === "not_comparable",
  ).length;
  const comparableChecks = matches + mismatches;
  const unexplainedMismatches = comparisons.filter(
    (item) => item.status === "mismatch" && !item.explanation,
  ).length;
  const agreementPercentage =
    comparableChecks > 0
      ? rounded((matches / comparableChecks) * 100, 4)
      : null;
  const inputPolicyMatches =
    input.policy.id === PHASE29_POLICY.id &&
    input.policy.version === PHASE29_POLICY.version &&
    input.policy.status === PHASE29_POLICY.status &&
    Boolean(input.policy.confirmationReference.trim());

  let status: Phase29AcceptanceStatus;
  if (!policyAudit.passed || !inputPolicyMatches) {
    status = "invalid_policy";
  } else if (missingScenarios.length > 0) {
    status = "incomplete_coverage";
  } else if (
    comparableChecks < minimumComparableChecks ||
    agreementPercentage == null
  ) {
    status = "pending_reference";
  } else if (agreementPercentage < targetPercentage) {
    status = "below_target";
  } else if (unexplainedMismatches > 0) {
    status = "unexplained_mismatch";
  } else if (input.finalSignoff.status !== "approved") {
    status = "pending_signoff";
  } else {
    status = "accepted";
  }

  return {
    schemaVersion: "1.0",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    source: data.source,
    policyAudit,
    requirements: {
      targetPercentage,
      minimumComparableChecks,
      requiredScenarios: [...PHASE29_REQUIRED_SCENARIOS],
    },
    coverage: {
      providedCases: input.cases.length,
      coveredScenarios,
      missingScenarios,
    },
    results: {
      comparableChecks,
      matches,
      mismatches,
      notComparable,
      unexplainedMismatches,
      agreementPercentage,
    },
    comparisons,
    finalSignoff: input.finalSignoff,
    status,
    strictPass: status === "accepted",
  };
}

function display(value: number | null): string {
  return value == null ? "N/A" : String(value);
}

export function phase29AcceptanceMarkdown(
  report: Phase29AcceptanceReport,
): string {
  const lines = [
    "# Phase 29 Confirmed-Policy Acceptance Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Source: ${report.source.fileName}`,
    "",
    "## Status",
    "",
    `- Acceptance status: ${report.status}`,
    `- Strict gate: ${report.strictPass ? "PASS" : "BLOCKED"}`,
    `- Policy: ${report.policyAudit.activeId} · ${report.policyAudit.activeVersion} · ${report.policyAudit.activeStatus}`,
    `- Policy audit: ${report.policyAudit.passed ? "PASS" : "FAIL"}`,
    `- Agreement: ${display(report.results.agreementPercentage)}%`,
    `- Target: ${report.requirements.targetPercentage}%`,
    `- Comparable checks: ${report.results.comparableChecks}`,
    `- Matches: ${report.results.matches}`,
    `- Mismatches: ${report.results.mismatches}`,
    `- Unexplained mismatches: ${report.results.unexplainedMismatches}`,
    `- Final sign-off: ${report.finalSignoff.status}`,
    "",
    "## Scenario coverage",
    "",
    `- Covered: ${report.coverage.coveredScenarios.join(", ") || "None"}`,
    `- Missing: ${report.coverage.missingScenarios.join(", ") || "None"}`,
    "",
    "## Comparisons",
    "",
    "| Case | Scenario | Metric | 3D value | Module value | Tolerance | Result | Explanation |",
    "|---|---|---|---:|---:|---:|---|---|",
  ];
  for (const item of report.comparisons) {
    lines.push(
      `| ${item.caseId} | ${item.scenario} | ${item.metric} | ${item.expected} | ${display(item.calculated)} | ${item.allowedDifference} | ${item.status} | ${item.explanation ?? ""} |`,
    );
  }
  if (report.comparisons.length === 0) {
    lines.push("| — | — | No private 3D values supplied | — | — | — | pending | — |");
  }
  lines.push(
    "",
    "## Acceptance rule",
    "",
    "The report passes only when the confirmed production policy is active, all eight scenarios are covered, the minimum comparable-check count is met, agreement is at least the configured target, every mismatch is explained, and written 3D sign-off is recorded as approved.",
    "",
  );
  return `${lines.join("\n")}\n`;
}
