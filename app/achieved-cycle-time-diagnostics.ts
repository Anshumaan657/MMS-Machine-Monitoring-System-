import type {
  CanonicalMmsData,
  ProductionInterval,
} from "./mms.ts";

export type CycleTimeCandidateId =
  | "operative_div_calculated_quantity"
  | "operative_div_reported_quantity"
  | "operative_div_stroke"
  | "shift_div_calculated_quantity"
  | "shift_div_reported_quantity"
  | "planned_div_calculated_quantity"
  | "planned_div_reported_quantity"
  | "elapsed_div_calculated_quantity"
  | "elapsed_div_reported_quantity"
  | "reported_equals_standard_cycle"
  | "reported_equals_approved_cycle";

export type CycleTimeCandidateSummary = {
  id: CycleTimeCandidateId;
  label: string;
  comparable: number;
  matches: number;
  agreementPercentage: number | null;
  currentMismatchComparable: number;
  currentMismatchesExplained: number;
  currentMismatchExplanationPercentage: number | null;
};

export type CycleTimeMismatchRecord = {
  recordId: string;
  sourceRow: number;
  date: string | null;
  machine: string;
  shift: string;
  product: string;
  operativeTimeSeconds: number | null;
  shiftTimeSeconds: number | null;
  allowedTimeSeconds: number | null;
  elapsedTimeSeconds: number | null;
  stroke: number | null;
  multiplier: number | null;
  reportedQuantity: number | null;
  calculatedQuantity: number | null;
  reportedAchievedCycleTimeSeconds: number;
  calculatedAchievedCycleTimeSeconds: number;
  absoluteDifferenceSeconds: number;
  relativeDifferencePercentage: number | null;
  allowedDifferenceSeconds: number;
  patterns: string[];
  matchingCandidateIds: CycleTimeCandidateId[];
};

export type CycleTimeMismatchGroup = {
  key: string;
  comparableRecords: number;
  mismatchRecords: number;
  mismatchRatePercentage: number;
  medianAbsoluteDifferenceSeconds: number;
  p90AbsoluteDifferenceSeconds: number;
  maximumAbsoluteDifferenceSeconds: number;
};

export type CycleTimeRepresentativeExample = CycleTimeMismatchRecord & {
  selectionReasons: string[];
};

export type AchievedCycleTimeDiagnostic = {
  schemaVersion: "1.0";
  generatedAt: string;
  source: {
    company: string;
    fileName: string;
  };
  baseline: {
    productionRecords: number;
    comparableRecords: number;
    matches: number;
    mismatches: number;
    notComparable: number;
    agreementPercentage: number | null;
  };
  mismatchPatterns: Array<{
    pattern: string;
    count: number;
    percentageOfMismatches: number;
  }>;
  candidates: CycleTimeCandidateSummary[];
  groups: {
    byMachine: CycleTimeMismatchGroup[];
    byShift: CycleTimeMismatchGroup[];
    byProduct: CycleTimeMismatchGroup[];
  };
  representativeExamples: CycleTimeRepresentativeExample[];
  allMismatches: CycleTimeMismatchRecord[];
};

type Candidate = {
  id: CycleTimeCandidateId;
  label: string;
  calculate(record: ProductionInterval): number | null;
};

