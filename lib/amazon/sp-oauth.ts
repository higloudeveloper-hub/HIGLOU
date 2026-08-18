import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAmazonSellingPartnerId } from "@/lib/amazon/sp-api";
import { isAmazonRefreshToken } from "@/lib/amazon/seller-id";
import {
  amazonCallbackUrl,
  amazonSpMissingReason,
  getAmazonSpConfig,
  isAmazonSpConfigured,
} from "@/lib/amazon/sp-config";
import {
  decryptSecret,
  encryptSecret,
  signOAuthState,
  verifyOAuthState,
} from "@/lib/ebay/crypto-tokens";

export type AmazonTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type?: string;
};

export type AmazonConnectionPublic = {
  connected: boolean;
  configured: boolean;
  env: "sandbox" | "production";
  sellingPartnerId: string | null;
  marketplaceId: string | null;
  connectedAt: string | null;
  lastError: string | null;
  missingReason?: string;
};

type AmazonConnectionRow = {
  user_id: string;
  selling_partner_id: string | null;
  marketplace_id: string | null;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  connected_at: string | null;
  revoked_at: string | null;
  last_error: string | null;
};

export function buildAmazonAuthorizeUrl(userId: string): { url: string; state: string } {
  if (!isAmazonSpConfigured()) {
    throw new Error(amazonSpMissingReason());
  }
  const cfg = getAmazonSpConfig();
  const state = signOAuthState(userId, cfg.encryptionKey);
  const params = new URLSearchParams({
    application_id: cfg.applicationId,
    state,
  });
  if (cfg.draftApp) params.set("version", "beta");
  return {
    url: `${cfg.authorizeBase}?${params.toString()}`,
    state,
  };
}

export function parseAmazonOAuthState(state: string) {
  const cfg = getAmazonSpConfig();
  return verifyOAuthState(state, cfg.encryptionKey);
}

async function postLwaToken(body: URLSearchParams): Promise<AmazonTokenResponse> {
  const cfg = getAmazonSpConfig();
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as AmazonTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || `Amazon token exchange failed (${res.status})`,
    );
  }
  return json;
}

export async function exchangeAmazonAuthorizationCode(code: string, origin?: string) {
  const cfg = getAmazonSpConfig();
  return postLwaToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: amazonCallbackUrl(origin),
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  );
}

export async function refreshAmazonAccessToken(refreshToken: string) {
  const cfg = getAmazonSpConfig();
  return postLwaToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  );
}

export async function saveAmazonSelfAuthorizeToken(
  supabase: SupabaseClient,
  userId: string,
  refreshToken: string,
  sellingPartnerIdHint = "",
) {
  if (!isAmazonSpConfigured()) {
    throw new Error(amazonSpMissingReason());
  }
  const token = String(refreshToken || "").trim();
  if (!isAmazonRefreshToken(token)) {
    throw new Error(
      "Paste the Amazon refresh token (it starts with Atzr|). Copy it from Authorize application, not the Client Secret.",
    );
  }

  const tokens = await refreshAmazonAccessToken(token);
  const sellingPartnerId =
    sellingPartnerIdHint.trim() ||
    (await resolveAmazonSellingPartnerId(tokens.access_token));
  if (!sellingPartnerId) {
    throw new Error(
      "Amazon connected the token but did not return a seller id. Add AMAZON_SELLING_PARTNER_ID (Merchant token from Seller Central).",
    );
  }

  await upsertAmazonConnection(supabase, userId, {
    ...tokens,
    refresh_token: tokens.refresh_token || token,
  }, sellingPartnerId);
}

