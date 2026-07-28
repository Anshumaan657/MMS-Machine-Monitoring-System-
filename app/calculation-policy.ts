import {
  calculateAvailabilityPerformance,
  type AvailabilityPerformanceResult,
} from "./availability-performance-engine.ts";
import type { ProductionInterval } from "./mms.ts";

export type CalculationPolicyStatus =
  | "confirmed"
  | "provisional"
  | "pending_confirmation";

export type CalculationPolicyId =
  | "mms-direct-quantity-v2"
  | "mms-confirmed-v1"
  | "mms-reconciled-99-37-v1"
  | "mms-3d-confirmation-pending-v1";

export type CalculationPolicyRuntimeEnvironment =
  | "development"
  | "test"
  | "production";

export type CalculationFormulaSet = {
  producedQuantity: string;
  achievedCycleTime: string;
  shiftTarget: string;
  operativeTimeTarget: string;
  productionLoss: string;
  availability: string;
  performance: string;
  quality: string;
  finalOee: string;
  financialLoss: string;
};

export type CalculationPolicyMetadata = {
  id: CalculationPolicyId;
  version: string;
  status: CalculationPolicyStatus;
  description: string;
  formulas: CalculationFormulaSet;
  enabledByDefault: boolean;
  productionAllowed: boolean;
  requiresExplicitOptIn: boolean;
};

export type CalculationPolicySelection = {
  policyId?: CalculationPolicyId | null;
  allowProvisional?: boolean;
  runtimeEnvironment?: CalculationPolicyRuntimeEnvironment;
};

export type ResolvedCalculationPolicy = CalculationPolicyMetadata & {
  requestedPolicyId: CalculationPolicyId | null;
  explicitlySelected: boolean;
  warning: string | null;
};

export type PolicyProductionMetrics = {
  recordId: string;
  producedQuantity: number | null;
  reportedQuantity: number | null;
  calculatedQuantity: number | null;
  achievedCycleTimeSeconds: number | null;
  shiftTarget: number | null;
  operativeTimeTarget: number | null;
  productionLoss: number | null;
  goodQuantity: number | null;
  quality: number | null;
  finalOee: number | null;
  oeeComponents: AvailabilityPerformanceResult;
  quantitySource:
    | "stroke_x_multiplier"
    | "reported"
    | "reported_fallback"
    | "unavailable";
};

export type CalculationPolicyEvaluation = {
  policy: ResolvedCalculationPolicy;
  productionByRecordId: ReadonlyMap<string, PolicyProductionMetrics>;
  downtime: {
    financialLossMode: "classified_downtime" | "all_events";
    machineHourCostByMachine: Readonly<Record<string, number>>;
  };
};

const CONFIRMED_POLICY_ID: CalculationPolicyId = "mms-direct-quantity-v2";

