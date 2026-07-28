import {
  evaluateCalculationPolicy,
  type CalculationPolicyRuntimeEnvironment,
  type PolicyProductionMetrics,
} from "./calculation-policy.ts";
import type { CanonicalMmsData, DowntimeEvent } from "./mms.ts";

export const FORMULA_SANDBOX_POLICY_ID = "mms-reconciled-99-37-v1";

export type FormulaComparisonMetric =
  | "producedQuantity"
  | "achievedCycleTimeSeconds"
  | "shiftTarget"
  | "operativeTimeTarget"
  | "productionLoss"
  | "quality"
  | "finalOee";

export type FormulaMetricComparison = {
  metric: FormulaComparisonMetric;
  confirmedResult: number | null;
  provisionalResult: number | null;
  absoluteDifference: number | null;
  percentageDifference: number | null;
  differs: boolean;
};

export type FormulaRecordComparison = {
  recordId: string;
  machine: string;
  shift: string;
  date: string | null;
  sourceRow: number;
  comparisons: FormulaMetricComparison[];
  affected: boolean;
};

export type FormulaComparisonSummary = {
  metric: FormulaComparisonMetric;
  recordsCompared: number;
  recordsAffected: number;
  confirmedTotal: number;
  provisionalTotal: number;
  absoluteDifference: number;
  percentageDifference: number | null;
};

export type FinancialLossComparisonRecord = {
  recordId: string;
  machine: string;
  durationHours: number | null;
  stableMachineHourCost: number | null;
  confirmedResult: number | null;
  provisionalResult: number | null;
  absoluteDifference: number | null;
};

export type FormulaPolicySandboxResult = {
  mode: "diagnostic_comparison_only";
  officialPolicyId: "mms-direct-quantity-v2";
  provisionalPolicyId: typeof FORMULA_SANDBOX_POLICY_ID;
  productionActivationAllowed: false;
  warning: string;
  recordsCompared: number;
  recordsAffected: number;
  records: FormulaRecordComparison[];
  summary: FormulaComparisonSummary[];
  financialLoss: {
    formula: "Event Duration Hours × Stable Machine Master Cost";
    records: FinancialLossComparisonRecord[];
    recordsAffected: number;
  };
};

export type FormulaPolicySandboxOptions = {
  purpose: "diagnostic_comparison";
  runtimeEnvironment?: CalculationPolicyRuntimeEnvironment;
};

const METRICS: readonly FormulaComparisonMetric[] = [
  "producedQuantity",
  "achievedCycleTimeSeconds",
  "shiftTarget",
  "operativeTimeTarget",
  "productionLoss",
  "quality",
  "finalOee",
];

function rounded(value: number, digits = 8): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function value(
  metrics: PolicyProductionMetrics,
  name: FormulaComparisonMetric,
): number | null {
  return metrics[name];
}

function comparison(
  metric: FormulaComparisonMetric,
  confirmedResult: number | null,
  provisionalResult: number | null,
): FormulaMetricComparison {
  const comparable =
    confirmedResult != null && provisionalResult != null;
  const absoluteDifference = comparable
    ? rounded(Math.abs(provisionalResult - confirmedResult))
    : null;
  const percentageDifference =
    absoluteDifference != null &&
    confirmedResult != null &&
    confirmedResult !== 0
      ? rounded((absoluteDifference / Math.abs(confirmedResult)) * 100, 6)
      : absoluteDifference === 0
        ? 0
        : null;
  return {
    metric,
    confirmedResult,
    provisionalResult,
    absoluteDifference,
    percentageDifference,
    differs:
      confirmedResult !== provisionalResult &&
      (absoluteDifference == null || absoluteDifference > 0.00000001),
  };
}