export async function upsertAmazonConnection(
  supabase: SupabaseClient,
  userId: string,
  tokens: AmazonTokenResponse,
  sellingPartnerId: string,
) {
  const cfg = getAmazonSpConfig();
  if (!tokens.refresh_token) {
    throw new Error("Amazon did not return a refresh_token");
  }
  const expiresAt = new Date(
    Date.now() + Math.max(60, Number(tokens.expires_in || 3600) - 60) * 1000,
  ).toISOString();

  const payload = {
    user_id: userId,
    selling_partner_id: sellingPartnerId || null,
    marketplace_id: cfg.marketplaceId,
    refresh_token_enc: encryptSecret(tokens.refresh_token, cfg.encryptionKey),
    access_token_enc: encryptSecret(tokens.access_token, cfg.encryptionKey),
    access_token_expires_at: expiresAt,
    connected_at: new Date().toISOString(),
    revoked_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("amazon_connections")
    .upsert(payload, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

export async function getAmazonConnectionPublic(
  supabase: SupabaseClient,
  userId: string,
): Promise<AmazonConnectionPublic> {
  const configured = isAmazonSpConfigured();
  const cfg = getAmazonSpConfig();
  if (!configured) {
    return {
      connected: false,
      configured: false,
      env: cfg.env,
      sellingPartnerId: null,
      marketplaceId: null,
      connectedAt: null,
      lastError: null,
      missingReason: amazonSpMissingReason(),
    };
  }

  const { data, error } = await supabase
    .from("amazon_connections")
    .select(
      "selling_partner_id, marketplace_id, connected_at, revoked_at, last_error",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return {
      connected: false,
      configured: true,
      env: cfg.env,
      sellingPartnerId: null,
      marketplaceId: null,
      connectedAt: null,
      lastError: error.message,
    };
  }

  const row = data as Partial<AmazonConnectionRow> | null;
  const connected = Boolean(row?.connected_at && !row?.revoked_at);
  return {
    connected,
    configured: true,
    env: cfg.env,
    sellingPartnerId: connected ? row?.selling_partner_id || null : null,
    marketplaceId: connected ? row?.marketplace_id || cfg.marketplaceId : null,
    connectedAt: connected ? row?.connected_at || null : null,
    lastError: row?.last_error || null,
  };
}

export async function revokeAmazonConnection(
  supabase: SupabaseClient,
  userId: string,
) {
  const { error } = await supabase
    .from("amazon_connections")
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

export async function getValidAmazonAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ token: string; sellingPartnerId: string }> {
  if (!isAmazonSpConfigured()) {
    throw new Error(amazonSpMissingReason());
  }
  const cfg = getAmazonSpConfig();
  const { data, error } = await supabase
    .from("amazon_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const row = data as AmazonConnectionRow | null;
  if (!row || row.revoked_at || !row.refresh_token_enc) {
    throw new Error("Connect your Amazon seller account in Settings first.");
  }
  let sellingPartnerId = String(row.selling_partner_id || "").trim();

  const expiresAt = row.access_token_expires_at
    ? new Date(row.access_token_expires_at).getTime()
    : 0;
  if (row.access_token_enc && expiresAt > Date.now() + 60_000) {
    const token = decryptSecret(row.access_token_enc, cfg.encryptionKey);
    if (!sellingPartnerId) {
      sellingPartnerId = await resolveAmazonSellingPartnerId(token);
    }
    if (!sellingPartnerId) {
      throw new Error("Amazon seller id is missing. Disconnect and connect again.");
    }
    return { token, sellingPartnerId };
  }

  const refreshToken = decryptSecret(row.refresh_token_enc, cfg.encryptionKey);
  try {
    const tokens = await refreshAmazonAccessToken(refreshToken);
    if (!sellingPartnerId) {
      sellingPartnerId = await resolveAmazonSellingPartnerId(tokens.access_token);
    }
    if (!sellingPartnerId) {
      throw new Error("Amazon seller id is missing. Disconnect and connect again.");
    }
    const nextExpires = new Date(
      Date.now() + Math.max(60, Number(tokens.expires_in || 3600) - 60) * 1000,
    ).toISOString();
    await supabase
      .from("amazon_connections")
      .update({
        selling_partner_id: sellingPartnerId,
        access_token_enc: encryptSecret(tokens.access_token, cfg.encryptionKey),
        access_token_expires_at: nextExpires,
        refresh_token_enc: tokens.refresh_token
          ? encryptSecret(tokens.refresh_token, cfg.encryptionKey)
          : row.refresh_token_enc,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return { token: tokens.access_token, sellingPartnerId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Amazon token refresh failed";
    await supabase
      .from("amazon_connections")
      .update({
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    throw new Error(message);
  }
}
