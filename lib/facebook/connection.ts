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

  if (error) {
    return {
      connected: false,
      pageId: null,
      pageName: null,
      connectedAt: null,
      lastError: error.message.includes("facebook_connections")
        ? "Falta la tabla facebook_connections en Supabase. Aplicá la migración."
        : error.message,
      lastShareAt: null,
      encryptionReady,
    };
  }

  return publicFromRow(data as Row | null, encryptionReady);
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
      error?: { message?: string; code?: number };
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
  const payload = {
    user_id: opts.userId,
    page_id: pageId,
    page_name: pageName,
    access_token_enc: enc,
    connected_at: connectedAt,
    revoked_at: null as string | null,
    last_error: null as string | null,
    updated_at: connectedAt,
  };

  const db = await dbForFacebook(supabase);

  // Clean reconnect: delete then insert so revoked_at / empty token never linger
  await db.from("facebook_connections").delete().eq("user_id", opts.userId);

  const { data, error } = await db
    .from("facebook_connections")
    .insert(payload)
    .select(
      "page_id, page_name, access_token_enc, connected_at, revoked_at, last_error, last_share_at",
    )
    .maybeSingle();

  if (error || !data?.access_token_enc) {
    // Last resort: upsert if delete+insert blocked
    const upsert = await db
      .from("facebook_connections")
      .upsert(
        {
          ...payload,
          // Force clear revoke with a sentinel rewrite via update after
        },
        { onConflict: "user_id" },
      )
      .select(
        "page_id, page_name, access_token_enc, connected_at, revoked_at, last_error, last_share_at",
      )
      .maybeSingle();

    if (upsert.error || !upsert.data?.access_token_enc) {
      return {
        ok: false,
        error:
          error?.message?.includes("facebook_connections") ||
          upsert.error?.message?.includes("facebook_connections")
            ? "Apply migration 20260920_facebook_connections.sql in Supabase"
            : error?.message ||
              upsert.error?.message ||
              "No se pudo guardar la conexión en Supabase.",
      };
    }

    await db
      .from("facebook_connections")
      .update({
        page_id: pageId,
        page_name: pageName,
        access_token_enc: enc,
        connected_at: connectedAt,
        revoked_at: null,
        last_error: null,
        updated_at: connectedAt,
      })
      .eq("user_id", opts.userId);

    const again = await getFacebookConnectionPublic(db, opts.userId);
    if (!again.connected) {
      return {
        ok: false,
        error:
          again.lastError ||
          "Supabase guardó mal la fila (sigue Off). Revisá RLS / migración facebook_connections.",
        connection: again,
      };
    }
    return { ok: true, connection: again };
  }

  const connection = publicFromRow(data as Row, true);
  if (!connection.connected) {
    return {
      ok: false,
      error:
        connection.lastError ||
        "Token guardado pero no legible. Revisá EBAY_TOKEN_ENCRYPTION_KEY en Vercel.",
      connection,
    };
  }
  return { ok: true, connection };
}

export async function disconnectFacebook(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const db = await dbForFacebook(supabase);
  await db.from("facebook_connections").delete().eq("user_id", userId);
}

export async function loadFacebookPageCredentials(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ pageId: string; accessToken: string; pageName: string | null } | null> {
  if (!canEncryptFacebookToken()) return null;
  const db = await dbForFacebook(supabase);
  const { data } = await db
    .from("facebook_connections")
    .select("page_id, page_name, access_token_enc, revoked_at")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as Row | null;
  if (!row?.page_id || !row.access_token_enc || row.revoked_at) return null;
  try {
    const accessToken = decryptFacebookToken(row.access_token_enc);
    if (!accessToken) return null;
    return {
      pageId: row.page_id,
      accessToken,
      pageName: row.page_name,
    };
  } catch {
    return null;
  }
}
