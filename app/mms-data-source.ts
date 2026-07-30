import type { CanonicalMmsData } from "./mms.ts";
import {
  DEFAULT_MAX_WORKBOOK_BYTES,
  isSupportedWorkbookName,
} from "./security.ts";

export type MmsDataSourceKind = "database" | "excel";

export type MmsDataSourceErrorCode =
  | "CONFIGURATION_ERROR"
  | "CONNECTION_ERROR"
  | "FILE_ERROR"
  | "MAPPING_ERROR"
  | "QUERY_ERROR";

export class MmsDataSourceError extends Error {
  readonly code: MmsDataSourceErrorCode;
  readonly retryable: boolean;

  constructor(
    code: MmsDataSourceErrorCode,
    message: string,
    options: { cause?: unknown; retryable?: boolean } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "MmsDataSourceError";
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

export interface MmsDataSource {
  readonly kind: MmsDataSourceKind;
  readonly name: string;
  load(): Promise<CanonicalMmsData>;
}

export type MmsDataSourceLoadResult = {
  data: CanonicalMmsData;
  source: {
    kind: MmsDataSourceKind;
    name: string;
    usedFallback: boolean;
  };
  primaryError: MmsDataSourceError | null;
};

export type ExcelMmsDataSourceOptions = {
  maxFileSizeBytes?: number;
};

export function validateMmsWorkbookUpload(
  fileName: string,
  byteLength: number,
  maxFileSizeBytes = DEFAULT_MAX_WORKBOOK_BYTES,
): void {
  if (!isSupportedWorkbookName(fileName)) {
    throw new MmsDataSourceError(
      "FILE_ERROR",
      "Only .xls and .xlsx MMS workbooks are supported.",
    );
  }
  if (!Number.isFinite(byteLength) || byteLength <= 0) {
    throw new MmsDataSourceError(
      "FILE_ERROR",
      "The selected workbook is empty.",
    );
  }
  if (byteLength > maxFileSizeBytes) {
    throw new MmsDataSourceError(
      "FILE_ERROR",
      `The workbook exceeds the ${Math.round(maxFileSizeBytes / 1_048_576)} MB safety limit.`,
    );
  }
}

function normalizedSourceError(
  error: unknown,
  source: MmsDataSource,
): MmsDataSourceError {
  if (error instanceof MmsDataSourceError) return error;
  return new MmsDataSourceError(
    source.kind === "database" ? "CONNECTION_ERROR" : "FILE_ERROR",
    `${source.name} could not be loaded.`,
    { cause: error, retryable: source.kind === "database" },
  );
}

/**
 * Prefer the read-only database when it is configured. If it is unavailable,
 * the caller may supply the user's local workbook as an explicit offline
 * fallback. A database failure is returned for status display but its details
 * are not copied into the canonical dataset.
 */
export async function loadMmsDataWithFallback(
  primary: MmsDataSource,
  fallback?: MmsDataSource,
): Promise<MmsDataSourceLoadResult> {
  try {
    return {
      data: await primary.load(),
      source: {
        kind: primary.kind,
        name: primary.name,
        usedFallback: false,
      },
      primaryError: null,
    };
  } catch (error) {
    const primaryError = normalizedSourceError(error, primary);
    if (!fallback) throw primaryError;

    return {
      data: await fallback.load(),
      source: {
        kind: fallback.kind,
        name: fallback.name,
        usedFallback: true,
      },
      primaryError,
    };
  }
}

/**
 * Offline data source retained for client sites that cannot expose their MMS
 * database. Parsing remains local and uses the same canonical model as the
 * database source.
 */
export class ExcelMmsDataSource implements MmsDataSource {
  readonly kind = "excel" as const;
  readonly name: string;
  readonly #readFile: () => Promise<ArrayBuffer>;
  readonly #maxFileSizeBytes: number;

  constructor(
    fileName: string,
    file: ArrayBuffer | (() => Promise<ArrayBuffer>),
    options: ExcelMmsDataSourceOptions = {},
  ) {
    this.name = fileName;
    this.#maxFileSizeBytes =
      options.maxFileSizeBytes ?? DEFAULT_MAX_WORKBOOK_BYTES;
    this.#readFile =
      typeof file === "function" ? file : async () => file.slice(0);
  }

  async load(): Promise<CanonicalMmsData> {
    try {
      const buffer = await this.#readFile();
      validateMmsWorkbookUpload(
        this.name,
        buffer.byteLength,
        this.#maxFileSizeBytes,
      );
      const { parseMmsCanonicalFile } = await import("./mms.ts");
      return parseMmsCanonicalFile(buffer, this.name);
    } catch (error) {
      if (error instanceof MmsDataSourceError) throw error;
      throw new MmsDataSourceError(
        "FILE_ERROR",
        "The MMS workbook could not be read or normalized.",
        { cause: error },
      );
    }
  }
}