function rounded(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function safeDivide(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (
    typeof numerator !== "number" ||
    !Number.isFinite(numerator) ||
    typeof denominator !== "number" ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }
  return rounded(numerator / denominator);
}

function elapsedSeconds(record: ProductionInterval): number | null {
  if (
    record.startEpochMs == null ||
    record.endEpochMs == null ||
    record.endEpochMs < record.startEpochMs
  ) {
    return null;
  }
  return rounded((record.endEpochMs - record.startEpochMs) / 1_000);
}

function plannedSeconds(record: ProductionInterval): number | null {
  const shift = record.timesSeconds.shift;
  const allowed = record.timesSeconds.allowed;
  if (
    shift == null ||
    allowed == null ||
    !Number.isFinite(shift) ||
    !Number.isFinite(allowed) ||
    shift < allowed
  ) {
    return null;
  }
  return rounded(shift - allowed);
}

const CANDIDATES: Candidate[] = [
  {
    id: "operative_div_calculated_quantity",
    label: "Operative Time ÷ Stroke-derived Quantity",
    calculate: (record) =>
      safeDivide(
        record.timesSeconds.operative,
        record.calculations.actualQuantity,
      ),
  },
  {
    id: "operative_div_reported_quantity",
    label: "Operative Time ÷ Reported Qty",
    calculate: (record) =>
      safeDivide(record.timesSeconds.operative, record.quantities.reported),
  },
  {
    id: "operative_div_stroke",
    label: "Operative Time ÷ Stroke",
    calculate: (record) =>
      safeDivide(record.timesSeconds.operative, record.quantities.stroke),
  },
  {
    id: "shift_div_calculated_quantity",
    label: "Shift Time ÷ Stroke-derived Quantity",
    calculate: (record) =>
      safeDivide(record.timesSeconds.shift, record.calculations.actualQuantity),
  },
  {
    id: "shift_div_reported_quantity",
    label: "Shift Time ÷ Reported Qty",
    calculate: (record) =>
      safeDivide(record.timesSeconds.shift, record.quantities.reported),
  },
  {
    id: "planned_div_calculated_quantity",
    label: "Planned Production Time ÷ Stroke-derived Quantity",
    calculate: (record) =>
      safeDivide(plannedSeconds(record), record.calculations.actualQuantity),
  },
  {
    id: "planned_div_reported_quantity",
    label: "Planned Production Time ÷ Reported Qty",
    calculate: (record) =>
      safeDivide(plannedSeconds(record), record.quantities.reported),
  },
  {
    id: "elapsed_div_calculated_quantity",
    label: "Interval Elapsed Time ÷ Stroke-derived Quantity",
    calculate: (record) =>
      safeDivide(elapsedSeconds(record), record.calculations.actualQuantity),
  },
  {
    id: "elapsed_div_reported_quantity",
    label: "Interval Elapsed Time ÷ Reported Qty",
    calculate: (record) =>
      safeDivide(elapsedSeconds(record), record.quantities.reported),
  },
  {
    id: "reported_equals_standard_cycle",
    label: "Reported Achieved Cycle equals Standard Cycle",
    calculate: (record) => record.cycleTimesSeconds.standard,
  },
  {
    id: "reported_equals_approved_cycle",
    label: "Reported Achieved Cycle equals Approved Cycle",
    calculate: (record) => record.cycleTimesSeconds.approved,
  },
];

function tolerance(reported: number): number {
  return rounded(Math.max(0.1, Math.abs(reported) * 0.005));
}

function matches(
  reported: number | null | undefined,
  calculated: number | null | undefined,
): boolean | null {
  if (
    typeof reported !== "number" ||
    !Number.isFinite(reported) ||
    typeof calculated !== "number" ||
    !Number.isFinite(calculated)
  ) {
    return null;
  }
  return Math.abs(calculated - reported) <= tolerance(reported);
}

function productName(record: ProductionInterval): string {
  return (
    record.product.productName ||
    record.product.partName ||
    record.product.partNumber ||
    "UNKNOWN"
  );
}

function mismatchPatterns(
  record: ProductionInterval,
  reported: number,
  calculated: number,
  difference: number,
): string[] {
  const patterns: string[] = [];
  if (record.calculations.comparisons.quantity.matches === false) {
    patterns.push("quantity_mismatch");
  }
  if (record.quantities.multiplier != null && record.quantities.multiplier !== 1) {
    patterns.push("multiplier_not_one");
  }
  if (record.quantities.reported === 0) patterns.push("reported_qty_zero");
  if (record.calculations.actualQuantity === 0) {
    patterns.push("calculated_qty_zero");
  }
  if (record.timesSeconds.operative === 0) {
    patterns.push("operative_time_zero");
  }
  if (reported === 0) patterns.push("reported_cycle_zero");
  if (difference <= 1) patterns.push("rounding_range_under_one_second");
  if (difference > Math.max(10, Math.abs(reported) * 0.1)) {
    patterns.push("large_difference");
  }
  if (
    reported !== 0 &&
    (calculated / reported >= 2 || reported / calculated >= 2)
  ) {
    patterns.push("ratio_at_least_two");
  }
  if (matches(reported, record.cycleTimesSeconds.standard)) {
    patterns.push("reported_matches_standard_cycle");
  }
  if (matches(reported, record.cycleTimesSeconds.approved)) {
    patterns.push("reported_matches_approved_cycle");
  }
  return patterns;
}

function quantile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return rounded(sorted[Math.floor((sorted.length - 1) * fraction)] ?? 0);
}

