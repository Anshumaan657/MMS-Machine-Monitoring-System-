import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeterministicManagementSummary,
  buildVerifiedManagementEvidence,
} from "../app/management-summary-engine.ts";
import {
  generateAiManagementSummary,
  generateManagementSummaryWithFallback,
  validateAiManagementSummary,
} from "../app/ai-management-summary-provider.ts";

function aggregate(label, values = {}) {
  return {
    key: label,
    label,
    machine: values.machine ?? null,
    shift: values.shift ?? null,
    date: null,
    recordCount: 2,
    eligibleRecordCount: 2,
    excludedRecordCount: 0,
    totals: {
      shiftTimeSeconds: 86_400,
      allowedTimeSeconds: 14_400,
      plannedProductionTimeSeconds: 72_000,
      operativeTimeSeconds: 57_600,
      producedQuantity: values.output ?? 800,
      operativeTimeTarget: values.operativeTarget ?? 1_000,
    },
    availability: values.availability ?? 0.8,
    performance: values.performance ?? 0.8,
    quality: { status: "pending", value: null },
    finalOee: { status: "pending", value: null },
    issueCodes: [],
  };
}

function productionAggregate(label, values = {}) {
  return {
    key: label,
    label,
    recordCount: 2,
    totals: {
      producedQuantity: values.output ?? 800,
      reportedQuantity: values.output ?? 800,
      calculatedQuantity: values.output ?? 800,
      shiftTarget: values.target ?? 1_000,
      operativeTimeTarget: values.operativeTarget ?? 1_000,
      productionLoss: values.loss ?? 200,
    },
    targetAttainment: values.attainment ?? 80,
  };
}

function downtimeAggregate(label, values = {}) {
  return {
    key: label,
    label,
    machine: values.machine ?? null,
    shift: values.shift ?? null,
    date: null,
    rawEventCount: 3,
    mergedEventCount: 3,
    totals: {
      shortNonOperativeSeconds: 600,
      downtimeSeconds: values.downtimeSeconds ?? 7_200,
      systemOffEventSeconds: values.systemOffSeconds ?? 300,
      reportedNonOperativeSeconds: 600,
      reportedSystemOffSeconds: 300,
      calculatedMachineHourLoss: values.loss ?? 4_000,
      reportedMachineHourLoss: values.loss ?? 4_000,
      unpricedDowntimeSeconds: 0,
    },
    unreportedEventCount: 1,
    overlappingEventCount: 0,
    issueCodes: [],
  };
}

function analyticsFixture() {
  const machineOneProduction = productionAggregate("PRESS ONE", {
    output: 500,
    target: 700,
    loss: 200,
    attainment: 71.43,
  });
  const machineTwoProduction = productionAggregate("PRESS TWO", {
    output: 300,
    target: 300,
    loss: 0,
    attainment: 100,
  });
  const shiftProduction = productionAggregate("SHIFT A");
  const machineOneOee = aggregate("PRESS ONE", {
    machine: "PRESS ONE",
    output: 500,
    availability: 0.7,
    performance: 0.72,
  });
  const machineTwoOee = aggregate("PRESS TWO", {
    machine: "PRESS TWO",
    output: 300,
    availability: 0.9,
    performance: 0.95,
  });
  const shiftOee = aggregate("SHIFT A", { shift: "SHIFT A" });
  const periodOee = aggregate("Entire selection");
  const machineOneDowntime = downtimeAggregate("PRESS ONE", {
    machine: "PRESS ONE",
    downtimeSeconds: 7_200,
    loss: 4_000,
  });
  const machineTwoDowntime = downtimeAggregate("PRESS TWO", {
    machine: "PRESS TWO",
    downtimeSeconds: 1_800,
    loss: 500,
  });
  const shiftDowntime = downtimeAggregate("SHIFT A");
  const periodDowntime = downtimeAggregate("Entire selection", {
    downtimeSeconds: 9_000,
    loss: 4_500,
  });
  return {
    filters: {
      dateFrom: "2024-01-01",
      dateTo: "2024-01-01",
      shifts: ["SHIFT A"],
      machines: [],
      products: [],
      operators: [],
      downtimeReasons: [],
    },
    activeFilterCount: 2,
    scope: {
      dateFrom: "2024-01-01",
      dateTo: "2024-01-01",
      productionRecordCount: 4,
      downtimeEventCount: 3,
    },
    records: {
      productionIntervals: [{ secretRawField: "must not escape" }],
      downtimeEvents: [{ secretRawField: "must not escape" }],
    },
    production: {
      recordCount: 4,
      totals: productionAggregate("period").totals,
      targetAttainment: 80,
      machineWise: [machineOneProduction, machineTwoProduction],
      shiftWise: [shiftProduction],
      daily: [],
      productWise: [],
      operatorWise: [],
    },
    availabilityPerformance: {
      machineWise: [machineOneOee, machineTwoOee],
      shiftWise: [shiftOee],
      daily: [],
      period: periodOee,
    },
    oee: {
      machineWise: [],
      shiftWise: [],
      daily: [],
      period: {
        quality: 0.9925,
        finalOee: 0.6352,
      },
    },
    quality: {
      records: [],
      machineWise: [],
      shiftWise: [],
      daily: [],
      period: {
        totals: {
          producedQuantity: 800,
          rejectedQuantity: 4,
          reworkedQuantity: 2,
          estimatedScrap: 16,
        },
      },
      oeeQualityStatus: "not_calculated",
      finalOeeStatus: "not_calculated",
    },
    downtime: {
      events: [],
      mergedEvents: [],
      machineWise: [machineOneDowntime, machineTwoDowntime],
      shiftWise: [shiftDowntime],
      daily: [],
      period: periodDowntime,
      machineRanking: [machineOneDowntime, machineTwoDowntime],
      reasonPareto: [
        {
          reason: "UNREPORTED",
          eventCount: 2,
          downtimeSeconds: 7_200,
          downtimePercentage: 80,
          cumulativePercentage: 80,
          calculatedMachineHourLoss: 4_000,
        },
      ],
      mergeRule: {
        enabled: true,
        maximumGapSeconds: 0,
        requireSameReason: true,
      },
    },
    dataQuality: {
      validationIssues: [],
      findings: [
        {
          code: "UNREPORTED_REASON",
          count: 2,
          severity: "warning",
          source: "downtime",
        },
      ],
      errorCount: 0,
      warningCount: 2,
      invalidProductionRecords: 0,
      invalidDowntimeRecords: 0,
      quantityMismatchRecords: 0,
      missingQualityRecords: 1,
      possiblyUnreportedQualityRecords: 1,
      unreportedDowntimeEvents: 2,
      overlappingDowntimeEvents: 0,
    },
  };
}

