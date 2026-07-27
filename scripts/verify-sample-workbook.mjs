import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseMmsCanonicalFile } from "../app/mms.ts";
import {
  buildMmsVerificationReport,
  verificationReportMarkdown,
} from "../app/verification-engine.ts";

const projectRoot = process.cwd();
const workbookPath = path.resolve(
  process.argv[2] ?? "Sample1_31-07-23_To_25-12-24.xls",
);
const referencePath = path.resolve(
  process.env.MMS_3D_REFERENCE_FILE ??
    "verification-input/3d-selected-results.json",
);
const outputDirectory = path.resolve("verification-output");

async function optionalSelectedReferences() {
  try {
    await access(referencePath);
  } catch {
    return [];
  }
  const payload = JSON.parse(await readFile(referencePath, "utf8"));
  if (!payload || !Array.isArray(payload.cases)) {
    throw new Error(
      "The 3D selected-results reference file must contain a cases array.",
    );
  }
  return payload.cases;
}

const file = await readFile(workbookPath);
const arrayBuffer = file.buffer.slice(
  file.byteOffset,
  file.byteOffset + file.byteLength,
);
const canonical = parseMmsCanonicalFile(
  arrayBuffer,
  path.basename(workbookPath),
);
const selected3dReferences = await optionalSelectedReferences();
const report = buildMmsVerificationReport(canonical, {
  thresholdPercentage: 95,
  selected3dReferences,
});

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    path.join(outputDirectory, "phase12-verification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    path.join(outputDirectory, "phase12-verification.md"),
    verificationReportMarkdown(report),
    "utf8",
  ),
]);

const agreement =
  report.overall.agreementPercentage == null
    ? "N/A"
    : `${report.overall.agreementPercentage.toFixed(2)}%`;
console.log(`Workbook: ${path.relative(projectRoot, workbookPath)}`);
console.log(
  `Canonical records: ${canonical.productionIntervals.length} production, ${canonical.downtimeEvents.length} downtime`,
);
console.log(
  `Reported-vs-calculated agreement: ${agreement} (${report.overall.matches} matches, ${report.overall.mismatches} mismatches)`,
);
console.log(
  `Selected 3D cases: ${report.selected3dVerification.providedCases} (${report.selected3dVerification.status})`,
);
console.log(
  "Detailed local reports: verification-output/phase12-verification.{json,md}",
);

if (
  process.env.MMS_VERIFICATION_ENFORCE_TARGET === "true" &&
  (report.overall.status !== "provisional_pass" ||
    report.selected3dVerification.status !== "meets_target")
) {
  process.exitCode = 2;
}
