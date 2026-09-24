import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { runRonCycle } from "@/lib/ron/cycle";
import { loadRonState, saveRonPrefs } from "@/lib/ron/memory";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["auto", "watch"]).optional(),
  /** Run one work cycle now */
  run: z.boolean().optional(),
  force: z.boolean().optional(),
});

/** RON agent status for the floating red robot UI. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }
  try {
    const state = await loadRonState(auth.supabase, auth.user.id);
    return NextResponse.json({
      ok: true,
      agent: "ron",
      name: "RON",
      blurb:
        "Money machine · Keepa → rank ROI → pack → Facebook. Trabaja solo mientras dormís.",
      state,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "RON unavailable";
    if (/ron_agent_state|schema cache|does not exist/i.test(msg)) {
      return NextResponse.json({
        ok: true,
        agent: "ron",
        name: "RON",
        needsMigration: true,
        state: {
          enabled: false,
          mode: "auto",
          statusMessage: "Aplicá la migración ron_agent_state en Supabase",
          lastRunAt: null,
          lastPostAt: null,
          lastError: null,
          postsToday: 0,
          learning: {
            niches: {},
            formats: { ads: 1, carousel: 1.2, vitrina: 1.4 },
            asins: {},
            strategies: {
              velocity: 1.2,
              amazon_oos: 1.1,
              price_drop: 1.15,
              seller_vacuum: 1.05,
              rising_price: 1,
              hot_deals: 1.25,
            },
            clicksSeen: 0,
            cycles: 0,
          },
          activity: [],
          working: false,
        },
      });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Enable / disable / run a cycle. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await request.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "Invalid RON payload" }, { status: 400 });
  }

  if (parsed.enabled != null || parsed.mode) {
    await saveRonPrefs(auth.supabase, auth.user.id, {
      enabled: parsed.enabled,
      mode: parsed.mode,
      statusMessage: parsed.enabled
        ? "Encendido · RON trabaja por vos"
        : undefined,
    });
  }

  if (parsed.run) {
    // Ensure enabled when manually forcing a cycle with force:true
    if (parsed.force && parsed.enabled !== false) {
      await saveRonPrefs(auth.supabase, auth.user.id, {
        enabled: true,
        mode: "auto",
        statusMessage: "Trabajando · ciclo manual…",
      });
    }
    const result = await runRonCycle(auth.supabase, {
      userId: auth.user.id,
      force: Boolean(parsed.force),
      // Cycle auto-forces Keepa only when the ledger is empty
      forceScan: false,
    });
    return NextResponse.json({
      agent: "ron",
      ...result,
    });
  }

  const state = await loadRonState(auth.supabase, auth.user.id);
  return NextResponse.json({ ok: true, agent: "ron", state });
}
