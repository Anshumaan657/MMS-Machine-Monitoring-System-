import { NextResponse } from "next/server";
import { resolveCalculationPolicy } from "../../calculation-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const policy = resolveCalculationPolicy();
  return NextResponse.json(
    {
      status: "ok",
      service: "mms-intelligence",
      timestamp: new Date().toISOString(),
      calculationPolicy: {
        id: policy.id,
        version: policy.version,
        status: policy.status,
      },
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
