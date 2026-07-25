export type DowntimeClassification =
  | "short_non_operative"
  | "downtime"
  | "system_off"
  | "unclassified";

export type DowntimeIntelligenceIssueCode =
  | "CONTEXT_NOT_FOUND"
  | "DURATION_DERIVED_FROM_TIMESTAMPS"
  | "INVALID_DOWNTIME_DURATION"
  | "MERGED_CONSECUTIVE_EVENTS"
  | "MISSING_ADDITIONAL_OVERTIME_THRESHOLD"
  | "MISSING_MACHINE_HOUR_COST"
  | "OVERLAPPING_DOWNTIME_RECORD"
  | "REPORTED_LOSS_MISMATCH"
  | "UNREPORTED_REASON";

export type DowntimeEngineEventInput = {
  id: string;
  machine: string;
  shift: string;
  date: string | null;
  startEpochMs: number | null;
  endEpochMs: number | null;
  startAt: string | null;
  endAt: string | null;
  durationSeconds: number | null;
  productName: string;
  reasonType: string;
  reason: string;
  isUnreported: boolean;
  hasOverlap: boolean;
  reportedMachineHourLoss: number | null;
};

export type DowntimeContextInterval = {
  id: string;
  machine: string;
  shift: string;
  date: string | null;
  startEpochMs: number | null;
  endEpochMs: number | null;
  productName: string;
  additionalOvertimeThresholdSeconds: number | null;
  machineHourCost: number | null;
  reportedNonOperativeSeconds: number | null;
  reportedSystemOffSeconds: number | null;
};

export type FinancialLossComparison = {
  reported: number | null;
  calculated: number | null;
  difference: number | null;
  matches: boolean | null;
};

export type DowntimeEventIntelligence = DowntimeEngineEventInput & {
  sourceEventIds: string[];
  sourceEventCount: number;
  contextIntervalId: string | null;
  classification: DowntimeClassification;
  additionalOvertimeThresholdSeconds: number | null;
  machineHourCost: number | null;
  calculatedMachineHourLoss: number | null;
  financialLossComparison: FinancialLossComparison;
  issueCodes: DowntimeIntelligenceIssueCode[];
};

export type DowntimeReasonPareto = {
  reason: string;
  eventCount: number;
  downtimeSeconds: number;
  downtimePercentage: number;
  cumulativePercentage: number;
  calculatedMachineHourLoss: number;
};

export type DowntimeAggregate = {
  key: string;
  label: string;
  machine: string | null;
  shift: string | null;
  date: string | null;
  rawEventCount: number;
  mergedEventCount: number;
  totals: {
    shortNonOperativeSeconds: number;
    downtimeSeconds: number;
    systemOffEventSeconds: number;
    reportedNonOperativeSeconds: number;
    reportedSystemOffSeconds: number;
    calculatedMachineHourLoss: number;
    reportedMachineHourLoss: number;
    unpricedDowntimeSeconds: number;
  };
  unreportedEventCount: number;
  overlappingEventCount: number;
  issueCodes: DowntimeIntelligenceIssueCode[];
};

export type DowntimeEngineOptions = {
  mergeConsecutiveEvents?: boolean;
  maximumMergeGapSeconds?: number;
  requireSameReasonForMerge?: boolean;
  financialComparisonTolerance?: number;
};

export type DowntimeAnalytics = {
  events: DowntimeEventIntelligence[];
  mergedEvents: DowntimeEventIntelligence[];
  machineWise: DowntimeAggregate[];
  shiftWise: DowntimeAggregate[];
  daily: DowntimeAggregate[];
  period: DowntimeAggregate;
  machineRanking: DowntimeAggregate[];
  reasonPareto: DowntimeReasonPareto[];
  mergeRule: {
    enabled: boolean;
    maximumGapSeconds: number;
    requireSameReason: boolean;
  };
};

const DEFAULT_FINANCIAL_TOLERANCE = 0.01;

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function rounded(value: number, digits = 6): number {
  const power = 10 ** digits;
  return Math.round((value + Number.EPSILON) * power) / power;
}

