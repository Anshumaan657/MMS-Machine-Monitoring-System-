# MMS Intelligence deployment

The complete deployment and environment guide is available at
[`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md). This file is the short
release checklist.

The application supports three operating modes:

- Laptop: install dependencies, run `npm run build`, then `npm run start`.
- Company server: use the same commands behind the company reverse proxy. Keep
  the workbook and all environment variables on the server.
- Vercel: import the repository, add only the required environment variables,
  and use `npm run build:vercel`.

Excel remains the primary input. The browser validates `.xls` and `.xlsx`
files, enforces a 50 MB safety limit, and does not modify the original file.
The MySQL path is read-only and should use a database account restricted to
`SELECT`.

Before release, run:

```sh
npm test
npm run lint
npm run smoke:deployment
```

Check `/api/health` after deployment. It deliberately exposes no credentials,
connection strings, filenames, or client records.

The current production policy must be:

```text
mms-direct-quantity-v2 · 2.0.0 · confirmed
```

The repository contains a read-only MySQL adapter boundary, but live database
operation remains disabled until 3D provides its schema, a technology-specific
client and approved `SELECT`-only credentials.
