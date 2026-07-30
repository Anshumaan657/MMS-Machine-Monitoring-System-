# Known limitations

## Formal acceptance

The calculation policy is confirmed, but final formal acceptance still
requires private representative cases compared with 3D's own MMS interface.
The historical 93.88% workbook score is an audit baseline, not the current
confirmed-policy acceptance result.

## MySQL integration

The repository contains:

- a read-only data-source interface;
- environment validation;
- schema-mapping validation;
- retry/error behavior;
- database/Excel equivalence tests with fixtures.

It does not contain:

- 3D's live table/column schema;
- production credentials;
- a configured MySQL network connection;
- acceptance evidence against the live database.

Excel remains the supported input.

## Source-data limitations

- Most sample downtime reasons are `UNREPORTED`, limiting root-cause analysis.
- Sample rejection and rework values do not provide complete external Quality
  reference coverage.
- Missing operator and quality entries produce large warning counts.
- Machine-hour cost conflicts require master-data confirmation.

## Formula comparison

The provisional 99.37% policy is retained only for audit comparison. It is
disabled and production-blocked because 3D confirmed that M. Factor should not
be used throughout the formulas.

## Synchronization

- Automatic live-file monitoring depends on browser File System Access support.
- Manual Excel upload is the universal fallback.
- Browser state is not a centralized multi-user synchronization service.
- Near-real-time MySQL refresh cannot be verified without the live schema and
  environment.

## Printing

Physical PDF page numbering varies between browsers/renderers. Enable browser
headers/footers when guaranteed physical page numbers are required.

## Browser automation

The automated browser environment could not provide the local workbook through
its native file chooser. Workbook behavior is instead covered by parser,
analytics, export, print-fixture and regression tests. A human upload smoke test
is still required before release.

## Scale

Safe import limits protect the browser, but actual performance depends on
machine memory, workbook complexity and browser implementation. Large client
workbooks require a pilot measurement on the target computer.

## Alert interpretation

Alerts are threshold-based operational signals, not predictive-maintenance
diagnoses. Multiple alerts can refer to one underlying record. Human
investigation remains necessary.

## AI

AI wording is optional and requires an approved API key/network path.
Deterministic summaries remain the authoritative fallback. AI does not
calculate metrics.

## Deployment

Vercel and Cloudflare-compatible builds pass, but client-data approval,
authentication, access control, retention and production infrastructure remain
organizational responsibilities.
