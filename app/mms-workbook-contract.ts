import * as XLSX from "xlsx";

export const MMS_WORKBOOK_CONTRACT_VERSION = "1.0.0";

export const MMS_WORKBOOK_LIMITS = Object.freeze({
  maximumFileBytes: 50 * 1024 * 1024,
  maximumRowsPerSheet: 200_000,
  maximumRowsAcrossRequiredSheets: 300_000,
  maximumColumnsPerSheet: 256,
  headerSearchRows: 50,
});

export type MmsWorkbookFormat = "xls" | "xlsx";
export type MmsCanonicalSheetName =
  | "Product Log Book"
  | "Down Time Details";
export type MmsCompatibilityStatus =
  | "compatible"
  | "compatible_with_warnings"
  | "rejected";
export type MmsCompatibilitySeverity = "info" | "warning" | "error";

export type MmsWorkbookCompatibilityIssue = {
  code:
    | "UNSUPPORTED_FILE_FORMAT"
    | "FILE_TOO_LARGE"
    | "MISSING_REQUIRED_SHEET"
    | "AMBIGUOUS_SHEET"
    | "HEADER_ROW_NOT_FOUND"
    | "MISSING_REQUIRED_COLUMN"
    | "DUPLICATE_CANONICAL_COLUMN"
    | "UNKNOWN_COLUMN"
    | "OPTIONAL_COLUMN_MISSING"
    | "SHEET_ROW_LIMIT_EXCEEDED"
    | "WORKBOOK_ROW_LIMIT_EXCEEDED"
    | "SHEET_COLUMN_LIMIT_EXCEEDED";
  severity: MmsCompatibilitySeverity;
  message: string;
  sheet?: MmsCanonicalSheetName;
  actualSheetName?: string;
  column?: string;
};

export type MmsWorkbookSheetCompatibility = {
  canonicalName: MmsCanonicalSheetName;
  actualName: string | null;
  headerRowNumber: number | null;
  estimatedRowCount: number;
  estimatedColumnCount: number;
  mappedColumns: Record<string, string>;
  missingRequiredColumns: string[];
  missingOptionalColumns: string[];
  unknownColumns: string[];
};

export type MmsWorkbookCompatibilityReport = {
  contractVersion: string;
  status: MmsCompatibilityStatus;
  file: {
    name: string;
    format: MmsWorkbookFormat | null;
    byteLength: number | null;
    originalFilePreserved: true;
  };
  workbook: {
    sheetCount: number;
    estimatedRowsAcrossRequiredSheets: number;
  };
  sheets: MmsWorkbookSheetCompatibility[];
  issues: MmsWorkbookCompatibilityIssue[];
};

export type MmsContractSourceRow = {
  rowNumber: number;
  values: Record<string, unknown>;
};

export type MmsWorkbookContractExtraction = {
  report: MmsWorkbookCompatibilityReport;
  productionRows: MmsContractSourceRow[];
  downtimeRows: MmsContractSourceRow[];
};

type ColumnDefinition = {
  canonicalName: string;
  required: boolean;
  aliases: readonly string[];
};

type SheetDefinition = {
  canonicalName: MmsCanonicalSheetName;
  aliases: readonly string[];
  columns: readonly ColumnDefinition[];
};

