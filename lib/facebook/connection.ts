import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canEncryptFacebookToken,
  decryptFacebookToken,
  encryptFacebookToken,
} from "@/lib/facebook/config";
import {
  canExtendFacebookTokens,
  hardenPageAccessToken,
} from "@/lib/facebook/token-exchange";
import {
  HIGLOU_FACEBOOK,
  mintNeverExpiringPageToken,
} from "@/lib/facebook/permanent-token";

export type FacebookConnectionPublic = {
  connected: boolean;
  pageId: string | null;
  pageName: string | null;
  connectedAt: string | null;
  lastError: string | null;
  lastShareAt: string | null;
  encryptionReady: boolean;
  /** True when Page token was hardened via App ID/Secret (does not expire) */
  neverExpires?: boolean;
  tokenExpiresAt?: string | null;
  canExtendTokens?: boolean;
};

type Row = {
  page_id: string | null;
  page_name: string | null;
  access_token_enc: string | null;
  connected_at: string | null;
  revoked_at: string | null;
  last_error: string | null;
  last_share_at: string | null;
  token_expires_at?: string | null;
  token_never_expires?: boolean | null;
};

type StoredPayload = {
  pageId: string;
  pageName: string | null;
  accessTokenEnc: string;
  connectedAt: string;
  lastError: string | null;
  lastShareAt: string | null;
  tokenExpiresAt?: string | null;
  tokenNeverExpires?: boolean;
};

const SECRETS_BUCKET = "higlou-secrets";

async function dbForFacebook(
  fallback: SupabaseClient,
): Promise<SupabaseClient> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    return createAdminClient();
  } catch {
    return fallback;
  }
}

function isMissingTableError(message: string | null | undefined): boolean {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("facebook_connections") ||
    m.includes("could not find the table") ||
    (m.includes("relation") && m.includes("does not exist")) ||
    m.includes("schema cache")
  );
}

function publicFromRow(
  row: Row | null,
  encryptionReady: boolean,
): FacebookConnectionPublic {
  if (!row || row.revoked_at || !row.access_token_enc || !row.page_id) {
    return {
      connected: false,
      pageId: row?.page_id || null,
      pageName: row?.page_name || null,
      connectedAt: row?.connected_at || null,
      lastError:
        row?.last_error ||
        (row?.revoked_at
          ? "Page desconectada. Volvé a pegar Page ID + token."
          : null),
      lastShareAt: row?.last_share_at || null,
      encryptionReady,
      neverExpires: false,
      tokenExpiresAt: row?.token_expires_at || null,
      canExtendTokens: canExtendFacebookTokens(),
    };
  }

  if (!encryptionReady) {
    return {
      connected: false,
      pageId: row.page_id,
      pageName: row.page_name,
      connectedAt: row.connected_at,
      lastError:
        "Falta FACEBOOK_TOKEN_ENCRYPTION_KEY (o EBAY_TOKEN_ENCRYPTION_KEY) en el servidor.",
      lastShareAt: row.last_share_at,
      encryptionReady,
      neverExpires: false,
      tokenExpiresAt: row.token_expires_at || null,
      canExtendTokens: canExtendFacebookTokens(),
    };
  }

  try {
    const token = decryptFacebookToken(row.access_token_enc);
    if (!token) {
      return {
        connected: false,
        pageId: row.page_id,
        pageName: row.page_name,
        connectedAt: row.connected_at,
        lastError: "Token ilegible — reconectá la Page en Settings.",
        lastShareAt: row.last_share_at,
        encryptionReady,
        neverExpires: false,
        tokenExpiresAt: row.token_expires_at || null,
        canExtendTokens: canExtendFacebookTokens(),
      };
    }
  } catch {
    return {
      connected: false,
      pageId: row.page_id,
      pageName: row.page_name,
      connectedAt: row.connected_at,
      lastError:
        "No se pudo leer el token (clave de cifrado distinta). Reconectá la Page.",
      lastShareAt: row.last_share_at,
      encryptionReady,
      neverExpires: false,
      tokenExpiresAt: row.token_expires_at || null,
      canExtendTokens: canExtendFacebookTokens(),
    };
  }

  return {
    connected: true,
    pageId: row.page_id,
    pageName: row.page_name,
    connectedAt: row.connected_at,
    lastError: row.last_error,
    lastShareAt: row.last_share_at,
    encryptionReady,
    neverExpires: Boolean(row.token_never_expires),
    tokenExpiresAt: row.token_expires_at || null,
    canExtendTokens: canExtendFacebookTokens(),
  };
}

