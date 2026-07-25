import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the MMS application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /MMS Intelligence™ \| Industrial Analytics Command Center/i);
  assert.match(html, /Upload a verified MMS workbook to begin/i);
  assert.match(html, /Connect workbook/i);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("contains the functional dashboard, query engine, and report export", async () => {
  const [page, layout, packageJson, parser, queryEngine, syncEngine] =
    await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/mms.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/analytics-query-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/synchronization-engine.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Connect workbook/);
  assert.match(page, /Data quality command center/);
  assert.match(page, /Calculated production loss/);
  assert.match(page, /Management summary/);
  assert.match(page, /Final OEE/);
  assert.match(page, /Pending/);
  assert.match(page, /Export Excel \(\.xlsx\)/);
  assert.match(page, /XLSX\.writeFile/);
  assert.match(page, /Machine Performance/);
  assert.match(page, /Shift Performance/);
  assert.match(page, /Downtime Events/);
  assert.match(page, /Financial Losses/);
  assert.match(page, /Rejection Rework Scrap/);
  assert.match(page, /queryMmsAnalytics/);
  assert.match(page, /ExcelMmsDataSource/);
  assert.match(page, /showOpenFilePicker/);
  assert.match(page, /Last successful synchronization/);
  assert.match(page, /Sync now/);
  assert.match(page, /Resume/);
  assert.match(page, /Sync logs/);
  assert.doesNotMatch(page, /temperature:\s*number/i);
  assert.doesNotMatch(page, /vibration:\s*number/i);
  assert.doesNotMatch(page, /rpm:\s*number/i);
  assert.doesNotMatch(page, /pressure:\s*number/i);
  assert.match(layout, /MMS Intelligence/);
  assert.match(packageJson, /"xlsx"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  assert.match(parser, /Product Log Book/);
  assert.match(parser, /Down Time Details/);
  assert.match(parser, /summarizeWorkbook/);
  assert.match(queryEngine, /dateRange/);
  assert.match(queryEngine, /downtimeReason/);
  assert.match(syncEngine, /reconcileMmsSnapshots/);
  assert.match(syncEngine, /retryDelaysMs/);
  assert.match(syncEngine, /lastSuccessfulSyncAt/);
  assert.match(syncEngine, /duplicateKeys/);
  assert.match(syncEngine, /staleAfterMs/);

  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", templateRoot)),
  );
});
