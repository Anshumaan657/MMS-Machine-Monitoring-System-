# Troubleshooting guide

## Workbook is rejected

Check:

- extension is `.xls` or `.xlsx`;
- file is not empty or above 50 MB;
- both required sheets exist;
- mandatory columns are present;
- only one sheet matches each required canonical sheet;
- sheet limits are not exceeded.

The compatibility report identifies the exact missing sheet or column.

## Workbook loads with many warnings

Open **Data Quality** and group findings by code. Common causes:

- `UNREPORTED` downtime reasons;
- missing operator;
- blank rejection/rework values;
- Qty differing from Stroke × M. Factor;
- inconsistent machine-hour costs;
- duplicate or overlapping events.

Warnings do not automatically mean the parser is wrong. Use the source sheet
and row to verify the record.

## Dashboard shows N/A or Blocked OEE

Check for:

- missing rejection or rework values;
- zero/missing Reported Qty;
- negative Good Quantity;
- invalid duration or required identity;
- unreliable source records;
- non-confirmed calculation policy.

The system intentionally blocks unsupported Quality/OEE claims.

## Alert count appears too high

- Apply a focused date range.
- Remember that one record can trigger multiple alert types.
- Group by type and machine.
- Distinguish data-entry warnings from operational failures.
- Review acknowledgement and resolved status.

## Filters return no data

1. Clear all filters.
2. Check the workbook date range.
3. Select one machine or shift at a time.
4. Confirm advanced multi-value selections.
5. Check whether data-quality status excludes the records.

## Excel export is empty

The export uses the active filters. Clear filters or choose a period containing
records, then export again.

## PDF content is clipped

- Select A4.
- Start at 100% scale.
- Enable background graphics.
- Remove browser margins only if preview remains readable.
- Use landscape where the report defines a landscape section.
- Inspect every page before saving.

## AI summary is unavailable

This is not a reporting failure. The deterministic summary is the supported
fallback. If AI wording is required:

- confirm `OPENAI_API_KEY` exists in the server environment;
- confirm the model identifier is approved;
- inspect safe server logs without printing credentials;
- verify that the structured response passes factual validation.

Never send raw workbook rows to the AI endpoint.

## Synchronization is stale or paused

- Select **Resume** if manually paused.
- Use **Sync now**.
- Check the last successful synchronization time.
- For Excel, reselect or re-upload the modified workbook.
- For a database source, check network access and the read-only account.
- Review bounded synchronization logs.

## Database configuration fails

The current build requires:

- `MMS_DB_READ_ONLY=true`;
- valid host, database, username and password;
- a valid port;
- safe table/column identifiers;
- required schema mappings;
- an implemented technology-specific MySQL `select` client.

The repository does not contain 3D's schema or a live production driver.

## Build or test failure

```sh
node --version
npm ci
npm run lint
npm test
```

Node must meet the version in `package.json`. If only a dependency deprecation
warning appears while the build and tests pass, record it but do not treat it
as a failed acceptance gate.

## Health endpoint fails

Check application logs and environment configuration, then request:

```text
/api/health
```

Expected status is `ok` with policy `mms-direct-quantity-v2`, version `2.0.0`,
status `confirmed`.

## Escalation evidence

When reporting a problem, provide:

- application commit/tag;
- browser and OS;
- sanitized workbook compatibility report;
- active filters;
- policy ID/version;
- alert/finding ID and source row;
- steps to reproduce;
- expected and observed behavior;
- sanitized logs.

Do not attach credentials or a client workbook to a public issue.
