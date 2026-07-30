import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseMmsCanonicalFile } from "../app/mms.ts";
import {
  buildPhase29AcceptanceReport,
  phase29AcceptanceMarkdown,
} from "../app/phase29-acceptance-engine.ts";

const workbookPath = path.resolve(
  process.argv[2] ?? "Sample1_31-07-23_To_25-12-24.xls",
);
const privateInputPath = path.resolve(
  process.env.MMS_PHASE29_REFERENCE_FILE ??
    "verification-input/phase29-3d-results.json",
);
const templatePath = path.resolve(
  "verification/phase29-acceptance.template.json",
);
const outputDirectory = path.resolve("verification-output");

async function inputPath() {
  try {
    await access(privateInputPath);
    return privateInputPath;
  } catch {
    return templatePath;
  }
}

const selectedInputPath = await inputPath();
const [workbookBytes, rawInput] = await Promise.all([
  readFile(workbookPath),
  readFile(selectedInputPath, "utf8"),
]);
const arrayBuffer = workbookBytes.buffer.slice(
  workbookBytes.byteOffset,
  workbookBytes.byteOffset + workbookBytes.byteLength,
);
const canonical = parseMmsCanonicalFile(
  arrayBuffer,
  path.basename(workbookPath),
);
const input = JSON.parse(rawInput);
const report = buildPhase29AcceptanceReport(canonical, input);

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    path.join(outputDirectory, "phase29-acceptance.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    path.join(outputDirectory, "phase29-acceptance.md"),
    phase29AcceptanceMarkdown(report),
    "utf8",
  ),
]);

console.log(`Policy: ${report.policyAudit.activeId} ${report.policyAudit.activeVersion}`);
console.log(`Reference input: ${path.relative(process.cwd(), selectedInputPath)}`);
console.log(`Cases: ${report.coverage.providedCases}`);
console.log(`Comparable checks: ${report.results.comparableChecks}`);
console.log(
  `Agreement: ${
    report.results.agreementPercentage == null
      ? "N/A"
      : `${report.results.agreementPercentage.toFixed(2)}%`
  }`,
);
console.log(`Phase 29 status: ${report.status}`);
console.log("Reports: verification-output/phase29-acceptance.{json,md}");

if (
  process.env.MMS_PHASE29_ENFORCE_ACCEPTANCE === "true" &&
  !report.strictPass
) {
  process.exitCode = 2;
}
