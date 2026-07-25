export type ProductionCalculationIssueCode =
  | "INVALID_INPUT"
  | "MISSING_OPERATIVE_TIME"
  | "MISSING_PRODUCED_QUANTITY"
  | "MISSING_SHIFT_TARGET"
  | "MISSING_STANDARD_CYCLE_TIME"
  | "QUANTITY_MISMATCH"
  | "ZERO_PRODUCED_QUANTITY"
  | "ZERO_STANDARD_CYCLE_TIME";

export type QuantitySource = "stroke_x_multiplier" | "reported" | "unavailable";

export type MetricComparison = {
  reported: number | null;
  calculated: number | null;
  difference: number | null;
  absoluteDifference: number | null;
  matches: boolean | null;
};

export type StandardizedCycleTimes = {
  standard: number | null;
  approved: number | null;
  reportedAchieved: number | null;
  calculatedAchieved: number | null;
};

export type ProductionCalculationInput = {
  stroke: number | null;
  multiplier: number | null;
  reportedQuantity: number | null;
  operativeTimeSeconds: number | null;
  standardCycleTimeSeconds: number | null;
  approvedCycleTimeSeconds?: number | null;
  reportedAchievedCycleTimeSeconds?: number | null;
  reportedOperativeTimeTarget?: number | null;
  shiftTarget: number | null;
  reportedProductionLoss?: number | null;
};

export type ProductionCalculationResult = {
  actualQuantity: number | null;
  producedQuantityUsed: number | null;
  quantitySource: QuantitySource;
  achievedCycleTimeSeconds: number | null;
  operativeTimeTarget: number | null;
  productionLoss: number | null;
  cycleTimesSeconds: StandardizedCycleTimes;
  comparisons: {
    quantity: MetricComparison;
    achievedCycleTime: MetricComparison;
    operativeTimeTarget: MetricComparison;
    productionLoss: MetricComparison;
  };
  issueCodes: ProductionCalculationIssueCode[];
};

export type ProductionEngineOptions = {
  absoluteTolerance?: number;
};

const DEFAULT_ABSOLUTE_TOLERANCE = 0.0001;

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function rounded(value: number, digits = 6): number {
  const power = 10 ** digits;
  return Math.round((value + Number.EPSILON) * power) / power;
}

function comparison(
  reportedValue: number | null | undefined,
  calculatedValue: number | null,
  tolerance: number,
): MetricComparison {
  const reported = finiteNonNegative(reportedValue);
  if (reported == null || calculatedValue == null) {
    return {
      reported,
      calculated: calculatedValue,
      difference: null,
      absoluteDifference: null,
      matches: null,
    };
  }

  const difference = rounded(calculatedValue - reported);
  const absoluteDifference = rounded(Math.abs(difference));
  return {
    reported,
    calculated: calculatedValue,
    difference,
    absoluteDifference,
    matches: absoluteDifference <= tolerance,
  };
}

/**
 * Applies the production formulas confirmed for MMS.
 *
 * Calculated stroke quantity is authoritative when both Stroke and M. Factor
 * are available. Reported Qty is only a fallback for calculations when either
 * source field is missing.
 */
export function calculateProductionMetrics(
  input: ProductionCalculationInput,
  options: ProductionEngineOptions = {},
): ProductionCalculationResult {
  const tolerance =
    typeof options.absoluteTolerance === "number" &&
    Number.isFinite(options.absoluteTolerance) &&
    options.absoluteTolerance >= 0
      ? options.absoluteTolerance
      : DEFAULT_ABSOLUTE_TOLERANCE;

  const issues = new Set<ProductionCalculationIssueCode>();
  const stroke = finiteNonNegative(input.stroke);
  const multiplier = finiteNonNegative(input.multiplier);
  const reportedQuantity = finiteNonNegative(input.reportedQuantity);
  const operativeTimeSeconds = finiteNonNegative(input.operativeTimeSeconds);
  const standardCycleTimeSeconds = finiteNonNegative(
    input.standardCycleTimeSeconds,
  );
  const shiftTarget = finiteNonNegative(input.shiftTarget);

  const rawValues = [
    input.stroke,
    input.multiplier,
    input.reportedQuantity,
    input.operativeTimeSeconds,
    input.standardCycleTimeSeconds,
    input.approvedCycleTimeSeconds,
    input.reportedAchievedCycleTimeSeconds,
    input.reportedOperativeTimeTarget,
    input.shiftTarget,
    input.reportedProductionLoss,
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

  const actualQuantity =
    stroke != null && multiplier != null ? rounded(stroke * multiplier) : null;
  const quantitySource: QuantitySource =
    actualQuantity != null
      ? "stroke_x_multiplier"
      : reportedQuantity != null
        ? "reported"
        : "unavailable";
  const producedQuantityUsed = actualQuantity ?? reportedQuantity;

  if (producedQuantityUsed == null) issues.add("MISSING_PRODUCED_QUANTITY");

  let achievedCycleTimeSeconds: number | null = null;
  if (operativeTimeSeconds == null) {
    issues.add("MISSING_OPERATIVE_TIME");
  } else if (producedQuantityUsed == null) {
    // The missing-quantity issue has already been recorded.
  } else if (producedQuantityUsed === 0) {
    issues.add("ZERO_PRODUCED_QUANTITY");
  } else {
    achievedCycleTimeSeconds = rounded(
      operativeTimeSeconds / producedQuantityUsed,
    );
  }

  let operativeTimeTarget: number | null = null;
  if (standardCycleTimeSeconds == null) {
    issues.add("MISSING_STANDARD_CYCLE_TIME");
  } else if (standardCycleTimeSeconds === 0) {
    issues.add("ZERO_STANDARD_CYCLE_TIME");
  } else if (operativeTimeSeconds != null) {
    operativeTimeTarget = rounded(
      operativeTimeSeconds / standardCycleTimeSeconds,
    );
  }

  let productionLoss: number | null = null;
  if (shiftTarget == null) {
    issues.add("MISSING_SHIFT_TARGET");
  } else if (producedQuantityUsed != null) {
    productionLoss = rounded(shiftTarget - producedQuantityUsed);
  }

  const quantityComparison = comparison(
    reportedQuantity,
    actualQuantity,
    tolerance,
  );
  if (quantityComparison.matches === false) issues.add("QUANTITY_MISMATCH");

  const cycleTimesSeconds: StandardizedCycleTimes = {
    standard: standardCycleTimeSeconds,
    approved: finiteNonNegative(input.approvedCycleTimeSeconds),
    reportedAchieved: finiteNonNegative(
      input.reportedAchievedCycleTimeSeconds,
    ),
    calculatedAchieved: achievedCycleTimeSeconds,
  };

  return {
    actualQuantity,
    producedQuantityUsed,
    quantitySource,
    achievedCycleTimeSeconds,
    operativeTimeTarget,
    productionLoss,
    cycleTimesSeconds,
    comparisons: {
      quantity: quantityComparison,
      achievedCycleTime: comparison(
        input.reportedAchievedCycleTimeSeconds,
        achievedCycleTimeSeconds,
        tolerance,
      ),
      operativeTimeTarget: comparison(
        input.reportedOperativeTimeTarget,
        operativeTimeTarget,
        tolerance,
      ),
      productionLoss: comparison(
        input.reportedProductionLoss,
        productionLoss,
        tolerance,
      ),
    },
    issueCodes: [...issues],
  };
}
