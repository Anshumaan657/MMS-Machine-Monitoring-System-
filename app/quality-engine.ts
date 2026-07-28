export type QualityIssueCode =
  | "INVALID_QUALITY_INPUT"
  | "MISSING_PRODUCED_QUANTITY"
  | "MISSING_REJECTION_QUANTITY"
  | "MISSING_REWORK_QUANTITY"
  | "MISSING_SCRAP_PER_PART"
  | "POSSIBLY_UNREPORTED_QUALITY"
  | "ZERO_PRODUCED_QUANTITY"
  | "PROVISIONAL_POLICY_NOT_OFFICIAL"
  | "UNRELIABLE_REQUIRED_DATA"
  | "QUALITY_LOSS_EXCEEDS_PRODUCTION"
  | "REJECTION_EXCEEDS_PRODUCTION"
  | "REWORK_EXCEEDS_PRODUCTION";

export type QualityRecordInput = {
  id: string;
  machine: string;
  shift: string;
  date: string | null;
  producedQuantity: number | null;
  rejectedQuantity: number | null;
  reworkedQuantity: number | null;
  scrapPerPart: number | null;
  policyStatus?: "confirmed" | "provisional" | "pending_confirmation";
  requiredDataReliable?: boolean;
};

export type QualityCalculationStatus =
  | "calculated"
  | "blocked_missing_data"
  | "blocked_zero_production"
  | "blocked_invalid_data"
  | "blocked_provisional_policy"
  | "blocked_unreliable_data";

export type QualityConfidence = "high" | "low" | "unavailable";

export type QualityRecordResult = QualityRecordInput & {
  goodQuantity: number | null;
  quality: number | null;
  rejectionRate: number | null;
  reworkRate: number | null;
  estimatedScrap: number | null;
  qualityStatus: QualityCalculationStatus;
  qualityConfidence: QualityConfidence;
  finalOeeReadiness: "ready" | "blocked";
  hasMissingEntry: boolean;
  isPossiblyUnreported: boolean;
  issueCodes: QualityIssueCode[];
};

export type QualityAggregate = {
  key: string;
  label: string;
  machine: string | null;
  shift: string | null;
  date: string | null;
  recordCount: number;
  totals: {
    producedQuantity: number;
    goodQuantity: number;
    rejectedQuantity: number;
    reworkedQuantity: number;
    estimatedScrap: number;
  };
  rates: {
    quality: number | null;
    rejection: number | null;
    rework: number | null;
  };
  missingEntries: {
    producedQuantity: number;
    rejectionQuantity: number;
    reworkQuantity: number;
    scrapPerPart: number;
  };
  possiblyUnreportedRecords: number;
  readyRecordCount: number;
  blockedRecordCount: number;
  qualityStatus: QualityCalculationStatus;
  qualityConfidence: QualityConfidence;
  finalOeeReadiness: "ready" | "blocked";
  issueCodes: QualityIssueCode[];
};

export type QualityAnalytics = {
  records: QualityRecordResult[];
  machineWise: QualityAggregate[];
  shiftWise: QualityAggregate[];
  daily: QualityAggregate[];
  period: QualityAggregate;
  oeeQualityStatus: QualityCalculationStatus;
  finalOeeStatus: "ready" | "blocked";
};

