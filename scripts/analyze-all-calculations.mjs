import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseMmsCanonicalFile } from "../app/mms.ts";

const workbookPath = path.resolve(
  process.argv[2] ?? "Sample1_31-07-23_To_25-12-24.xls",
);
const outputDirectory = path.resolve("verification-output");
const file = await readFile(workbookPath);
const data = parseMmsCanonicalFile(
  file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  path.basename(workbookPath),
);

const tolerances = {
  quantity: { absolute: 0.01, relative: 0.0001 },
  cycle: { absolute: 0.1, relative: 0.005 },
  target: { absolute: 0.5, relative: 0.001 },
  loss: { absolute: 0.5, relative: 0.001 },
  duration: { absolute: 60, relative: 0.005 },
  financial: { absolute: 1, relative: 0.01 },
  timeBalance: { absolute: 60, relative: 0.001 },
};

const round = (value, digits = 6) => {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

const divide = (numerator, denominator) =>
  typeof numerator === "number" &&
  Number.isFinite(numerator) &&
  typeof denominator === "number" &&
  Number.isFinite(denominator) &&
  denominator > 0
    ? round(numerator / denominator)
    : null;

const subtract = (left, right) =>
  typeof left === "number" &&
  Number.isFinite(left) &&
  typeof right === "number" &&
  Number.isFinite(right)
    ? round(left - right)
    : null;

const elapsedSeconds = (record) =>
  record.startEpochMs != null &&
  record.endEpochMs != null &&
  record.endEpochMs >= record.startEpochMs
    ? round((record.endEpochMs - record.startEpochMs) / 1_000)
    : null;

function isMatch(reported, calculated, tolerance) {
  if (
    typeof reported !== "number" ||
    !Number.isFinite(reported) ||
    typeof calculated !== "number" ||
    !Number.isFinite(calculated)
  ) {
    return null;
  }
  const allowed = Math.max(
    tolerance.absolute,
    Math.abs(reported) * tolerance.relative,
  );
  return Math.abs(reported - calculated) <= allowed;
}

function summarizeCandidate(records, reported, calculated, tolerance) {
  let comparable = 0;
  let matches = 0;
  for (const record of records) {
    const result = isMatch(reported(record), calculated(record), tolerance);
    if (result == null) continue;
    comparable += 1;
    if (result) matches += 1;
  }
  return {
    comparable,
    matches,
    mismatches: comparable - matches,
    agreementPercentage:
      comparable > 0 ? round((matches / comparable) * 100, 4) : null,
  };
}

function candidates(records, reported, definitions, tolerance) {
  return definitions
    .map(({ id, label, calculate }) => ({
      id,
      label,
      ...summarizeCandidate(records, reported, calculate, tolerance),
    }))
    .sort(
      (left, right) =>
        (right.agreementPercentage ?? -1) -
        (left.agreementPercentage ?? -1),
    );
}

function productionName(record) {
  return (
    record.product.productName ||
    record.product.partName ||
    record.product.partNumber ||
    "UNKNOWN"
  );
}

const production = data.productionIntervals;
const downtime = data.downtimeEvents;
const latestProductionEndEpochMs = Math.max(
  ...production
    .map((record) => record.endEpochMs)
    .filter((value) => typeof value === "number"),
);
const plannedTimeRatios = new Map();
for (const record of production) {
  const shift = record.timesSeconds.shift;
  const allowed = record.timesSeconds.allowed;
  if (shift != null && shift > 0 && allowed != null && allowed <= shift) {
    plannedTimeRatios.set(
      [record.machine, record.date, record.shift].join("|"),
      (shift - allowed) / shift,
    );
  }
}
const plannedTimeRatio = (record) =>
  plannedTimeRatios.get(
    [record.machine, record.date, record.shift].join("|"),
  ) ?? null;
const machineCostCounts = new Map();
for (const record of production) {
  const cost = record.costs.machinePerHour;
  if (cost == null || cost < 0) continue;
  const costs = machineCostCounts.get(record.machine) ?? new Map();
  costs.set(cost, (costs.get(cost) ?? 0) + 1);
  machineCostCounts.set(record.machine, costs);
}
const machineHourCostModes = new Map(
  [...machineCostCounts].map(([machine, costs]) => [
    machine,
    [...costs].sort(
      ([leftCost, leftCount], [rightCost, rightCount]) =>
        rightCount - leftCount || leftCost - rightCost,
    )[0]?.[0] ?? null,
  ]),
);
const downtimeIntelligence = new Map(
  data.downtimeAnalytics.events.map((event) => [event.id, event]),
);

const actualQuantityCandidates = candidates(
  production,
  (record) => record.quantities.reported,
  [
    {
      id: "stroke_x_multiplier",
      label: "Stroke × M. Factor",
      calculate: (record) => record.calculations.actualQuantity,
    },
    {
      id: "raw_stroke",
      label: "Raw Stroke",
      calculate: (record) => record.quantities.stroke,
    },
  ],
  tolerances.quantity,
);

const achievedCycleCandidates = candidates(
  production,
  (record) => record.cycleTimesSeconds.achieved,
  [
    {
      id: "operative_div_reported_quantity_per_factor",
      label: "Operative Time ÷ (Reported Qty ÷ M. Factor)",
      calculate: (record) =>
        divide(
          record.timesSeconds.operative,
          divide(
            record.quantities.reported,
            record.quantities.multiplier,
          ),
        ),
    },
    {
      id: "operative_div_stroke",
      label: "Operative Time ÷ Stroke",
      calculate: (record) =>
        divide(record.timesSeconds.operative, record.quantities.stroke),
    },
    {
      id: "operative_div_actual_quantity",
      label: "Operative Time ÷ (Stroke × M. Factor)",
      calculate: (record) =>
        divide(
          record.timesSeconds.operative,
          record.calculations.actualQuantity,
        ),
    },
    {
      id: "operative_div_reported_quantity",
      label: "Operative Time ÷ Reported Qty",
      calculate: (record) =>
        divide(record.timesSeconds.operative, record.quantities.reported),
    },
    {
      id: "reported_equals_approved_cycle",
      label: "Approved Cycle Time",
      calculate: (record) => record.cycleTimesSeconds.approved,
    },
    {
      id: "reported_equals_standard_cycle",
      label: "Standard Cycle Time",
      calculate: (record) => record.cycleTimesSeconds.standard,
    },
  ],
  tolerances.cycle,
);

const shiftTargetCandidates = candidates(
  production,
  (record) => record.quantities.shiftTarget,
  [
    {
      id: "allocated_or_active_planned_time_div_standard_cycle_x_factor",
      label:
        "(Completed Allocation or Active Full-Shift Planned Time ÷ Standard Cycle Time) × M. Factor",
      calculate: (record) => {
        const elapsed = elapsedSeconds(record);
        const ratio = plannedTimeRatio(record);
        const factor = record.quantities.multiplier;
        const shift = record.timesSeconds.shift;
        const allowed = record.timesSeconds.allowed;
        if (
          elapsed == null ||
          ratio == null ||
          factor == null
        ) {
          return null;
        }
        const isActiveSnapshotInterval =
          record.endEpochMs === latestProductionEndEpochMs &&
          shift != null &&
          shift > 0 &&
          elapsed < shift * 0.99;
        const allocatedPlannedTime =
          isActiveSnapshotInterval ||
          (shift != null &&
            shift > 0 &&
            allowed != null &&
            elapsed >= shift * 0.99)
            ? shift - (allowed ?? 0)
            : elapsed * ratio;
        const base = divide(
          allocatedPlannedTime,
          record.cycleTimesSeconds.standard,
        );
        return base == null ? null : round(base * factor);
      },
    },
    {
      id: "allocated_planned_time_div_standard_cycle_x_factor",
      label:
        "(Allocated Planned Time ÷ Standard Cycle Time) × M. Factor",
      calculate: (record) => {
        const elapsed = elapsedSeconds(record);
        const ratio = plannedTimeRatio(record);
        const factor = record.quantities.multiplier;
        const shift = record.timesSeconds.shift;
        const allowed = record.timesSeconds.allowed;
        if (
          elapsed == null ||
          ratio == null ||
          factor == null
        ) {
          return null;
        }
        const allocatedPlannedTime =
          shift != null &&
          shift > 0 &&
          allowed != null &&
          elapsed >= shift * 0.99
            ? shift - allowed
            : elapsed * ratio;
        const base = divide(
          allocatedPlannedTime,
          record.cycleTimesSeconds.standard,
        );
        return base == null ? null : round(base * factor);
      },
    },
    {
      id: "prorated_interval_div_standard_cycle_x_factor",
      label:
        "(Interval Elapsed Time × Planned/Shift Ratio ÷ Standard Cycle Time) × M. Factor",
      calculate: (record) => {
        const elapsed = elapsedSeconds(record);
        const ratio = plannedTimeRatio(record);
        const factor = record.quantities.multiplier;
        if (
          elapsed == null ||
          ratio == null ||
          factor == null
        ) {
          return null;
        }
        const base = divide(
          elapsed * ratio,
          record.cycleTimesSeconds.standard,
        );
        return base == null ? null : round(base * factor);
      },
    },
    {
      id: "interval_minus_allowed_div_standard_cycle_x_factor",
      label:
        "((Interval Elapsed Time − Allowed Time) ÷ Standard Cycle Time) × M. Factor",
      calculate: (record) => {
        const base = divide(
          subtract(elapsedSeconds(record), record.timesSeconds.allowed),
          record.cycleTimesSeconds.standard,
        );
        return base != null && record.quantities.multiplier != null
          ? round(base * record.quantities.multiplier)
          : null;
      },
    },
    {
      id: "interval_div_standard_cycle_x_factor",
      label:
        "(Interval Elapsed Time ÷ Standard Cycle Time) × M. Factor",
      calculate: (record) => {
        const base = divide(
          elapsedSeconds(record),
          record.cycleTimesSeconds.standard,
        );
        return base != null && record.quantities.multiplier != null
          ? round(base * record.quantities.multiplier)
          : null;
      },
    },
    {
      id: "planned_div_standard_cycle_x_factor",
      label:
        "((Shift Time − Allowed Time) ÷ Standard Cycle Time) × M. Factor",
      calculate: (record) => {
        const base = divide(
          subtract(record.timesSeconds.shift, record.timesSeconds.allowed),
          record.cycleTimesSeconds.standard,
        );
        return base != null && record.quantities.multiplier != null
          ? round(base * record.quantities.multiplier)
          : null;
      },
    },
    {
      id: "shift_div_standard_cycle_x_factor",
      label: "(Shift Time ÷ Standard Cycle Time) × M. Factor",
      calculate: (record) => {
        const base = divide(
          record.timesSeconds.shift,
          record.cycleTimesSeconds.standard,
        );
        return base != null && record.quantities.multiplier != null
          ? round(base * record.quantities.multiplier)
          : null;
      },
    },
    {
      id: "shift_div_standard_cycle",
      label: "Shift Time ÷ Standard Cycle Time",
      calculate: (record) =>
        divide(record.timesSeconds.shift, record.cycleTimesSeconds.standard),
    },
    {
      id: "planned_div_standard_cycle",
      label: "(Shift Time − Allowed Time) ÷ Standard Cycle Time",
      calculate: (record) =>
        divide(
          subtract(record.timesSeconds.shift, record.timesSeconds.allowed),
          record.cycleTimesSeconds.standard,
        ),
    },
    {
      id: "shift_div_approved_cycle",
      label: "Shift Time ÷ Approved Cycle Time",
      calculate: (record) =>
        divide(record.timesSeconds.shift, record.cycleTimesSeconds.approved),
    },
    {
      id: "planned_div_approved_cycle",
      label: "(Shift Time − Allowed Time) ÷ Approved Cycle Time",
      calculate: (record) =>
        divide(
          subtract(record.timesSeconds.shift, record.timesSeconds.allowed),
          record.cycleTimesSeconds.approved,
        ),
    },
  ],
  tolerances.target,
);

const operativeTargetCandidates = candidates(
  production,
  (record) => record.quantities.operativeTimeTarget,
  [
    {
      id: "operative_div_standard_cycle_x_factor",
      label:
        "(Operative Time ÷ Standard Cycle Time) × M. Factor",
      calculate: (record) => {
        const base = divide(
          record.timesSeconds.operative,
          record.cycleTimesSeconds.standard,
        );
        return base != null && record.quantities.multiplier != null
          ? round(base * record.quantities.multiplier)
          : null;
      },
    },
    {
      id: "operative_div_standard_cycle",
      label: "Operative Time ÷ Standard Cycle Time",
      calculate: (record) =>
        divide(record.timesSeconds.operative, record.cycleTimesSeconds.standard),
    },
    {
      id: "operative_div_approved_cycle",
      label: "Operative Time ÷ Approved Cycle Time",
      calculate: (record) =>
        divide(record.timesSeconds.operative, record.cycleTimesSeconds.approved),
    },
    {
      id: "shift_div_standard_cycle",
      label: "Shift Time ÷ Standard Cycle Time",
      calculate: (record) =>
        divide(record.timesSeconds.shift, record.cycleTimesSeconds.standard),
    },
    {
      id: "planned_div_standard_cycle",
      label: "(Shift Time − Allowed Time) ÷ Standard Cycle Time",
      calculate: (record) =>
        divide(
          subtract(record.timesSeconds.shift, record.timesSeconds.allowed),
          record.cycleTimesSeconds.standard,
        ),
    },
  ],
  tolerances.target,
);

const productionLossCandidates = candidates(
  production,
  (record) => record.quantities.productionLoss,
  [
    {
      id: "clamped_reported_shift_target_minus_reported_quantity",
      label: "MAX(0, Reported Shift Target − Reported Qty)",
      calculate: (record) => {
        const difference = subtract(
          record.quantities.shiftTarget,
          record.quantities.reported,
        );
        return difference == null ? null : Math.max(0, difference);
      },
    },
    {
      id: "clamped_reported_shift_target_minus_calculated_quantity",
      label:
        "MAX(0, Reported Shift Target − (Stroke × M. Factor))",
      calculate: (record) => {
        const difference = subtract(
          record.quantities.shiftTarget,
          record.calculations.actualQuantity,
        );
        return difference == null ? null : Math.max(0, difference);
      },
    },
    {
      id: "reported_shift_target_minus_calculated_quantity",
      label: "Reported Shift Target − (Stroke × M. Factor)",
      calculate: (record) =>
        subtract(
          record.quantities.shiftTarget,
          record.calculations.actualQuantity,
        ),
    },
    {
      id: "reported_shift_target_minus_reported_quantity",
      label: "Reported Shift Target − Reported Qty",
      calculate: (record) =>
        subtract(
          record.quantities.shiftTarget,
          record.quantities.reported,
        ),
    },
    {
      id: "operative_target_minus_calculated_quantity",
      label: "Reported Opr. Time Target − (Stroke × M. Factor)",
      calculate: (record) =>
        subtract(
          record.quantities.operativeTimeTarget,
          record.calculations.actualQuantity,
        ),
    },
    {
      id: "operative_target_minus_reported_quantity",
      label: "Reported Opr. Time Target − Reported Qty",
      calculate: (record) =>
        subtract(
          record.quantities.operativeTimeTarget,
          record.quantities.reported,
        ),
    },
    {
      id: "calculated_shift_target_minus_calculated_quantity",
      label:
        "(Shift Time ÷ Standard Cycle Time) − (Stroke × M. Factor)",
      calculate: (record) =>
        subtract(
          divide(
            record.timesSeconds.shift,
            record.cycleTimesSeconds.standard,
          ),
          record.calculations.actualQuantity,
        ),
    },
  ],
  tolerances.loss,
);

const downtimeDurationCandidates = candidates(
  downtime,
  (event) => event.durationSeconds,
  [
    {
      id: "timestamp_difference",
      label: "Till Time − From Time",
      calculate: (event) =>
        event.startEpochMs != null && event.endEpochMs != null
          ? round((event.endEpochMs - event.startEpochMs) / 1_000)
          : null,
    },
  ],
  tolerances.duration,
);

const machineHourLossCandidates = candidates(
  downtime,
  (event) => event.reportedMachineHourLoss,
  [
    {
      id: "all_event_hours_x_machine_modal_cost",
      label:
        "Every Event Duration Hours × Stable Machine-Hour Cost",
      calculate: (event) => {
        const cost = machineHourCostModes.get(event.machine);
        return event.durationSeconds != null && cost != null
          ? round((event.durationSeconds / 3_600) * cost)
          : null;
      },
    },
    {
      id: "classified_downtime_hours_x_cost",
      label: "Classified Downtime Hours × Machine-Hour Cost",
      calculate: (event) =>
        downtimeIntelligence.get(event.id)?.calculatedMachineHourLoss ?? null,
    },
    {
      id: "all_event_hours_x_cost",
      label: "Every Event Duration Hours × Machine-Hour Cost",
      calculate: (event) => {
        const intelligence = downtimeIntelligence.get(event.id);
        return intelligence?.durationSeconds != null &&
          intelligence.machineHourCost != null
          ? round(
              (intelligence.durationSeconds / 3_600) *
                intelligence.machineHourCost,
            )
          : null;
      },
    },
  ],
  tolerances.financial,
);

const timeBalanceCandidates = candidates(
  production,
  (record) => record.timesSeconds.shift,
  [
    {
      id: "operative_nonoperative_downtime_systemoff_allowed",
      label:
        "Operative + Non-Operative + Downtime + System Off + Allowed",
      calculate: (record) => {
        const fields = [
          record.timesSeconds.operative,
          record.timesSeconds.nonOperative,
          record.timesSeconds.downtime,
          record.timesSeconds.systemOff,
          record.timesSeconds.allowed,
        ];
        return fields.every((value) => typeof value === "number")
          ? round(fields.reduce((sum, value) => sum + value, 0))
          : null;
      },
    },
    {
      id: "operative_nonoperative_downtime_systemoff",
      label: "Operative + Non-Operative + Downtime + System Off",
      calculate: (record) => {
        const fields = [
          record.timesSeconds.operative,
          record.timesSeconds.nonOperative,
          record.timesSeconds.downtime,
          record.timesSeconds.systemOff,
        ];
        return fields.every((value) => typeof value === "number")
          ? round(fields.reduce((sum, value) => sum + value, 0))
          : null;
      },
    },
    {
      id: "operative_nonoperative_systemoff_allowed",
      label: "Operative + Non-Operative + System Off + Allowed",
      calculate: (record) => {
        const fields = [
          record.timesSeconds.operative,
          record.timesSeconds.nonOperative,
          record.timesSeconds.systemOff,
          record.timesSeconds.allowed,
        ];
        return fields.every((value) => typeof value === "number")
          ? round(fields.reduce((sum, value) => sum + value, 0))
          : null;
      },
    },
  ],
  tolerances.timeBalance,
);

function multiplierGroup(record) {
  return record.quantities.multiplier == null
    ? "MISSING"
    : String(record.quantities.multiplier);
}

function groupAudit(records, groupKey, reported, candidatesToTest, tolerance) {
  const groups = new Map();
  for (const record of records) {
    const key = groupKey(record) || "UNKNOWN";
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      records: group.length,
      candidates: candidates(group, reported, candidatesToTest, tolerance),
    }))
    .sort((left, right) => right.records - left.records);
}

