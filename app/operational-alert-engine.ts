import type {
  CanonicalMmsData,
  DowntimeEvent,
  DowntimeEventIntelligence,
  ProductionInterval,
} from "./mms.ts";
import type { FilteredMmsAnalytics } from "./analytics-query-engine.ts";
import type { MmsDataSourceKind } from "./mms-data-source.ts";
import type { MmsSyncStatus } from "./synchronization-engine.ts";
import {
  evaluateCalculationPolicy,
  type CalculationPolicySelection,
  type PolicyProductionMetrics,
} from "./calculation-policy.ts";
import { buildDowntimeAnalytics } from "./downtime-engine.ts";

export type OperationalAlertType =
  | "EXCESSIVE_DOWNTIME"
  | "SYSTEM_OFF"
  | "PRODUCTION_BELOW_TARGET"
  | "ABNORMAL_CYCLE_TIME"
  | "HIGH_PRODUCTION_LOSS"
  | "HIGH_MACHINE_HOUR_LOSS"
  | "MISSING_MACHINE_DATA"
  | "MISSING_OPERATOR"
  | "MISSING_DOWNTIME_REASON"
  | "INVALID_DURATION"
  | "DATABASE_SYNC_FAILURE";

export type OperationalAlertSeverity = "critical" | "warning";
export type OperationalAlertStatus = "active" | "resolved";
export type AlertAcknowledgementState =
  | "unacknowledged"
  | "acknowledged";

export type AlertMetricValue = {
  value: number | string | null;
  unit: string;
};

export type SupportingRecord = {
  id: string;
  sheet: "Product Log Book" | "Down Time Details" | "Synchronization";
  rowNumber: number | null;
};

export type OperationalAlert = {
  id: string;
  type: OperationalAlertType;
  title: string;
  severity: OperationalAlertSeverity;
  machine: string;
  shift: string;
  date: string | null;
  time: string | null;
  triggeringValue: AlertMetricValue;
  threshold: AlertMetricValue;
  supportingRecord: SupportingRecord;
  status: OperationalAlertStatus;
  acknowledgementState: AlertAcknowledgementState;
  acknowledgedAt: string | null;
  message: string;
};

export type OperationalAlertThresholds = {
  excessiveDowntimeSeconds: number;
  systemOffSeconds: number;
  minimumProductionAttainment: number;
  maximumCycleTimeRatio: number;
  highProductionLossQuantity: number;
  highMachineHourLoss: number;
};

export type OperationalAlertConfig = {
  enabled: Record<OperationalAlertType, boolean>;
  thresholds: OperationalAlertThresholds;
};

export type OperationalAlertConfigInput = {
  enabled?: Partial<Record<OperationalAlertType, boolean>>;
  thresholds?: Partial<OperationalAlertThresholds>;
};

export type AlertAcknowledgements = Record<string, string>;

export type AlertSynchronizationContext = {
  sourceKind: MmsDataSourceKind;
  sourceName: string | null;
  status: MmsSyncStatus;
  lastAttemptAt: string | null;
  error: string | null;
};

export const OPERATIONAL_ALERT_LABELS: Record<
  OperationalAlertType,
  string
> = {
  EXCESSIVE_DOWNTIME: "Excessive downtime",
  SYSTEM_OFF: "System Off",
  PRODUCTION_BELOW_TARGET: "Production below target",
  ABNORMAL_CYCLE_TIME: "Abnormal cycle time",
  HIGH_PRODUCTION_LOSS: "High production loss",
  HIGH_MACHINE_HOUR_LOSS: "High machine-hour loss",
  MISSING_MACHINE_DATA: "Missing machine data",
  MISSING_OPERATOR: "Missing operator",
  MISSING_DOWNTIME_REASON: "Missing downtime reason",
  INVALID_DURATION: "Invalid duration",
  DATABASE_SYNC_FAILURE: "Database synchronization failure",
};