const POLICIES: Readonly<Record<CalculationPolicyId, CalculationPolicyMetadata>> =
  Object.freeze({
    "mms-direct-quantity-v2": Object.freeze({
      id: "mms-direct-quantity-v2",
      version: "2.0.0",
      status: "confirmed",
      description:
        "3D-confirmed policy: Reported Qty is authoritative and M. Factor is used only to validate Stroke-derived quantity.",
      formulas: Object.freeze({
        producedQuantity:
          "Reported Qty; Stroke × M. Factor is validation-only",
        achievedCycleTime: "Operative Time ÷ Reported Qty",
        shiftTarget:
          "Allocated Planned Time ÷ Standard Cycle Time; an active unfinished interval retains the full planned target",
        operativeTimeTarget: "Operative Time ÷ Standard Cycle Time",
        productionLoss: "MAX(0, Shift Target − Reported Qty)",
        availability: "Operative Time ÷ (Shift Time − Allowed Time)",
        performance: "Reported Qty ÷ Operative Time Target",
        quality:
          "(Reported Qty − Rejected Qty − Rework Qty) ÷ Reported Qty; Scrap excluded",
        finalOee: "Availability × Performance × Quality",
        financialLoss:
          "Every Event Duration Hour × stable Machine Master Hourly Cost",
      }),
      enabledByDefault: true,
      productionAllowed: true,
      requiresExplicitOptIn: false,
    }),
    "mms-confirmed-v1": Object.freeze({
      id: "mms-confirmed-v1",
      version: "1.0.0",
      status: "provisional",
      description:
        "Superseded Phase 12 baseline retained for audit comparison. Stroke × M. Factor was authoritative and Quality/Final OEE were pending.",
      formulas: Object.freeze({
        producedQuantity:
          "Stroke × M. Factor, with Reported Qty used only as a fallback",
        achievedCycleTime: "Operative Time ÷ Produced Quantity",
        shiftTarget: "Reported Shift Target from the MMS workbook",
        operativeTimeTarget: "Operative Time ÷ Standard Cycle Time",
        productionLoss: "Reported Shift Target − Produced Quantity",
        availability: "Operative Time ÷ (Shift Time − Allowed Time)",
        performance: "Produced Quantity ÷ Operative Time Target",
        quality: "Pending in the historical Phase 12 baseline",
        finalOee: "Pending in the historical Phase 12 baseline",
        financialLoss:
          "Classified Downtime Hours × interval Machine-Hour Cost",
      }),
      enabledByDefault: false,
      productionAllowed: false,
      requiresExplicitOptIn: true,
    }),
    "mms-reconciled-99-37-v1": Object.freeze({
      id: "mms-reconciled-99-37-v1",
      version: "1.0.0-provisional.1",
      status: "provisional",
      description:
        "Disabled formula set inferred from the sample workbook reconciliation. It projected 99.37% agreement and must not become official until 3D confirms the rules.",
      formulas: Object.freeze({
        producedQuantity:
          "Reported Qty; Stroke × M. Factor remains a validation check",
        achievedCycleTime:
          "Operative Time ÷ (Reported Qty ÷ M. Factor)",
        shiftTarget:
          "(Allocated Planned Time ÷ Standard Cycle Time) × M. Factor; an active unfinished interval retains the full planned target",
        operativeTimeTarget:
          "(Operative Time ÷ Standard Cycle Time) × M. Factor",
        productionLoss:
          "MAX(0, Reported Shift Target − Reported Qty)",
        availability: "Operative Time ÷ (Shift Time − Allowed Time)",
        performance: "Reported Qty ÷ Operative Time Target",
        quality:
          "(Reported Qty − Rejected Qty − Rework Qty) ÷ Reported Qty; Scrap excluded",
        finalOee: "Availability × Performance × Quality",
        financialLoss:
          "Every Event Duration Hour × stable Machine Master Hourly Cost",
      }),
      enabledByDefault: false,
      productionAllowed: false,
      requiresExplicitOptIn: true,
    }),
    "mms-3d-confirmation-pending-v1": Object.freeze({
      id: "mms-3d-confirmation-pending-v1",
      version: "1.0.0-pending",
      status: "pending_confirmation",
      description:
        "Non-executable placeholder for the final rules supplied by 3D. It preserves the policy contract while confirmation is pending.",
      formulas: Object.freeze({
        producedQuantity: "Pending 3D confirmation",
        achievedCycleTime: "Pending 3D confirmation",
        shiftTarget: "Pending 3D confirmation",
        operativeTimeTarget: "Pending 3D confirmation",
        productionLoss: "Pending 3D confirmation",
        availability: "Pending 3D confirmation",
        performance: "Pending 3D confirmation",
        quality: "Pending 3D confirmation",
        finalOee: "Pending 3D confirmation",
        financialLoss: "Pending 3D confirmation",
      }),
      enabledByDefault: false,
      productionAllowed: false,
      requiresExplicitOptIn: true,
    }),
  });

function runtimeEnvironment(): CalculationPolicyRuntimeEnvironment {
  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "production"
  ) {
    return "production";
  }
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return "test";
  }
  return "development";
}

