import {
  canonicalizeMmsRows,
  type CanonicalMmsData,
  type MmsSourceRow,
} from "../app/mms.ts";
import {
  MmsDataSourceError,
  type MmsDataSource,
} from "../app/mms-data-source.ts";

export const MMS_PRODUCTION_FIELDS = [
  "Date",
  "Machine",
  "Shift",
  "From Time",
  "Till Time",
  "Part No.",
  "Part Name",
  "Part ERP Code",
  "Product Name",
  "ERP Code",
  "Operator",
  "Machine Type",
  "Shift Time",
  "Allowed Time",
  "Opr. Time",
  "Non Opr. Time",
  "Down Time",
  "System Off",
  "Setup Time",
  "Additional Over Time",
  "Prod Gap Between",
  "Std. Cycle Time",
  "Approved Cycle Time",
  "Achieve Cycle Time",
  "Stroke",
  "M. Factor",
  "Qty",
  "Shift Target",
  "Opr. Time Target",
  "Product Loss",
  "Reject Qty",
  "Rework Qty",
  "Error Stroke",
  "Part Cost",
  "Component Cost",
  "Running Hrs Cost",
  "Operator Per Hrs Cost",
  "Scrap part",
  "Quality Interlock",
  "Process Dependency",
  "Proxy",
  "Tool Yes/No",
] as const;

export const MMS_DOWNTIME_FIELDS = [
  "Date",
  "Machine",
  "Shift",
  "From Time",
  "Till Time",
  "Duration",
  "Product Name",
  "Operator Name",
  "Reason_Type",
  "Reason",
  "Revenue",
] as const;

export type MmsProductionField = (typeof MMS_PRODUCTION_FIELDS)[number];
export type MmsDowntimeField = (typeof MMS_DOWNTIME_FIELDS)[number];

export type MmsDatabaseTableMapping<Field extends string> = {
  table: string;
  columns: Partial<Record<Field, string>>;
};

export type MmsDatabaseSchemaMapping = {
  production: MmsDatabaseTableMapping<MmsProductionField>;
  downtime: MmsDatabaseTableMapping<MmsDowntimeField>;
};

export type ReadonlySelectRequest = Readonly<{
  operation: "select";
  table: string;
  columns: readonly string[];
}>;

/**
 * Technology-specific adapters implement SELECT only. The interface does not
 * expose execute, insert, update, delete or raw SQL methods.
 */
export interface ReadonlyMmsDatabaseClient {
  readonly technology: string;
  select(
    request: ReadonlySelectRequest,
  ): Promise<readonly Readonly<Record<string, unknown>>[]>;
}

export type MmsDatabaseDataSourceOptions = {
  client: ReadonlyMmsDatabaseClient;
  schema: MmsDatabaseSchemaMapping;
  company: string;
  sourceName?: string;
  now?: () => Date;
};

const REQUIRED_PRODUCTION_FIELDS: readonly MmsProductionField[] = [
  "Date",
  "Machine",
  "Shift",
  "From Time",
  "Till Time",
];
const REQUIRED_DOWNTIME_FIELDS: readonly MmsDowntimeField[] = [
  "Date",
  "Machine",
  "Shift",
  "From Time",
  "Till Time",
];
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*$/;

function assertIdentifier(value: string, label: string): void {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new MmsDataSourceError(
      "CONFIGURATION_ERROR",
      `${label} must be a plain database identifier, not a SQL expression.`,
    );
  }
}

function validateTableMapping<Field extends string>(
  mapping: MmsDatabaseTableMapping<Field>,
  requiredFields: readonly Field[],
  label: string,
): void {
  assertIdentifier(mapping.table, `${label} table`);
  for (const field of requiredFields) {
    if (!mapping.columns[field]) {
      throw new MmsDataSourceError(
        "CONFIGURATION_ERROR",
        `${label} mapping is missing the required “${field}” field.`,
      );
    }
  }
  for (const [field, column] of Object.entries(mapping.columns)) {
    if (typeof column !== "string") {
      throw new MmsDataSourceError(
        "CONFIGURATION_ERROR",
        `${label} mapping for “${field}” is invalid.`,
      );
    }
    assertIdentifier(column, `${label} column for “${field}”`);
  }
}

function selectedColumns<Field extends string>(
  mapping: MmsDatabaseTableMapping<Field>,
): string[] {
  return Array.from(
    new Set(Object.values(mapping.columns).filter((value): value is string => Boolean(value))),
  );
}

function mapRows<Field extends string>(
  rows: readonly Readonly<Record<string, unknown>>[],
  mapping: MmsDatabaseTableMapping<Field>,
): MmsSourceRow[] {
  return rows.map((row, index) => ({
    rowNumber: index + 1,
    values: Object.fromEntries(
      Object.entries(mapping.columns).map(([mmsField, databaseColumn]) => [
        mmsField,
        typeof databaseColumn === "string" ? row[databaseColumn] : null,
      ]),
    ),
  }));
}

export class MmsDatabaseDataSource implements MmsDataSource {
  readonly kind = "database" as const;
  readonly name: string;
  readonly #client: ReadonlyMmsDatabaseClient;
  readonly #schema: MmsDatabaseSchemaMapping;
  readonly #company: string;
  readonly #now: () => Date;

  constructor(options: MmsDatabaseDataSourceOptions) {
    validateTableMapping(
      options.schema.production,
      REQUIRED_PRODUCTION_FIELDS,
      "Production",
    );
    validateTableMapping(
      options.schema.downtime,
      REQUIRED_DOWNTIME_FIELDS,
      "Downtime",
    );
    if (!options.client.technology.trim()) {
      throw new MmsDataSourceError(
        "CONFIGURATION_ERROR",
        "The database technology must be confirmed before connecting.",
      );
    }

    this.#client = options.client;
    this.#schema = options.schema;
    this.#company = options.company;
    this.#now = options.now ?? (() => new Date());
    this.name =
      options.sourceName ??
      `${options.client.technology} read-only MMS database`;
  }

  async load(): Promise<CanonicalMmsData> {
    let productionRows: readonly Readonly<Record<string, unknown>>[];
    let downtimeRows: readonly Readonly<Record<string, unknown>>[];
    try {
      [productionRows, downtimeRows] = await Promise.all([
        this.#client.select({
          operation: "select",
          table: this.#schema.production.table,
          columns: selectedColumns(this.#schema.production),
        }),
        this.#client.select({
          operation: "select",
          table: this.#schema.downtime.table,
          columns: selectedColumns(this.#schema.downtime),
        }),
      ]);
    } catch (error) {
      throw new MmsDataSourceError(
        "CONNECTION_ERROR",
        "The read-only MMS database could not be reached. Excel upload remains available.",
        { cause: error, retryable: true },
      );
    }

    try {
      return canonicalizeMmsRows({
        company: this.#company,
        sourceName: this.name,
        parsedAt: this.#now().toISOString(),
        productionRows: mapRows(
          productionRows,
          this.#schema.production,
        ),
        downtimeRows: mapRows(downtimeRows, this.#schema.downtime),
      });
    } catch (error) {
      if (error instanceof MmsDataSourceError) throw error;
      throw new MmsDataSourceError(
        "MAPPING_ERROR",
        "Database records did not match the configured MMS schema mapping.",
        { cause: error },
      );
    }
  }
}