const productionColumns = [
  ["Date", true, ["Production Date", "Log Date"]],
  ["Machine", true, ["Machine Name", "Machine No", "Machine Number"]],
  ["Shift", true, ["Shift Name", "Shift No", "Shift Number"]],
  ["From Time", true, ["Start Time", "From", "Start Date Time", "Start Datetime"]],
  ["Till Time", true, ["End Time", "To Time", "Till", "End Date Time", "End Datetime"]],
  ["Qty", true, ["Quantity", "Produced Qty", "Production Qty", "Actual Qty"]],
  ["Opr. Time", true, ["Opr Time", "Operating Time", "Operative Time", "Operation Time"]],
  ["Std. Cycle Time", true, ["Std Cycle Time", "Standard Cycle Time", "Standard CT"]],
  ["Part No.", false, ["Part No", "Part Number", "Part Code"]],
  ["Part Name", false, ["Component Name"]],
  ["Part ERP Code", false, ["Part ERP", "Part ERP No"]],
  ["Part Cost", false, ["Cost Per Part"]],
  ["Product Name", false, ["Product", "Item Name"]],
  ["Machine Type", false, ["Machine Category", "Type"]],
  ["Running Hrs Cost", false, ["Running Hours Cost", "Machine Hour Cost", "Machine Hourly Cost"]],
  ["Setup Time", false, ["Set Up Time", "Changeover Time"]],
  ["M. Factor", false, ["M Factor", "M.Factor", "Multiplication Factor", "Multiplier"]],
  ["Prod Gap Between", false, ["Production Gap Between", "Prod. Gap Between", "Production Gap"]],
  ["Additional Over Time", false, ["Additional Overtime", "Additional Changeover Time"]],
  ["Component Cost", false, ["Material Cost"]],
  ["Scrap part", false, ["Scrap Part", "Scrap Per Part"]],
  ["Approved Cycle Time", false, ["Approved CT", "Client Cycle Time"]],
  ["Quality Interlock", false, ["Quality Interlocking"]],
  ["ERP Code", false, ["Product ERP Code", "ERP"]],
  ["Process Dependency", false, ["Process Dependent"]],
  ["Operator", false, ["Operator Name"]],
  ["Address", false, ["Operator Address"]],
  ["Mobile", false, ["Mobile Number", "Phone"]],
  ["Operator Per Hrs Cost", false, ["Operator Per Hour Cost", "Operator Hour Cost"]],
  ["Stroke", false, ["Strokes", "Stroke Count"]],
  ["Achieve Cycle Time", false, ["Achieved Cycle Time", "Actual Cycle Time", "Achieved CT"]],
  ["Shift Target", false, ["Production Target", "Target Qty"]],
  ["Opr. Time Target", false, ["Opr Time Target", "Operative Time Target"]],
  ["Proxy", false, []],
  ["Shift Time", false, ["Total Shift Time"]],
  ["Allowed Time", false, ["Allowance Time"]],
  ["Non Opr. Time", false, ["Non Opr Time", "Non Operating Time", "Non Operative Time"]],
  ["Down Time", false, ["Downtime"]],
  ["System Off", false, ["System Off Time"]],
  ["Product Loss", false, ["Production Loss"]],
  ["Reject Qty", false, ["Rejected Qty", "Rejection Qty", "Reject Quantity"]],
  ["Rework Qty", false, ["Reworked Qty", "Rework Quantity"]],
  ["Error Stroke", false, ["Error Strokes"]],
  ["Tool Yes/No", false, ["Tool Required", "Tool"]],
] satisfies ReadonlyArray<readonly [string, boolean, readonly string[]]>;

const downtimeColumns = [
  ["Date", true, ["Event Date", "Downtime Date"]],
  ["Machine", true, ["Machine Name", "Machine No", "Machine Number"]],
  ["Shift", true, ["Shift Name", "Shift No", "Shift Number"]],
  ["From Time", true, ["Start Time", "From", "Start Date Time", "Start Datetime"]],
  ["Till Time", true, ["End Time", "To Time", "Till", "End Date Time", "End Datetime"]],
  ["Duration", true, ["Downtime Duration", "Stop Duration"]],
  ["Revenue", false, ["Machine Hour Loss", "Financial Loss", "Revenue Loss"]],
  ["Reason_Type", false, ["Reason Type", "Downtime Type", "Reason Category"]],
  ["Reason", false, ["Downtime Reason", "Root Cause"]],
  ["Product Name", false, ["Product", "Item Name"]],
  ["Operator Name", false, ["Operator"]],
] satisfies ReadonlyArray<readonly [string, boolean, readonly string[]]>;

function columns(
  values: ReadonlyArray<readonly [string, boolean, readonly string[]]>,
): ColumnDefinition[] {
  return values.map(([canonicalName, required, aliases]) => ({
    canonicalName,
    required,
    aliases,
  }));
}

export const MMS_WORKBOOK_SCHEMA: readonly SheetDefinition[] = Object.freeze([
  {
    canonicalName: "Product Log Book",
    aliases: [
      "Product Log",
      "Production Log Book",
      "Production Log",
      "ProductLogBook",
    ],
    columns: columns(productionColumns),
  },
  {
    canonicalName: "Down Time Details",
    aliases: [
      "Downtime Details",
      "DownTime Details",
      "Downtime Detail",
      "Down Time Detail",
      "Downtime Log",
    ],
    columns: columns(downtimeColumns),
  },
]);

