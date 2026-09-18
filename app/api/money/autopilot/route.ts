import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import {
  getMonetizationFlags,
  isMoneyEngineEnabled,
} from "@/lib/monetization/flags";
import { runAutopilotOnOpportunities } from "@/lib/monetization/autopilot";
import { logMonetizationEvent } from "@/lib/monetization/observability";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  mode: z.enum(["suggest_only", "queue_ready"]).optional().default("suggest_only"),
  limit: z.number().int().min(1).max(40).optional().default(12),
  opportunityMode: z
    .enum(["amazon", "amazon_to_ebay", "supplier"])
    .optional()
    .default("amazon_to_ebay"),
});

export async function GET() {
  if (!isMoneyEngineEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const flags = getMonetizationFlags();
  return NextResponse.json({
    enabled: flags.autopilot,
    flags,
    description:
      "Autopilot ranks money opportunities across markets Higlou already scans. It does not publish or buy alone.",
    phases: {
      now: "Find + rank + queue (one button)",
      next: "Semi-auto draft import with your confirm",
      later: "Full pilot after enough real P&L learning",
    },
  });
}

export async function POST(request: Request) {
  if (!isMoneyEngineEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const flags = getMonetizationFlags();
  if (!flags.autopilot) {
    return NextResponse.json(
      { error: "Autopilot is disabled (AUTOPILOT_ENABLED)" },
      { status: 404 },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "Invalid autopilot payload" }, { status: 400 });
  }

  let hits: OpportunityProduct[] = [];
  if (isSupabaseConfigured()) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("opportunity_ledger")
        .select("asin, payload, net_profit, title, brand, image_url")
        .eq("user_id", auth.user.id)
        .eq("mode", parsed.opportunityMode)
        .order("net_profit", { ascending: false })
        .limit(80);
      if (!error && data) {
        hits = data
          .map((row) => {
            const payload = (row.payload || {}) as OpportunityProduct;
            if (payload?.asin) return payload;
            return null;
          })
          .filter((h): h is OpportunityProduct => Boolean(h?.asin));
      }
    } catch (error) {
      logMonetizationEvent({
        level: "warn",
        event: "autopilot_ledger_load_failed",
        detail: {
          message: error instanceof Error ? error.message : "unknown",
        },
      });
    }
  }

  const cycle = runAutopilotOnOpportunities(hits, {
    mode: parsed.mode,
    limit: parsed.limit,
  });

  // Best-effort learning persistence (migration required)
  if (isSupabaseConfigured() && cycle.actions.length) {
    try {
      const admin = createAdminClient();
      const rows = cycle.actions.map((action) => ({
        user_id: auth.user.id,
        product_id: null,
        asin: action.asin,
        recommendation: action.recommendation,
        money_score: action.moneyScore,
        confidence: action.confidence,
        payload: {
          title: action.title,
          brand: action.brand,
          imageUrl: action.imageUrl,
          primaryAction: action.primaryAction,
          estimatedProfit: action.estimatedProfit,
          reasons: action.reasons,
          source: "autopilot",
          opportunityMode: parsed.opportunityMode,
        },
        updated_at: new Date().toISOString(),
      }));
      await admin.from("monetization_opportunities").insert(rows);
    } catch (error) {
      logMonetizationEvent({
        level: "warn",
        event: "autopilot_persist_failed",
        detail: {
          message: error instanceof Error ? error.message : "unknown",
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    enabled: true,
    ...cycle,
    emptyHint:
      hits.length === 0
        ? "No saved winners yet — open Find Winners, run a live scan, then press Autopilot again."
        : null,
  });
}
