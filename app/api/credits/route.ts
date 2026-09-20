import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { CREDIT_ACTIONS, CREDIT_PACKS } from "@/lib/credits/costs";
import {
  claimWelcomeBonus,
  getCreditWallet,
  listCreditLedger,
  markCreditsOnboarded,
  rechargeCreditsMock,
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
      ledger: [],
    });
  }

  const wallet = await getCreditWallet(auth.user.id);
  const ledger = await listCreditLedger(auth.user.id, 15);
  return NextResponse.json({
    wallet,
    packs: CREDIT_PACKS,
    actions: CREDIT_ACTIONS,
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
      { error: "Send { intent: welcome|onboarded|recharge }" },
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

  const result = await rechargeCreditsMock({
    userId: auth.user.id,
    packId: parsed.packId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    ...result,
    stripe: {
      mode: "mock",
      note: "Stripe Checkout se conecta después — mismo grant vía webhook.",
    },
  });
}
