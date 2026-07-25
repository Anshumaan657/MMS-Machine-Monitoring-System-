import { MmsDataSourceError } from "../app/mms-data-source.ts";

export type ReadonlyMmsDatabaseEnvironment = {
  technology: string;
  host: string;
  port: number | null;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
};

type Environment = Record<string, string | undefined>;

function required(environment: Environment, key: string): string {
  const value = environment[key]?.trim();
  if (!value) {
    throw new MmsDataSourceError(
      "CONFIGURATION_ERROR",
      `${key} is required for read-only MMS database access.`,
    );
  }
  return value;
}

/**
 * This function belongs in server-only code. It intentionally returns no
 * connection string and never serializes or logs the password.
 */
export function loadReadonlyMmsDatabaseEnvironment(
  environment: Environment,
): ReadonlyMmsDatabaseEnvironment {
  if (environment.MMS_DB_READ_ONLY?.trim().toLowerCase() !== "true") {
    throw new MmsDataSourceError(
      "CONFIGURATION_ERROR",
      "MMS_DB_READ_ONLY=true is required before database access is enabled.",
    );
  }

  const rawPort = environment.MMS_DB_PORT?.trim();
  const port = rawPort ? Number(rawPort) : null;
  if (port != null && (!Number.isInteger(port) || port < 1 || port > 65_535)) {
    throw new MmsDataSourceError(
      "CONFIGURATION_ERROR",
      "MMS_DB_PORT must be a valid TCP port.",
    );
  }

  return {
    technology: required(environment, "MMS_DB_TECHNOLOGY"),
    host: required(environment, "MMS_DB_HOST"),
    port,
    database: required(environment, "MMS_DB_NAME"),
    username: required(environment, "MMS_DB_USERNAME"),
    password: required(environment, "MMS_DB_PASSWORD"),
    ssl: environment.MMS_DB_SSL?.trim().toLowerCase() !== "false",
  };
}

export function describeReadonlyMmsDatabaseEnvironment(
  config: ReadonlyMmsDatabaseEnvironment,
): Omit<ReadonlyMmsDatabaseEnvironment, "password"> & {
  password: "[REDACTED]";
} {
  return {
    ...config,
    password: "[REDACTED]",
  };
}
