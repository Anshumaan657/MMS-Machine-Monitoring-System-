# 3D Intelligence — MMS Analytics Module

3D Intelligence is a standalone analytics and reporting layer for Machine
Monitoring System (MMS) data. It imports 3D-compatible Excel workbooks,
normalizes production and downtime records, applies a versioned calculation
policy, and presents verified results through dashboards, alerts, Excel exports
and printable PDF reports.

## What the module provides

- `.xls` and `.xlsx` import with a documented compatibility contract
- Production, target, loss, Availability, Performance, Quality and OEE analysis
- Downtime classification, reason Pareto and machine-hour financial loss
- Structured data-quality findings with source-sheet and row evidence
- Configurable operational alerts with acknowledgement and resolution
- Unified date, machine, shift, product, operator and reason filters
- Deterministic management summaries, with optional validated AI wording
- Eleven-sheet filtered Excel reports
- A4 browser-native printing and PDF saving
- Excel-first operation with a future-ready read-only MySQL adapter boundary

The production calculation policy is `mms-direct-quantity-v2`, version `2.0.0`,
status `confirmed`. Reported Qty is authoritative. `Stroke × M. Factor` is a
validation check and never silently replaces Reported Qty.

## Quick start

Requirements: Node.js `22.13.0` or newer and npm.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`, select **Connect workbook**, and choose a
compatible MMS `.xls` or `.xlsx` export. The original file is not modified.

## Validation

```sh
npm run lint
npm test
npm run build:vercel
npm run smoke:deployment
```

The current automated suite contains 128 passing tests. Formal 3D acceptance
still requires the private representative side-by-side cases described in
[`verification/PHASE_29_CONFIRMATION.md`](verification/PHASE_29_CONFIRMATION.md).

## Documentation

Start with the [handover documentation index](docs/README.md).

- [Project overview](docs/PROJECT_OVERVIEW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Installation](docs/INSTALLATION.md)
- [Excel input guide](docs/EXCEL_INPUT_GUIDE.md)
- [Data dictionary](docs/DATA_DICTIONARY.md)
- [Formulas and policy versions](docs/FORMULAS_AND_POLICIES.md)
- [Dashboard guide](docs/DASHBOARD_GUIDE.md)
- [Alert guide](docs/ALERT_GUIDE.md)
- [Excel and PDF reporting](docs/REPORTING_GUIDE.md)
- [Deployment](docs/DEPLOYMENT_GUIDE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Testing and verification](docs/TESTING_AND_VERIFICATION.md)
- [Handover checklist](docs/HANDOVER_CHECKLIST.md)

## Data and confidentiality

Client workbooks, generated summaries, verification output and credentials must
not be committed. Use `.env` for local secrets and a dedicated `SELECT`-only
database account if MySQL integration is enabled later.

## Release status

The Phase 28 handover package and Phase 29 confirmed-policy acceptance tooling
are implemented. It is not the final `v1.0.0` release until the representative
3D cases pass and written sign-off is recorded.
