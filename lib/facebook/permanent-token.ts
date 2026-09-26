import { createHmac } from "crypto";
import {
  facebookAppId,
  facebookAppSecret,
} from "@/lib/facebook/token-exchange";

/** Higlou Business + Page + Deals Deals app (public IDs). */
export const HIGLOU_FACEBOOK = {
  businessId: "2898719580497172",
  pageId: "1079254478615173",
  pageName: "Higlou",
  appId: "1387610726544790",
  /** System user "RON Higlou Publisher" — Page already assigned */
  systemUserId: "122095632627496907",
} as const;

export type FacebookAppCreds = {
  appId: string;
  appSecret: string;
};

export function resolveFacebookAppCreds(
  override?: Partial<FacebookAppCreds> | null,
): FacebookAppCreds | null {
  const appId = String(
    override?.appId || facebookAppId() || HIGLOU_FACEBOOK.appId || "",
  ).trim();
  const appSecret = String(
    override?.appSecret || facebookAppSecret() || "",
  ).trim();
  if (appId.length < 5 || appSecret.length < 8) return null;
  return { appId, appSecret };
}

export function appSecretProof(
  accessToken: string,
  appSecret: string,
): string {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

/**
 * Mint a never-expiring System User → Page token.
 * Requires App Secret once (appsecret_proof). Page must already be assigned
 * to the system user (done for Higlou / RON Higlou Publisher).
 */
export async function mintNeverExpiringPageToken(opts: {
  userAccessToken: string;
  appId?: string;
  appSecret?: string;
  pageId?: string;
  systemUserId?: string;
}): Promise<
  | {
      ok: true;
      pageId: string;
      pageName: string | null;
      accessToken: string;
      systemUserToken: string;
      neverExpires: true;
      note: string;
    }
  | { ok: false; error: string }
> {
  const creds = resolveFacebookAppCreds({
    appId: opts.appId,
    appSecret: opts.appSecret,
  });
  if (!creds) {
    return {
      ok: false,
      error:
        "Falta el App Secret de Meta (Deals Deals). Pegalo una vez en Settings → Facebook.",
    };
  }

  const userTok = opts.userAccessToken.trim();
  if (userTok.length < 20) {
    return { ok: false, error: "User token inválido." };
  }

  const systemUserId =
    String(opts.systemUserId || HIGLOU_FACEBOOK.systemUserId).trim() ||
    HIGLOU_FACEBOOK.systemUserId;
  const pageId =
    String(opts.pageId || HIGLOU_FACEBOOK.pageId).replace(/\D/g, "") ||
    HIGLOU_FACEBOOK.pageId;

  const proof = appSecretProof(userTok, creds.appSecret);
  const tokenUrl = new URL(
    `https://graph.facebook.com/v21.0/${systemUserId}/access_tokens`,
  );
  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      business_app: creds.appId,
      scope: [
        "pages_manage_posts",
        "pages_read_engagement",
        "pages_show_list",
        "pages_manage_metadata",
        "business_management",
      ].join(","),
      access_token: userTok,
      appsecret_proof: proof,
    }),
  });
  const tokenBody = (await tokenRes.json().catch(() => null)) as {
    access_token?: string;
    error?: { message?: string };
  } | null;

  if (!tokenRes.ok || !tokenBody?.access_token) {
    return {
      ok: false,
      error:
        tokenBody?.error?.message ||
        "No se pudo crear el token del System User. Revisá App Secret.",
    };
  }

  const sysTok = tokenBody.access_token;

  // Reject empty-scope system tokens — they cannot publish
  const dbgUrl = new URL("https://graph.facebook.com/v21.0/debug_token");
  dbgUrl.searchParams.set("input_token", sysTok);
  dbgUrl.searchParams.set(
    "access_token",
    `${creds.appId}|${creds.appSecret}`,
  );
  const dbgRes = await fetch(dbgUrl);
  const dbg = (await dbgRes.json().catch(() => null)) as {
    data?: { scopes?: string[]; type?: string };
  } | null;
  const scopes = dbg?.data?.scopes || [];
  if (!scopes.includes("pages_manage_posts")) {
    return {
      ok: false,
      error:
        "System User token sin pages_manage_posts. Usá un User token (no Page) + App Secret, o pegá un Page token permanente directo.",
    };
  }

  // Resolve Page token from system user
  const accUrl = new URL("https://graph.facebook.com/v21.0/me/accounts");
  accUrl.searchParams.set("fields", "id,name,access_token");
  accUrl.searchParams.set("access_token", sysTok);
  const accRes = await fetch(accUrl);
  const acc = (await accRes.json().catch(() => null)) as {
    data?: Array<{ id?: string; name?: string; access_token?: string }>;
    error?: { message?: string };
  } | null;

  let pageTok: string | null = null;
  let pageName: string | null = HIGLOU_FACEBOOK.pageName;
  const match = (acc?.data || []).find(
    (p) => String(p.id || "").replace(/\D/g, "") === pageId,
  );
  if (match?.access_token) {
    pageTok = match.access_token;
    pageName = match.name || pageName;
  }

  if (!pageTok) {
    // Fallback: Page edge with system user token
    const pageUrl = new URL(`https://graph.facebook.com/v21.0/${pageId}`);
    pageUrl.searchParams.set("fields", "id,name,access_token");
    pageUrl.searchParams.set("access_token", sysTok);
    const pageRes = await fetch(pageUrl);
    const pageBody = (await pageRes.json().catch(() => null)) as {
      id?: string;
      name?: string;
      access_token?: string;
      error?: { message?: string };
    } | null;
    if (pageBody?.access_token) {
      pageTok = pageBody.access_token;
      pageName = pageBody.name || pageName;
    }
  }

  if (!pageTok) {
    return {
      ok: false,
      error:
        "System User OK pero sin Page token. Asigná la Page al System User en Business Manager.",
    };
  }

  return {
    ok: true,
    pageId,
    pageName,
    accessToken: pageTok,
    systemUserToken: sysTok,
    neverExpires: true,
    note: "System User token permanente (no vence · no depende de tu login).",
  };
}
