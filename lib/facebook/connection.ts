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

export async function getFacebookConnectionPublic(
  supabase: SupabaseClient,
  userId: string,
): Promise<FacebookConnectionPublic> {
  const encryptionReady = canEncryptFacebookToken();
  const { data } = await supabase
    .from("facebook_connections")
    .select(
      "page_id, page_name, access_token_enc, connected_at, revoked_at, last_error, last_share_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const row = data as Row | null;
  if (!row || row.revoked_at || !row.access_token_enc || !row.page_id) {
    return {
      connected: false,
      pageId: null,
      pageName: null,
      connectedAt: null,
      lastError: row?.last_error || null,
      lastShareAt: row?.last_share_at || null,
      encryptionReady,
    };
  }

  // Row exists but token must decrypt — otherwise UI lies "conectada" while publish falls back
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
          "Token inválido. Usá el access_token de la Page desde GET /me/accounts (no el User token).",
      };
    }
    if (String(body.id) !== pageId.replace(/\D/g, "") && String(body.id) !== pageId) {
      // Graph sometimes returns the same id as string — allow match without digits-only
      if (String(body.id).replace(/\D/g, "") !== pageId.replace(/\D/g, "")) {
        return {
          ok: false,
          error: `El token no corresponde al Page ID ${pageId}. Copiá el id + access_token del mismo ítem en /me/accounts.`,
        };
      }
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
): Promise<{ ok: true } | { ok: false; error: string }> {
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

  // Verify with Graph before saving — catches User tokens / bad Page ID early
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

  const { error } = await supabase.from("facebook_connections").upsert(
    {
      user_id: opts.userId,
      page_id: pageId,
      page_name:
        String(opts.pageName || "").trim() || verified.pageName || null,
      access_token_enc: enc,
      connected_at: new Date().toISOString(),
      revoked_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return {
      ok: false,
      error:
        error.message.includes("facebook_connections")
          ? "Apply migration 20260920_facebook_connections.sql"
          : error.message,
    };
  }
  return { ok: true };
}

export async function disconnectFacebook(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  await supabase
    .from("facebook_connections")
    .update({
      revoked_at: new Date().toISOString(),
      access_token_enc: "",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

export async function loadFacebookPageCredentials(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ pageId: string; accessToken: string; pageName: string | null } | null> {
  if (!canEncryptFacebookToken()) return null;
  const { data } = await supabase
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