function finiteNonNegative(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function rounded(value: number, digits = 6): number {
  const power = 10 ** digits;
  return Math.round((value + Number.EPSILON) * power) / power;
}

export function processQualityRecord(
  input: QualityRecordInput,
): QualityRecordResult {
  const issues = new Set<QualityIssueCode>();
  const producedQuantity = finiteNonNegative(input.producedQuantity);
  const rejectedQuantity = finiteNonNegative(input.rejectedQuantity);
  const reworkedQuantity = finiteNonNegative(input.reworkedQuantity);
  const scrapPerPart = finiteNonNegative(input.scrapPerPart);
  const policyStatus = input.policyStatus ?? "confirmed";
  const requiredDataReliable = input.requiredDataReliable ?? true;

  if (
    [
      input.producedQuantity,
      input.rejectedQuantity,
      input.reworkedQuantity,
      input.scrapPerPart,
    ].some(
      (value) =>
        value != null &&
        (typeof value !== "number" || !Number.isFinite(value) || value < 0),
    )
  ) {
    issues.add("INVALID_QUALITY_INPUT");
  }
  if (producedQuantity == null) issues.add("MISSING_PRODUCED_QUANTITY");
  if (producedQuantity === 0) issues.add("ZERO_PRODUCED_QUANTITY");
  if (rejectedQuantity == null) issues.add("MISSING_REJECTION_QUANTITY");
  if (reworkedQuantity == null) issues.add("MISSING_REWORK_QUANTITY");
  if (scrapPerPart == null) issues.add("MISSING_SCRAP_PER_PART");
  if (policyStatus !== "confirmed") {
    issues.add("PROVISIONAL_POLICY_NOT_OFFICIAL");
  }
  if (!requiredDataReliable) issues.add("UNRELIABLE_REQUIRED_DATA");

  if (
    producedQuantity != null &&
    rejectedQuantity != null &&
    rejectedQuantity > producedQuantity
  ) {
    issues.add("REJECTION_EXCEEDS_PRODUCTION");
  }
  if (
    producedQuantity != null &&
    reworkedQuantity != null &&
    reworkedQuantity > producedQuantity
  ) {
    issues.add("REWORK_EXCEEDS_PRODUCTION");
  }
  if (
    producedQuantity != null &&
    rejectedQuantity != null &&
    reworkedQuantity != null &&
    rejectedQuantity + reworkedQuantity > producedQuantity
  ) {
    issues.add("QUALITY_LOSS_EXCEEDS_PRODUCTION");
  }

  const isPossiblyUnreported =
    rejectedQuantity === 0 && reworkedQuantity === 0;
  if (isPossiblyUnreported) issues.add("POSSIBLY_UNREPORTED_QUALITY");
  const missingQualityInput =
    producedQuantity == null ||
    rejectedQuantity == null ||
    reworkedQuantity == null;
  const invalidQualityInput =
    issues.has("INVALID_QUALITY_INPUT") ||
    issues.has("QUALITY_LOSS_EXCEEDS_PRODUCTION") ||
    issues.has("REJECTION_EXCEEDS_PRODUCTION") ||
    issues.has("REWORK_EXCEEDS_PRODUCTION");
  const qualityStatus: QualityCalculationStatus =
    policyStatus !== "confirmed"
      ? "blocked_provisional_policy"
      : !requiredDataReliable
        ? "blocked_unreliable_data"
        : missingQualityInput
          ? "blocked_missing_data"
          : producedQuantity === 0
            ? "blocked_zero_production"
            : invalidQualityInput
              ? "blocked_invalid_data"
              : "calculated";
  const goodQuantity =
    qualityStatus === "calculated" &&
    producedQuantity != null &&
    rejectedQuantity != null &&
    reworkedQuantity != null
      ? rounded(producedQuantity - rejectedQuantity - reworkedQuantity)
      : null;
  const quality =
    goodQuantity != null && producedQuantity != null && producedQuantity > 0
      ? rounded(goodQuantity / producedQuantity, 8)
      : null;
  const rejectionRate =
    rejectedQuantity != null && producedQuantity != null && producedQuantity > 0
      ? rounded(rejectedQuantity / producedQuantity, 8)
      : null;
  const reworkRate =
    reworkedQuantity != null && producedQuantity != null && producedQuantity > 0
      ? rounded(reworkedQuantity / producedQuantity, 8)
      : null;

  return {
    ...input,
    producedQuantity,
    rejectedQuantity,
    reworkedQuantity,
    scrapPerPart,
    policyStatus,
    requiredDataReliable,
    goodQuantity,
    quality,
    rejectionRate,
    reworkRate,
    estimatedScrap:
      producedQuantity != null && scrapPerPart != null
        ? rounded(scrapPerPart * producedQuantity)
        : null,
    qualityStatus,
    qualityConfidence:
      qualityStatus === "calculated"
        ? isPossiblyUnreported
          ? "low"
          : "high"
        : "unavailable",
    finalOeeReadiness: qualityStatus === "calculated" ? "ready" : "blocked",
    hasMissingEntry:
      producedQuantity == null ||
      rejectedQuantity == null ||
      reworkedQuantity == null ||
      scrapPerPart == null,
    isPossiblyUnreported,
    issueCodes: [...issues],
  };
}

type QualityDimension = "machine" | "shift" | "date" | "period";

function aggregateQualityGroup(
  key: string,
  label: string,
  records: QualityRecordResult[],
  dimension: QualityDimension,
): QualityAggregate {
  const totals = {
    producedQuantity: 0,
    goodQuantity: 0,
    rejectedQuantity: 0,
    reworkedQuantity: 0,
    estimatedScrap: 0,
  };
  const missingEntries = {
    producedQuantity: 0,
    rejectionQuantity: 0,
    reworkQuantity: 0,
    scrapPerPart: 0,
  };
  const issues = new Set<QualityIssueCode>();

  for (const record of records) {
    if (record.producedQuantity == null) missingEntries.producedQuantity += 1;
    else totals.producedQuantity += record.producedQuantity;
    if (record.goodQuantity != null) totals.goodQuantity += record.goodQuantity;
    if (record.rejectedQuantity == null) missingEntries.rejectionQuantity += 1;
    else totals.rejectedQuantity += record.rejectedQuantity;
    if (record.reworkedQuantity == null) missingEntries.reworkQuantity += 1;
    else totals.reworkedQuantity += record.reworkedQuantity;
    if (record.scrapPerPart == null) missingEntries.scrapPerPart += 1;
    if (record.estimatedScrap != null) {
      totals.estimatedScrap += record.estimatedScrap;
    }
    for (const code of record.issueCodes) issues.add(code);
  }
  const readyRecordCount = records.filter(
    (record) => record.qualityStatus === "calculated",
  ).length;
  const blockedRecordCount = records.length - readyRecordCount;
  const qualityStatus: QualityCalculationStatus =
    records.length > 0 && blockedRecordCount === 0
      ? "calculated"
      : records.find((record) => record.qualityStatus !== "calculated")
          ?.qualityStatus ?? "blocked_missing_data";
  const produced = totals.producedQuantity;
  const rates = {
    quality:
      qualityStatus === "calculated" && produced > 0
        ? rounded(totals.goodQuantity / produced, 8)
        : null,
    rejection:
      produced > 0 ? rounded(totals.rejectedQuantity / produced, 8) : null,
    rework:
      produced > 0 ? rounded(totals.reworkedQuantity / produced, 8) : null,
  };

  return {
    key,
    label,
    machine: dimension === "machine" ? label : null,
    shift: dimension === "shift" ? label : null,
    date: dimension === "date" ? label : null,
    recordCount: records.length,
    totals: {
      producedQuantity: rounded(totals.producedQuantity),
      goodQuantity: rounded(totals.goodQuantity),
      rejectedQuantity: rounded(totals.rejectedQuantity),
      reworkedQuantity: rounded(totals.reworkedQuantity),
      estimatedScrap: rounded(totals.estimatedScrap),
    },
    rates,
    missingEntries,
    possiblyUnreportedRecords: records.filter(
      (record) => record.isPossiblyUnreported,
    ).length,
    readyRecordCount,
    blockedRecordCount,
    qualityStatus,
    qualityConfidence:
      qualityStatus !== "calculated"
        ? "unavailable"
        : records.some((record) => record.qualityConfidence === "low")
          ? "low"
          : "high",
    finalOeeReadiness:
      qualityStatus === "calculated" ? "ready" : "blocked",
    issueCodes: [...issues],
  };
}

function groupedQuality(
  records: QualityRecordResult[],
  dimension: Exclude<QualityDimension, "period">,
): QualityAggregate[] {
  const groups = new Map<string, QualityRecordResult[]>();
  for (const record of records) {
    const value =
      dimension === "machine"
        ? record.machine
        : dimension === "shift"
          ? record.shift
          : record.date;
    const key = value || "UNKNOWN";
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => aggregateQualityGroup(key, key, group, dimension));
}

export function buildQualityAnalytics(
  inputs: QualityRecordInput[],
): QualityAnalytics {
  const records = inputs.map(processQualityRecord);
  const period = aggregateQualityGroup(
    "period",
    "Entire period",
    records,
    "period",
  );
  return {
    records,
    machineWise: groupedQuality(records, "machine"),
    shiftWise: groupedQuality(records, "shift"),
    daily: groupedQuality(records, "date"),
    period,
    oeeQualityStatus: period.qualityStatus,
    finalOeeStatus: period.finalOeeReadiness,
  };
}
