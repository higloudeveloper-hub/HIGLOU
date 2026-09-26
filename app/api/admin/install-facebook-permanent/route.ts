import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ensureFacebookPageCredentialsForPublish,
  getFacebookConnectionPublic,
  saveFacebookConnection,
} from "@/lib/facebook/connection";
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
  /** Also restore Amazon Associate tag (RON needs it) */
  associateTag: z.string().min(3).max(64).optional(),
});

async function resolveOwnerUserId(
  wantEmail: string,
): Promise<
  { ok: true; userId: string } | { ok: false; error: string; status: number }
> {
  const owners = (process.env.HIGLOU_OWNER_EMAILS || "higloudeveloper@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!wantEmail || !owners.includes(wantEmail)) {
    return { ok: false, error: "userEmail no es owner", status: 403 };
  }
  try {
    const admin = createAdminClient();
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = (listed.data?.users || []).find(
      (u) => String(u.email || "").toLowerCase() === wantEmail,
    );
    if (!match?.id) {
      return {
        ok: false,
        error: `No hay usuario Auth para ${wantEmail}`,
        status: 404,
      };
    }
    return { ok: true, userId: match.id };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "No se pudo listar usuarios de Auth",
      status: 500,
    };
  }
}

async function assertAppSecret(
  appId: string,
  appSecret: string,
  probeTok: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (appId !== HIGLOU_FACEBOOK.appId) {
    return { ok: false, error: "App ID no coincide con Higlou" };
  }
  const dbgUrl = new URL("https://graph.facebook.com/v21.0/debug_token");
  dbgUrl.searchParams.set("input_token", probeTok);
  dbgUrl.searchParams.set("access_token", `${appId}|${appSecret}`);
  const dbgRes = await fetch(dbgUrl);
  const dbg = (await dbgRes.json().catch(() => null)) as {
    data?: { is_valid?: boolean; type?: string; app_id?: string };
    error?: { message?: string };
  } | null;
  if (!dbgRes.ok || !dbg?.data?.is_valid) {
    return {
      ok: false,
      error:
        dbg?.error?.message ||
        "App Secret inválido o token inválido (debug_token falló).",
    };
  }
  if (String(dbg.data.app_id || "") !== appId) {
    return { ok: false, error: "El token no pertenece a la App Deals Deals." };
  }
  return { ok: true };
}

/** Diagnose: can RON load Page credentials for the owner? */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }
  const url = new URL(request.url);
  const appSecret = String(url.searchParams.get("appSecret") || "").trim();
  const appId = String(
    url.searchParams.get("appId") || HIGLOU_FACEBOOK.appId,
  ).trim();
  const userEmail = String(
    url.searchParams.get("userEmail") || "higloudeveloper@gmail.com",
  )
    .trim()
    .toLowerCase();
  if (appSecret.length < 8) {
    return NextResponse.json({ error: "Pass ?appSecret=…" }, { status: 400 });
  }

  const appTok = `${appId}|${appSecret}`;
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

  const owner = await resolveOwnerUserId(userEmail);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  const admin = createAdminClient();
  const pub = await getFacebookConnectionPublic(admin, owner.userId);
  const ensured = await ensureFacebookPageCredentialsForPublish(
    admin,
    owner.userId,
    userEmail,
  );

  let graphMe: unknown = null;
  if (ensured.ok) {
    const meUrl = new URL("https://graph.facebook.com/v21.0/me");
    meUrl.searchParams.set("fields", "id,name");
    meUrl.searchParams.set("access_token", ensured.creds.accessToken);
    const meRes = await fetch(meUrl);
    graphMe = await meRes.json().catch(() => null);
  }

  return NextResponse.json({
    ok: ensured.ok,
    userId: owner.userId,
    connection: {
      connected: pub.connected,
      pageId: pub.pageId,
      pageName: pub.pageName,
      neverExpires: pub.neverExpires,
      lastError: pub.lastError,
      canExtendTokens: pub.canExtendTokens,
      encryptionReady: pub.encryptionReady,
    },
    ensure: ensured.ok
      ? {
          pageId: ensured.creds.pageId,
          pageName: ensured.creds.pageName,
          tokenLen: ensured.creds.accessToken.length,
        }
      : { error: ensured.error },
    graphMe,
  });
}

