import { NextResponse } from "next/server";
import { z } from "zod";
import { HIGLOU_FACEBOOK } from "@/lib/facebook/permanent-token";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  appSecret: z.string().min(8).max(200),
  associateTag: z.string().min(3).max(64).default("higlou-20"),
  userEmail: z.string().email().optional(),
});

/**
 * Restore Amazon Associate tag for the Higlou owner (RON needs it to publish).
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
    return NextResponse.json(
      { error: "Send { appSecret, associateTag? }" },
      { status: 400 },
    );
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

  const tag = parsed.associateTag.trim();
  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from("money_machine_settings")
    .select("user_id")
    .eq("user_id", match.id)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("money_machine_settings")
      .update({
        associate_tag: tag,
        associate_marketplace: "US",
        updated_at: now,
      })
      .eq("user_id", match.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await admin.from("money_machine_settings").insert({
      user_id: match.id,
      associate_tag: tag,
      associate_marketplace: "US",
      money_engine: true,
      affiliate_engine: true,
      smart_links: true,
      money_score: true,
      autopilot: true,
      updated_at: now,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    userId: match.id,
    email: wantEmail,
    associateTag: tag,
    note: "Associate tag restaurado · RON ya puede publicar con comisión.",
  });
}