function normalized(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function isSystemOff(reasonType: string, reason: string): boolean {
  const values = [normalized(reasonType), normalized(reason)];
  return values.some(
    (value) =>
      value === "SYSTEM OFF" ||
      value === "SYSTEM_OFF" ||
      value.includes("SYSTEM OFF"),
  );
}

function effectiveDuration(
  event: DowntimeEngineEventInput,
  issues: Set<DowntimeIntelligenceIssueCode>,
): number | null {
  const reported = finiteNonNegative(event.durationSeconds);
  if (reported != null) return reported;
  if (
    event.startEpochMs != null &&
    event.endEpochMs != null &&
    event.endEpochMs >= event.startEpochMs
  ) {
    issues.add("DURATION_DERIVED_FROM_TIMESTAMPS");
    return rounded((event.endEpochMs - event.startEpochMs) / 1_000);
  }
  issues.add("INVALID_DOWNTIME_DURATION");
  return null;
}

function findContext(
  event: DowntimeEngineEventInput,
  contexts: DowntimeContextInterval[],
): DowntimeContextInterval | null {
  const candidates = contexts.filter(
    (context) =>
      context.machine === event.machine &&
      event.startEpochMs != null &&
      context.startEpochMs != null &&
      context.endEpochMs != null &&
      event.startEpochMs >= context.startEpochMs &&
      event.startEpochMs <= context.endEpochMs,
  );
  return (
    candidates.find(
      (context) =>
        context.shift === event.shift &&
        context.productName === event.productName,
    ) ??
    candidates.find((context) => context.shift === event.shift) ??
    candidates[0] ??
    null
  );
}

function financialComparison(
  reportedValue: number | null,
  calculatedValue: number | null,
  tolerance: number,
): FinancialLossComparison {
  const reported = finiteNonNegative(reportedValue);
  if (reported == null || calculatedValue == null) {
    return {
      reported,
      calculated: calculatedValue,
      difference: null,
      matches: null,
    };
  }
  const difference = rounded(calculatedValue - reported);
  return {
    reported,
    calculated: calculatedValue,
    difference,
    matches: Math.abs(difference) <= tolerance,
  };
}

function classifyEvent(
  event: DowntimeEngineEventInput,
  context: DowntimeContextInterval | null,
  tolerance: number,
): DowntimeEventIntelligence {
  const issues = new Set<DowntimeIntelligenceIssueCode>();
  if (event.isUnreported) issues.add("UNREPORTED_REASON");
  if (event.hasOverlap) issues.add("OVERLAPPING_DOWNTIME_RECORD");
  if (!context) issues.add("CONTEXT_NOT_FOUND");

  const durationSeconds = effectiveDuration(event, issues);
  const threshold = finiteNonNegative(
    context?.additionalOvertimeThresholdSeconds,
  );
  const machineHourCost = finiteNonNegative(context?.machineHourCost);
  let classification: DowntimeClassification;
  if (isSystemOff(event.reasonType, event.reason)) {
    classification = "system_off";
  } else if (threshold == null || durationSeconds == null) {
    classification = "unclassified";
    if (threshold == null) {
      issues.add("MISSING_ADDITIONAL_OVERTIME_THRESHOLD");
    }
  } else {
    classification =
      durationSeconds <= threshold ? "short_non_operative" : "downtime";
  }

  let calculatedMachineHourLoss: number | null = 0;
  if (classification === "downtime") {
    if (machineHourCost == null) {
      calculatedMachineHourLoss = null;
      issues.add("MISSING_MACHINE_HOUR_COST");
    } else if (durationSeconds == null) {
      calculatedMachineHourLoss = null;
    } else {
      calculatedMachineHourLoss = rounded(
        (durationSeconds / 3_600) * machineHourCost,
      );
    }
  } else if (classification === "unclassified") {
    calculatedMachineHourLoss = null;
  }

  const comparison = financialComparison(
    event.reportedMachineHourLoss,
    calculatedMachineHourLoss,
    tolerance,
  );
  if (comparison.matches === false) issues.add("REPORTED_LOSS_MISMATCH");

  return {
    ...event,
    durationSeconds,
    sourceEventIds: [event.id],
    sourceEventCount: 1,
    contextIntervalId: context?.id ?? null,
    classification,
    additionalOvertimeThresholdSeconds: threshold,
    machineHourCost,
    calculatedMachineHourLoss,
    financialLossComparison: comparison,
    issueCodes: [...issues],
  };
}

function canMerge(
  current: DowntimeEventIntelligence,
  next: DowntimeEventIntelligence,
  maximumGapSeconds: number,
  requireSameReason: boolean,
): boolean {
  if (
    current.hasOverlap ||
    next.hasOverlap ||
    current.machine !== next.machine ||
    current.shift !== next.shift ||
    current.classification !== next.classification ||
    current.classification === "unclassified" ||
    current.endEpochMs == null ||
    next.startEpochMs == null ||
    next.startEpochMs < current.endEpochMs ||
    (next.startEpochMs - current.endEpochMs) / 1_000 > maximumGapSeconds ||
    current.additionalOvertimeThresholdSeconds !==
      next.additionalOvertimeThresholdSeconds ||
    current.machineHourCost !== next.machineHourCost
  ) {
    return false;
  }
  return (
    !requireSameReason ||
    (normalized(current.reasonType) === normalized(next.reasonType) &&
      normalized(current.reason) === normalized(next.reason))
  );
}

function mergedFinancialLoss(
  classification: DowntimeClassification,
  durationSeconds: number | null,
  machineHourCost: number | null,
): number | null {
  if (classification !== "downtime") {
    return classification === "unclassified" ? null : 0;
  }
  return durationSeconds != null && machineHourCost != null
    ? rounded((durationSeconds / 3_600) * machineHourCost)
    : null;
}

function mergeEvents(
  events: DowntimeEventIntelligence[],
  options: Required<
    Pick<
      DowntimeEngineOptions,
      | "maximumMergeGapSeconds"
      | "requireSameReasonForMerge"
      | "financialComparisonTolerance"
    >
  >,
): DowntimeEventIntelligence[] {
  const sorted = [...events].sort(
    (left, right) =>
      left.machine.localeCompare(right.machine) ||
      (left.startEpochMs ?? Number.MAX_SAFE_INTEGER) -
        (right.startEpochMs ?? Number.MAX_SAFE_INTEGER),
  );
  const merged: DowntimeEventIntelligence[] = [];

  for (const event of sorted) {
    const previous = merged.at(-1);
    if (
      !previous ||
      !canMerge(
        previous,
        event,
        options.maximumMergeGapSeconds,
        options.requireSameReasonForMerge,
      )
    ) {
      merged.push({ ...event, sourceEventIds: [...event.sourceEventIds] });
      continue;
    }

    const durationSeconds =
      previous.startEpochMs != null && event.endEpochMs != null
        ? rounded((event.endEpochMs - previous.startEpochMs) / 1_000)
        : previous.durationSeconds != null && event.durationSeconds != null
          ? rounded(previous.durationSeconds + event.durationSeconds)
          : null;
    const reportedMachineHourLoss =
      previous.reportedMachineHourLoss != null &&
      event.reportedMachineHourLoss != null
        ? rounded(
            previous.reportedMachineHourLoss + event.reportedMachineHourLoss,
          )
        : previous.reportedMachineHourLoss ?? event.reportedMachineHourLoss;
    const calculatedMachineHourLoss = mergedFinancialLoss(
      previous.classification,
      durationSeconds,
      previous.machineHourCost,
    );
    const comparison = financialComparison(
      reportedMachineHourLoss,
      calculatedMachineHourLoss,
      options.financialComparisonTolerance,
    );
    const issueCodes = new Set([
      ...previous.issueCodes,
      ...event.issueCodes,
      "MERGED_CONSECUTIVE_EVENTS" as const,
    ]);
    if (comparison.matches === false) issueCodes.add("REPORTED_LOSS_MISMATCH");

    merged[merged.length - 1] = {
      ...previous,
      id: `MERGED:${previous.sourceEventIds[0]}:${event.sourceEventIds.at(-1)}`,
      endEpochMs: event.endEpochMs,
      endAt: event.endAt,
      durationSeconds,
      sourceEventIds: [...previous.sourceEventIds, ...event.sourceEventIds],
      sourceEventCount: previous.sourceEventCount + event.sourceEventCount,
      reportedMachineHourLoss,
      calculatedMachineHourLoss,
      financialLossComparison: comparison,
      issueCodes: [...issueCodes],
    };
  }
  return merged;
}

type DowntimeDimension = "machine" | "shift" | "date" | "period";

function aggregateDowntimeGroup(
  key: string,
  label: string,
  events: DowntimeEventIntelligence[],
  rawEvents: DowntimeEventIntelligence[],
  contexts: DowntimeContextInterval[],
  dimension: DowntimeDimension,
): DowntimeAggregate {
  const totals = {
    shortNonOperativeSeconds: 0,
    downtimeSeconds: 0,
    systemOffEventSeconds: 0,
    reportedNonOperativeSeconds: 0,
    reportedSystemOffSeconds: 0,
    calculatedMachineHourLoss: 0,
    reportedMachineHourLoss: 0,
    unpricedDowntimeSeconds: 0,
  };
  const issues = new Set<DowntimeIntelligenceIssueCode>();

  for (const event of events) {
    const duration = event.durationSeconds ?? 0;
    if (event.classification === "short_non_operative") {
      totals.shortNonOperativeSeconds += duration;
    } else if (event.classification === "downtime") {
      totals.downtimeSeconds += duration;
      if (event.calculatedMachineHourLoss == null) {
        totals.unpricedDowntimeSeconds += duration;
      }
    } else if (event.classification === "system_off") {
      totals.systemOffEventSeconds += duration;
    }
    if (event.calculatedMachineHourLoss != null) {
      totals.calculatedMachineHourLoss += event.calculatedMachineHourLoss;
    }
    if (event.reportedMachineHourLoss != null) {
      totals.reportedMachineHourLoss += event.reportedMachineHourLoss;
    }
    for (const code of event.issueCodes) issues.add(code);
  }
  for (const context of contexts) {
    totals.reportedNonOperativeSeconds +=
      context.reportedNonOperativeSeconds ?? 0;
    totals.reportedSystemOffSeconds += context.reportedSystemOffSeconds ?? 0;
  }

  return {
    key,
    label,
    machine: dimension === "machine" ? label : null,
    shift: dimension === "shift" ? label : null,
    date: dimension === "date" ? label : null,
    rawEventCount: rawEvents.length,
    mergedEventCount: events.length,
    totals: Object.fromEntries(
      Object.entries(totals).map(([name, value]) => [name, rounded(value)]),
    ) as DowntimeAggregate["totals"],
    unreportedEventCount: rawEvents.filter((event) => event.isUnreported).length,
    overlappingEventCount: rawEvents.filter((event) => event.hasOverlap).length,
    issueCodes: [...issues],
  };
}

function groupedDowntime(
  mergedEvents: DowntimeEventIntelligence[],
  rawEvents: DowntimeEventIntelligence[],
  contexts: DowntimeContextInterval[],
  dimension: Exclude<DowntimeDimension, "period">,
): DowntimeAggregate[] {
  const keys = new Set<string>();
  const valueFor = (
    value: DowntimeEventIntelligence | DowntimeContextInterval,
  ): string =>
    (dimension === "machine"
      ? value.machine
      : dimension === "shift"
        ? value.shift
        : value.date) || "UNKNOWN";
  for (const event of rawEvents) keys.add(valueFor(event));
  for (const context of contexts) keys.add(valueFor(context));

  return [...keys]
    .sort((left, right) => left.localeCompare(right))
    .map((key) =>
      aggregateDowntimeGroup(
        key,
        key,
        mergedEvents.filter((event) => valueFor(event) === key),
        rawEvents.filter((event) => valueFor(event) === key),
        contexts.filter((context) => valueFor(context) === key),
        dimension,
      ),
    );
}

function buildReasonPareto(
  events: DowntimeEventIntelligence[],
): DowntimeReasonPareto[] {
  const groups = new Map<
    string,
    { eventCount: number; seconds: number; loss: number }
  >();
  for (const event of events) {
    if (event.classification !== "downtime") continue;
    const reason = event.reason || event.reasonType || "UNSPECIFIED";
    const group = groups.get(reason) ?? {
      eventCount: 0,
      seconds: 0,
      loss: 0,
    };
    group.eventCount += event.sourceEventCount;
    group.seconds += event.durationSeconds ?? 0;
    group.loss += event.calculatedMachineHourLoss ?? 0;
    groups.set(reason, group);
  }
  const totalSeconds = [...groups.values()].reduce(
    (sum, group) => sum + group.seconds,
    0,
  );
  let cumulative = 0;
  return [...groups.entries()]
    .sort((left, right) => right[1].seconds - left[1].seconds)
    .map(([reason, group]) => {
      const percentage = totalSeconds
        ? rounded((group.seconds / totalSeconds) * 100, 4)
        : 0;
      cumulative = rounded(cumulative + percentage, 4);
      return {
        reason,
        eventCount: group.eventCount,
        downtimeSeconds: rounded(group.seconds),
        downtimePercentage: percentage,
        cumulativePercentage: Math.min(cumulative, 100),
        calculatedMachineHourLoss: rounded(group.loss),
      };
    });
}

export function buildDowntimeAnalytics(
  eventInputs: DowntimeEngineEventInput[],
  contexts: DowntimeContextInterval[],
  options: DowntimeEngineOptions = {},
): DowntimeAnalytics {
  const mergeRule = {
    enabled: options.mergeConsecutiveEvents ?? true,
    maximumGapSeconds: Math.max(0, options.maximumMergeGapSeconds ?? 0),
    requireSameReason: options.requireSameReasonForMerge ?? true,
  };
  const financialComparisonTolerance =
    finiteNonNegative(options.financialComparisonTolerance) ??
    DEFAULT_FINANCIAL_TOLERANCE;
  const contextsByMachine = new Map<string, DowntimeContextInterval[]>();
  for (const context of contexts) {
    const group = contextsByMachine.get(context.machine) ?? [];
    group.push(context);
    contextsByMachine.set(context.machine, group);
  }
  const events = eventInputs.map((event) =>
    classifyEvent(
      event,
      findContext(event, contextsByMachine.get(event.machine) ?? []),
      financialComparisonTolerance,
    ),
  );
  const mergedEvents = mergeRule.enabled
    ? mergeEvents(events, {
        maximumMergeGapSeconds: mergeRule.maximumGapSeconds,
        requireSameReasonForMerge: mergeRule.requireSameReason,
        financialComparisonTolerance,
      })
    : events.map((event) => ({
        ...event,
        sourceEventIds: [...event.sourceEventIds],
      }));
  const machineWise = groupedDowntime(
    mergedEvents,
    events,
    contexts,
    "machine",
  );
  const shiftWise = groupedDowntime(
    mergedEvents,
    events,
    contexts,
    "shift",
  );
  const daily = groupedDowntime(mergedEvents, events, contexts, "date");
  const period = aggregateDowntimeGroup(
    "period",
    "Entire period",
    mergedEvents,
    events,
    contexts,
    "period",
  );

  return {
    events,
    mergedEvents,
    machineWise,
    shiftWise,
    daily,
    period,
    machineRanking: [...machineWise].sort(
      (left, right) =>
        right.totals.downtimeSeconds - left.totals.downtimeSeconds,
    ),
    reasonPareto: buildReasonPareto(mergedEvents),
    mergeRule,
  };
}
