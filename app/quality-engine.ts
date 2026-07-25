export type QualityIssueCode =
  | "INVALID_QUALITY_INPUT"
  | "MISSING_PRODUCED_QUANTITY"
  | "MISSING_REJECTION_QUANTITY"
  | "MISSING_REWORK_QUANTITY"
  | "MISSING_SCRAP_PER_PART"
  | "POSSIBLY_UNREPORTED_QUALITY"
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
};

export type QualityRecordResult = QualityRecordInput & {
  estimatedScrap: number | null;
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
    rejectedQuantity: number;
    reworkedQuantity: number;
    estimatedScrap: number;
  };
  missingEntries: {
    producedQuantity: number;
    rejectionQuantity: number;
    reworkQuantity: number;
    scrapPerPart: number;
  };
  possiblyUnreportedRecords: number;
  issueCodes: QualityIssueCode[];
};

export type QualityAnalytics = {
  records: QualityRecordResult[];
  machineWise: QualityAggregate[];
  shiftWise: QualityAggregate[];
  daily: QualityAggregate[];
  period: QualityAggregate;
  oeeQualityStatus: "not_calculated";
  finalOeeStatus: "not_calculated";
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
  if (rejectedQuantity == null) issues.add("MISSING_REJECTION_QUANTITY");
  if (reworkedQuantity == null) issues.add("MISSING_REWORK_QUANTITY");
  if (scrapPerPart == null) issues.add("MISSING_SCRAP_PER_PART");

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

  return {
    ...input,
    producedQuantity,
    rejectedQuantity,
    reworkedQuantity,
    scrapPerPart,
    estimatedScrap:
      producedQuantity != null && scrapPerPart != null
        ? rounded(scrapPerPart * producedQuantity)
        : null,
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

  return {
    key,
    label,
    machine: dimension === "machine" ? label : null,
    shift: dimension === "shift" ? label : null,
    date: dimension === "date" ? label : null,
    recordCount: records.length,
    totals: {
      producedQuantity: rounded(totals.producedQuantity),
      rejectedQuantity: rounded(totals.rejectedQuantity),
      reworkedQuantity: rounded(totals.reworkedQuantity),
      estimatedScrap: rounded(totals.estimatedScrap),
    },
    missingEntries,
    possiblyUnreportedRecords: records.filter(
      (record) => record.isPossiblyUnreported,
    ).length,
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
  return {
    records,
    machineWise: groupedQuality(records, "machine"),
    shiftWise: groupedQuality(records, "shift"),
    daily: groupedQuality(records, "date"),
    period: aggregateQualityGroup("period", "Entire period", records, "period"),
    oeeQualityStatus: "not_calculated",
    finalOeeStatus: "not_calculated",
  };
}