export class MmsWorkbookCompatibilityError extends Error {
  readonly report: MmsWorkbookCompatibilityReport;

  constructor(report: MmsWorkbookCompatibilityReport) {
    const errors = report.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message);
    super(
      `Workbook import rejected by MMS contract ${report.contractVersion}: ${
        errors.join(" ") || "The workbook is incompatible."
      }`,
    );
    this.name = "MmsWorkbookCompatibilityError";
    this.report = report;
  }
}

export function normalizeMmsWorkbookLabel(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[_./\\-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function detectMmsWorkbookFormat(
  fileName: string,
): MmsWorkbookFormat | null {
  const match = fileName.trim().toLowerCase().match(/\.([^.]+)$/);
  return match?.[1] === "xls" || match?.[1] === "xlsx"
    ? match[1]
    : null;
}

function dimensions(sheet: XLSX.WorkSheet | undefined): {
  rows: number;
  columns: number;
} {
  if (!sheet?.["!ref"]) return { rows: 0, columns: 0 };
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  return {
    rows: range.e.r - range.s.r + 1,
    columns: range.e.c - range.s.c + 1,
  };
}

function aliasIndex(definition: SheetDefinition): Map<string, string> {
  const result = new Map<string, string>();
  for (const column of definition.columns) {
    for (const label of [column.canonicalName, ...column.aliases]) {
      result.set(normalizeMmsWorkbookLabel(label), column.canonicalName);
    }
  }
  return result;
}

function matchingSheetNames(
  workbook: XLSX.WorkBook,
  definition: SheetDefinition,
): string[] {
  const accepted = new Set(
    [definition.canonicalName, ...definition.aliases].map(normalizeMmsWorkbookLabel),
  );
  return workbook.SheetNames.filter((name) =>
    accepted.has(normalizeMmsWorkbookLabel(name)),
  );
}

function inspectSheet(
  workbook: XLSX.WorkBook,
  definition: SheetDefinition,
  issues: MmsWorkbookCompatibilityIssue[],
): MmsWorkbookSheetCompatibility {
  const matches = matchingSheetNames(workbook, definition);
  if (matches.length === 0) {
    issues.push({
      code: "MISSING_REQUIRED_SHEET",
      severity: "error",
      sheet: definition.canonicalName,
      message: `Required sheet “${definition.canonicalName}” was not found.`,
    });
    return {
      canonicalName: definition.canonicalName,
      actualName: null,
      headerRowNumber: null,
      estimatedRowCount: 0,
      estimatedColumnCount: 0,
      mappedColumns: {},
      missingRequiredColumns: definition.columns
        .filter((column) => column.required)
        .map((column) => column.canonicalName),
      missingOptionalColumns: definition.columns
        .filter((column) => !column.required)
        .map((column) => column.canonicalName),
      unknownColumns: [],
    };
  }
  if (matches.length > 1) {
    issues.push({
      code: "AMBIGUOUS_SHEET",
      severity: "error",
      sheet: definition.canonicalName,
      message: `Multiple sheets match “${definition.canonicalName}”: ${matches.join(", ")}.`,
    });
  }

  const actualName = matches[0];
  const sheet = workbook.Sheets[actualName];
  const size = dimensions(sheet);
  if (size.rows > MMS_WORKBOOK_LIMITS.maximumRowsPerSheet) {
    issues.push({
      code: "SHEET_ROW_LIMIT_EXCEEDED",
      severity: "error",
      sheet: definition.canonicalName,
      actualSheetName: actualName,
      message: `Sheet “${actualName}” has ${size.rows.toLocaleString()} rows; the safe limit is ${MMS_WORKBOOK_LIMITS.maximumRowsPerSheet.toLocaleString()}.`,
    });
  }
  if (size.columns > MMS_WORKBOOK_LIMITS.maximumColumnsPerSheet) {
    issues.push({
      code: "SHEET_COLUMN_LIMIT_EXCEEDED",
      severity: "error",
      sheet: definition.canonicalName,
      actualSheetName: actualName,
      message: `Sheet “${actualName}” has ${size.columns} columns; the safe limit is ${MMS_WORKBOOK_LIMITS.maximumColumnsPerSheet}.`,
    });
  }

  const preview = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    range: {
      s: { r: 0, c: 0 },
      e: {
        r: Math.min(Math.max(size.rows - 1, 0), MMS_WORKBOOK_LIMITS.headerSearchRows - 1),
        c: Math.min(Math.max(size.columns - 1, 0), MMS_WORKBOOK_LIMITS.maximumColumnsPerSheet - 1),
      },
    },
  });
  const aliases = aliasIndex(definition);
  const required = new Set(
    definition.columns
      .filter((column) => column.required)
      .map((column) => column.canonicalName),
  );
  let best:
    | {
        index: number;
        recognized: number;
        requiredFound: number;
        headers: unknown[];
      }
    | undefined;
  preview.forEach((row, index) => {
    const canonical = new Set(
      row
        .map((value) => aliases.get(normalizeMmsWorkbookLabel(value)))
        .filter((value): value is string => Boolean(value)),
    );
    const candidate = {
      index,
      recognized: canonical.size,
      requiredFound: [...required].filter((name) => canonical.has(name)).length,
      headers: row,
    };
    if (
      !best ||
      candidate.requiredFound > best.requiredFound ||
      (candidate.requiredFound === best.requiredFound &&
        candidate.recognized > best.recognized)
    ) {
      best = candidate;
    }
  });

  const minimumRecognized = Math.min(4, definition.columns.length);
  if (!best || best.recognized < minimumRecognized) {
    issues.push({
      code: "HEADER_ROW_NOT_FOUND",
      severity: "error",
      sheet: definition.canonicalName,
      actualSheetName: actualName,
      message: `Could not identify MMS headers within the first ${MMS_WORKBOOK_LIMITS.headerSearchRows} rows of “${actualName}”.`,
    });
    return {
      canonicalName: definition.canonicalName,
      actualName,
      headerRowNumber: null,
      estimatedRowCount: Math.max(0, size.rows),
      estimatedColumnCount: size.columns,
      mappedColumns: {},
      missingRequiredColumns: [...required],
      missingOptionalColumns: definition.columns
        .filter((column) => !column.required)
        .map((column) => column.canonicalName),
      unknownColumns: [],
    };
  }

  const mappedColumns: Record<string, string> = {};
  const unknownColumns: string[] = [];
  const seenCanonical = new Set<string>();
  for (const rawHeader of best.headers) {
    const original = String(rawHeader ?? "").trim();
    if (!original) continue;
    const canonical = aliases.get(normalizeMmsWorkbookLabel(original));
    if (!canonical) {
      unknownColumns.push(original);
      continue;
    }
    if (seenCanonical.has(canonical)) {
      issues.push({
        code: "DUPLICATE_CANONICAL_COLUMN",
        severity: "error",
        sheet: definition.canonicalName,
        actualSheetName: actualName,
        column: canonical,
        message: `Sheet “${actualName}” maps more than one column to “${canonical}”.`,
      });
      continue;
    }
    seenCanonical.add(canonical);
    mappedColumns[original] = canonical;
  }

  const missingRequiredColumns = definition.columns
    .filter((column) => column.required && !seenCanonical.has(column.canonicalName))
    .map((column) => column.canonicalName);
  const missingOptionalColumns = definition.columns
    .filter((column) => !column.required && !seenCanonical.has(column.canonicalName))
    .map((column) => column.canonicalName);
  for (const column of missingRequiredColumns) {
    issues.push({
      code: "MISSING_REQUIRED_COLUMN",
      severity: "error",
      sheet: definition.canonicalName,
      actualSheetName: actualName,
      column,
      message: `Required column “${column}” is missing from “${actualName}”.`,
    });
  }
  for (const column of missingOptionalColumns) {
    issues.push({
      code: "OPTIONAL_COLUMN_MISSING",
      severity: "info",
      sheet: definition.canonicalName,
      actualSheetName: actualName,
      column,
      message: `Optional column “${column}” is not present in “${actualName}”.`,
    });
  }
  for (const column of unknownColumns) {
    issues.push({
      code: "UNKNOWN_COLUMN",
      severity: "warning",
      sheet: definition.canonicalName,
      actualSheetName: actualName,
      column,
      message: `Column “${column}” is not part of MMS contract ${MMS_WORKBOOK_CONTRACT_VERSION} and will be ignored.`,
    });
  }

  return {
    canonicalName: definition.canonicalName,
    actualName,
    headerRowNumber: best.index + 1,
    estimatedRowCount: Math.max(0, size.rows - best.index - 1),
    estimatedColumnCount: size.columns,
    mappedColumns,
    missingRequiredColumns,
    missingOptionalColumns,
    unknownColumns,
  };
}

