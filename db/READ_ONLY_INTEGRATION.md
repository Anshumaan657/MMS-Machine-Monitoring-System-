# MMS read-only database integration

Phase 8 deliberately separates 3D's operational database from the analytics
engines. Database rows and Excel rows enter the same canonical MMS model, so
Availability, Performance, production, quality, downtime and financial-loss
calculations do not change with the source.

## Required information from 3D

The database technology is confirmed as MySQL. Live integration must not be
enabled until 3D also provides:

1. MySQL version.
2. Host, port and database name, or an approved private connection endpoint.
3. A dedicated account with `SELECT` permission only.
4. SSL/TLS requirements and any VPN or IP allow-list requirement.
5. Production-log and downtime-table names.
6. Column names, data types, primary keys and modified-at columns.
7. A small database extract covering the same period as a supplied workbook.

Real credentials belong only in an uncommitted `.env` file locally and in the
deployment platform's encrypted environment settings in production. The
committed `.env.example` contains names only.

## Adapter boundary

`ReadonlyMmsDatabaseClient` exposes only a structured `select` operation. It
does not expose raw SQL or any insert, update, delete, execute or migration
method. The database-specific adapter must use the confirmed driver and a
server-side connection.

`MmsDatabaseSchemaMapping` maps the two confirmed database tables to the
existing MMS export field names. Required interval identity fields are
validated before any query runs, and table/column names must be plain
identifiers rather than SQL expressions.

## Acceptance check

Before database access is enabled for the dashboard:

1. Load a fixed date range from the read-only database.
2. Export the same range from MMS to Excel.
3. Compare canonical record counts and IDs.
4. Compare production, target, Availability and Performance totals.
5. Compare downtime duration, reasons and financial loss.
6. Compare rejection, rework, scrap and data-quality findings.
7. Investigate every mismatch before enabling automatic database refresh.

Near-real-time polling, duplicate prevention, retry handling, stale detection
and bounded logs are implemented by `app/synchronization-engine.ts`. They
operate above this adapter boundary and must be acceptance-tested against the
live MySQL schema before automatic database refresh is enabled.
