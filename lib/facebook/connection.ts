import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canEncryptFacebookToken,
  decryptFacebookToken,
  encryptFacebookToken,
} from "@/lib/facebook/config";

export type FacebookConnectionPublic = {
  connected: boolean;
  pageId: string | null;
  pageName: string | null;
  connectedAt: string | null;
  lastError: string | null;
  lastShareAt: string | null;
  encryptionReady: boolean;
};

type Row = {
  page_id: string | null;
  page_name: string | null;
  access_token_enc: string | null;
  connected_at: string | null;
  revoked_at: string | null;
  last_error: string | null;
  last_share_at: string | null;
};

type StoredPayload = {
  pageId: string;
  pageName: string | null;
  accessTokenEnc: string;
  connectedAt: string;
  lastError: string | null;
  lastShareAt: string | null;
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

  const { data, error } = await db
    .from("facebook_connections")
    .select(
      "page_id, page_name, access_token_enc, connected_at, revoked_at, last_error, last_share_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!error) {
    return publicFromRow(data as Row | null, encryptionReady);
  }

  if (isMissingTableError(error.message)) {
    const stored = await readStoragePayload(db, userId);
    return publicFromStored(stored, encryptionReady);
  }

  return {
    connected: false,
    pageId: null,
    pageName: null,
    connectedAt: null,
    lastError: error.message,
    lastShareAt: null,
    encryptionReady,
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

export async function saveFacebookConnection(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    pageId: string;
    pageName?: string | null;
    accessToken: string;
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
  const pageId = opts.pageId.replace(/\D/g, "");
  const token = opts.accessToken.trim();
  if (pageId.length < 5 || token.length < 20) {
    return {
      ok: false,
      error: "Need a valid Facebook Page ID and Page access token.",
    };
  }

  const verified = await verifyFacebookPageToken(pageId, token);
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }

  let enc: string;
  try {
    enc = encryptFacebookToken(token);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not encrypt token",
    };
  }

  const connectedAt = new Date().toISOString();
  const pageName =
    String(opts.pageName || "").trim() || verified.pageName || null;
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
        last_error: null,
        updated_at: connectedAt,
      })
      .select(
        "page_id, page_name, access_token_enc, connected_at, revoked_at, last_error, last_share_at",
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
      lastError: null,
      lastShareAt: null,
    });
    const connection = publicFromStored(
      {
        pageId,
        pageName,
        accessTokenEnc: enc,
        connectedAt,
        lastError: null,
        lastShareAt: null,
      },
      true,
    );
    if (!connection.connected) {
      return {
        ok: false,
        error:
          connection.lastError ||
          "Token guardado pero no legible. Revisá EBAY_TOKEN_ENCRYPTION_KEY.",
        connection,
      };
    }
    return { ok: true, connection };
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

export async function loadFacebookPageCredentials(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ pageId: string; accessToken: string; pageName: string | null } | null> {
  if (!canEncryptFacebookToken()) return null;
  const db = await dbForFacebook(supabase);

  const { data, error } = await db
    .from("facebook_connections")
    .select("page_id, page_name, access_token_enc, revoked_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!error) {
    const row = data as Row | null;
    if (!row?.page_id || !row.access_token_enc || row.revoked_at) {
      // try storage fallback too
    } else {
      try {
        const accessToken = decryptFacebookToken(row.access_token_enc);
        if (accessToken) {
          return {
            pageId: row.page_id,
            accessToken,
            pageName: row.page_name,
          };
        }
      } catch {
        // fall through
      }
    }
  }

  const stored = await readStoragePayload(db, userId);
  if (!stored) return null;
  try {
    const accessToken = decryptFacebookToken(stored.accessTokenEnc);
    if (!accessToken) return null;
    return {
      pageId: stored.pageId,
      accessToken,
      pageName: stored.pageName,
    };
  } catch {
    return null;
  }
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
