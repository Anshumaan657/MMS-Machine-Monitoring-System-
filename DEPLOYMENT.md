# MMS Intelligence deployment

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
