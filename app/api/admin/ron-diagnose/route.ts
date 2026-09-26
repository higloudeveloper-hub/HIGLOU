import { NextResponse } from "next/server";
import { z } from "zod";
import { HIGLOU_FACEBOOK } from "@/lib/facebook/permanent-token";
import { runRonCycle } from "@/lib/ron/cycle";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  appSecret: z.string().min(8).max(200),
  userEmail: z.string().email().optional(),
  force: z.boolean().optional(),
});

/**
 * Owner diagnose: run one RON cycle and return the real error/skip reason.
 * Auth = Meta App Secret for Deals Deals.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send { appSecret }" }, { status: 400 });
  }

  const appId = HIGLOU_FACEBOOK.appId;
  const appTok = `${appId}|${parsed.appSecret.trim()}`;
  const appUrl = new URL("https://graph.facebook.com/v21.0/app");
  appUrl.searchParams.set("access_token", appTok);
  const appRes = await fetch(appUrl);
  const appBody = (await appRes.json().catch(() => null)) as {
    id?: string;
    error?: { message?: string };
  } | null;
  if (!appRes.ok || String(appBody?.id || "") !== appId) {
    return NextResponse.json(
      { error: appBody?.error?.message || "App Secret inválido" },
      { status: 403 },
    );
  }

  const wantEmail = String(
    parsed.userEmail || "higloudeveloper@gmail.com",
  )
    .trim()
    .toLowerCase();
  const owners = (process.env.HIGLOU_OWNER_EMAILS || "higloudeveloper@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!owners.includes(wantEmail)) {
    return NextResponse.json({ error: "userEmail no es owner" }, { status: 403 });
  }

  const admin = createAdminClient();
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const match = (listed.data?.users || []).find(
    (u) => String(u.email || "").toLowerCase() === wantEmail,
  );
  if (!match?.id) {
    return NextResponse.json(
      { error: `No hay usuario Auth para ${wantEmail}` },
      { status: 404 },
    );
  }

  const result = await runRonCycle(admin, {
    userId: match.id,
    force: parsed.force !== false,
    forceScan: false,
  });

  return NextResponse.json({
    ok: result.ok,
    published: result.published,
    skipped: result.skipped,
    error: result.error,
    postUrl: result.postUrl || null,
    statusMessage: result.state.statusMessage,
    lastError: result.state.lastError,
    recentActivity: (result.state.activity || []).slice(0, 5),
  });
}