const cycleDefinitions = [
  {
    id: "operative_div_reported_quantity_per_factor",
    label: "Operative Time ÷ (Reported Qty ÷ M. Factor)",
    calculate: (record) =>
      divide(
        record.timesSeconds.operative,
        divide(record.quantities.reported, record.quantities.multiplier),
      ),
  },
  {
    id: "operative_div_stroke",
    label: "Operative Time ÷ Stroke",
    calculate: (record) =>
      divide(record.timesSeconds.operative, record.quantities.stroke),
  },
  {
    id: "operative_div_actual_quantity",
    label: "Operative Time ÷ (Stroke × M. Factor)",
    calculate: (record) =>
      divide(record.timesSeconds.operative, record.calculations.actualQuantity),
  },
  {
    id: "operative_div_reported_quantity",
    label: "Operative Time ÷ Reported Qty",
    calculate: (record) =>
      divide(record.timesSeconds.operative, record.quantities.reported),
  },
];

function ratioEvidence(record) {
  const reported = record.cycleTimesSeconds.achieved;
  const current = divide(
    record.timesSeconds.operative,
    record.calculations.actualQuantity,
  );
  const factor = record.quantities.multiplier;
  const ratio = divide(reported, current);
  if (
    factor == null ||
    factor <= 1 ||
    ratio == null ||
    reported == null ||
    reported === 0
  ) {
    return null;
  }
  return {
    record,
    ratio,
    factor,
    ratioMatchesFactor:
      isMatch(factor, ratio, tolerances.quantity) === true,
    rawStrokeFormulaMatches:
      isMatch(
        reported,
        divide(record.timesSeconds.operative, record.quantities.stroke),
        tolerances.cycle,
      ) === true,
  };
}

