import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { CREDIT_ACTIONS, CREDIT_PACKS } from "@/lib/credits/costs";
import { PRO_FEATURES, PRO_PLAN } from "@/lib/credits/pro";
import {
  claimWelcomeBonus,
  getCreditEntitlements,
  getCreditWallet,
  listCreditLedger,
  markCreditsOnboarded,
  rechargeCreditsMock,
  unlockProFeature,
  unlockProPlanWithCredits,
} from "@/lib/credits/wallet";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      wallet: {
        balance: 0,
        lifetimeGranted: 0,
        lifetimeSpent: 0,
        onboarded: false,
        welcomeBonusClaimed: false,
        ready: false,
        note: "Supabase required",
      },
      packs: CREDIT_PACKS,
      actions: CREDIT_ACTIONS,
      entitlements: { plan: "free", unlockedFeatures: [] },
      pro: { features: PRO_FEATURES, plan: PRO_PLAN },
      ledger: [],
    });
  }

  const wallet = await getCreditWallet(auth.user.id);
  const entitlements = await getCreditEntitlements(auth.user.id);
  const ledger = await listCreditLedger(auth.user.id, 15);
  return NextResponse.json({
    wallet,
    packs: CREDIT_PACKS,
    actions: CREDIT_ACTIONS,
    entitlements,
    pro: { features: PRO_FEATURES, plan: PRO_PLAN },
    ledger,
  });
}

const bodySchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("welcome") }),
  z.object({ intent: z.literal("onboarded") }),
  z.object({
    intent: z.literal("recharge"),
    packId: z.enum(["starter", "grow", "pro"]),
  }),
  z.object({
    intent: z.literal("unlock_feature"),
    featureId: z.enum([
      "facebook_carousel",
      "cheap_source",
      "batch_import",
      "ai_analyze",
    ]),
  }),
  z.object({ intent: z.literal("unlock_pro") }),
]);

/**
 * Credits mutations.
 * `recharge` is mock until Stripe Checkout + webhook are wired —
 * same grant path will be called from the Stripe webhook.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      {
        error:
          "Send { intent: welcome|onboarded|recharge|unlock_feature|unlock_pro }",
      },
      { status: 400 },
    );
  }

  if (parsed.intent === "welcome") {
    const result = await claimWelcomeBonus(auth.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  if (parsed.intent === "onboarded") {
    const wallet = await markCreditsOnboarded(auth.user.id);
    return NextResponse.json({ ok: true, wallet });
  }

  if (parsed.intent === "unlock_feature") {
    const feature = PRO_FEATURES[parsed.featureId];
    const result = await unlockProFeature({
      userId: auth.user.id,
      featureId: feature.id,
      cost: feature.unlockCredits,
      title: feature.title,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          balance: result.balance,
          needed: result.needed,
          rechargeHref: "/credits",
        },
        { status: result.code === "insufficient" ? 402 : 400 },
      );
    }
    return NextResponse.json(result);
  }

  if (parsed.intent === "unlock_pro") {
    const result = await unlockProPlanWithCredits({
      userId: auth.user.id,
      cost: PRO_PLAN.unlockCredits,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          balance: result.balance,
          needed: result.needed,
          rechargeHref: "/credits",
        },
        { status: result.code === "insufficient" ? 402 : 400 },
      );
    }
    return NextResponse.json(result);
  }

  const result = await rechargeCreditsMock({
    userId: auth.user.id,
    packId: parsed.packId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const entitlements = await getCreditEntitlements(auth.user.id);
  return NextResponse.json({
    ...result,
    entitlements,
    stripe: {
      mode: "mock",
      note: "Stripe Checkout se conecta después — mismo grant vía webhook.",
    },
  });
}
