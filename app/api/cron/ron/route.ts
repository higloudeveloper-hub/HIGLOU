import { NextResponse } from "next/server";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import { createClient as createUserClient } from "@supabase/supabase-js";
import { runRonCycle } from "@/lib/ron/cycle";
import { listEnabledRonUsers } from "@/lib/ron/memory";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron tick for RON — publishes while you sleep.
 * Secure with Authorization: Bearer $CRON_SECRET (Vercel Cron).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.RON_CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const urlToken = new URL(request.url).searchParams.get("secret") || "";
  if (!secret || (token !== secret && urlToken !== secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }

  const admin = createAdminClient();

  // One-shot: wipe ghost listings + Find Winners before RON works
  let purge: unknown = null;
  try {
    const { maybeAutoPurgeListingsWinners } = await import(
      "@/lib/admin/purge-listings-winners"
    );
    purge = await maybeAutoPurgeListingsWinners(admin);
  } catch {
    /* purge optional */
  }

  const userIds = await listEnabledRonUsers(admin);
  const results: Array<{
    userId: string;
    ok: boolean;
    published?: boolean;
    skipped?: string;
    error?: string;
  }> = [];

  // Process a few users per tick to stay under timeout
  for (const userId of userIds.slice(0, 8)) {
    try {
      // Prefer user-scoped client when possible; admin works for RLS-bypass tables
      const supabase =
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
          ? createUserClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL,
              process.env.SUPABASE_SERVICE_ROLE_KEY,
              { auth: { persistSession: false, autoRefreshToken: false } },
            )
          : admin;

      const cycle = await runRonCycle(supabase, { userId, force: false });
      results.push({
        userId,
        ok: cycle.ok,
        published: cycle.published,
        skipped: cycle.skipped,
        error: cycle.error,
      });
    } catch (err) {
      results.push({
        userId,
        ok: false,
        error: err instanceof Error ? err.message : "RON cycle failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    agent: "ron",
    scanned: userIds.length,
    ran: results.length,
    results,
    purge,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