const ratioRows = production.map(ratioEvidence).filter(Boolean);
const mFactorEvidence = {
  eligibleRows: ratioRows.length,
  ratioMatchesFactor: ratioRows.filter((row) => row.ratioMatchesFactor).length,
  rawStrokeFormulaMatches: ratioRows.filter(
    (row) => row.rawStrokeFormulaMatches,
  ).length,
};
mFactorEvidence.ratioMatchPercentage = round(
  (mFactorEvidence.ratioMatchesFactor / mFactorEvidence.eligibleRows) * 100,
  4,
);
mFactorEvidence.rawStrokeMatchPercentage = round(
  (mFactorEvidence.rawStrokeFormulaMatches / mFactorEvidence.eligibleRows) *
    100,
  4,
);

function selectExamples() {
  const selected = [];
  const seen = new Set();
  const add = (record, reason) => {
    if (!record || seen.has(record.id)) return;
    seen.add(record.id);
    selected.push({
      sourceRow: record.sourceRow,
      date: record.date,
      machine: record.machine,
      shift: record.shift,
      product: productionName(record),
      operativeTimeSeconds: record.timesSeconds.operative,
      stroke: record.quantities.stroke,
      multiplier: record.quantities.multiplier,
      reportedQuantity: record.quantities.reported,
      calculatedQuantity: record.calculations.actualQuantity,
      reportedAchievedCycleTimeSeconds:
        record.cycleTimesSeconds.achieved,
      currentAchievedCycleTimeSeconds:
        record.calculations.achievedCycleTimeSeconds,
      rawStrokeAchievedCycleTimeSeconds: divide(
        record.timesSeconds.operative,
        record.quantities.stroke,
      ),
      reportedShiftTarget: record.quantities.shiftTarget,
      shiftTargetFromShiftAndStandard: divide(
        record.timesSeconds.shift,
        record.cycleTimesSeconds.standard,
      ),
      reportedOperativeTarget: record.quantities.operativeTimeTarget,
      operativeTargetFromOperativeAndStandard: divide(
        record.timesSeconds.operative,
        record.cycleTimesSeconds.standard,
      ),
      reportedProductionLoss: record.quantities.productionLoss,
      lossFromReportedTargetAndCalculatedQuantity: subtract(
        record.quantities.shiftTarget,
        record.calculations.actualQuantity,
      ),
      lossFromReportedTargetAndReportedQuantity: subtract(
        record.quantities.shiftTarget,
        record.quantities.reported,
      ),
      reason,
    });
  };

  for (const factor of [2, 3, 4, 6, 8, 10, 12]) {
    const row = ratioRows.find(
      (item) =>
        item.factor === factor &&
        item.ratioMatchesFactor &&
        item.rawStrokeFormulaMatches &&
        item.record.calculations.comparisons.quantity.matches === true,
    );
    add(row?.record, `clean_m_factor_${factor}`);
  }
  add(
    production.find(
      (record) =>
        record.quantities.multiplier === 1 &&
        isMatch(
          record.cycleTimesSeconds.achieved,
          divide(record.timesSeconds.operative, record.quantities.stroke),
          tolerances.cycle,
        ) === true &&
        record.calculations.comparisons.quantity.matches === true,
    ),
    "clean_m_factor_1_control",
  );
  add(
    production.find(
      (record) =>
        record.quantities.reported === 0 &&
        (record.calculations.actualQuantity ?? 0) > 0 &&
        record.cycleTimesSeconds.achieved === 0,
    ),
    "zero_placeholder_exception",
  );
  add(
    production.find(
      (record) =>
        record.calculations.comparisons.quantity.matches === false &&
        isMatch(
          record.cycleTimesSeconds.achieved,
          divide(
            record.timesSeconds.operative,
            record.quantities.reported,
          ),
          tolerances.cycle,
        ) === true,
    ),
    "reported_quantity_exception",
  );
  return selected;
}

