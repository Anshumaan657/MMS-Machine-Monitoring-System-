import {
  normalizeMmsAnalyticsFilters,
  type MmsAnalyticsFilters,
  type NormalizedMmsAnalyticsFilters,
} from "./analytics-query-engine.ts";

export const MMS_FILTER_STORAGE_KEY = "mms.analytics.filters.v1";

const ARRAY_KEYS = [
  ["shift", "shifts"],
  ["machine", "machines"],
  ["product", "products"],
  ["operator", "operators"],
  ["downtimeReason", "downtimeReasons"],
  ["alertSeverity", "alertSeverities"],
  ["dataQualityStatus", "dataQualityStatuses"],
] as const;

export function encodeMmsAnalyticsFilters(
  filters: MmsAnalyticsFilters,
): string {
  const normalized = normalizeMmsAnalyticsFilters(filters);
  const parameters = new URLSearchParams();
  if (normalized.dateFrom) parameters.set("from", normalized.dateFrom);
  if (normalized.dateTo) parameters.set("to", normalized.dateTo);
  for (const [parameter, property] of ARRAY_KEYS) {
    for (const value of normalized[property]) {
      parameters.append(parameter, value);
    }
  }
  return parameters.toString();
}

export function decodeMmsAnalyticsFilters(
  serialized: string | null | undefined,
): MmsAnalyticsFilters {
  if (!serialized?.trim()) return {};
  const parameters = new URLSearchParams(
    serialized.startsWith("?") ? serialized.slice(1) : serialized,
  );
  const result: MmsAnalyticsFilters = {
    dateRange: {
      from: parameters.get("from"),
      to: parameters.get("to"),
    },
  };
  for (const [parameter] of ARRAY_KEYS) {
    const values = parameters.getAll(parameter).filter(Boolean);
    if (values.length) result[parameter] = values;
  }
  return result;
}

export function emptyMmsAnalyticsFilters(): NormalizedMmsAnalyticsFilters {
  return normalizeMmsAnalyticsFilters({});
}

export function persistMmsAnalyticsFilters(
  storage: Pick<Storage, "setItem" | "removeItem">,
  filters: MmsAnalyticsFilters,
): void {
  const encoded = encodeMmsAnalyticsFilters(filters);
  if (encoded) storage.setItem(MMS_FILTER_STORAGE_KEY, encoded);
  else storage.removeItem(MMS_FILTER_STORAGE_KEY);
}

export function restoreMmsAnalyticsFilters(
  storage: Pick<Storage, "getItem">,
): MmsAnalyticsFilters {
  return decodeMmsAnalyticsFilters(storage.getItem(MMS_FILTER_STORAGE_KEY));
}