function statusFor(
  issues: readonly MmsWorkbookCompatibilityIssue[],
): MmsCompatibilityStatus {
  if (issues.some((issue) => issue.severity === "error")) return "rejected";
  if (issues.some((issue) => issue.severity === "warning")) {
    return "compatible_with_warnings";
  }
  return "compatible";
}

export function inspectMmsWorkbookCompatibility(
  workbook: XLSX.WorkBook,
  options: { fileName: string; byteLength?: number | null },
): MmsWorkbookCompatibilityReport {
  const issues: MmsWorkbookCompatibilityIssue[] = [];
  const format = detectMmsWorkbookFormat(options.fileName);
  if (!format) {
    issues.push({
      code: "UNSUPPORTED_FILE_FORMAT",
      severity: "error",
      message: `“${options.fileName}” is not supported. Upload an .xls or .xlsx workbook.`,
    });
  }
  const byteLength = options.byteLength ?? null;
  if (
    byteLength != null &&
    byteLength > MMS_WORKBOOK_LIMITS.maximumFileBytes
  ) {
    issues.push({
      code: "FILE_TOO_LARGE",
      severity: "error",
      message: `Workbook size is ${(byteLength / 1024 / 1024).toFixed(1)} MB; the safe limit is ${MMS_WORKBOOK_LIMITS.maximumFileBytes / 1024 / 1024} MB.`,
    });
  }

  const sheets = MMS_WORKBOOK_SCHEMA.map((definition) =>
    inspectSheet(workbook, definition, issues),
  );
  const totalRows = sheets.reduce(
    (sum, sheet) => sum + sheet.estimatedRowCount,
    0,
  );
  if (totalRows > MMS_WORKBOOK_LIMITS.maximumRowsAcrossRequiredSheets) {
    issues.push({
      code: "WORKBOOK_ROW_LIMIT_EXCEEDED",
      severity: "error",
      message: `Required sheets contain approximately ${totalRows.toLocaleString()} data rows; the safe combined limit is ${MMS_WORKBOOK_LIMITS.maximumRowsAcrossRequiredSheets.toLocaleString()}.`,
    });
  }

  return {
    contractVersion: MMS_WORKBOOK_CONTRACT_VERSION,
    status: statusFor(issues),
    file: {
      name: options.fileName,
      format,
      byteLength,
      originalFilePreserved: true,
    },
    workbook: {
      sheetCount: workbook.SheetNames.length,
      estimatedRowsAcrossRequiredSheets: totalRows,
    },
    sheets,
    issues,
  };
}

