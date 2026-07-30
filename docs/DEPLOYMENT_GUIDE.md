# Deployment guide

## Supported targets

- Developer/local laptop
- Company PC
- Local company server
- Vercel
- Cloudflare/Vinext-compatible runtime

Excel-only operation is supported now. Live MySQL requires a database-specific
driver/adapter, confirmed schema and read-only credentials.

## Pre-deployment gate

```sh
npm ci
npm run lint
npm test
npm run build:vercel
npm run smoke:deployment
```

Do not deploy if a test fails or the health endpoint reports a non-confirmed
policy.

## Laptop or company PC

```sh
npm ci
npm run build
npm run start
```

Use an OS account with access only to the approved application and workbook
directories. Do not place credentials inside the repository.

## Local company server

1. Install the approved Node.js version.
2. Copy or clone the accepted release.
3. Run `npm ci`.
4. create an uncommitted `.env.local` or service-managed environment.
5. Run the validation gate.
6. Start the production server using the organization's process manager.
7. Place it behind the approved reverse proxy and TLS configuration.
8. Restrict network access to authorized users.
9. Check `/api/health`.

Back up environment configuration separately from source code.

## Vercel

1. Import the accepted GitHub repository.
2. Use the framework defaults detected from Next.js.
3. Use `npm run build:vercel` when a custom build command is required.
4. Configure optional environment values in encrypted project settings.
5. Deploy the exact accepted commit.
6. Check `/`, workbook upload, report export and `/api/health`.

Do not deploy confidential client workbooks as static assets.

## Cloudflare/Vinext

The standard build is:

```sh
npm run build
```

Use the organization's Cloudflare configuration and keep any runtime bindings
outside source control. Optional D1 support is not the MMS MySQL integration.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | No | Optional AI wording; deterministic fallback works without it |
| `OPENAI_MODEL` | No | Approved model identifier |
| `MMS_DB_TECHNOLOGY` | MySQL only | Expected database technology |
| `MMS_DB_HOST` | MySQL only | Database host |
| `MMS_DB_PORT` | MySQL only | Port, normally 3306 |
| `MMS_DB_NAME` | MySQL only | Database name |
| `MMS_DB_USERNAME` | MySQL only | Dedicated read-only account |
| `MMS_DB_PASSWORD` | MySQL only | Secret password |
| `MMS_DB_READ_ONLY` | MySQL only | Must be `true` |
| `MMS_DB_SSL` | MySQL only | TLS behavior |

The current repository contains the interface and mapping boundary, not a live
3D MySQL schema or production driver.

## Health check

`GET /api/health` returns:

- service status;
- timestamp;
- active calculation-policy ID, version and status.

It does not expose credentials, filenames or client records.

## Post-deployment smoke test

1. Load the application.
2. Upload a known compatible workbook.
3. Apply date, machine and shift filters.
4. Check production and policy metadata.
5. Review alerts and data-quality findings.
6. export Excel.
7. preview/save PDF.
8. test deterministic summary without an API key.
9. verify dark/light themes and keyboard navigation.
10. record deployed commit and acceptance result.
