import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getEbayConfig,
  isEbayOAuthConfigured,
  ebayOAuthMissingReason,
} from "@/lib/ebay/config";
import {
  decryptSecret,
  encryptSecret,
  signOAuthState,
  verifyOAuthState,
} from "@/lib/ebay/crypto-tokens";

export type EbayTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
};

export type EbayConnectionPublic = {
  connected: boolean;
  configured: boolean;
  env: "sandbox" | "production";
  ebayUsername: string | null;
  ebayUserId: string | null;
  marketplaceId: string | null;
  connectedAt: string | null;
  lastError: string | null;
  missingReason?: string;
};

type EbayConnectionRow = {
  user_id: string;
  ebay_user_id: string | null;
  ebay_username: string | null;
  marketplace_id: string | null;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  scopes: string | null;
  connected_at: string | null;
  revoked_at: string | null;
  last_error: string | null;
};

function basicAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export function buildEbayAuthorizeUrl(userId: string): {
  url: string;
  state: string;
} {
  if (!isEbayOAuthConfigured()) {
    throw new Error(ebayOAuthMissingReason());
  }
  const cfg = getEbayConfig();
  const state = signOAuthState(userId, cfg.encryptionKey);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.ruName,
    scope: cfg.scopes.join(" "),
    state,
  });
  return {
    url: `${cfg.authorizeBase}?${params.toString()}`,
    state,
  };
}

export function parseOAuthState(state: string) {
  const cfg = getEbayConfig();
  return verifyOAuthState(state, cfg.encryptionKey);
}

async function postToken(
  body: URLSearchParams,
): Promise<EbayTokenResponse> {
  const cfg = getEbayConfig();
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(cfg.clientId, cfg.clientSecret),
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as EbayTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `eBay token exchange failed (${res.status})`,
    );
  }
  return json;
}

export async function exchangeAuthorizationCode(code: string) {
  const cfg = getEbayConfig();
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.ruName,
    }),
  );
}

export async function refreshAccessToken(refreshToken: string) {
  const cfg = getEbayConfig();
  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: cfg.scopes.join(" "),
    }),
  );
}

export async function fetchEbayUserIdentity(accessToken: string): Promise<{
  userId: string;
  username: string;
}> {
  const cfg = getEbayConfig();
  const res = await fetch(`${cfg.apiBase}/commerce/identity/v1/user/`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Accept-Language": "en-US",
      "Content-Language": "en-US",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });
  if (!res.ok) {
    return { userId: "", username: "" };
  }
  const json = (await res.json()) as {
    userId?: string;
    username?: string;
  };
  return {
    userId: String(json.userId || ""),
    username: String(json.username || ""),
  };
}

export async function upsertEbayConnection(
  supabase: SupabaseClient,
  userId: string,
  tokens: EbayTokenResponse,
  identity: { userId: string; username: string },
) {
  const cfg = getEbayConfig();
  if (!tokens.refresh_token) {
    throw new Error("eBay did not return a refresh_token");
  }
  const expiresAt = new Date(
    Date.now() + Math.max(60, Number(tokens.expires_in || 7200) - 60) * 1000,
  ).toISOString();

  const payload = {
    user_id: userId,
    ebay_user_id: identity.userId || null,
    ebay_username: identity.username || null,
    marketplace_id: "EBAY_US",
    refresh_token_enc: encryptSecret(tokens.refresh_token, cfg.encryptionKey),
    access_token_enc: encryptSecret(tokens.access_token, cfg.encryptionKey),
    access_token_expires_at: expiresAt,
    scopes: cfg.scopes.join(" "),
    connected_at: new Date().toISOString(),
    revoked_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("ebay_connections")
    .upsert(payload, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

export async function getEbayConnectionPublic(
  supabase: SupabaseClient,
  userId: string,
): Promise<EbayConnectionPublic> {
  const configured = isEbayOAuthConfigured();
  const cfg = getEbayConfig();
  if (!configured) {
    return {
      connected: false,
      configured: false,
      env: cfg.env,
      ebayUsername: null,
      ebayUserId: null,
      marketplaceId: null,
      connectedAt: null,
      lastError: null,
      missingReason: ebayOAuthMissingReason(),
    };
  }

  const { data, error } = await supabase
    .from("ebay_connections")
    .select(
      "ebay_user_id, ebay_username, marketplace_id, connected_at, revoked_at, last_error",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return {
      connected: false,
      configured: true,
      env: cfg.env,
      ebayUsername: null,
      ebayUserId: null,
      marketplaceId: null,
      connectedAt: null,
      lastError: error.message,
    };
  }

  const row = data as Partial<EbayConnectionRow> | null;
  const connected = Boolean(row?.connected_at && !row?.revoked_at);

  return {
    connected,
    configured: true,
    env: cfg.env,
    ebayUsername: connected ? row?.ebay_username || null : null,
    ebayUserId: connected ? row?.ebay_user_id || null : null,
    marketplaceId: connected ? row?.marketplace_id || "EBAY_US" : null,
    connectedAt: connected ? row?.connected_at || null : null,
    lastError: row?.last_error || null,
  };
}

export async function revokeEbayConnection(
  supabase: SupabaseClient,
  userId: string,
) {
  const { error } = await supabase
    .from("ebay_connections")
    .update({
      revoked_at: new Date().toISOString(),
      access_token_enc: null,
      access_token_expires_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Returns a valid user access token, refreshing when needed. */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  if (!isEbayOAuthConfigured()) {
    throw new Error(ebayOAuthMissingReason());
  }
  const cfg = getEbayConfig();
  const { data, error } = await supabase
    .from("ebay_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const row = data as EbayConnectionRow | null;
  if (!row || row.revoked_at || !row.refresh_token_enc) {
    throw new Error("Connect your eBay store in Settings first.");
  }

  const expiresAt = row.access_token_expires_at
    ? new Date(row.access_token_expires_at).getTime()
    : 0;
  if (
    row.access_token_enc &&
    expiresAt > Date.now() + 60_000
  ) {
    return decryptSecret(row.access_token_enc, cfg.encryptionKey);
  }

  const refreshToken = decryptSecret(row.refresh_token_enc, cfg.encryptionKey);
  try {
    const tokens = await refreshAccessToken(refreshToken);
    const nextExpires = new Date(
      Date.now() + Math.max(60, Number(tokens.expires_in || 7200) - 60) * 1000,
    ).toISOString();
    await supabase
      .from("ebay_connections")
      .update({
        access_token_enc: encryptSecret(tokens.access_token, cfg.encryptionKey),
        access_token_expires_at: nextExpires,
        refresh_token_enc: tokens.refresh_token
          ? encryptSecret(tokens.refresh_token, cfg.encryptionKey)
          : row.refresh_token_enc,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return tokens.access_token;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token refresh failed";
    await supabase
      .from("ebay_connections")
      .update({
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    throw new Error(message);
  }
}
