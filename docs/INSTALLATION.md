# Installation guide

## Requirements

- Node.js `22.13.0` or newer
- npm
- A modern desktop browser
- A compatible MMS `.xls` or `.xlsx` workbook
- At least 2 GB free memory for normal development and build operations

MySQL is not required for Excel operation.

## Local development

```sh
git clone https://github.com/Anshumaan657/MMS-Machine-Monitoring-System-.git
cd MMS-Machine-Monitoring-System-
npm ci
npm run dev
```

Open `http://localhost:3000`.

## First workbook

1. Select **Connect workbook**.
2. Choose a compatible `.xls` or `.xlsx` MMS export.
3. Review the compatibility report if the workbook contains warnings.
4. Verify the displayed client/workspace and date range.
5. Open **Data Quality** before treating the metrics as final.

The source workbook remains unchanged.

## Production-style local run

```sh
npm ci
npm run build
npm run start
```

Check:

```text
http://localhost:3000/
http://localhost:3000/api/health
```

## Environment setup

Copy the committed template:

```sh
cp .env.example .env.local
```

Leave database values blank for Excel-only operation. `OPENAI_API_KEY` is
optional; without it the module generates a deterministic management summary.
Never commit `.env.local`.

## Pre-use verification

```sh
npm run lint
npm test
npm run build:vercel
npm run smoke:deployment
```

## Updating

1. Back up local environment files.
2. Stop the running application.
3. Pull the approved release tag or `main`.
4. Run `npm ci` to reproduce the lockfile.
5. Run the complete verification commands.
6. Start the application and upload a known workbook.

Do not deploy a provisional calculation policy.