function financialRecord(
  event: DowntimeEvent,
  cost: number | undefined,
): FinancialLossComparisonRecord {
  const durationHours =
    event.durationSeconds != null && event.durationSeconds >= 0
      ? rounded(event.durationSeconds / 3_600)
      : null;
  const result =
    durationHours != null && cost != null
      ? rounded(durationHours * cost)
      : null;
  return {
    recordId: event.id,
    machine: event.machine,
    durationHours,
    stableMachineHourCost: cost ?? null,
    confirmedResult: result,
    provisionalResult: result,
    absoluteDifference: result == null ? null : 0,
  };
}

export function compareFormulaPolicies(
  data: Pick<CanonicalMmsData, "productionIntervals" | "downtimeEvents">,
  options: FormulaPolicySandboxOptions,
): FormulaPolicySandboxResult {
  const environment = options.runtimeEnvironment ?? "development";
  if (options.purpose !== "diagnostic_comparison") {
    throw new Error(
      "The provisional formula policy is available only for explicit diagnostic comparison.",
    );
  }
  if (environment === "production") {
    throw new Error(
      "The provisional 99.37% formula sandbox cannot run in production.",
    );
  }

  const confirmed = evaluateCalculationPolicy(data.productionIntervals, {
    policyId: "mms-direct-quantity-v2",
    runtimeEnvironment: environment,
  });
  const provisional = evaluateCalculationPolicy(data.productionIntervals, {
    policyId: FORMULA_SANDBOX_POLICY_ID,
    allowProvisional: true,
    runtimeEnvironment: environment,
  });
  const records = data.productionIntervals.map((record) => {
    const confirmedMetrics = confirmed.productionByRecordId.get(record.id)!;
    const provisionalMetrics =
      provisional.productionByRecordId.get(record.id)!;
    const comparisons = METRICS.map((metric) =>
      comparison(
        metric,
        value(confirmedMetrics, metric),
        value(provisionalMetrics, metric),
      ),
    );
    return {
      recordId: record.id,
      machine: record.machine,
      shift: record.shift,
      date: record.date,
      sourceRow: record.sourceRow,
      comparisons,
      affected: comparisons.some((item) => item.differs),
    };
  });
  const summary = METRICS.map((metric) => {
    const values = records.map((record) =>
      record.comparisons.find((item) => item.metric === metric)!,
    );
    const confirmedTotal = rounded(
      values.reduce(
        (sum, item) => sum + (item.confirmedResult ?? 0),
        0,
      ),
    );
    const provisionalTotal = rounded(
      values.reduce(
        (sum, item) => sum + (item.provisionalResult ?? 0),
        0,
      ),
    );
    const absoluteDifference = rounded(
      Math.abs(provisionalTotal - confirmedTotal),
    );
    return {
      metric,
      recordsCompared: values.filter(
        (item) =>
          item.confirmedResult != null && item.provisionalResult != null,
      ).length,
      recordsAffected: values.filter((item) => item.differs).length,
      confirmedTotal,
      provisionalTotal,
      absoluteDifference,
      percentageDifference:
        confirmedTotal !== 0
          ? rounded(
              (absoluteDifference / Math.abs(confirmedTotal)) * 100,
              6,
            )
          : absoluteDifference === 0
            ? 0
            : null,
    };
  });
  const financialRecords = data.downtimeEvents.map((event) =>
    financialRecord(
      event,
      confirmed.downtime.machineHourCostByMachine[event.machine],
    ),
  );
  return {
    mode: "diagnostic_comparison_only",
    officialPolicyId: "mms-direct-quantity-v2",
    provisionalPolicyId: FORMULA_SANDBOX_POLICY_ID,
    productionActivationAllowed: false,
    warning:
      "Provisional values are comparison evidence only. Reported Qty and confirmed policy 2.0.0 remain authoritative.",
    recordsCompared: records.length,
    recordsAffected: records.filter((record) => record.affected).length,
    records,
    summary,
    financialLoss: {
      formula: "Event Duration Hours × Stable Machine Master Cost",
      records: financialRecords,
      recordsAffected: financialRecords.filter(
        (record) => record.absoluteDifference !== 0,
      ).length,
    },
  };
}