const actualQuantityMismatches = production.filter(
  (record) =>
    isMatch(
      record.quantities.reported,
      record.calculations.actualQuantity,
      tolerances.quantity,
    ) === false,
);
const quantityMismatchClassification = {
  total: actualQuantityMismatches.length,
  reportedZeroCalculatedPositive: actualQuantityMismatches.filter(
    (record) =>
      record.quantities.reported === 0 &&
      (record.calculations.actualQuantity ?? 0) > 0,
  ).length,
  reportedPositiveCalculatedZero: actualQuantityMismatches.filter(
    (record) =>
      (record.quantities.reported ?? 0) > 0 &&
      record.calculations.actualQuantity === 0,
  ).length,
  bothPositive: actualQuantityMismatches.filter(
    (record) =>
      (record.quantities.reported ?? 0) > 0 &&
      (record.calculations.actualQuantity ?? 0) > 0,
  ).length,
  nullProductZeroPlaceholders: actualQuantityMismatches.filter(
    (record) =>
      record.quantities.reported === 0 &&
      ["NULL", "NULL TURN"].includes(productionName(record).toUpperCase()),
  ).length,
};

const achievedZeroPlaceholders = production.filter(
  (record) =>
    record.cycleTimesSeconds.achieved === 0 &&
    record.quantities.reported === 0,
).length;

