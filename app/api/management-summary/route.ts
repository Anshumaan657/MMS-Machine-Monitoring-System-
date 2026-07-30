import { NextResponse } from "next/server";
import { generateManagementSummaryWithFallback } from "../../ai-management-summary-provider";
import type { VerifiedManagementEvidence } from "../../management-summary-engine";

export const runtime = "nodejs";

function isVerifiedEvidence(value: unknown): value is VerifiedManagementEvidence {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VerifiedManagementEvidence>;
  return (
    candidate.schemaVersion === "1.1" &&
    typeof candidate.evidenceDigest === "string" &&
    Array.isArray(candidate.facts) &&
    candidate.facts.length <= 80 &&
    candidate.policy?.calculationsAllowed === false &&
    candidate.policy?.rawRecordsIncluded === false &&
    candidate.policy?.evidenceReferencesRequired === true &&
    typeof candidate.calculationPolicy?.id === "string" &&
    typeof candidate.calculationPolicy?.version === "string" &&
    candidate.calculationPolicy?.status === "confirmed" &&
    Array.isArray(candidate.pendingClaims) &&
    candidate.pendingClaims.every((claim) => typeof claim === "string") &&
    candidate.facts.every(
      (fact) =>
        fact != null &&
        typeof fact === "object" &&
        typeof fact.id === "string" &&
        typeof fact.label === "string" &&
        typeof fact.display === "string",
    )
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 128 * 1024) {
    return NextResponse.json(
      { error: "The verified-evidence payload exceeds the safety limit." },
      { status: 413 },
    );
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }
  const evidence =
    payload && typeof payload === "object"
      ? (payload as { evidence?: unknown }).evidence
      : null;
  if (!isVerifiedEvidence(evidence)) {
    return NextResponse.json(
      { error: "A bounded verified-evidence payload is required." },
      { status: 400 },
    );
  }

  const result = await generateManagementSummaryWithFallback(evidence, {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
  });
  return NextResponse.json(result);
}