export const DEFAULT_OPERATIONAL_ALERT_CONFIG: OperationalAlertConfig = {
  enabled: {
    EXCESSIVE_DOWNTIME: true,
    SYSTEM_OFF: true,
    PRODUCTION_BELOW_TARGET: true,
    ABNORMAL_CYCLE_TIME: true,
    HIGH_PRODUCTION_LOSS: true,
    HIGH_MACHINE_HOUR_LOSS: true,
    MISSING_MACHINE_DATA: true,
    MISSING_OPERATOR: true,
    MISSING_DOWNTIME_REASON: true,
    INVALID_DURATION: true,
    DATABASE_SYNC_FAILURE: true,
  },
  thresholds: {
    excessiveDowntimeSeconds: 3_600,
    systemOffSeconds: 300,
    minimumProductionAttainment: 0.8,
    maximumCycleTimeRatio: 1.2,
    highProductionLossQuantity: 50,
    highMachineHourLoss: 1_000,
  },
};

function finiteNonNegative(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

export function normalizeOperationalAlertConfig(
  config: OperationalAlertConfigInput = {},
): OperationalAlertConfig {
  const thresholds: Partial<OperationalAlertThresholds> =
    config.thresholds ?? {};
  return {
    enabled: {
      ...DEFAULT_OPERATIONAL_ALERT_CONFIG.enabled,
      ...(config.enabled ?? {}),
    },
    thresholds: {
      excessiveDowntimeSeconds: finiteNonNegative(
        thresholds.excessiveDowntimeSeconds,
        DEFAULT_OPERATIONAL_ALERT_CONFIG.thresholds.excessiveDowntimeSeconds,
      ),
      systemOffSeconds: finiteNonNegative(
        thresholds.systemOffSeconds,
        DEFAULT_OPERATIONAL_ALERT_CONFIG.thresholds.systemOffSeconds,
      ),
      minimumProductionAttainment: finiteNonNegative(
        thresholds.minimumProductionAttainment,
        DEFAULT_OPERATIONAL_ALERT_CONFIG.thresholds
          .minimumProductionAttainment,
      ),
      maximumCycleTimeRatio: finiteNonNegative(
        thresholds.maximumCycleTimeRatio,
        DEFAULT_OPERATIONAL_ALERT_CONFIG.thresholds.maximumCycleTimeRatio,
      ),
      highProductionLossQuantity: finiteNonNegative(
        thresholds.highProductionLossQuantity,
        DEFAULT_OPERATIONAL_ALERT_CONFIG.thresholds
          .highProductionLossQuantity,
      ),
      highMachineHourLoss: finiteNonNegative(
        thresholds.highMachineHourLoss,
        DEFAULT_OPERATIONAL_ALERT_CONFIG.thresholds.highMachineHourLoss,
      ),
    },
  };
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function supportingRecord(
  record: ProductionInterval | DowntimeEvent,
): SupportingRecord {
  return {
    id: record.id,
    sheet: record.sourceSheet,
    rowNumber: record.sourceRow,
  };
}

function alertId(
  type: OperationalAlertType,
  record: SupportingRecord,
): string {
  return `AL-${stableHash(
    [type, record.sheet, record.id, record.rowNumber].join("|"),
  )}`;
}

function recordContext(record: ProductionInterval | DowntimeEvent): {
  machine: string;
  shift: string;
  date: string | null;
  time: string | null;
} {
  return {
    machine: record.machine || "Not provided",
    shift: record.shift || "Not provided",
    date: record.date,
    time: record.startAt ?? record.date,
  };
}

type AddAlertInput = {
  type: OperationalAlertType;
  severity: OperationalAlertSeverity;
  record: SupportingRecord;
  context: {
    machine: string;
    shift: string;
    date: string | null;
    time: string | null;
  };
  triggeringValue: AlertMetricValue;
  threshold: AlertMetricValue;
  message: string;
};

function makeAlert(
  input: AddAlertInput,
  acknowledgements: AlertAcknowledgements,
): OperationalAlert {
  const id = alertId(input.type, input.record);
  const acknowledgedAt = acknowledgements[id] ?? null;
  return {
    id,
    type: input.type,
    title: OPERATIONAL_ALERT_LABELS[input.type],
    severity: input.severity,
    ...input.context,
    triggeringValue: input.triggeringValue,
    threshold: input.threshold,
    supportingRecord: input.record,
    status: "active",
    acknowledgementState: acknowledgedAt
      ? "acknowledged"
      : "unacknowledged",
    acknowledgedAt,
    message: input.message,
  };
}

function seconds(value: number): AlertMetricValue {
  return { value, unit: "seconds" };
}

function quantity(value: number): AlertMetricValue {
  return { value, unit: "quantity" };
}

function productionAlerts(
  interval: ProductionInterval,
  policyMetrics: PolicyProductionMetrics | undefined,
  config: OperationalAlertConfig,
  acknowledgements: AlertAcknowledgements,
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const context = recordContext(interval);
  const record = supportingRecord(interval);
  const add = (
    input: Omit<AddAlertInput, "record" | "context">,
  ): void => {
    if (config.enabled[input.type]) {
      alerts.push(
        makeAlert(
          { ...input, record, context },
          acknowledgements,
        ),
      );
    }
  };

  const systemOff = interval.timesSeconds.systemOff;
  if (
    systemOff != null &&
    systemOff > config.thresholds.systemOffSeconds
  ) {
    add({
      type: "SYSTEM_OFF",
      severity: "critical",
      triggeringValue: seconds(systemOff),
      threshold: seconds(config.thresholds.systemOffSeconds),
      message: "Machine data was unavailable longer than the configured limit.",
    });
  }

  const produced = policyMetrics
    ? policyMetrics.producedQuantity
    : interval.calculations.producedQuantityUsed;
  const target = policyMetrics
    ? policyMetrics.shiftTarget
    : interval.quantities.shiftTarget;
  if (produced != null && target != null && target > 0) {
    const attainment = produced / target;
    if (attainment < config.thresholds.minimumProductionAttainment) {
      add({
        type: "PRODUCTION_BELOW_TARGET",
        severity: "warning",
        triggeringValue: {
          value: attainment * 100,
          unit: "percent attainment",
        },
        threshold: {
          value: config.thresholds.minimumProductionAttainment * 100,
          unit: "minimum percent attainment",
        },
        message: "Produced quantity is below the configured share of shift target.",
      });
    }
  }

  const achievedCycle = policyMetrics
    ? policyMetrics.achievedCycleTimeSeconds
    : interval.calculations.achievedCycleTimeSeconds;
  const standardCycle = interval.cycleTimesSeconds.standard;
  if (
    achievedCycle != null &&
    standardCycle != null &&
    standardCycle > 0
  ) {
    const ratio = achievedCycle / standardCycle;
    if (ratio > config.thresholds.maximumCycleTimeRatio) {
      add({
        type: "ABNORMAL_CYCLE_TIME",
        severity: "warning",
        triggeringValue: {
          value: achievedCycle,
          unit: "seconds achieved cycle",
        },
        threshold: {
          value: standardCycle * config.thresholds.maximumCycleTimeRatio,
          unit: "maximum seconds",
        },
        message: "Achieved cycle time exceeds the configured standard-cycle ratio.",
      });
    }
  }

  const productionLoss = policyMetrics
    ? policyMetrics.productionLoss
    : interval.calculations.productionLoss;
  if (
    productionLoss != null &&
    productionLoss > config.thresholds.highProductionLossQuantity
  ) {
    add({
      type: "HIGH_PRODUCTION_LOSS",
      severity: "critical",
      triggeringValue: quantity(productionLoss),
      threshold: quantity(config.thresholds.highProductionLossQuantity),
      message: "Calculated production loss exceeds the configured quantity.",
    });
  }

  if (!interval.machine) {
    add({
      type: "MISSING_MACHINE_DATA",
      severity: "critical",
      triggeringValue: { value: "Blank machine", unit: "field" },
      threshold: { value: "Machine is required", unit: "validation rule" },
      message: "The production record has no machine identifier.",
    });
  }

  if (interval.operator.isMissing) {
    add({
      type: "MISSING_OPERATOR",
      severity: "warning",
      triggeringValue: {
        value: interval.operator.raw || "Blank operator",
        unit: "field",
      },
      threshold: { value: "Operator is required", unit: "validation rule" },
      message: "No valid operator was entered for the production interval.",
    });
  }

  return alerts;
}

function downtimeAlerts(
  event: DowntimeEvent,
  intelligenceById: ReadonlyMap<string, DowntimeEventIntelligence>,
  config: OperationalAlertConfig,
  acknowledgements: AlertAcknowledgements,
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const context = recordContext(event);
  const record = supportingRecord(event);
  const intelligence = intelligenceById.get(event.id);
  const add = (
    input: Omit<AddAlertInput, "record" | "context">,
  ): void => {
    if (config.enabled[input.type]) {
      alerts.push(
        makeAlert(
          { ...input, record, context },
          acknowledgements,
        ),
      );
    }
  };

  if (
    event.durationSeconds != null &&
    event.durationSeconds > config.thresholds.excessiveDowntimeSeconds
  ) {
    add({
      type: "EXCESSIVE_DOWNTIME",
      severity: "critical",
      triggeringValue: seconds(event.durationSeconds),
      threshold: seconds(config.thresholds.excessiveDowntimeSeconds),
      message: "Continuous machine stoppage exceeds the configured duration.",
    });
  }

  if (
    intelligence?.classification === "system_off" &&
    (intelligence.durationSeconds ?? 0) > config.thresholds.systemOffSeconds
  ) {
    add({
      type: "SYSTEM_OFF",
      severity: "critical",
      triggeringValue: seconds(intelligence.durationSeconds ?? 0),
      threshold: seconds(config.thresholds.systemOffSeconds),
      message: "A System Off event exceeds the configured duration.",
    });
  }

  if (
    intelligence?.calculatedMachineHourLoss != null &&
    intelligence.calculatedMachineHourLoss >
      config.thresholds.highMachineHourLoss
  ) {
    add({
      type: "HIGH_MACHINE_HOUR_LOSS",
      severity: "critical",
      triggeringValue: {
        value: intelligence.calculatedMachineHourLoss,
        unit: "INR",
      },
      threshold: {
        value: config.thresholds.highMachineHourLoss,
        unit: "INR",
      },
      message: "Calculated machine-hour loss exceeds the configured amount.",
    });
  }

  if (!event.machine) {
    add({
      type: "MISSING_MACHINE_DATA",
      severity: "critical",
      triggeringValue: { value: "Blank machine", unit: "field" },
      threshold: { value: "Machine is required", unit: "validation rule" },
      message: "The downtime record has no machine identifier.",
    });
  }

  if (event.operator.isMissing) {
    add({
      type: "MISSING_OPERATOR",
      severity: "warning",
      triggeringValue: {
        value: event.operator.raw || "Blank operator",
        unit: "field",
      },
      threshold: { value: "Operator is required", unit: "validation rule" },
      message: "No valid operator was entered for the downtime event.",
    });
  }

  if (!event.reason.trim() || event.isUnreported) {
    add({
      type: "MISSING_DOWNTIME_REASON",
      severity: "warning",
      triggeringValue: {
        value: event.reason || "Blank reason",
        unit: "field",
      },
      threshold: {
        value: "Reported reason required",
        unit: "validation rule",
      },
      message: "The downtime event does not have a usable reported reason.",
    });
  }

  if (
    event.durationSeconds == null ||
    event.issueCodes.includes("INVALID_DURATION")
  ) {
    add({
      type: "INVALID_DURATION",
      severity: "critical",
      triggeringValue: {
        value: event.durationSeconds,
        unit: "seconds",
      },
      threshold: {
        value: "Valid non-negative duration required",
        unit: "validation rule",
      },
      message: "The downtime duration is missing or invalid.",
    });
  }

  return alerts;
}

function synchronizationAlerts(
  context: AlertSynchronizationContext | undefined,
  config: OperationalAlertConfig,
  acknowledgements: AlertAcknowledgements,
): OperationalAlert[] {
  if (
    !context ||
    !config.enabled.DATABASE_SYNC_FAILURE ||
    context.sourceKind !== "database" ||
    (context.status !== "error" && context.status !== "stale")
  ) {
    return [];
  }
  const record: SupportingRecord = {
    id: `database:${context.sourceName ?? "mms"}`,
    sheet: "Synchronization",
    rowNumber: null,
  };
  return [
    makeAlert(
      {
        type: "DATABASE_SYNC_FAILURE",
        severity: "critical",
        record,
        context: {
          machine: "All machines",
          shift: "All shifts",
          date: context.lastAttemptAt?.slice(0, 10) ?? null,
          time: context.lastAttemptAt,
        },
        triggeringValue: {
          value: context.error ?? context.status,
          unit: "synchronization status",
        },
        threshold: {
          value: "Successful read-only synchronization",
          unit: "required state",
        },
        message: "The MMS database synchronization is unavailable or stale.",
      },
      acknowledgements,
    ),
  ];
}

export function buildOperationalAlerts(
  data: CanonicalMmsData,
  configInput: OperationalAlertConfigInput = {},
  options: {
    acknowledgements?: AlertAcknowledgements;
    synchronization?: AlertSynchronizationContext;
    calculationPolicy?: CalculationPolicySelection;
    /**
     * When supplied, alerts consume the exact records and policy metrics
     * already selected by the unified analytics query.
     */
    analytics?: FilteredMmsAnalytics;
  } = {},
): OperationalAlert[] {
  const config = normalizeOperationalAlertConfig(configInput);
  const acknowledgements = options.acknowledgements ?? {};
  const productionIntervals =
    options.analytics?.records.productionIntervals ??
    data.productionIntervals;
  const downtimeEvents =
    options.analytics?.records.downtimeEvents ?? data.downtimeEvents;
  const policyEvaluation = options.analytics
    ? null
    : evaluateCalculationPolicy(
        data.productionIntervals,
        options.calculationPolicy,
      );
  const policyMetrics = options.analytics
    ? new Map(
        options.analytics.policyCalculations.production.map((metrics) => [
          metrics.recordId,
          metrics,
        ]),
      )
    : policyEvaluation!.productionByRecordId;
  const downtimeAnalytics = options.analytics?.downtime ?? buildDowntimeAnalytics(
    downtimeEvents.map((event) => ({
      id: event.id,
      machine: event.machine,
      shift: event.shift,
      date: event.date,
      startEpochMs: event.startEpochMs,
      endEpochMs: event.endEpochMs,
      startAt: event.startAt,
      endAt: event.endAt,
      durationSeconds: event.durationSeconds,
      productName: event.productName,
      reasonType: event.reasonType,
      reason: event.reason,
      isUnreported: event.isUnreported,
      hasOverlap: event.issueCodes.includes("OVERLAPPING_DOWNTIME_EVENT"),
      reportedMachineHourLoss: event.reportedMachineHourLoss,
    })),
    productionIntervals.map((interval) => ({
      id: interval.id,
      machine: interval.machine,
      shift: interval.shift,
      date: interval.date,
      startEpochMs: interval.startEpochMs,
      endEpochMs: interval.endEpochMs,
      productName: interval.product.productName,
      additionalOvertimeThresholdSeconds:
        interval.timesSeconds.additionalOvertime,
      machineHourCost: interval.costs.machinePerHour,
      reportedNonOperativeSeconds: interval.timesSeconds.nonOperative,
      reportedSystemOffSeconds: interval.timesSeconds.systemOff,
    })),
    {
      financialLossMode: policyEvaluation!.downtime.financialLossMode,
      machineHourCostByMachine:
        policyEvaluation!.downtime.machineHourCostByMachine,
    },
  );
  const intelligenceById = new Map(
    downtimeAnalytics.events.map((event) => [event.id, event]),
  );
  const alerts = [
    ...productionIntervals.flatMap((interval) =>
      productionAlerts(
        interval,
        policyMetrics.get(interval.id),
        config,
        acknowledgements,
      ),
    ),
    ...downtimeEvents.flatMap((event) =>
      downtimeAlerts(event, intelligenceById, config, acknowledgements),
    ),
    ...synchronizationAlerts(
      options.synchronization,
      config,
      acknowledgements,
    ),
  ];

  const severityRank: Record<OperationalAlertSeverity, number> = {
    critical: 0,
    warning: 1,
  };
  return alerts.sort(
    (left, right) =>
      severityRank[left.severity] - severityRank[right.severity] ||
      (right.time ?? "").localeCompare(left.time ?? "") ||
      left.id.localeCompare(right.id),
  );
}