function groupMismatches(
  records: ProductionInterval[],
  mismatches: CycleTimeMismatchRecord[],
  dimension: (record: ProductionInterval) => string,
): CycleTimeMismatchGroup[] {
  const comparableCounts = new Map<string, number>();
  for (const record of records) {
    const reported = record.cycleTimesSeconds.achieved;
    const calculated = record.calculations.achievedCycleTimeSeconds;
    if (matches(reported, calculated) != null) {
      const key = dimension(record) || "UNKNOWN";
      comparableCounts.set(key, (comparableCounts.get(key) ?? 0) + 1);
    }
  }
  const mismatchGroups = new Map<string, CycleTimeMismatchRecord[]>();
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const mismatch of mismatches) {
    const source = byId.get(mismatch.recordId);
    if (!source) continue;
    const key = dimension(source) || "UNKNOWN";
    const group = mismatchGroups.get(key) ?? [];
    group.push(mismatch);
    mismatchGroups.set(key, group);
  }
  return [...mismatchGroups.entries()]
    .map(([key, group]) => {
      const comparableRecords = comparableCounts.get(key) ?? 0;
      const differences = group.map(
        (record) => record.absoluteDifferenceSeconds,
      );
      return {
        key,
        comparableRecords,
        mismatchRecords: group.length,
        mismatchRatePercentage: comparableRecords
          ? rounded((group.length / comparableRecords) * 100, 2)
          : 0,
        medianAbsoluteDifferenceSeconds: quantile(differences, 0.5),
        p90AbsoluteDifferenceSeconds: quantile(differences, 0.9),
        maximumAbsoluteDifferenceSeconds: Math.max(...differences, 0),
      };
    })
    .sort(
      (left, right) =>
        right.mismatchRecords - left.mismatchRecords ||
        right.mismatchRatePercentage - left.mismatchRatePercentage ||
        left.key.localeCompare(right.key),
    );
}

function buildMismatch(record: ProductionInterval): CycleTimeMismatchRecord | null {
  const reported = record.cycleTimesSeconds.achieved;
  const calculated = record.calculations.achievedCycleTimeSeconds;
  if (
    reported == null ||
    calculated == null ||
    matches(reported, calculated) !== false
  ) {
    return null;
  }
  const absoluteDifferenceSeconds = rounded(Math.abs(calculated - reported));
  const matchingCandidateIds = CANDIDATES.filter(
    (candidate) => matches(reported, candidate.calculate(record)) === true,
  ).map((candidate) => candidate.id);
  return {
    recordId: record.id,
    sourceRow: record.sourceRow,
    date: record.date,
    machine: record.machine,
    shift: record.shift,
    product: productName(record),
    operativeTimeSeconds: record.timesSeconds.operative,
    shiftTimeSeconds: record.timesSeconds.shift,
    allowedTimeSeconds: record.timesSeconds.allowed,
    elapsedTimeSeconds: elapsedSeconds(record),
    stroke: record.quantities.stroke,
    multiplier: record.quantities.multiplier,
    reportedQuantity: record.quantities.reported,
    calculatedQuantity: record.calculations.actualQuantity,
    reportedAchievedCycleTimeSeconds: reported,
    calculatedAchievedCycleTimeSeconds: calculated,
    absoluteDifferenceSeconds,
    relativeDifferencePercentage:
      reported === 0
        ? null
        : rounded((absoluteDifferenceSeconds / Math.abs(reported)) * 100, 2),
    allowedDifferenceSeconds: tolerance(reported),
    patterns: mismatchPatterns(
      record,
      reported,
      calculated,
      absoluteDifferenceSeconds,
    ),
    matchingCandidateIds,
  };
}

function candidateSummaries(
  records: ProductionInterval[],
  currentMismatches: Set<string>,
): CycleTimeCandidateSummary[] {
  return CANDIDATES.map((candidate) => {
    let comparable = 0;
    let candidateMatches = 0;
    let currentMismatchComparable = 0;
    let currentMismatchesExplained = 0;
    for (const record of records) {
      const reported = record.cycleTimesSeconds.achieved;
      const result = matches(reported, candidate.calculate(record));
      if (result == null) continue;
      comparable += 1;
      if (result) candidateMatches += 1;
      if (currentMismatches.has(record.id)) {
        currentMismatchComparable += 1;
        if (result) currentMismatchesExplained += 1;
      }
    }
    return {
      id: candidate.id,
      label: candidate.label,
      comparable,
      matches: candidateMatches,
      agreementPercentage: comparable
        ? rounded((candidateMatches / comparable) * 100, 2)
        : null,
      currentMismatchComparable,
      currentMismatchesExplained,
      currentMismatchExplanationPercentage: currentMismatchComparable
        ? rounded(
            (currentMismatchesExplained / currentMismatchComparable) * 100,
            2,
          )
        : null,
    };
  }).sort(
    (left, right) =>
      right.currentMismatchesExplained - left.currentMismatchesExplained ||
      (right.agreementPercentage ?? 0) - (left.agreementPercentage ?? 0),
  );
}