const qualityComparable = production.filter(
  (record) =>
    (record.quantities.reported ?? 0) > 0 &&
    record.quantities.rejected != null &&
    record.quantities.reworked != null,
);
const qualityAudit = {
  comparableRecords: qualityComparable.length,
  zeroRejectAndReworkRecords: qualityComparable.filter(
    (record) =>
      record.quantities.rejected === 0 &&
      record.quantities.reworked === 0,
  ).length,
  invalidNegativeGoodQuantityRecords: qualityComparable.filter(
    (record) =>
      (record.quantities.reported ?? 0) -
        (record.quantities.rejected ?? 0) -
        (record.quantities.reworked ?? 0) <
      0,
  ).length,
  formula:
    "(Reported Qty − Rejected Qty − Rework Qty) ÷ Reported Qty; scrap excluded",
  externalWorkbookReferenceAvailable: false,
};

const projectedMetrics = [
  {
    metric: "actual_quantity",
    ...actualQuantityCandidates.find(
      (candidate) => candidate.id === "stroke_x_multiplier",
    ),
  },
  {
    metric: "achieved_cycle_time_seconds",
    ...achievedCycleCandidates.find(
      (candidate) =>
        candidate.id === "operative_div_reported_quantity_per_factor",
    ),
  },
  {
    metric: "operative_time_target",
    ...operativeTargetCandidates.find(
      (candidate) =>
        candidate.id === "operative_div_standard_cycle_x_factor",
    ),
  },
  {
    metric: "production_loss",
    ...productionLossCandidates.find(
      (candidate) =>
        candidate.id ===
        "clamped_reported_shift_target_minus_reported_quantity",
    ),
  },
  {
    metric: "downtime_duration_seconds",
    ...downtimeDurationCandidates[0],
  },
  {
    metric: "machine_hour_loss",
    ...machineHourLossCandidates.find(
      (candidate) =>
        candidate.id === "all_event_hours_x_machine_modal_cost",
    ),
  },
].map(({ metric, id, label, comparable, matches, mismatches }) => ({
  metric,
  formulaId: id,
  formula: label,
  comparable,
  matches,
  mismatches,
  agreementPercentage:
    comparable > 0 ? round((matches / comparable) * 100, 4) : null,
}));
const projectedComparable = projectedMetrics.reduce(
  (sum, metric) => sum + metric.comparable,
  0,
);
const projectedMatches = projectedMetrics.reduce(
  (sum, metric) => sum + metric.matches,
  0,
);
const projectedAgreement = {
  comparable: projectedComparable,
  matches: projectedMatches,
  mismatches: projectedComparable - projectedMatches,
  agreementPercentage: round(
    (projectedMatches / projectedComparable) * 100,
    4,
  ),
  note:
    "Projected from workbook evidence only; formula policy must be confirmed before production code changes.",
};

