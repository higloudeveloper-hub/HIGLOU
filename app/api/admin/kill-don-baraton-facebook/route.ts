import { NextResponse } from "next/server";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import { decryptFacebookToken } from "@/lib/facebook/config";
import { revokeFacebookAccessToken } from "@/lib/facebook/revoke";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-shot kill: revoke Facebook tokens Higlou knows about so shared copies
 * (Telegram / Don Baratón) that reused the same Page token stop publishing.
 *
 * Auth: Authorization: Bearer <KILL_DON_BARATON_FB_SECRET>
 * or ?secret=
 */
export async function POST(request: Request) {
  const expected = String(process.env.KILL_DON_BARATON_FB_SECRET || "").trim();
  if (!expected || expected.length < 16) {
    return NextResponse.json(
      { error: "KILL_DON_BARATON_FB_SECRET not configured" },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") || "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const q = new URL(request.url).searchParams.get("secret") || "";
  if (bearer !== expected && q !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Array<{ source: string; ok: boolean; detail: string }> = [];
  const tokens = new Map<string, string>();

  const boot = String(process.env.FACEBOOK_BOOTSTRAP_PAGE_TOKEN || "").trim();
  if (boot) tokens.set("bootstrap", boot);

  if (isSupabaseConfigured()) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("facebook_connections")
        .select("user_id, access_token_enc, page_id");
      for (const row of data || []) {
        try {
          const tok = decryptFacebookToken(String(row.access_token_enc || ""));
          if (tok) tokens.set(`db:${row.user_id}`, tok);
        } catch {
          results.push({
            source: `db:${row.user_id}`,
            ok: false,
            detail: "decrypt failed",
          });
        }
      }

      // Clear stored connections so Higlou won't keep using them
      await admin.from("facebook_connections").delete().neq("user_id", "00000000-0000-0000-0000-000000000000");

      // Wipe storage fallbacks
      try {
        const { data: files } = await admin.storage
          .from("higlou-secrets")
          .list("facebook", { limit: 100 });
        if (files?.length) {
          await admin.storage
            .from("higlou-secrets")
            .remove(files.map((f) => `facebook/${f.name}`));
        }
      } catch {
        // optional
      }
    } catch (e) {
      results.push({
        source: "supabase",
        ok: false,
        detail: e instanceof Error ? e.message : "supabase error",
      });
    }
  }

  for (const [source, tok] of tokens) {
    const r = await revokeFacebookAccessToken(tok);
    results.push({ source, ok: r.ok, detail: r.detail });
  }

  return NextResponse.json({
    ok: true,
    donBaratonFromHiglou: "killed (getDonBaratonConfig.enabled=false)",
    tokensTried: tokens.size,
    results,
    next: [
      "Remove FACEBOOK_BOOTSTRAP_PAGE_* from Higlou Vercel",
      "Remove KILL_DON_BARATON_FB_SECRET from Vercel",
      "If Telegram still posts, its token is a DIFFERENT string — open Meta Business → Page settings → revoke connected apps / generate new Page token and update ONLY Higlou",
    ],
  });
}
