import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { diagnoseAchievedCycleTime } from "../app/achieved-cycle-time-diagnostics.ts";
import { parseMmsCanonicalFile } from "../app/mms.ts";

const workbookPath = path.resolve(
  process.argv[2] ?? "Sample1_31-07-23_To_25-12-24.xls",
);
const outputDirectory = path.resolve("verification-output");
const file = await readFile(workbookPath);
const data = parseMmsCanonicalFile(
  file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  path.basename(workbookPath),
);
const diagnostic = diagnoseAchievedCycleTime(data);

function markdownGroup(title, groups, limit = 12) {
  return [
    `### ${title}`,
    "",
    "| Group | Comparable | Mismatches | Mismatch rate | Median difference | P90 difference | Maximum difference |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...groups.slice(0, limit).map(
      (group) =>
        `| ${String(group.key).replaceAll("|", "\\|")} | ${
          group.comparableRecords
        } | ${group.mismatchRecords} | ${
          group.mismatchRatePercentage
        }% | ${group.medianAbsoluteDifferenceSeconds}s | ${
          group.p90AbsoluteDifferenceSeconds
        }s | ${group.maximumAbsoluteDifferenceSeconds}s |`,
    ),
    "",
  ];
}

const markdown = [
  "# Achieved Cycle Time Diagnostic",
  "",
  `Generated: ${diagnostic.generatedAt}`,
  "",
  "This report investigates the current formula without changing production calculations.",
  "",
  "## Baseline",
  "",
  `- Production records: ${diagnostic.baseline.productionRecords}`,
  `- Comparable records: ${diagnostic.baseline.comparableRecords}`,
  `- Matches: ${diagnostic.baseline.matches}`,
  `- Mismatches: ${diagnostic.baseline.mismatches}`,
  `- Not comparable: ${diagnostic.baseline.notComparable}`,
  `- Agreement: ${diagnostic.baseline.agreementPercentage ?? "N/A"}%`,
  "",
  "## Candidate explanations",
  "",
  "| Candidate | Comparable | Overall matches | Overall agreement | Current mismatches explained | Explanation rate |",
  "|---|---:|---:|---:|---:|---:|",
  ...diagnostic.candidates.map(
    (candidate) =>
      `| ${candidate.label} | ${candidate.comparable} | ${
        candidate.matches
      } | ${candidate.agreementPercentage ?? "N/A"}% | ${
        candidate.currentMismatchesExplained
      } | ${candidate.currentMismatchExplanationPercentage ?? "N/A"}% |`,
  ),
  "",
  "Candidate matches are diagnostic evidence only. They do not authorize a formula change.",
  "",
  "## Mismatch patterns",
  "",
  "| Pattern | Records | Percentage of mismatches |",
  "|---|---:|---:|",
  ...diagnostic.mismatchPatterns.map(
    (pattern) =>
      `| ${pattern.pattern} | ${pattern.count} | ${pattern.percentageOfMismatches}% |`,
  ),
  "",
  "## Grouped mismatches",
  "",
  ...markdownGroup("By machine", diagnostic.groups.byMachine),
  ...markdownGroup("By shift", diagnostic.groups.byShift),
  ...markdownGroup("By product", diagnostic.groups.byProduct),
  "## Representative examples",
  "",
  "| Row | Date | Machine | Shift | Operative sec. | Stroke | M. Factor | Reported Qty | Stroke-derived Qty | Reported cycle | Current cycle | Matching explanations | Reason selected |",
  "|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|",
  ...diagnostic.representativeExamples.map(
    (example) =>
      `| ${example.sourceRow} | ${example.date ?? ""} | ${example.machine.replaceAll(
        "|",
        "\\|",
      )} | ${example.shift.replaceAll("|", "\\|")} | ${
        example.operativeTimeSeconds ?? ""
      } | ${example.stroke ?? ""} | ${example.multiplier ?? ""} | ${
        example.reportedQuantity ?? ""
      } | ${example.calculatedQuantity ?? ""} | ${
        example.reportedAchievedCycleTimeSeconds
      } | ${example.calculatedAchievedCycleTimeSeconds} | ${
        example.matchingCandidateIds.join(", ")
      } | ${example.selectionReasons.join(", ")} |`,
  ),
  "",
  "The full JSON report contains every mismatch and all candidate matches. These local outputs contain client identifiers and must not be committed.",
  "",
].join("\n");

function csvValue(value) {
  if (value == null) return "";
  const text = Array.isArray(value) ? value.join("; ") : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csvColumns = [
  "sourceRow",
  "date",
  "machine",
  "shift",
  "product",
  "operativeTimeSeconds",
  "shiftTimeSeconds",
  "allowedTimeSeconds",
  "elapsedTimeSeconds",
  "stroke",
  "multiplier",
  "reportedQuantity",
  "calculatedQuantity",
  "reportedAchievedCycleTimeSeconds",
  "calculatedAchievedCycleTimeSeconds",
  "absoluteDifferenceSeconds",
  "relativeDifferencePercentage",
  "patterns",
  "matchingCandidateIds",
  "selectionReasons",
];
const csv = [
  csvColumns.join(","),
  ...diagnostic.representativeExamples.map((example) =>
    csvColumns
      .map((column) => csvValue(example[column]))
      .join(","),
  ),
].join("\n");

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    path.join(outputDirectory, "achieved-cycle-time-diagnostic.json"),
    `${JSON.stringify(diagnostic, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    path.join(outputDirectory, "achieved-cycle-time-diagnostic.md"),
    markdown,
    "utf8",
  ),
  writeFile(
    path.join(outputDirectory, "achieved-cycle-time-examples.csv"),
    `${csv}\n`,
    "utf8",
  ),
]);

console.log(
  `Achieved Cycle Time: ${diagnostic.baseline.matches}/${diagnostic.baseline.comparableRecords} matches (${diagnostic.baseline.agreementPercentage}%)`,
);
console.log(`Mismatches grouped: ${diagnostic.baseline.mismatches}`);
console.log(
  `Best alternative explanation: ${
    diagnostic.candidates.find(
      (candidate) =>
        candidate.id !== "operative_div_calculated_quantity",
    )?.label ?? "None"
  }`,
);
console.log(
  `Representative examples selected: ${diagnostic.representativeExamples.length}`,
);
console.log(
  "Private outputs: verification-output/achieved-cycle-time-diagnostic.{json,md} and achieved-cycle-time-examples.csv",
);
