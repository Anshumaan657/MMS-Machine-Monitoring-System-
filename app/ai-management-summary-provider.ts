import {
  buildDeterministicManagementSummary,
  type EvidenceBackedStatement,
  type ManagementRecommendation,
  type ManagementSummary,
  type VerifiedManagementEvidence,
} from "./management-summary-engine.ts";

export type ManagementSummaryAiConfig = {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  fetchImplementation?: typeof fetch;
};

const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "executiveSummary",
    "productionLosses",
    "comparisons",
    "bottlenecks",
    "dataCaveats",
    "recommendations",
  ],
  properties: {
    title: { type: "string" },
    executiveSummary: { $ref: "#/$defs/statements" },
    productionLosses: { $ref: "#/$defs/statements" },
    comparisons: { $ref: "#/$defs/statements" },
    bottlenecks: { $ref: "#/$defs/statements" },
    dataCaveats: { $ref: "#/$defs/statements" },
    recommendations: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "text", "evidenceIds"],
        properties: {
          priority: { type: "string", enum: ["high", "medium", "low"] },
          text: { type: "string" },
          evidenceIds: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string" },
          },
        },
      },
    },
  },
  $defs: {
    statements: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidenceIds"],
        properties: {
          text: { type: "string" },
          evidenceIds: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string" },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_INSTRUCTIONS = `You narrate verified MMS evidence for management.
Rules:
- Use only the supplied evidence facts and their existing rankings.
- Never calculate, estimate, transform, compare, total, average, or infer a figure.
- Never write any digit, number, percentage, currency amount, date, duration, machine ID, shift ID, or quantity in prose. The application renders exact evidence separately.
- Cite one or more supplied evidence IDs for every statement and recommendation.
- Do not introduce operational facts not present in the evidence.
- Keep Quality and Final OEE out of all performance claims.
- State uncertainty when evidence is marked caveat or pending.
- Recommendations must identify an action supported by cited evidence.
- Be concise and use plain management language.`;

type RawAiSummary = {
  title: unknown;
  executiveSummary: unknown;
  productionLosses: unknown;
  comparisons: unknown;
  bottlenecks: unknown;
  dataCaveats: unknown;
  recommendations: unknown;
};

function extractResponseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{ type?: unknown; text?: unknown }>;
    }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const output of response.output ?? []) {
    for (const content of output.content ?? []) {
      if (
        (content.type === "output_text" || content.type == null) &&
        typeof content.text === "string"
      ) {
        return content.text;
      }
    }
  }
  return null;
}

function assertCleanText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`AI summary ${field} must be non-empty text.`);
  }
  if (/\d/.test(value)) {
    throw new Error(
      `AI summary ${field} introduced a numeric claim; deterministic fallback required.`,
    );
  }
  return value.trim();
}

function parseStatements(
  value: unknown,
  field: string,
  validEvidenceIds: Set<string>,
): EvidenceBackedStatement[] {
  if (!Array.isArray(value) || value.length > 5) {
    throw new Error(`AI summary ${field} is invalid.`);
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`AI summary ${field}[${index}] is invalid.`);
    }
    const candidate = item as { text?: unknown; evidenceIds?: unknown };
    if (
      !Array.isArray(candidate.evidenceIds) ||
      candidate.evidenceIds.length < 1 ||
      candidate.evidenceIds.length > 4 ||
      candidate.evidenceIds.some(
        (id) => typeof id !== "string" || !validEvidenceIds.has(id),
      )
    ) {
      throw new Error(
        `AI summary ${field}[${index}] cites unsupported evidence.`,
      );
    }
    return {
      text: assertCleanText(candidate.text, `${field}[${index}].text`),
      evidenceIds: candidate.evidenceIds as string[],
    };
  });
}

export function validateAiManagementSummary(
  value: unknown,
  evidence: VerifiedManagementEvidence,
  model: string,
  generatedAt = new Date().toISOString(),
): ManagementSummary {
  if (!value || typeof value !== "object") {
    throw new Error("AI summary response is not an object.");
  }
  const candidate = value as RawAiSummary;
  const validIds = new Set(evidence.facts.map((item) => item.id));
  const recommendations = parseStatements(
    candidate.recommendations,
    "recommendations",
    validIds,
  ).map((recommendation, index) => {
    const rawPriority = (
      candidate.recommendations as Array<{ priority?: unknown }>
    )[index]?.priority;
    if (!["high", "medium", "low"].includes(String(rawPriority))) {
      throw new Error(`AI recommendation ${index} has an invalid priority.`);
    }
    return {
      ...recommendation,
      priority: rawPriority as ManagementRecommendation["priority"],
    };
  });
  return {
    source: "ai",
    model,
    evidenceDigest: evidence.evidenceDigest,
    generatedAt,
    title: assertCleanText(candidate.title, "title"),
    executiveSummary: parseStatements(
      candidate.executiveSummary,
      "executiveSummary",
      validIds,
    ),
    productionLosses: parseStatements(
      candidate.productionLosses,
      "productionLosses",
      validIds,
    ),
    comparisons: parseStatements(
      candidate.comparisons,
      "comparisons",
      validIds,
    ),
    bottlenecks: parseStatements(
      candidate.bottlenecks,
      "bottlenecks",
      validIds,
    ),
    dataCaveats: parseStatements(
      candidate.dataCaveats,
      "dataCaveats",
      validIds,
    ),
    recommendations,
    pendingClaims: ["Quality", "Final OEE"],
  };
}

export async function generateAiManagementSummary(
  evidence: VerifiedManagementEvidence,
  config: ManagementSummaryAiConfig = {},
): Promise<ManagementSummary> {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const model = config.model?.trim() || "gpt-5.6-sol";
  const request = config.fetchImplementation ?? fetch;
  const response = await request(
    config.endpoint ?? "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: SYSTEM_INSTRUCTIONS,
        input: JSON.stringify(evidence),
        text: {
          format: {
            type: "json_schema",
            name: "mms_management_summary",
            strict: true,
            schema: SUMMARY_SCHEMA,
          },
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`AI summary request failed with status ${response.status}.`);
  }
  const payload = await response.json();
  const responseText = extractResponseText(payload);
  if (!responseText) {
    throw new Error("AI summary response did not contain structured output.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error("AI summary response was not valid JSON.");
  }
  return validateAiManagementSummary(parsed, evidence, model);
}

export async function generateManagementSummaryWithFallback(
  evidence: VerifiedManagementEvidence,
  config: ManagementSummaryAiConfig = {},
): Promise<{ summary: ManagementSummary; fallbackReason: string | null }> {
  try {
    return {
      summary: await generateAiManagementSummary(evidence, config),
      fallbackReason: null,
    };
  } catch (error) {
    return {
      summary: buildDeterministicManagementSummary(evidence),
      fallbackReason:
        error instanceof Error
          ? error.message
          : "AI summary generation failed.",
    };
  }
}