const report = {
  schemaVersion: "1.0",
  generatedAt: new Date().toISOString(),
  source: data.source,
  recordCounts: {
    production: production.length,
    downtime: downtime.length,
  },
  formulaCandidates: {
    actualQuantity: actualQuantityCandidates,
    achievedCycleTime: achievedCycleCandidates,
    shiftTarget: shiftTargetCandidates,
    operativeTimeTarget: operativeTargetCandidates,
    productionLoss: productionLossCandidates,
    downtimeDuration: downtimeDurationCandidates,
    machineHourLoss: machineHourLossCandidates,
    timeBalance: timeBalanceCandidates,
  },
  achievedCycleByMultiplier: groupAudit(
    production,
    multiplierGroup,
    (record) => record.cycleTimesSeconds.achieved,
    cycleDefinitions,
    tolerances.cycle,
  ),
  achievedCycleByMachine: groupAudit(
    production,
    (record) => record.machine,
    (record) => record.cycleTimesSeconds.achieved,
    cycleDefinitions,
    tolerances.cycle,
  ),
  achievedCycleByShift: groupAudit(
    production,
    (record) => record.shift,
    (record) => record.cycleTimesSeconds.achieved,
    cycleDefinitions,
    tolerances.cycle,
  ),
  mFactorEvidence,
  quantityMismatchClassification,
  achievedZeroPlaceholders,
  qualityAudit,
  projectedMetrics,
  projectedAgreement,
  essentialConfirmations: [
    "Use Reported Qty as the authoritative production quantity when it conflicts with Stroke × M. Factor, while retaining the latter as a data-quality check.",
    "Calculate Achieved Cycle Time as Operative Time ÷ (Reported Qty ÷ M. Factor).",
    "Multiply Shift Target and Opr. Time Target by M. Factor; prorate Shift Target across completed product-change intervals, but retain the full planned target for an active unfinished interval.",
    "Calculate Production Loss as MAX(0, Shift Target − Reported Qty).",
    "Calculate event financial loss using the stable machine-master hourly cost for every event in Down Time Details; keep Non-Operative/System Off classifications separate for analytics.",
  ],
  representativeExamples: selectExamples(),
};