function rounded(value: number, digits = 6): number {
  const power = 10 ** digits;
  return Math.round((value + Number.EPSILON) * power) / power;
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function divide(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  const safeNumerator = finiteNonNegative(numerator);
  const safeDenominator = finiteNonNegative(denominator);
  if (safeNumerator == null || safeDenominator == null || safeDenominator === 0) {
    return null;
  }
  return rounded(safeNumerator / safeDenominator);
}

function policyKey(record: ProductionInterval): string {
  return [record.machine, record.date, record.shift].join("|");
}

export function listCalculationPolicies(): CalculationPolicyMetadata[] {
  return Object.values(POLICIES).map((policy) => ({
    ...policy,
    formulas: { ...policy.formulas },
  }));
}

export function calculationPolicyMetadata(
  policyId: CalculationPolicyId,
): CalculationPolicyMetadata {
  const policy = POLICIES[policyId];
  if (!policy) throw new Error(`Unknown MMS calculation policy: ${policyId}`);
  return { ...policy, formulas: { ...policy.formulas } };
}

export function resolveCalculationPolicy(
  selection: CalculationPolicySelection = {},
): ResolvedCalculationPolicy {
  const requestedPolicyId = selection.policyId ?? null;
  const selectedId = requestedPolicyId ?? CONFIRMED_POLICY_ID;
  const policy = POLICIES[selectedId];
  if (!policy) throw new Error(`Unknown MMS calculation policy: ${selectedId}`);

  if (policy.status === "pending_confirmation") {
    throw new Error(
      `Calculation policy ${selectedId} is pending 3D confirmation and cannot be executed.`,
    );
  }
  if (policy.status === "provisional" && !selection.allowProvisional) {
    throw new Error(
      `Calculation policy ${selectedId} is provisional and requires explicit non-production opt-in.`,
    );
  }
  const environment =
    selection.runtimeEnvironment ?? runtimeEnvironment();
  if (environment === "production" && !policy.productionAllowed) {
    throw new Error(
      `Calculation policy ${selectedId} is disabled in production until 3D confirms it.`,
    );
  }

  return {
    ...policy,
    formulas: { ...policy.formulas },
    requestedPolicyId,
    explicitlySelected: requestedPolicyId != null,
    warning:
      policy.status === "provisional"
        ? "Provisional calculations are for controlled comparison only and are not official MMS results."
        : null,
  };
}

function plannedRatios(
  records: ProductionInterval[],
): ReadonlyMap<string, number> {
  const ratios = new Map<string, number>();
  for (const record of records) {
    const shift = finiteNonNegative(record.timesSeconds.shift);
    const allowed = finiteNonNegative(record.timesSeconds.allowed);
    if (shift != null && shift > 0 && allowed != null && allowed <= shift) {
      ratios.set(policyKey(record), (shift - allowed) / shift);
    }
  }
  return ratios;
}

function latestProductionEnd(records: ProductionInterval[]): number | null {
  const values = records
    .map((record) => record.endEpochMs)
    .filter((value): value is number => typeof value === "number");
  return values.length ? Math.max(...values) : null;
}

function stableMachineCosts(
  records: ProductionInterval[],
): Readonly<Record<string, number>> {
  const counts = new Map<string, Map<number, number>>();
  for (const record of records) {
    const cost = finiteNonNegative(record.costs.machinePerHour);
    if (cost == null) continue;
    const machineCounts = counts.get(record.machine) ?? new Map<number, number>();
    machineCounts.set(cost, (machineCounts.get(cost) ?? 0) + 1);
    counts.set(record.machine, machineCounts);
  }
  return Object.fromEntries(
    [...counts].map(([machine, machineCounts]) => {
      const selected = [...machineCounts].sort(
        ([leftCost, leftCount], [rightCost, rightCount]) =>
          rightCount - leftCount || leftCost - rightCost,
      )[0]?.[0];
      return [machine, selected];
    }).filter((entry): entry is [string, number] => entry[1] != null),
  );
}

function confirmedMetrics(
  record: ProductionInterval,
): PolicyProductionMetrics {
  return {
    recordId: record.id,
    producedQuantity: record.calculations.producedQuantityUsed,
    reportedQuantity: record.quantities.reported,
    calculatedQuantity: record.calculations.actualQuantity,
    achievedCycleTimeSeconds:
      record.calculations.achievedCycleTimeSeconds,
    shiftTarget: record.quantities.shiftTarget,
    operativeTimeTarget: record.calculations.operativeTimeTarget,
    productionLoss: record.calculations.productionLoss,
    goodQuantity: null,
    quality: null,
    finalOee: null,
    oeeComponents: record.oeeComponents,
    quantitySource: record.calculations.quantitySource,
  };
}

function allocatedShiftTarget(
  record: ProductionInterval,
  ratio: number | null,
  latestEndEpochMs: number | null,
  factor: number | null,
): number | null {
  const standardCycle = finiteNonNegative(record.cycleTimesSeconds.standard);
  const shift = finiteNonNegative(record.timesSeconds.shift);
  const allowed = finiteNonNegative(record.timesSeconds.allowed);
  const elapsed =
    record.startEpochMs != null &&
    record.endEpochMs != null &&
    record.endEpochMs >= record.startEpochMs
      ? (record.endEpochMs - record.startEpochMs) / 1_000
      : null;
  if (
    standardCycle == null ||
    standardCycle === 0 ||
    factor == null ||
    ratio == null ||
    elapsed == null
  ) {
    return finiteNonNegative(record.quantities.shiftTarget);
  }

  const fullShiftRecord =
    shift != null &&
    shift > 0 &&
    allowed != null &&
    elapsed >= shift * 0.99;
  const activeSnapshotRecord =
    record.endEpochMs != null &&
    record.endEpochMs === latestEndEpochMs &&
    shift != null &&
    shift > 0 &&
    elapsed < shift * 0.99;
  const allocatedPlannedSeconds =
    fullShiftRecord || activeSnapshotRecord
      ? shift! - (allowed ?? 0)
      : elapsed * ratio;
  return rounded(
    (allocatedPlannedSeconds / standardCycle) * factor,
  );
}

function qualityMetrics(
  record: ProductionInterval,
  producedQuantity: number | null,
): {
  goodQuantity: number | null;
  quality: number | null;
} {
  const rejected = finiteNonNegative(record.quantities.rejected);
  const reworked = finiteNonNegative(record.quantities.reworked);
  if (
    producedQuantity == null ||
    producedQuantity === 0 ||
    rejected == null ||
    reworked == null ||
    rejected + reworked > producedQuantity
  ) {
    return { goodQuantity: null, quality: null };
  }
  const goodQuantity = rounded(producedQuantity - rejected - reworked);
  return {
    goodQuantity,
    quality: rounded(goodQuantity / producedQuantity, 8),
  };
}

function directQuantityMetrics(
  record: ProductionInterval,
  ratio: number | null,
  latestEndEpochMs: number | null,
): PolicyProductionMetrics {
  const reportedQuantity = finiteNonNegative(record.quantities.reported);
  const operative = finiteNonNegative(record.timesSeconds.operative);
  const standardCycle = finiteNonNegative(record.cycleTimesSeconds.standard);
  const operativeTimeTarget = divide(operative, standardCycle);
  const shiftTarget = allocatedShiftTarget(
    record,
    ratio,
    latestEndEpochMs,
    1,
  );
  const productionLoss =
    shiftTarget != null && reportedQuantity != null
      ? rounded(Math.max(0, shiftTarget - reportedQuantity))
      : null;
  const oeeComponents = calculateAvailabilityPerformance({
    shiftTimeSeconds: record.timesSeconds.shift,
    allowedTimeSeconds: record.timesSeconds.allowed,
    operativeTimeSeconds: operative,
    producedQuantity: reportedQuantity,
    operativeTimeTarget,
    exclusionReason: record.oeeComponents.exclusionReason,
  });
  const quality = qualityMetrics(record, reportedQuantity);
  const finalOee =
    oeeComponents.isEligible &&
    oeeComponents.availability != null &&
    oeeComponents.performance != null &&
    quality.quality != null
      ? rounded(
          oeeComponents.availability *
            oeeComponents.performance *
            quality.quality,
          8,
        )
      : null;

  return {
    recordId: record.id,
    producedQuantity: reportedQuantity,
    reportedQuantity,
    calculatedQuantity: finiteNonNegative(record.calculations.actualQuantity),
    achievedCycleTimeSeconds: divide(operative, reportedQuantity),
    shiftTarget,
    operativeTimeTarget,
    productionLoss,
    goodQuantity: quality.goodQuantity,
    quality: quality.quality,
    finalOee,
    oeeComponents,
    quantitySource: reportedQuantity != null ? "reported" : "unavailable",
  };
}

function provisionalMetrics(
  record: ProductionInterval,
  ratio: number | null,
  latestEndEpochMs: number | null,
): PolicyProductionMetrics {
  const reportedQuantity = finiteNonNegative(record.quantities.reported);
  const calculatedQuantity = finiteNonNegative(
    record.calculations.actualQuantity,
  );
  const producedQuantity = reportedQuantity ?? calculatedQuantity;
  const multiplier = finiteNonNegative(record.quantities.multiplier);
  const operative = finiteNonNegative(record.timesSeconds.operative);
  const standardCycle = finiteNonNegative(record.cycleTimesSeconds.standard);
  const effectiveCycles =
    reportedQuantity != null &&
    multiplier != null &&
    multiplier > 0
      ? reportedQuantity / multiplier
      : null;
  const achievedCycleTimeSeconds = divide(operative, effectiveCycles);
  const baseOperativeTarget = divide(operative, standardCycle);
  const operativeTimeTarget =
    baseOperativeTarget != null && multiplier != null
      ? rounded(baseOperativeTarget * multiplier)
      : null;
  const shiftTarget = allocatedShiftTarget(
    record,
    ratio,
    latestEndEpochMs,
    multiplier,
  );
  const productionLossTarget =
    finiteNonNegative(record.quantities.shiftTarget) ?? shiftTarget;
  const productionLoss =
    productionLossTarget != null && producedQuantity != null
      ? rounded(Math.max(0, productionLossTarget - producedQuantity))
      : null;
  const oeeComponents = calculateAvailabilityPerformance({
    shiftTimeSeconds: record.timesSeconds.shift,
    allowedTimeSeconds: record.timesSeconds.allowed,
    operativeTimeSeconds: operative,
    producedQuantity,
    operativeTimeTarget,
    exclusionReason: record.oeeComponents.exclusionReason,
  });
  const quality = qualityMetrics(record, producedQuantity);
  // The sandbox may calculate component evidence, but a provisional policy
  // can never publish an official Final OEE value.
  const finalOee = null;

  return {
    recordId: record.id,
    producedQuantity,
    reportedQuantity,
    calculatedQuantity,
    achievedCycleTimeSeconds,
    shiftTarget,
    operativeTimeTarget,
    productionLoss,
    goodQuantity: quality.goodQuantity,
    quality: quality.quality,
    finalOee,
    oeeComponents,
    quantitySource:
      reportedQuantity != null
        ? "reported"
        : calculatedQuantity != null
          ? "reported_fallback"
          : "unavailable",
  };
}

export function evaluateCalculationPolicy(
  records: ProductionInterval[],
  selection: CalculationPolicySelection = {},
): CalculationPolicyEvaluation {
  const policy = resolveCalculationPolicy(selection);
  const ratios = plannedRatios(records);
  const latestEndEpochMs = latestProductionEnd(records);
  const useReconciledPolicy = policy.id === "mms-reconciled-99-37-v1";
  const useDirectQuantityPolicy = policy.id === "mms-direct-quantity-v2";
  const useStableEventCost =
    useDirectQuantityPolicy || useReconciledPolicy;
  const productionByRecordId = new Map(
    records.map((record) => [
      record.id,
      useDirectQuantityPolicy
        ? directQuantityMetrics(
            record,
            ratios.get(policyKey(record)) ?? null,
            latestEndEpochMs,
          )
        : useReconciledPolicy
        ? provisionalMetrics(
            record,
            ratios.get(policyKey(record)) ?? null,
            latestEndEpochMs,
          )
        : confirmedMetrics(record),
    ]),
  );
  return {
    policy,
    productionByRecordId,
    downtime: {
      financialLossMode: useStableEventCost
        ? "all_events"
        : "classified_downtime",
      machineHourCostByMachine: useStableEventCost
        ? stableMachineCosts(records)
        : {},
    },
  };
}

export const DEFAULT_CALCULATION_POLICY_ID = CONFIRMED_POLICY_ID;