test("builds bounded verified evidence without raw workbook records", () => {
  const evidence = buildVerifiedManagementEvidence(
    analyticsFixture(),
    "2026-07-26T00:00:00.000Z",
  );
  const serialized = JSON.stringify(evidence);
  assert.equal(evidence.policy.calculationsAllowed, false);
  assert.equal(evidence.policy.rawRecordsIncluded, false);
  assert.deepEqual(evidence.pendingClaims, []);
  assert.equal(
    evidence.facts.find((fact) => fact.id === "quality.factor")?.value,
    0.9925,
  );
  assert.equal(
    evidence.facts.find((fact) => fact.id === "oee.final")?.value,
    0.6352,
  );
  assert.ok(evidence.facts.length <= 80);
  assert.doesNotMatch(serialized, /secretRawField/);
  assert.doesNotMatch(serialized, /productionIntervals/);
  assert.doesNotMatch(serialized, /downtimeEvents/);
  assert.equal(
    evidence.facts.find((fact) => fact.id === "machine.rank_1")?.value,
    "PRESS ONE",
  );
});

test("deterministic summary includes confirmed Quality and Final OEE", () => {
  const evidence = buildVerifiedManagementEvidence(analyticsFixture());
  const summary = buildDeterministicManagementSummary(evidence);
  assert.equal(summary.source, "deterministic");
  assert.equal(summary.evidenceDigest, evidence.evidenceDigest);
  assert.ok(summary.executiveSummary.length >= 3);
  assert.ok(summary.productionLosses.length >= 1);
  assert.ok(summary.comparisons.length >= 1);
  assert.ok(summary.bottlenecks.length >= 1);
  assert.ok(summary.dataCaveats.length >= 1);
  assert.ok(summary.recommendations.length >= 1);
  assert.deepEqual(summary.pendingClaims, []);
  assert.ok(
    summary.executiveSummary.some((statement) =>
      statement.evidenceIds.includes("oee.final"),
    ),
  );
});

test("AI request uses strict structured output and verified evidence only", async () => {
  const evidence = buildVerifiedManagementEvidence(analyticsFixture());
  let capturedBody;
  const summary = await generateAiManagementSummary(evidence, {
    apiKey: "test-only",
    model: "test-model",
    fetchImplementation: async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    title: "Verified management brief",
                    executiveSummary: [
                      {
                        text: "Production is below the verified target.",
                        evidenceIds: [
                          "production.output",
                          "production.target",
                        ],
                      },
                    ],
                    productionLosses: [],
                    comparisons: [],
                    bottlenecks: [],
                    dataCaveats: [
                      {
                        text: "Downtime reasons require review.",
                        evidenceIds: ["data.unreported_downtime"],
                      },
                    ],
                    recommendations: [
                      {
                        priority: "high",
                        text: "Review the leading machine bottleneck.",
                        evidenceIds: ["machine.rank_1"],
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  assert.equal(summary.source, "ai");
  assert.equal(summary.model, "test-model");
  assert.equal(capturedBody.text.format.type, "json_schema");
  assert.equal(capturedBody.text.format.strict, true);
  assert.equal(JSON.parse(capturedBody.input).policy.rawRecordsIncluded, false);
  assert.doesNotMatch(capturedBody.input, /secretRawField/);
  assert.match(capturedBody.instructions, /Never calculate/);
});

test("rejects unsupported evidence and numeric AI claims", () => {
  const evidence = buildVerifiedManagementEvidence(analyticsFixture());
  const base = {
    title: "Verified management brief",
    executiveSummary: [],
    productionLosses: [],
    comparisons: [],
    bottlenecks: [],
    dataCaveats: [],
    recommendations: [],
  };
  assert.throws(
    () =>
      validateAiManagementSummary(
        {
          ...base,
          executiveSummary: [
            {
              text: "Production reached 80 percent.",
              evidenceIds: ["production.output"],
            },
          ],
        },
        evidence,
        "test-model",
      ),
    /numeric claim/,
  );
  assert.throws(
    () =>
      validateAiManagementSummary(
        {
          ...base,
          executiveSummary: [
            {
              text: "Production requires review.",
              evidenceIds: ["invented.fact"],
            },
          ],
        },
        evidence,
        "test-model",
      ),
    /unsupported evidence/,
  );
});

test("uses deterministic fallback when the AI is unavailable", async () => {
  const evidence = buildVerifiedManagementEvidence(analyticsFixture());
  const result = await generateManagementSummaryWithFallback(evidence);
  assert.equal(result.summary.source, "deterministic");
  assert.match(result.fallbackReason ?? "", /OPENAI_API_KEY/);
});
