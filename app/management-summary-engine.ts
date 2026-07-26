import type { FilteredMmsAnalytics } from "./mms.ts";

export type ManagementEvidenceCategory =
  | "scope"
  | "production"
  | "availability_performance"
  | "machine_comparison"
  | "shift_comparison"
  | "downtime"
  | "data_quality"
  | "pending";

export type ManagementEvidenceReliability =
  | "verified"
  | "caveat"
  | "pending";

export type ManagementEvidenceFact = {
  id: string;
  category: ManagementEvidenceCategory;
  label: string;
  display: string;
  value: number | string | null;
  unit: string | null;
  reliability: ManagementEvidenceReliability;
};

export type VerifiedManagementEvidence = {
  schemaVersion: "1.0";
  evidenceDigest: string;
  generatedAt: string;
  scope: {
    dateFrom: string | null;
    dateTo: string | null;
    shifts: string[];
    machines: string[];
    productionRecordCount: number;
    downtimeEventCount: number;
  };
  facts: ManagementEvidenceFact[];
  pendingClaims: ["Quality", "Final OEE"];
  policy: {
    calculationsAllowed: false;
    rawRecordsIncluded: false;
    evidenceReferencesRequired: true;
  };
};

export type EvidenceBackedStatement = {
  text: string;
  evidenceIds: string[];
};

export type ManagementRecommendation = EvidenceBackedStatement & {
  priority: "high" | "medium" | "low";
};

export type ManagementSummary = {
  source: "ai" | "deterministic";
  model: string | null;
  evidenceDigest: string;
  generatedAt: string;
  title: string;
  executiveSummary: EvidenceBackedStatement[];
  productionLosses: EvidenceBackedStatement[];
  comparisons: EvidenceBackedStatement[];
  bottlenecks: EvidenceBackedStatement[];
  dataCaveats: EvidenceBackedStatement[];
  recommendations: ManagementRecommendation[];
  pendingClaims: ["Quality", "Final OEE"];
};