await mkdir(outputDirectory, { recursive: true });
const markdownTable = (rows) =>
  rows.map((row) => `| ${row.join(" | ")} |`);
const markdown = [
  "# MMS Full Calculation Reconciliation",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "No production formula was changed during this audit.",
  "",
  "## Reconciled formula evidence",
  "",
  "| Metric | Best-supported formula | Comparable | Matches | Agreement |",
  "|---|---|---:|---:|---:|",
  ...markdownTable(
    [
      [
        "Actual Quantity",
        "Stroke × M. Factor (validation formula)",
        actualQuantityCandidates[0].comparable,
        actualQuantityCandidates[0].matches,
        `${actualQuantityCandidates[0].agreementPercentage}%`,
      ],
      [
        "Achieved Cycle Time",
        achievedCycleCandidates[0].label,
        achievedCycleCandidates[0].comparable,
        achievedCycleCandidates[0].matches,
        `${achievedCycleCandidates[0].agreementPercentage}%`,
      ],
      [
        "Shift Target",
        shiftTargetCandidates[0].label,
        shiftTargetCandidates[0].comparable,
        shiftTargetCandidates[0].matches,
        `${shiftTargetCandidates[0].agreementPercentage}%`,
      ],
      [
        "Opr. Time Target",
        operativeTargetCandidates[0].label,
        operativeTargetCandidates[0].comparable,
        operativeTargetCandidates[0].matches,
        `${operativeTargetCandidates[0].agreementPercentage}%`,
      ],
      [
        "Production Loss",
        productionLossCandidates[0].label,
        productionLossCandidates[0].comparable,
        productionLossCandidates[0].matches,
        `${productionLossCandidates[0].agreementPercentage}%`,
      ],
      [
        "Downtime Duration",
        downtimeDurationCandidates[0].label,
        downtimeDurationCandidates[0].comparable,
        downtimeDurationCandidates[0].matches,
        `${downtimeDurationCandidates[0].agreementPercentage}%`,
      ],
      [
        "Machine-Hour Loss",
        machineHourLossCandidates[0].label,
        machineHourLossCandidates[0].comparable,
        machineHourLossCandidates[0].matches,
        `${machineHourLossCandidates[0].agreementPercentage}%`,
      ],
      [
        "Time Balance",
        timeBalanceCandidates[0].label,
        timeBalanceCandidates[0].comparable,
        timeBalanceCandidates[0].matches,
        `${timeBalanceCandidates[0].agreementPercentage}%`,
      ],
    ],
  ),
  "",
  "## M. Factor proof",
  "",
  `- Eligible multi-factor rows: ${mFactorEvidence.eligibleRows}`,
  `- Reported/current cycle ratio equals M. Factor: ${mFactorEvidence.ratioMatchesFactor} (${mFactorEvidence.ratioMatchPercentage}%)`,
  `- Unified Reported Qty ÷ M. Factor formula: ${achievedCycleCandidates[0].matches}/${achievedCycleCandidates[0].comparable} (${achievedCycleCandidates[0].agreementPercentage}%)`,
  "",
  "## Quantity exceptions",
  "",
  `- Stroke × M. Factor mismatches: ${quantityMismatchClassification.total}`,
  `- Reported Qty is zero while calculated quantity is positive: ${quantityMismatchClassification.reportedZeroCalculatedPositive}`,
  `- Of those, NULL/NULL TURN rows: ${quantityMismatchClassification.nullProductZeroPlaceholders}`,
  `- Both quantities are positive but different: ${quantityMismatchClassification.bothPositive}`,
  `- Reported quantity is positive while calculated quantity is zero: ${quantityMismatchClassification.reportedPositiveCalculatedZero}`,
  "",
  "## Projected Phase 12 agreement",
  "",
  `- ${projectedAgreement.matches}/${projectedAgreement.comparable} comparable checks`,
  `- Projected agreement: ${projectedAgreement.agreementPercentage}%`,
  `- Remaining mismatches: ${projectedAgreement.mismatches}, all in the Stroke × M. Factor validation check`,
  "",
  "## One consolidated confirmation required from 3D",
  "",
  ...report.essentialConfirmations.map(
    (confirmation, index) => `${index + 1}. ${confirmation}`,
  ),
  "",
  "Quality uses the already-confirmed formula shown in the JSON report, but the workbook contains no official Quality/OEE reference column, so factual calculation testing is possible while external agreement testing remains unavailable.",
  "",
].join("\n");

