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
      page_name: String(opts.pageName || "").trim() || null,
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