function publicFromStored(
  stored: StoredPayload | null,
  encryptionReady: boolean,
): FacebookConnectionPublic {
  if (!stored?.pageId || !stored.accessTokenEnc) {
    return {
      connected: false,
      pageId: null,
      pageName: null,
      connectedAt: null,
      lastError: null,
      lastShareAt: null,
      encryptionReady,
    };
  }
  return publicFromRow(
    {
      page_id: stored.pageId,
      page_name: stored.pageName,
      access_token_enc: stored.accessTokenEnc,
      connected_at: stored.connectedAt,
      revoked_at: null,
      last_error: stored.lastError,
      last_share_at: stored.lastShareAt,
      token_expires_at: stored.tokenExpiresAt || null,
      token_never_expires: stored.tokenNeverExpires || false,
    },
    encryptionReady,
  );
}

async function ensureSecretsBucket(db: SupabaseClient): Promise<void> {
  const { data: buckets } = await db.storage.listBuckets();
  const exists = (buckets || []).some((b) => b.name === SECRETS_BUCKET);
  if (exists) return;
  const { error } = await db.storage.createBucket(SECRETS_BUCKET, {
    public: false,
    fileSizeLimit: 64 * 1024,
  });
  // ignore "already exists"
  if (error && !/already|exists|duplicate/i.test(error.message)) {
    throw error;
  }
}

function storagePath(userId: string) {
  return `facebook/${userId}.json`;
}