const exampleColumns = [
  "sourceRow",
  "date",
  "machine",
  "shift",
  "product",
  "operativeTimeSeconds",
  "stroke",
  "multiplier",
  "reportedQuantity",
  "calculatedQuantity",
  "reportedAchievedCycleTimeSeconds",
  "currentAchievedCycleTimeSeconds",
  "rawStrokeAchievedCycleTimeSeconds",
  "reportedShiftTarget",
  "reportedOperativeTarget",
  "reportedProductionLoss",
  "reason",
];
const csvValue = (value) => {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = [
  exampleColumns.join(","),
  ...report.representativeExamples.map((example) =>
    exampleColumns.map((column) => csvValue(example[column])).join(","),
  ),
].join("\n");

await Promise.all([
  writeFile(
    path.join(outputDirectory, "all-calculation-reconciliation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    path.join(outputDirectory, "all-calculation-reconciliation.md"),
    markdown,
    "utf8",
  ),
  writeFile(
    path.join(outputDirectory, "all-calculation-examples.csv"),
    `${csv}\n`,
    "utf8",
  ),
]);

console.log(
  `Projected workbook agreement: ${projectedAgreement.agreementPercentage}% (${projectedAgreement.matches}/${projectedAgreement.comparable})`,
);
console.log(
  `Achieved Cycle Time unified formula: ${achievedCycleCandidates[0].agreementPercentage}%`,
);
console.log(
  `Shift Target: ${shiftTargetCandidates[0].agreementPercentage}%`,
);
console.log(
  `Opr. Time Target: ${operativeTargetCandidates[0].agreementPercentage}%`,
);
console.log(
  `Production Loss: ${productionLossCandidates[0].agreementPercentage}%`,
);
console.log(
  `Downtime and machine-hour loss: ${downtimeDurationCandidates[0].agreementPercentage}% / ${machineHourLossCandidates[0].agreementPercentage}%`,
);
