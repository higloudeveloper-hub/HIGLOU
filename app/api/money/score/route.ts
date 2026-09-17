import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getMonetizationFlags, isMoneyEngineEnabled } from "@/lib/monetization/flags";
import { calculateMoneyScore } from "@/lib/monetization/money-score";
import { getMonetizationRecommendation } from "@/lib/monetization/decision-engine";
import type { MonetizationInput } from "@/lib/monetization/types";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  ebayPrice: z.number().nonnegative().nullable().optional(),
  amazonPrice: z.number().nonnegative().nullable().optional(),
  cost: z.number().nonnegative().nullable().optional(),
  amazonFees: z.number().nonnegative().nullable().optional(),
  ebayFees: z.number().nonnegative().nullable().optional(),
  shipping: z.number().nonnegative().nullable().optional(),
  packing: z.number().nonnegative().nullable().optional(),
  asin: z.string().max(20).optional(),
  demandScore: z.number().optional().nullable(),
  sellerCount: z.number().int().optional().nullable(),
  quantity: z.number().int().optional().nullable(),
  amazonEligibility: z
    .enum([
      "SELLABLE",
      "APPROVAL_REQUIRED",
      "RESTRICTED",
      "CONDITION_RESTRICTED",
      "UNKNOWN",
      "API_ERROR",
    ])
    .optional()
    .nullable(),
});

export async function POST(request: Request) {
  if (!isMoneyEngineEnabled()) {
    return NextResponse.json(
      { enabled: false, error: "Money Engine is disabled" },
      { status: 404 },
    );
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!getMonetizationFlags().moneyScore) {
    return NextResponse.json(
      { enabled: true, score: null, availability: "insufficient", message: "Money Score disabled" },
      { status: 200 },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid score payload" }, { status: 400 });
  }

  const input: MonetizationInput = { ...parsed };
  const decision = getMonetizationRecommendation(input);
  const scored = calculateMoneyScore(input, decision.channels);
  return NextResponse.json({
    enabled: true,
    score: scored.score,
    availability: scored.availability,
    factors: scored.factors,
  });
}