async function readStoragePayload(
  db: SupabaseClient,
  userId: string,
): Promise<StoredPayload | null> {
  try {
    await ensureSecretsBucket(db);
    const { data, error } = await db.storage
      .from(SECRETS_BUCKET)
      .download(storagePath(userId));
    if (error || !data) return null;
    const text = await data.text();
    const parsed = JSON.parse(text) as StoredPayload;
    if (!parsed?.pageId || !parsed?.accessTokenEnc) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeStoragePayload(
  db: SupabaseClient,
  userId: string,
  payload: StoredPayload,
): Promise<void> {
  await ensureSecretsBucket(db);
  const body = JSON.stringify(payload);
  const { error } = await db.storage
    .from(SECRETS_BUCKET)
    .upload(storagePath(userId), body, {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw error;
}

async function deleteStoragePayload(
  db: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    await db.storage.from(SECRETS_BUCKET).remove([storagePath(userId)]);
  } catch {
    // ignore
  }
}

async function updateStorageMeta(
  db: SupabaseClient,
  userId: string,
  patch: Partial<Pick<StoredPayload, "lastError" | "lastShareAt">>,
): Promise<void> {
  const current = await readStoragePayload(db, userId);
  if (!current) return;
  await writeStoragePayload(db, userId, { ...current, ...patch });
}

export async function getFacebookConnectionPublic(
  supabase: SupabaseClient,
  userId: string,
): Promise<FacebookConnectionPublic> {
  const encryptionReady = canEncryptFacebookToken();
  const db = await dbForFacebook(supabase);
  const storedApp = await loadStoredFacebookAppCreds(supabase, userId);
  const extendReady =
    canExtendFacebookTokens() ||
    Boolean(storedApp?.appId && storedApp?.appSecret);

  const { data, error } = await db
    .from("facebook_connections")
    .select(
      "page_id, page_name, access_token_enc, connected_at, revoked_at, last_error, last_share_at, token_expires_at, token_never_expires",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!error) {
    const pub = publicFromRow(data as Row | null, encryptionReady);
    return { ...pub, canExtendTokens: extendReady };
  }

  if (isMissingTableError(error.message)) {
    const stored = await readStoragePayload(db, userId);
    const pub = publicFromStored(stored, encryptionReady);
    return { ...pub, canExtendTokens: extendReady };
  }

  return {
    connected: false,
    pageId: null,
    pageName: null,
    connectedAt: null,
    lastError: error.message,
    lastShareAt: null,
    encryptionReady,
    neverExpires: false,
    tokenExpiresAt: null,
    canExtendTokens: extendReady,
  };
}

/** Confirm Page ID + Page access token against Graph before storing. */
export async function verifyFacebookPageToken(
  pageId: string,
  accessToken: string,
): Promise<{ ok: true; pageName: string | null } | { ok: false; error: string }> {
  try {
    const me = new URL(`https://graph.facebook.com/v21.0/${pageId}`);
    me.searchParams.set("fields", "id,name");
    me.searchParams.set("access_token", accessToken);
    const res = await fetch(me);
    const body = (await res.json().catch(() => null)) as {
      id?: string;
      name?: string;
      error?: { message?: string };
    } | null;
    if (!res.ok || !body?.id) {
      return {
        ok: false,
        error:
          body?.error?.message ||
          "Token inválido. Usá el access_token de la Page (Graph → Page seleccionada).",
      };
    }
    const want = pageId.replace(/\D/g, "");
    const got = String(body.id).replace(/\D/g, "");
    if (got !== want) {
      return {
        ok: false,
        error: `El token no corresponde al Page ID ${pageId}. Copiá id + token de la misma Page.`,
      };
    }
    return { ok: true, pageName: body.name || null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo verificar el token",
    };
  }
}

/**
 * Graph Explorer often gives a User token. Publishing needs the Page token
 * from GET /me/accounts. Exchange automatically when possible.
 */
export async function resolvePageAccessToken(
  pageId: string,
  accessToken: string,
): Promise<
  | { ok: true; pageId: string; pageName: string | null; accessToken: string }
  | { ok: false; error: string }
> {
  const want = pageId.replace(/\D/g, "");
  const token = accessToken.trim();
  if (want.length < 5 || token.length < 20) {
    return { ok: false, error: "Need a valid Facebook Page ID and access token." };
  }

  // Already a Page token? /me returns the Page.
  try {
    const meUrl = new URL("https://graph.facebook.com/v21.0/me");
    meUrl.searchParams.set("fields", "id,name");
    meUrl.searchParams.set("access_token", token);
    const meRes = await fetch(meUrl);
    const me = (await meRes.json().catch(() => null)) as {
      id?: string;
      name?: string;
      error?: { message?: string };
    } | null;
    if (meRes.ok && me?.id && String(me.id).replace(/\D/g, "") === want) {
      return {
        ok: true,
        pageId: want,
        pageName: me.name || null,
        accessToken: token,
      };
    }
  } catch {
    // continue to accounts lookup
  }

  // User token → exchange via /me/accounts
  try {
    const accUrl = new URL("https://graph.facebook.com/v21.0/me/accounts");
    accUrl.searchParams.set("fields", "id,name,access_token");
    accUrl.searchParams.set("access_token", token);
    const accRes = await fetch(accUrl);
    const acc = (await accRes.json().catch(() => null)) as {
      data?: Array<{ id?: string; name?: string; access_token?: string }>;
      error?: { message?: string };
    } | null;
    if (!accRes.ok) {
      return {
        ok: false,
        error:
          acc?.error?.message ||
          "No se pudo listar Pages. Generá un User token con pages_show_list + pages_manage_posts.",
      };
    }
    const match = (acc?.data || []).find(
      (p) => String(p.id || "").replace(/\D/g, "") === want,
    );
    if (!match?.access_token) {
      const names = (acc?.data || [])
        .map((p) => `${p.name || "?"} (${p.id})`)
        .slice(0, 5)
        .join(", ");
      return {
        ok: false,
        error: names
          ? `Page ID ${want} no está en tus Pages. Tenés: ${names}`
          : `No encontré la Page ${want} en /me/accounts. Revisá que seas admin.`,
      };
    }
    return {
      ok: true,
      pageId: want,
      pageName: match.name || null,
      accessToken: match.access_token,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo resolver el Page token",
    };
  }
}

function appCredsStoragePath(userId: string) {
  return `facebook/${userId}-app.json`;
}

async function writeAppCredsPayload(
  db: SupabaseClient,
  userId: string,
  appId: string,
  appSecret: string,
): Promise<void> {
  await ensureSecretsBucket(db);
  const body = JSON.stringify({
    appId,
    appSecretEnc: encryptFacebookToken(appSecret),
    savedAt: new Date().toISOString(),
  });
  const { error } = await db.storage
    .from(SECRETS_BUCKET)
    .upload(appCredsStoragePath(userId), body, {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw error;
}

export async function loadStoredFacebookAppCreds(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ appId: string; appSecret: string } | null> {
  if (!canEncryptFacebookToken()) return null;
  try {
    const db = await dbForFacebook(supabase);
    await ensureSecretsBucket(db);
    const { data, error } = await db.storage
      .from(SECRETS_BUCKET)
      .download(appCredsStoragePath(userId));
    if (error || !data) return null;
    const parsed = JSON.parse(await data.text()) as {
      appId?: string;
      appSecretEnc?: string;
    };
    if (!parsed?.appId || !parsed?.appSecretEnc) return null;
    const appSecret = decryptFacebookToken(parsed.appSecretEnc);
    if (!appSecret) return null;
    return { appId: parsed.appId, appSecret };
  } catch {
    return null;
  }
}

export async function saveFacebookConnection(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    pageId: string;
    pageName?: string | null;
    accessToken: string;
    /** Optional — enables never-expiring System User / long-lived Page token */
    appId?: string | null;
    appSecret?: string | null;
  },
): Promise<
  | { ok: true; connection: FacebookConnectionPublic }
  | { ok: false; error: string; connection?: FacebookConnectionPublic }
> {
  if (!canEncryptFacebookToken()) {
    return {
      ok: false,
      error:
        "Set FACEBOOK_TOKEN_ENCRYPTION_KEY or EBAY_TOKEN_ENCRYPTION_KEY (≥32 chars) to store Page tokens.",
    };
  }
  const pageId =
    opts.pageId.replace(/\D/g, "") || HIGLOU_FACEBOOK.pageId;
  const token = opts.accessToken.trim();
  if (pageId.length < 5 || token.length < 20) {
    return {
      ok: false,
      error: "Need a valid Facebook Page ID and access token.",
    };
  }

  const storedCreds = await loadStoredFacebookAppCreds(supabase, opts.userId);
  const appId =
    String(opts.appId || storedCreds?.appId || HIGLOU_FACEBOOK.appId).trim() ||
    null;
  const appSecret =
    String(opts.appSecret || storedCreds?.appSecret || "").trim() || null;

  let pageAccessToken: string | null = null;
  let pageName: string | null =
    String(opts.pageName || "").trim() || HIGLOU_FACEBOOK.pageName;
  let tokenExpiresAt: string | null = null;
  let tokenNeverExpires = false;
  let hardenNote = "";

  // If the paste is already a Page token for this Page, keep it (do NOT mint a
  // System User on top — that often returns empty scopes and breaks RON).
  const alreadyPage = await resolvePageAccessToken(pageId, token);
  if (alreadyPage.ok) {
    const meUrl = new URL("https://graph.facebook.com/v21.0/me");
    meUrl.searchParams.set("fields", "id");
    meUrl.searchParams.set("access_token", token);
    const meRes = await fetch(meUrl);
    const me = (await meRes.json().catch(() => null)) as { id?: string } | null;
    const isDirectPageToken =
      meRes.ok &&
      Boolean(me?.id) &&
      String(me?.id || "").replace(/\D/g, "") === pageId;

    if (isDirectPageToken) {
      pageAccessToken = alreadyPage.accessToken;
      pageName = alreadyPage.pageName || pageName;
      if (appSecret && canExtendFacebookTokens({ appId, appSecret })) {
        const { debugFacebookToken } = await import(
          "@/lib/facebook/token-exchange"
        );
        const dbg = await debugFacebookToken(pageAccessToken, {
          appId,
          appSecret,
        });
        tokenNeverExpires = Boolean(dbg.isPage && !dbg.expiresAt);
        tokenExpiresAt = dbg.expiresAt
          ? new Date(dbg.expiresAt * 1000).toISOString()
          : null;
        hardenNote = tokenNeverExpires
          ? "Page token permanente (no vence)."
          : dbg.expiresAt
            ? `Page token vence ${new Date(dbg.expiresAt * 1000).toLocaleDateString()}.`
            : "Page token OK.";
      } else {
        tokenNeverExpires = false;
        hardenNote = "Page token guardado.";
      }
    }
  }

  // Only mint System User when the input is a User token (not already Page)
  if (
    !pageAccessToken &&
    appSecret &&
    canExtendFacebookTokens({ appId, appSecret })
  ) {
    const minted = await mintNeverExpiringPageToken({
      userAccessToken: token,
      appId: appId || undefined,
      appSecret,
      pageId,
    });
    if (minted.ok) {
      pageAccessToken = minted.accessToken;
      pageName = minted.pageName || pageName;
      tokenNeverExpires = true;
      tokenExpiresAt = null;
      hardenNote = minted.note;
    }
  }

  if (!pageAccessToken) {
    // User token → Page token via /me/accounts (Graph Explorer default)
    const resolved = alreadyPage.ok
      ? alreadyPage
      : await resolvePageAccessToken(pageId, token);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }

    const hardened = await hardenPageAccessToken({
      pageId: resolved.pageId,
      accessToken: token,
      pageAccessToken: resolved.accessToken,
      appId,
      appSecret,
    });
    pageAccessToken = hardened.accessToken;
    pageName =
      String(opts.pageName || "").trim() || resolved.pageName || pageName;
    tokenExpiresAt = hardened.expiresAt
      ? new Date(hardened.expiresAt * 1000).toISOString()
      : null;
    tokenNeverExpires = hardened.neverExpires;
    hardenNote = hardened.note;
  }

  // Persist App Secret once so future reconnects stay permanent
  if (appId && appSecret) {
    try {
      const db = await dbForFacebook(supabase);
      await writeAppCredsPayload(db, opts.userId, appId, appSecret);
    } catch {
      /* optional — Page token still saved */
    }
  }

  let enc: string;
  try {
    enc = encryptFacebookToken(pageAccessToken);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not encrypt token",
    };
  }

  const connectedAt = new Date().toISOString();
  const db = await dbForFacebook(supabase);

  // Prefer dedicated table when it exists
  const probe = await db.from("facebook_connections").select("user_id").limit(1);
  const tableMissing = Boolean(
    probe.error && isMissingTableError(probe.error.message),
  );

  if (!tableMissing && !probe.error) {
    await db.from("facebook_connections").delete().eq("user_id", opts.userId);
    const { data, error } = await db
      .from("facebook_connections")
      .insert({
        user_id: opts.userId,
        page_id: pageId,
        page_name: pageName,
        access_token_enc: enc,
        connected_at: connectedAt,
        revoked_at: null,
        last_error: hardenNote && !tokenNeverExpires ? hardenNote : null,
        updated_at: connectedAt,
        token_expires_at: tokenExpiresAt,
        token_never_expires: tokenNeverExpires,
      })
      .select(
        "page_id, page_name, access_token_enc, connected_at, revoked_at, last_error, last_share_at, token_expires_at, token_never_expires",
      )
      .maybeSingle();

    if (!error && data?.access_token_enc) {
      const connection = publicFromRow(data as Row, true);
      if (connection.connected) return { ok: true, connection };
    }
    // fall through to storage if insert failed oddly
  }

  // Fallback: private Storage (no SQL migration required)
  try {
    await writeStoragePayload(db, opts.userId, {
      pageId,
      pageName,
      accessTokenEnc: enc,
      connectedAt,
      lastError: hardenNote && !tokenNeverExpires ? hardenNote : null,
      lastShareAt: null,
      tokenExpiresAt,
      tokenNeverExpires,
    });
    const connection = await getFacebookConnectionPublic(supabase, opts.userId);
    if (connection.connected) return { ok: true, connection };
    return {
      ok: false,
      error: "Saved but could not re-read connection.",
      connection,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "No se pudo guardar la conexión de Facebook.",
    };
  }
}

export async function disconnectFacebook(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const db = await dbForFacebook(supabase);
  await db.from("facebook_connections").delete().eq("user_id", userId);
  await deleteStoragePayload(db, userId);
}

async function tokenActsAsPage(
  pageId: string,
  accessToken: string,
): Promise<boolean> {
  try {
    const meUrl = new URL("https://graph.facebook.com/v21.0/me");
    meUrl.searchParams.set("fields", "id");
    meUrl.searchParams.set("access_token", accessToken);
    const res = await fetch(meUrl);
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return (
      res.ok &&
      Boolean(body?.id) &&
      String(body?.id).replace(/\D/g, "") === pageId.replace(/\D/g, "")
    );
  } catch {
    return false;
  }
}

type PageCreds = {
  pageId: string;
  accessToken: string;
  pageName: string | null;
};

function bootstrapEnvCreds(): PageCreds | null {
  const pageId = String(process.env.FACEBOOK_BOOTSTRAP_PAGE_ID || "")
    .replace(/\D/g, "")
    .trim();
  const accessToken = String(
    process.env.FACEBOOK_BOOTSTRAP_PAGE_TOKEN || "",
  ).trim();
  const pageName =
    String(process.env.FACEBOOK_BOOTSTRAP_PAGE_NAME || "").trim() || null;
  if (pageId.length < 5 || accessToken.length < 20) return null;
  return { pageId, accessToken, pageName };
}

/**
 * Graph probe that distinguishes invalid tokens from network/unknown failures.
 * Unknown must NOT block RON — a blip would otherwise look like "Page desconectada".
 */
async function probeFacebookToken(
  accessToken: string,
  expectPageId?: string | null,
): Promise<"ok" | "invalid" | "unknown"> {
  try {
    const url = new URL("https://graph.facebook.com/v21.0/me");
    url.searchParams.set("fields", "id");
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url);
    const body = (await res.json().catch(() => null)) as {
      id?: string;
      error?: { message?: string; code?: number; type?: string };
    } | null;
    if (!res.ok || !body?.id) {
      const msg = String(body?.error?.message || "").toLowerCase();
      if (
        /invalid|expired|session|oauthexception|cannot parse access token|error validating/i.test(
          msg,
        ) ||
        body?.error?.type === "OAuthException"
      ) {
        return "invalid";
      }
      // Rate limit / 5xx / odd Graph responses → unknown, keep trying
      if (res.status >= 500 || res.status === 429) return "unknown";
      return "invalid";
    }
    if (expectPageId) {
      const want = expectPageId.replace(/\D/g, "");
      const got = String(body.id).replace(/\D/g, "");
      if (want && got && want !== got) return "invalid";
    }
    return "ok";
  } catch {
    return "unknown";
  }
}

async function persistBootstrapCreds(
  supabase: SupabaseClient,
  userId: string,
  boot: PageCreds,
): Promise<PageCreds> {
  await saveFacebookConnection(supabase, {
    userId,
    pageId: boot.pageId,
    pageName: boot.pageName,
    accessToken: boot.accessToken,
  });
  return boot;
}

/**
 * Load credentials and auto-heal User tokens → Page tokens.
 * Also falls back to FACEBOOK_BOOTSTRAP_PAGE_TOKEN when needed.
 */
export async function loadFacebookPageCredentials(
  supabase: SupabaseClient,
  userId: string,
): Promise<PageCreds | null> {
  if (!canEncryptFacebookToken()) {
    await markFacebookConnectionMeta(supabase, userId, {
      lastError:
        "Falta FACEBOOK_TOKEN_ENCRYPTION_KEY (o EBAY_TOKEN_ENCRYPTION_KEY ≥32) en el servidor.",
    }).catch(() => undefined);
    return null;
  }
  const db = await dbForFacebook(supabase);

  let pageId: string | null = null;
  let pageName: string | null = null;
  let accessToken: string | null = null;
  let decryptFailed = false;

  const { data, error } = await db
    .from("facebook_connections")
    .select("page_id, page_name, access_token_enc, revoked_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!error) {
    const row = data as Row | null;
    if (row?.page_id && row.access_token_enc && !row.revoked_at) {
      try {
        const tok = decryptFacebookToken(row.access_token_enc);
        if (tok) {
          pageId = row.page_id;
          pageName = row.page_name;
          accessToken = tok;
        } else {
          decryptFailed = true;
        }
      } catch {
        decryptFailed = true;
      }
    }
  }

  if (!accessToken || !pageId) {
    const stored = await readStoragePayload(db, userId);
    if (stored) {
      try {
        const tok = decryptFacebookToken(stored.accessTokenEnc);
        if (tok) {
          pageId = stored.pageId;
          pageName = stored.pageName;
          accessToken = tok;
          decryptFailed = false;
        } else {
          decryptFailed = true;
        }
      } catch {
        decryptFailed = true;
      }
    }
  }

  // Bootstrap Page token from Vercel if nothing stored / decrypt broken
  if (!accessToken || !pageId) {
    const boot = bootstrapEnvCreds();
    if (boot) {
      return persistBootstrapCreds(supabase, userId, boot);
    }
    if (decryptFailed) {
      await markFacebookConnectionMeta(supabase, userId, {
        lastError:
          "No se pudo leer el token (clave de cifrado distinta). Reconectá la Page en Settings.",
      }).catch(() => undefined);
    }
    return null;
  }

  // Probe once: Page token OK → publish. Do NOT double-probe (old soft check
  // after tokenActsAsPage killed RON on Graph blips with "Conectá tu Page").
  const probe = await probeFacebookToken(accessToken, pageId);
  if (probe === "ok" || probe === "unknown") {
    return { pageId, accessToken, pageName };
  }

  // Heal: stored User token → real Page token
  const resolved = await resolvePageAccessToken(pageId, accessToken);
  if (resolved.ok) {
    const healedProbe = await probeFacebookToken(
      resolved.accessToken,
      resolved.pageId,
    );
    if (healedProbe === "ok" || healedProbe === "unknown") {
      await saveFacebookConnection(supabase, {
        userId,
        pageId: resolved.pageId,
        pageName: resolved.pageName || pageName,
        accessToken: resolved.accessToken,
      });
      return {
        pageId: resolved.pageId,
        accessToken: resolved.accessToken,
        pageName: resolved.pageName || pageName,
      };
    }
  }

  // Last resort: overwrite with bootstrap Page token (any Page ID)
  const boot = bootstrapEnvCreds();
  if (boot) {
    const bootProbe = await probeFacebookToken(boot.accessToken, boot.pageId);
    if (bootProbe === "ok" || bootProbe === "unknown") {
      return persistBootstrapCreds(supabase, userId, {
        ...boot,
        pageName: boot.pageName || pageName,
      });
    }
  }

  await markFacebookConnectionMeta(supabase, userId, {
    lastError:
      "Token inválido o vencido. Pegá un token fresco en Settings → Facebook (App ID/Secret lo hace permanente).",
  });
  return null;
}

/**
 * RON / publish entry: bootstrap from Vercel if needed, then load credentials.
 * Returns a Spanish error RON can show in the ops log (not a vague "Conectá").
 */
export async function ensureFacebookPageCredentialsForPublish(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
): Promise<{ ok: true; creds: PageCreds } | { ok: false; error: string }> {
  if (!canEncryptFacebookToken()) {
    return {
      ok: false,
      error:
        "Falta clave de cifrado Facebook en el servidor (FACEBOOK_TOKEN_ENCRYPTION_KEY o EBAY_TOKEN_ENCRYPTION_KEY ≥32).",
    };
  }

  // Same heal Settings GET uses — cron/force cycle never hit that route
  try {
    await maybeBootstrapFacebookConnection(supabase, userId, userEmail);
  } catch {
    /* bootstrap optional */
  }

  const creds = await loadFacebookPageCredentials(supabase, userId);
  if (creds) return { ok: true, creds };

  const pub = await getFacebookConnectionPublic(supabase, userId);
  if (pub.lastError) {
    return { ok: false, error: pub.lastError };
  }
  if (!pub.encryptionReady) {
    return {
      ok: false,
      error:
        "Falta clave de cifrado Facebook en el servidor. Sin ella RON no puede leer el Page token.",
    };
  }
  return {
    ok: false,
    error:
      "Conectá tu Page de Facebook en Settings → Facebook (Page ID + token) para que RON publique solo",
  };
}

/** Persist last Graph error / share time across table or storage backends. */
export async function markFacebookConnectionMeta(
  supabase: SupabaseClient,
  userId: string,
  patch: { lastError?: string | null; lastShareAt?: string | null },
): Promise<void> {
  const db = await dbForFacebook(supabase);
  const tableUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if ("lastError" in patch) tableUpdate.last_error = patch.lastError ?? null;
  if ("lastShareAt" in patch) tableUpdate.last_share_at = patch.lastShareAt ?? null;

  const { error } = await db
    .from("facebook_connections")
    .update(tableUpdate)
    .eq("user_id", userId);

  if (error && isMissingTableError(error.message)) {
    await updateStorageMeta(db, userId, {
      lastError: patch.lastError ?? null,
      lastShareAt: patch.lastShareAt ?? null,
    });
  }
}

/**
 * Bootstrap / repair from Vercel env (FACEBOOK_BOOTSTRAP_PAGE_*).
 * Overwrites a bad User-token connection with the real Page token.
 */
export async function maybeBootstrapFacebookConnection(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
): Promise<FacebookConnectionPublic | null> {
  const allowEmail = String(process.env.FACEBOOK_BOOTSTRAP_USER_EMAIL || "")
    .trim()
    .toLowerCase();
  if (allowEmail) {
    const email = String(userEmail || "").trim().toLowerCase();
    if (!email || email !== allowEmail) return null;
  }

  const pageId = String(process.env.FACEBOOK_BOOTSTRAP_PAGE_ID || "")
    .replace(/\D/g, "")
    .trim();
  const accessToken = String(
    process.env.FACEBOOK_BOOTSTRAP_PAGE_TOKEN || "",
  ).trim();
  const pageName =
    String(process.env.FACEBOOK_BOOTSTRAP_PAGE_NAME || "").trim() || null;
  if (pageId.length < 5 || accessToken.length < 20) return null;

  const current = await getFacebookConnectionPublic(supabase, userId);
  if (current.connected && current.pageId) {
    // If already a real Page token, leave it
    const creds = await (async () => {
      const db = await dbForFacebook(supabase);
      const stored = await readStoragePayload(db, userId);
      if (stored?.accessTokenEnc) {
        try {
          return decryptFacebookToken(stored.accessTokenEnc);
        } catch {
          return null;
        }
      }
      const { data } = await db
        .from("facebook_connections")
        .select("access_token_enc")
        .eq("user_id", userId)
        .maybeSingle();
      const enc = (data as { access_token_enc?: string } | null)?.access_token_enc;
      if (!enc) return null;
      try {
        return decryptFacebookToken(enc);
      } catch {
        return null;
      }
    })();
    if (creds && (await tokenActsAsPage(pageId, creds))) {
      return null;
    }
  }

  const saved = await saveFacebookConnection(supabase, {
    userId,
    pageId,
    pageName,
    accessToken,
  });
  return saved.ok ? saved.connection : null;
}