const numberFormat = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});
const integerFormat = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});
const currencyFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function rounded(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function percentage(value: number | null): string {
  return value == null ? "Unavailable" : `${numberFormat.format(value * 100)}%`;
}

function percentageAlreadyScaled(value: number | null): string {
  return value == null ? "Unavailable" : `${numberFormat.format(value)}%`;
}

function hours(seconds: number): number {
  return rounded(seconds / 3_600, 2);
}

function stableDigest(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `mms-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function fact(
  id: string,
  category: ManagementEvidenceCategory,
  label: string,
  display: string,
  value: number | string | null,
  unit: string | null,
  reliability: ManagementEvidenceReliability = "verified",
): ManagementEvidenceFact {
  return { id, category, label, display, value, unit, reliability };
}

export function buildVerifiedManagementEvidence(
  analytics: FilteredMmsAnalytics,
  generatedAt = new Date().toISOString(),
): VerifiedManagementEvidence {
  const facts: ManagementEvidenceFact[] = [];
  const production = analytics.production;
  const oee = analytics.availabilityPerformance.period;
  const downtime = analytics.downtime.period;

  facts.push(
    fact(
      "scope.production_records",
      "scope",
      "Production intervals",
      integerFormat.format(analytics.scope.productionRecordCount),
      analytics.scope.productionRecordCount,
      "records",
    ),
    fact(
      "scope.downtime_events",
      "scope",
      "Downtime events",
      integerFormat.format(analytics.scope.downtimeEventCount),
      analytics.scope.downtimeEventCount,
      "events",
    ),
    fact(
      "production.output",
      "production",
      "Produced quantity",
      integerFormat.format(production.totals.producedQuantity),
      production.totals.producedQuantity,
      "quantity",
    ),
    fact(
      "production.target",
      "production",
      "Shift target",
      integerFormat.format(production.totals.shiftTarget),
      production.totals.shiftTarget,
      "quantity",
    ),
    fact(
      "production.attainment",
      "production",
      "Target attainment",
      percentageAlreadyScaled(production.targetAttainment),
      production.targetAttainment,
      "percent",
    ),
    fact(
      "production.loss",
      "production",
      "Calculated production loss",
      integerFormat.format(production.totals.productionLoss),
      production.totals.productionLoss,
      "quantity",
    ),
    fact(
      "oee.availability",
      "availability_performance",
      "Availability",
      percentage(oee.availability),
      oee.availability == null ? null : rounded(oee.availability),
      "ratio",
    ),
    fact(
      "oee.performance",
      "availability_performance",
      "Performance",
      percentage(oee.performance),
      oee.performance == null ? null : rounded(oee.performance),
      "ratio",
    ),
    fact(
      "downtime.hours",
      "downtime",
      "Long downtime",
      `${numberFormat.format(hours(downtime.totals.downtimeSeconds))} h`,
      hours(downtime.totals.downtimeSeconds),
      "hours",
    ),
    fact(
      "downtime.system_off_hours",
      "downtime",
      "System Off",
      `${numberFormat.format(
        hours(downtime.totals.systemOffEventSeconds),
      )} h`,
      hours(downtime.totals.systemOffEventSeconds),
      "hours",
    ),
    fact(
      "downtime.machine_hour_loss",
      "downtime",
      "Calculated machine-hour loss",
      currencyFormat.format(downtime.totals.calculatedMachineHourLoss),
      rounded(downtime.totals.calculatedMachineHourLoss, 2),
      "INR",
    ),
  );

  const machineProduction = new Map(
    production.machineWise.map((item) => [item.label, item]),
  );
  const machineOee = new Map(
    analytics.availabilityPerformance.machineWise.map((item) => [
      item.label,
      item,
    ]),
  );
  const machineDowntime = new Map(
    analytics.downtime.machineWise.map((item) => [item.label, item]),
  );
  const machineNames = new Set([
    ...machineProduction.keys(),
    ...machineOee.keys(),
    ...machineDowntime.keys(),
  ]);
  const rankedMachines = [...machineNames]
    .map((machine) => {
      const productionItem = machineProduction.get(machine);
      const oeeItem = machineOee.get(machine);
      const downtimeItem = machineDowntime.get(machine);
      return {
        machine,
        output: productionItem?.totals.producedQuantity ?? 0,
        target: productionItem?.totals.shiftTarget ?? 0,
        productionLoss: productionItem?.totals.productionLoss ?? 0,
        attainment: productionItem?.targetAttainment ?? null,
        availability: oeeItem?.availability ?? null,
        performance: oeeItem?.performance ?? null,
        downtimeHours: hours(downtimeItem?.totals.downtimeSeconds ?? 0),
        machineHourLoss:
          downtimeItem?.totals.calculatedMachineHourLoss ?? 0,
      };
    })
    .sort(
      (left, right) =>
        right.downtimeHours - left.downtimeHours ||
        right.productionLoss - left.productionLoss ||
        left.machine.localeCompare(right.machine),
    );

  rankedMachines.slice(0, 8).forEach((machine, index) => {
    facts.push(
      fact(
        `machine.rank_${index + 1}`,
        "machine_comparison",
        `Machine comparison rank ${index + 1}`,
        `${machine.machine}: output ${integerFormat.format(
          machine.output,
        )} of ${integerFormat.format(
          machine.target,
        )}; attainment ${percentageAlreadyScaled(
          machine.attainment,
        )}; availability ${percentage(
          machine.availability,
        )}; performance ${percentage(
          machine.performance,
        )}; downtime ${numberFormat.format(
          machine.downtimeHours,
        )} h; production loss ${integerFormat.format(
          machine.productionLoss,
        )}; machine-hour loss ${currencyFormat.format(
          machine.machineHourLoss,
        )}`,
        machine.machine,
        null,
      ),
    );
  });

  const shiftProduction = new Map(
    production.shiftWise.map((item) => [item.label, item]),
  );
  const shiftOee = new Map(
    analytics.availabilityPerformance.shiftWise.map((item) => [
      item.label,
      item,
    ]),
  );
  const shiftDowntime = new Map(
    analytics.downtime.shiftWise.map((item) => [item.label, item]),
  );
  const shiftNames = new Set([
    ...shiftProduction.keys(),
    ...shiftOee.keys(),
    ...shiftDowntime.keys(),
  ]);
  [...shiftNames]
    .sort((left, right) => left.localeCompare(right))
    .forEach((shift, index) => {
      const productionItem = shiftProduction.get(shift);
      const oeeItem = shiftOee.get(shift);
      const downtimeItem = shiftDowntime.get(shift);
      facts.push(
        fact(
          `shift.comparison_${index + 1}`,
          "shift_comparison",
          `Shift comparison ${index + 1}`,
          `${shift}: output ${integerFormat.format(
            productionItem?.totals.producedQuantity ?? 0,
          )} of ${integerFormat.format(
            productionItem?.totals.shiftTarget ?? 0,
          )}; attainment ${percentageAlreadyScaled(
            productionItem?.targetAttainment ?? null,
          )}; availability ${percentage(
            oeeItem?.availability ?? null,
          )}; performance ${percentage(
            oeeItem?.performance ?? null,
          )}; downtime ${numberFormat.format(
            hours(downtimeItem?.totals.downtimeSeconds ?? 0),
          )} h`,
          shift,
          null,
        ),
      );
    });

  analytics.downtime.reasonPareto.slice(0, 8).forEach((reason, index) => {
    facts.push(
      fact(
        `downtime.reason_${index + 1}`,
        "downtime",
        `Downtime reason rank ${index + 1}`,
        `${reason.reason}: ${numberFormat.format(
          hours(reason.downtimeSeconds),
        )} h, ${numberFormat.format(
          reason.downtimePercentage,
        )}% of downtime, ${integerFormat.format(reason.eventCount)} events`,
        reason.reason,
        null,
        reason.reason.trim().toUpperCase() === "UNREPORTED"
          ? "caveat"
          : "verified",
      ),
    );
  });

  const quality = analytics.quality.period;
  facts.push(
    fact(
      "quality.rejected",
      "production",
      "Reported rejection quantity",
      integerFormat.format(quality.totals.rejectedQuantity),
      quality.totals.rejectedQuantity,
      "quantity",
    ),
    fact(
      "quality.reworked",
      "production",
      "Reported rework quantity",
      integerFormat.format(quality.totals.reworkedQuantity),
      quality.totals.reworkedQuantity,
      "quantity",
    ),
    fact(
      "quality.estimated_scrap",
      "production",
      "Estimated scrap",
      numberFormat.format(quality.totals.estimatedScrap),
      quality.totals.estimatedScrap,
      "scrap units",
    ),
  );

  const caveats: Array<[string, string, number]> = [
    [
      "data.errors",
      "Data-quality errors",
      analytics.dataQuality.errorCount,
    ],
    [
      "data.warnings",
      "Data-quality warnings",
      analytics.dataQuality.warningCount,
    ],
    [
      "data.quantity_mismatches",
      "Quantity mismatch records",
      analytics.dataQuality.quantityMismatchRecords,
    ],
    [
      "data.missing_quality",
      "Records with missing quality entries",
      analytics.dataQuality.missingQualityRecords,
    ],
    [
      "data.possibly_unreported_quality",
      "Possibly unreported quality records",
      analytics.dataQuality.possiblyUnreportedQualityRecords,
    ],
    [
      "data.unreported_downtime",
      "Unreported downtime events",
      analytics.dataQuality.unreportedDowntimeEvents,
    ],
    [
      "data.overlapping_downtime",
      "Overlapping downtime events",
      analytics.dataQuality.overlappingDowntimeEvents,
    ],
  ];
  caveats.forEach(([id, label, value]) => {
    facts.push(
      fact(
        id,
        "data_quality",
        label,
        integerFormat.format(value),
        value,
        "records",
        value > 0 ? "caveat" : "verified",
      ),
    );
  });

  analytics.dataQuality.findings.slice(0, 6).forEach((finding, index) => {
    facts.push(
      fact(
        `data.finding_${index + 1}`,
        "data_quality",
        `Data finding rank ${index + 1}`,
        `${finding.code}: ${integerFormat.format(finding.count)} ${finding.severity} findings`,
        finding.code,
        null,
        finding.count > 0 ? "caveat" : "verified",
      ),
    );
  });

  facts.push(
    fact(
      "pending.quality",
      "pending",
      "Official Quality",
      "Pending — excluded from management claims",
      null,
      null,
      "pending",
    ),
    fact(
      "pending.final_oee",
      "pending",
      "Final OEE",
      "Pending — excluded from management claims",
      null,
      null,
      "pending",
    ),
  );

  const scope = {
    dateFrom: analytics.scope.dateFrom,
    dateTo: analytics.scope.dateTo,
    shifts: analytics.filters.shifts,
    machines: analytics.filters.machines,
    productionRecordCount: analytics.scope.productionRecordCount,
    downtimeEventCount: analytics.scope.downtimeEventCount,
  };
  const digest = stableDigest({ scope, facts });
  return {
    schemaVersion: "1.0",
    evidenceDigest: digest,
    generatedAt,
    scope,
    facts,
    pendingClaims: ["Quality", "Final OEE"],
    policy: {
      calculationsAllowed: false,
      rawRecordsIncluded: false,
      evidenceReferencesRequired: true,
    },
  };
}

function statement(
  text: string,
  ...evidenceIds: string[]
): EvidenceBackedStatement {
  return { text, evidenceIds };
}

function factById(
  evidence: VerifiedManagementEvidence,
  id: string,
): ManagementEvidenceFact {
  const result = evidence.facts.find((item) => item.id === id);
  if (!result) throw new Error(`Missing management evidence: ${id}`);
  return result;
}

function factsByCategory(
  evidence: VerifiedManagementEvidence,
  category: ManagementEvidenceCategory,
): ManagementEvidenceFact[] {
  return evidence.facts.filter((item) => item.category === category);
}

export function buildDeterministicManagementSummary(
  evidence: VerifiedManagementEvidence,
  generatedAt = new Date().toISOString(),
): ManagementSummary {
  const output = factById(evidence, "production.output");
  const target = factById(evidence, "production.target");
  const attainment = factById(evidence, "production.attainment");
  const productionLoss = factById(evidence, "production.loss");
  const availability = factById(evidence, "oee.availability");
  const performance = factById(evidence, "oee.performance");
  const downtime = factById(evidence, "downtime.hours");
  const machineHourLoss = factById(evidence, "downtime.machine_hour_loss");
  const unreported = factById(evidence, "data.unreported_downtime");
  const missingQuality = factById(evidence, "data.missing_quality");
  const errors = factById(evidence, "data.errors");
  const warnings = factById(evidence, "data.warnings");
  const machines = factsByCategory(evidence, "machine_comparison");
  const shifts = factsByCategory(evidence, "shift_comparison");
  const reasons = factsByCategory(evidence, "downtime").filter((item) =>
    item.id.startsWith("downtime.reason_"),
  );
  const topMachine = machines[0];
  const topReason = reasons[0];

  const bottlenecks: EvidenceBackedStatement[] = [];
  if (topMachine) {
    bottlenecks.push(
      statement(
        `The highest-ranked machine bottleneck in the selected scope is shown by the verified machine comparison.`,
        topMachine.id,
      ),
    );
  }
  if (topReason) {
    bottlenecks.push(
      statement(
        "The leading downtime concentration is shown by the verified reason Pareto result.",
        topReason.id,
      ),
    );
  }
  if (!bottlenecks.length) {
    bottlenecks.push(
      statement(
        "No machine or downtime-reason bottleneck can be ranked in the selected scope.",
        "scope.production_records",
        "scope.downtime_events",
      ),
    );
  }

  const dataCaveats = [
    statement(
      `The selected records contain ${errors.display} errors and ${warnings.display} warnings; decisions should account for these findings.`,
      errors.id,
      warnings.id,
    ),
    statement(
      `${unreported.display} downtime events lack a reported reason.`,
      unreported.id,
    ),
    statement(
      `${missingQuality.display} production records have missing quality entries.`,
      missingQuality.id,
    ),
    statement(
      "Official Quality and Final OEE remain excluded from this summary.",
      "pending.quality",
      "pending.final_oee",
    ),
  ];

  const recommendations: ManagementRecommendation[] = [];
  if (topMachine) {
    recommendations.push({
      priority: "high",
      text: "Review the leading machine bottleneck first and verify its largest stoppages with the production team.",
      evidenceIds: [topMachine.id],
    });
  }
  if (topReason) {
    recommendations.push({
      priority: "high",
      text: "Assign an owner and corrective action to the leading downtime-reason concentration.",
      evidenceIds: [topReason.id],
    });
  }
  if (Number(unreported.value) > 0) {
    recommendations.push({
      priority: "medium",
      text: "Complete missing downtime reasons before using reason-level trends for management decisions.",
      evidenceIds: [unreported.id],
    });
  }
  if (Number(errors.value) > 0 || Number(warnings.value) > 0) {
    recommendations.push({
      priority: "medium",
      text: "Resolve the highest-volume data-quality findings and then regenerate the report.",
      evidenceIds: [errors.id, warnings.id],
    });
  }
  if (!recommendations.length) {
    recommendations.push({
      priority: "low",
      text: "Continue monitoring production, downtime and data-quality evidence for changes.",
      evidenceIds: [output.id, downtime.id],
    });
  }

  return {
    source: "deterministic",
    model: null,
    evidenceDigest: evidence.evidenceDigest,
    generatedAt,
    title: "Verified MMS management brief",
    executiveSummary: [
      statement(
        `Production reached ${output.display} against a target of ${target.display}, with ${attainment.display} target attainment.`,
        output.id,
        target.id,
        attainment.id,
      ),
      statement(
        `Verified Availability is ${availability.display} and Performance is ${performance.display}.`,
        availability.id,
        performance.id,
      ),
      statement(
        `Long downtime is ${downtime.display}, with calculated machine-hour loss of ${machineHourLoss.display}.`,
        downtime.id,
        machineHourLoss.id,
      ),
    ],
    productionLosses: [
      statement(
        `Calculated production loss for the selected scope is ${productionLoss.display}.`,
        productionLoss.id,
      ),
      ...(machines.slice(0, 3).map((machine) =>
        statement(
          "The verified machine comparison provides the supporting production-loss and target context.",
          machine.id,
        ),
      )),
    ],
    comparisons: [
      ...machines.slice(0, 3).map((machine) =>
        statement("Verified machine comparison.", machine.id),
      ),
      ...shifts.slice(0, 3).map((shift) =>
        statement("Verified shift comparison.", shift.id),
      ),
    ],
    bottlenecks,
    dataCaveats,
    recommendations,
    pendingClaims: ["Quality", "Final OEE"],
  };
}

export function managementEvidenceMap(
  evidence: VerifiedManagementEvidence,
): Map<string, ManagementEvidenceFact> {
  return new Map(evidence.facts.map((item) => [item.id, item]));
}
