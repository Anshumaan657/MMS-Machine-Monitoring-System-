# Security and privacy notes

## Data-processing model

Excel parsing occurs in the browser. The original file is read, normalized and
left unchanged. Browser-native PDF printing and client-side Excel generation
avoid an external document-conversion service.

## Confidential data

Workbooks and reports may contain:

- machine and production details;
- operator information;
- downtime causes;
- cost and financial-loss information;
- client identifiers.

Treat every workbook, generated export, PDF and populated verification case as
confidential unless 3D approves disclosure.

## Repository exclusions

Do not commit:

- `.xls` or `.xlsx` client files;
- generated summaries containing client records;
- `.env` files;
- API keys or database passwords;
- populated private verification cases;
- generated verification output;
- local build/runtime caches.

## Upload controls

- Only `.xls` and `.xlsx` are accepted.
- Empty and oversized files are rejected.
- Sheet, row and column limits reduce memory-exhaustion risk.
- Unrelated and structurally incomplete workbooks are rejected.
- Spreadsheet text is sanitized when exported to reduce formula injection.

These protections do not replace malware scanning required by company policy.

## Database controls

- Use a dedicated account restricted to `SELECT`.
- Set `MMS_DB_READ_ONLY=true`.
- Require TLS where supported.
- Restrict host/network access.
- Never use an administrator account.
- Never log the password or a complete connection string.
- Review the schema mapping before enabling synchronization.

The database interface intentionally omits mutation and raw-SQL methods.

## Secret handling

- Use `.env.local` only for local development.
- Use encrypted platform/environment settings in production.
- Keep `.env.example` value-free.
- Rotate any credential that appears in a log or commit.
- Verify error messages through the redaction utility.

## AI boundary

AI receives bounded structured metrics and evidence IDs only. It must not:

- receive raw workbook records;
- calculate metrics;
- invent numeric claims;
- override the calculation engine;
- report unsupported Quality/OEE values.

If the API key is absent or validation fails, the deterministic summary is
used.

## Browser storage

Filter preferences, alert acknowledgement state and dashboard layout may be
stored in the browser. On shared computers:

1. use an approved browser profile;
2. sign out/close the application;
3. clear site data at handover when required;
4. do not rely on browser storage as the official audit record.

## Logging and health

Synchronization logs are bounded. The health endpoint exposes only service and
policy status. Logs and errors must not contain secrets, filenames or raw
client records.

## Deployment guidance

For confidential client use, prefer a company PC or local server. Use Vercel or
another cloud only after 3D approves the data classification, retention,
region, access control and AI/network behavior.

## Incident response

If confidential data or a secret is exposed:

1. stop the affected deployment;
2. revoke/rotate the credential;
3. preserve sanitized audit evidence;
4. notify the authorized 3D contact;
5. remove the exposed artifact from supported storage and repository history;
6. verify the remediation before restart.