function selectRepresentativeExamples(
  mismatches: CycleTimeMismatchRecord[],
  candidates: CycleTimeCandidateSummary[],
  limit = 20,
): CycleTimeRepresentativeExample[] {
  const selections = new Map<
    string,
    { record: CycleTimeMismatchRecord; reasons: Set<string> }
  >();
  const add = (record: CycleTimeMismatchRecord, reason: string) => {
    const current = selections.get(record.recordId) ?? {
      record,
      reasons: new Set<string>(),
    };
    current.reasons.add(reason);
    selections.set(record.recordId, current);
  };

  [...mismatches]
    .sort(
      (left, right) =>
        right.absoluteDifferenceSeconds - left.absoluteDifferenceSeconds,
    )
    .slice(0, 4)
    .forEach((record) => add(record, "largest_absolute_difference"));
  [...mismatches]
    .sort(
      (left, right) =>
        left.absoluteDifferenceSeconds - right.absoluteDifferenceSeconds,
    )
    .slice(0, 3)
    .forEach((record) => add(record, "smallest_non_tolerance_difference"));

  const topCandidateIds = candidates
    .filter(
      (candidate) =>
        candidate.id !== "operative_div_calculated_quantity" &&
        candidate.currentMismatchesExplained > 0,
    )
    .slice(0, 5)
    .map((candidate) => candidate.id);
  for (const candidateId of topCandidateIds) {
    const record = mismatches.find((item) =>
      item.matchingCandidateIds.includes(candidateId),
    );
    if (record) add(record, `matches_${candidateId}`);
  }

  const usedMachines = new Set<string>();
  for (const record of mismatches) {
    if (usedMachines.has(record.machine)) continue;
    add(record, "machine_coverage");
    usedMachines.add(record.machine);
    if (usedMachines.size >= 5) break;
  }
  const usedShifts = new Set<string>();
  for (const record of mismatches) {
    if (usedShifts.has(record.shift)) continue;
    add(record, "shift_coverage");
    usedShifts.add(record.shift);
  }
  for (const pattern of [
    "quantity_mismatch",
    "multiplier_not_one",
    "reported_cycle_zero",
    "large_difference",
    "reported_matches_standard_cycle",
  ]) {
    const record = mismatches.find((item) => item.patterns.includes(pattern));
    if (record) add(record, `pattern_${pattern}`);
  }

  return [...selections.values()]
    .slice(0, limit)
    .map(({ record, reasons }) => ({
      ...record,
      selectionReasons: [...reasons],
    }));
}

export function diagnoseAchievedCycleTime(
  data: CanonicalMmsData,
  generatedAt = new Date().toISOString(),
): AchievedCycleTimeDiagnostic {
  const records = data.productionIntervals;
  const allMismatches = records
    .map(buildMismatch)
    .filter((record): record is CycleTimeMismatchRecord => record != null);
  const comparableRecords = records.filter(
    (record) =>
      matches(
        record.cycleTimesSeconds.achieved,
        record.calculations.achievedCycleTimeSeconds,
      ) != null,
  ).length;
  const mismatchIds = new Set(allMismatches.map((record) => record.recordId));
  const matchCount = comparableRecords - allMismatches.length;
  const patternCounts = new Map<string, number>();
  for (const mismatch of allMismatches) {
    for (const pattern of mismatch.patterns) {
      patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
    }
  }
  const candidates = candidateSummaries(records, mismatchIds);
  return {
    schemaVersion: "1.0",
    generatedAt,
    source: {
      company: data.source.company,
      fileName: data.source.fileName,
    },
    baseline: {
      productionRecords: records.length,
      comparableRecords,
      matches: matchCount,
      mismatches: allMismatches.length,
      notComparable: records.length - comparableRecords,
      agreementPercentage: comparableRecords
        ? rounded((matchCount / comparableRecords) * 100, 2)
        : null,
    },
    mismatchPatterns: [...patternCounts.entries()]
      .map(([pattern, count]) => ({
        pattern,
        count,
        percentageOfMismatches: allMismatches.length
          ? rounded((count / allMismatches.length) * 100, 2)
          : 0,
      }))
      .sort(
        (left, right) =>
          right.count - left.count || left.pattern.localeCompare(right.pattern),
      ),
    candidates,
    groups: {
      byMachine: groupMismatches(records, allMismatches, (record) => record.machine),
      byShift: groupMismatches(records, allMismatches, (record) => record.shift),
      byProduct: groupMismatches(records, allMismatches, productName),
    },
    representativeExamples: selectRepresentativeExamples(
      allMismatches,
      candidates,
    ),
    allMismatches,
  };
}
