import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const projectRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(projectRoot, "verification-output");
const outputFile = resolve(outputDirectory, "phase27-print-report.html");
const vite = await createServer({
  root: projectRoot,
  configFile: false,
  appType: "custom",
  plugins: [react()],
  server: { middlewareMode: true },
});

try {
  const { exactCanonicalFixture } = await vite.ssrLoadModule(
    "/tests/phase12-fixture.mjs",
  );
  const { queryMmsAnalytics } = await vite.ssrLoadModule(
    "/app/analytics-query-engine.ts",
  );
  const { buildOperationalAlerts } = await vite.ssrLoadModule(
    "/app/operational-alert-engine.ts",
  );
  const {
    buildDeterministicManagementSummary,
    buildVerifiedManagementEvidence,
  } = await vite.ssrLoadModule("/app/management-summary-engine.ts");
  const { PrintableMmsReport } = await vite.ssrLoadModule(
    "/app/printable-report.tsx",
  );

  const data = exactCanonicalFixture();
  const analytics = queryMmsAnalytics(data, {
    date: "2024-01-01",
    machine: "MACHINE A",
    shift: "Shift 1",
  });
  const evidence = buildVerifiedManagementEvidence(
    analytics,
    "2026-07-30T00:00:00.000Z",
  );
  const managementSummary = buildDeterministicManagementSummary(
    evidence,
    "2026-07-30T00:00:00.000Z",
  );
  const alerts = buildOperationalAlerts(data, {}, {
    analytics,
    generatedAt: "2026-07-30T00:00:00.000Z",
  });
  const machineProduction = analytics.production.machineWise[0];
  const machineOee = analytics.availabilityPerformance.machineWise[0];
  const machineQuality = analytics.oee.machineWise[0];
  const machineDowntime = analytics.downtime.machineWise[0];
  const machines = [
    {
      name: "MACHINE A",
      status: alerts.length ? "Warning" : "Running",
      production: machineProduction?.totals.producedQuantity ?? 0,
      target: machineProduction?.totals.shiftTarget ?? 0,
      availability: machineOee?.availability ?? null,
      performance: machineOee?.performance ?? null,
      quality: machineQuality?.quality ?? null,
      finalOee: machineQuality?.finalOee ?? null,
      downtimeHours:
        (machineDowntime?.totals.downtimeSeconds ?? 0) / 3_600,
      financialLoss:
        machineDowntime?.totals.calculatedMachineHourLoss ?? 0,
    },
  ];
  const report = React.createElement(PrintableMmsReport, {
    analytics,
    machines,
    alerts,
    managementSummary,
    metadata: {
      company: data.source.company,
      sourceFileName: data.source.fileName,
      generatedAt: "2026-07-30T00:00:00.000Z",
      lastSuccessfulSyncAt: "2026-07-30T00:00:00.000Z",
      dataSource: "Phase 27 offline verification fixture",
    },
  });
  const css = await readFile(resolve(projectRoot, "app/globals.css"), "utf8");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Phase 27 MMS Print Verification</title>
  <style>${css}</style>
  <style>
    body { background: #fff !important; }
    .print-report { display: block !important; }
  </style>
</head>
<body>${renderToStaticMarkup(report)}</body>
</html>`;

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, html, "utf8");
  console.log(outputFile);
} finally {
  await vite.close();
}