/**
 * One-shot: install a never-expiring Page token for the Higlou owner.
 * Auth = valid Meta App Secret for Deals Deals (verified via Graph).
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
  const probeTok = parsed.accessToken.trim();
  const auth = await assertAppSecret(appId, appSecret, probeTok);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const wantEmail = String(
    parsed.userEmail ||
      (process.env.HIGLOU_OWNER_EMAILS || "higloudeveloper@gmail.com")
        .split(",")[0] ||
      "",
  )
    .trim()
    .toLowerCase();
  const owner = await resolveOwnerUserId(wantEmail);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  const admin = createAdminClient();
  const saved = await saveFacebookConnection(admin, {
    userId: owner.userId,
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

  const ensured = await ensureFacebookPageCredentialsForPublish(
    admin,
    owner.userId,
    wantEmail,
  );

  let associateTagSaved: string | null = null;
  const tag = String(parsed.associateTag || "higlou-20").trim();
  if (tag) {
    const now = new Date().toISOString();
    const { data: existing } = await admin
      .from("money_machine_settings")
      .select("user_id")
      .eq("user_id", owner.userId)
      .maybeSingle();
    if (existing) {
      const { error } = await admin
        .from("money_machine_settings")
        .update({
          associate_tag: tag,
          associate_marketplace: "US",
          updated_at: now,
        })
        .eq("user_id", owner.userId);
      if (!error) associateTagSaved = tag;
    } else {
      const { error } = await admin.from("money_machine_settings").insert({
        user_id: owner.userId,
        associate_tag: tag,
        associate_marketplace: "US",
        money_engine: true,
        affiliate_engine: true,
        smart_links: true,
        money_score: true,
        autopilot: true,
        updated_at: now,
      });
      if (!error) associateTagSaved = tag;
    }
  }

  // Ensure owner has Keepa scan credits so RON is not stuck on empty ledger
  let creditsBalance: number | null = null;
  try {
    const { claimWelcomeBonus, getCreditWallet } = await import(
      "@/lib/credits/wallet"
    );
    await claimWelcomeBonus(owner.userId);
    const wallet = await getCreditWallet(owner.userId);
    if (wallet.balance < 20) {
      const topUp = 100;
      const next = wallet.balance + topUp;
      await admin
        .from("credit_wallets")
        .update({
          balance: next,
          lifetime_granted: (wallet.lifetimeGranted || 0) + topUp,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", owner.userId);
      await admin.from("credit_ledger").insert({
        user_id: owner.userId,
        delta: topUp,
        balance_after: next,
        action: "admin_topup",
        reason: "RON unblock · Keepa scan credits",
        meta: { agent: "ron", source: "install-facebook-permanent" },
      });
      creditsBalance = next;
    } else {
      creditsBalance = wallet.balance;
    }
  } catch {
    creditsBalance = null;
  }

  return NextResponse.json({
    ok: true,
    userId: owner.userId,
    email: wantEmail,
    connection: {
      connected: saved.connection.connected,
      pageId: saved.connection.pageId,
      pageName: saved.connection.pageName,
      neverExpires: saved.connection.neverExpires,
      tokenExpiresAt: saved.connection.tokenExpiresAt,
      canExtendTokens: saved.connection.canExtendTokens,
    },
    ensureOk: ensured.ok,
    ensureError: ensured.ok ? null : ensured.error,
    associateTag: associateTagSaved,
    creditsBalance,
    proofPrefix: appSecretProof(probeTok, appSecret).slice(0, 8),
    note: "Page token permanente instalado para RON.",
  });
}