function extractSheetRows(
  workbook: XLSX.WorkBook,
  compatibility: MmsWorkbookSheetCompatibility,
): MmsContractSourceRow[] {
  if (!compatibility.actualName || compatibility.headerRowNumber == null) return [];
  const sheet = workbook.Sheets[compatibility.actualName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  const headerIndex = compatibility.headerRowNumber - 1;
  const headers = grid[headerIndex] ?? [];
  const mappedHeaders = headers.map((header) => {
    const original = String(header ?? "").trim();
    return compatibility.mappedColumns[original] ?? null;
  });
  return grid
    .slice(headerIndex + 1)
    .map((row, index) => ({
      rowNumber: headerIndex + index + 2,
      values: Object.fromEntries(
        mappedHeaders.flatMap((header, column) =>
          header ? [[header, row[column]]] : [],
        ),
      ),
    }))
    .filter((row) =>
      Object.values(row.values).some(
        (value) => value != null && String(value).trim() !== "",
      ),
    );
}

export function extractMmsWorkbookContractRows(
  workbook: XLSX.WorkBook,
  options: { fileName: string; byteLength?: number | null },
): MmsWorkbookContractExtraction {
  const report = inspectMmsWorkbookCompatibility(workbook, options);
  if (report.status === "rejected") {
    throw new MmsWorkbookCompatibilityError(report);
  }
  const production = report.sheets.find(
    (sheet) => sheet.canonicalName === "Product Log Book",
  )!;
  const downtime = report.sheets.find(
    (sheet) => sheet.canonicalName === "Down Time Details",
  )!;
  return {
    report,
    productionRows: extractSheetRows(workbook, production),
    downtimeRows: extractSheetRows(workbook, downtime),
  };
}
