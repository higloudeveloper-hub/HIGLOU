import { NextResponse } from "next/server";
import { z } from "zod";
import { saveFacebookConnection } from "@/lib/facebook/connection";
import {
  HIGLOU_FACEBOOK,
  appSecretProof,
} from "@/lib/facebook/permanent-token";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  accessToken: z.string().min(20).max(4000),
  pageId: z.string().min(5).max(40).optional(),
  pageName: z.string().max(120).optional().nullable(),
  appId: z.string().min(5).max(40).optional(),
  appSecret: z.string().min(8).max(200),
  /** Owner email to attach the connection to (default HIGLOU_OWNER_EMAILS[0]) */
  userEmail: z.string().email().optional(),
});

/**
 * One-shot: install a never-expiring Page token for the Higlou owner.
 * Auth = valid Meta App Secret for Deals Deals (verified via Graph),
 * not a Vercel env — so we can finish RON setup without dashboard access.
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
      { error: "Send { accessToken, appSecret }" },
      { status: 400 },
    );
  }

  const appId = String(parsed.appId || HIGLOU_FACEBOOK.appId).trim();
  const appSecret = parsed.appSecret.trim();
  if (appId !== HIGLOU_FACEBOOK.appId) {
    return NextResponse.json({ error: "App ID no coincide con Higlou" }, { status: 403 });
  }

  // Prove App Secret is real for this app
  const probeTok = parsed.accessToken.trim();
  const proof = appSecretProof(probeTok, appSecret);
  const dbgUrl = new URL("https://graph.facebook.com/v21.0/debug_token");
  dbgUrl.searchParams.set("input_token", probeTok);
  dbgUrl.searchParams.set("access_token", `${appId}|${appSecret}`);
  const dbgRes = await fetch(dbgUrl);
  const dbg = (await dbgRes.json().catch(() => null)) as {
    data?: { is_valid?: boolean; type?: string; app_id?: string };
    error?: { message?: string };
  } | null;
  if (!dbgRes.ok || !dbg?.data?.is_valid) {
    return NextResponse.json(
      {
        error:
          dbg?.error?.message ||
          "App Secret inválido o token inválido (debug_token falló).",
      },
      { status: 403 },
    );
  }
  if (String(dbg.data.app_id || "") !== appId) {
    return NextResponse.json(
      { error: "El token no pertenece a la App Deals Deals." },
      { status: 403 },
    );
  }

  // Resolve owner user id
  const admin = createAdminClient();
  const owners = (process.env.HIGLOU_OWNER_EMAILS || "higloudeveloper@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const wantEmail = String(parsed.userEmail || owners[0] || "")
    .trim()
    .toLowerCase();
  if (!wantEmail || !owners.includes(wantEmail)) {
    return NextResponse.json({ error: "userEmail no es owner" }, { status: 403 });
  }

  let userId: string | null = null;
  try {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = (listed.data?.users || []).find(
      (u) => String(u.email || "").toLowerCase() === wantEmail,
    );
    userId = match?.id || null;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "No se pudo listar usuarios de Auth",
      },
      { status: 500 },
    );
  }
  if (!userId) {
    return NextResponse.json(
      { error: `No hay usuario Auth para ${wantEmail}` },
      { status: 404 },
    );
  }

  const saved = await saveFacebookConnection(admin, {
    userId,
    pageId: parsed.pageId || HIGLOU_FACEBOOK.pageId,
    pageName: parsed.pageName || HIGLOU_FACEBOOK.pageName,
    accessToken: probeTok,
    appId,
    appSecret,
  });

  if (!saved.ok) {
    return NextResponse.json(
      { error: saved.error, connection: saved.connection || null },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    userId,
    email: wantEmail,
    connection: {
      connected: saved.connection.connected,
      pageId: saved.connection.pageId,
      pageName: saved.connection.pageName,
      neverExpires: saved.connection.neverExpires,
      tokenExpiresAt: saved.connection.tokenExpiresAt,
      canExtendTokens: saved.connection.canExtendTokens,
    },
    proofPrefix: proof.slice(0, 8),
    note: "Page token permanente instalado para RON.",
  });
}
