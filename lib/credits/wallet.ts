import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  CREDIT_ACTIONS,
  WELCOME_BONUS_CREDITS,
  type CreditActionId,
  type CreditPackId,
  getCreditPack,
} from "@/lib/credits/costs";

export type CreditWalletPublic = {
  balance: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  onboarded: boolean;
  welcomeBonusClaimed: boolean;
  ready: boolean;
  note?: string;
};

type WalletRow = {
  user_id: string;
  balance: number;
  lifetime_granted: number;
  lifetime_spent: number;
  onboarded_at: string | null;
  welcome_bonus_at: string | null;
};

function emptyWallet(note?: string): CreditWalletPublic {
  return {
    balance: 0,
    lifetimeGranted: 0,
    lifetimeSpent: 0,
    onboarded: false,
    welcomeBonusClaimed: false,
    ready: false,
    note,
  };
}

function toPublic(row: WalletRow): CreditWalletPublic {
  return {
    balance: Number(row.balance) || 0,
    lifetimeGranted: Number(row.lifetime_granted) || 0,
    lifetimeSpent: Number(row.lifetime_spent) || 0,
    onboarded: Boolean(row.onboarded_at),
    welcomeBonusClaimed: Boolean(row.welcome_bonus_at),
    ready: true,
  };
}

function adminOrNull() {
  if (!isSupabaseConfigured()) return null;
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

export async function getCreditWallet(
  userId: string,
): Promise<CreditWalletPublic> {
  const admin = adminOrNull();
  if (!admin) return emptyWallet("Supabase required");

  const { data, error } = await admin
    .from("credit_wallets")
    .select(
      "user_id, balance, lifetime_granted, lifetime_spent, onboarded_at, welcome_bonus_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return emptyWallet(
      error.message.includes("credit_wallets")
        ? "Apply migration 20260920_credits.sql"
        : error.message,
    );
  }
  if (!data) return emptyWallet();
  return toPublic(data as WalletRow);
}

async function ensureWalletRow(
  userId: string,
): Promise<{ ok: true; row: WalletRow } | { ok: false; error: string }> {
  const admin = adminOrNull();
  if (!admin) return { ok: false, error: "Supabase required" };

  const existing = await admin
    .from("credit_wallets")
    .select(
      "user_id, balance, lifetime_granted, lifetime_spent, onboarded_at, welcome_bonus_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.error) {
    return {
      ok: false,
      error: existing.error.message.includes("credit_wallets")
        ? "Apply migration 20260920_credits.sql"
        : existing.error.message,
    };
  }
  if (existing.data) return { ok: true, row: existing.data as WalletRow };

  const { data, error } = await admin
    .from("credit_wallets")
    .insert({
      user_id: userId,
      balance: 0,
      lifetime_granted: 0,
      lifetime_spent: 0,
    })
    .select(
      "user_id, balance, lifetime_granted, lifetime_spent, onboarded_at, welcome_bonus_at",
    )
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || "Could not create wallet" };
  }
  return { ok: true, row: data as WalletRow };
}

async function appendLedger(opts: {
  userId: string;
  delta: number;
  balanceAfter: number;
  action: string;
  reason?: string;
  meta?: Record<string, unknown>;
  stripeSessionId?: string | null;
}) {
  const admin = adminOrNull();
  if (!admin) return;
  await admin.from("credit_ledger").insert({
    user_id: opts.userId,
    delta: opts.delta,
    balance_after: opts.balanceAfter,
    action: opts.action,
    reason: opts.reason || null,
    meta: opts.meta || {},
    stripe_session_id: opts.stripeSessionId || null,
  });
}

export async function claimWelcomeBonus(
  userId: string,
): Promise<
  | { ok: true; wallet: CreditWalletPublic; granted: number }
  | { ok: false; error: string }
> {
  const admin = adminOrNull();
  if (!admin) return { ok: false, error: "Supabase required" };

  const ensured = await ensureWalletRow(userId);
  if (!ensured.ok) return ensured;
  if (ensured.row.welcome_bonus_at) {
    return { ok: true, wallet: toPublic(ensured.row), granted: 0 };
  }

  const nextBalance = ensured.row.balance + WELCOME_BONUS_CREDITS;
  const { data, error } = await admin
    .from("credit_wallets")
    .update({
      balance: nextBalance,
      lifetime_granted: ensured.row.lifetime_granted + WELCOME_BONUS_CREDITS,
      welcome_bonus_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .is("welcome_bonus_at", null)
    .select(
      "user_id, balance, lifetime_granted, lifetime_spent, onboarded_at, welcome_bonus_at",
    )
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: true, wallet: await getCreditWallet(userId), granted: 0 };
  }

  await appendLedger({
    userId,
    delta: WELCOME_BONUS_CREDITS,
    balanceAfter: nextBalance,
    action: "welcome_bonus",
    reason: "Welcome pack for new Higlou accounts",
  });

  return {
    ok: true,
    wallet: toPublic(data as WalletRow),
    granted: WELCOME_BONUS_CREDITS,
  };
}

export async function markCreditsOnboarded(
  userId: string,
): Promise<CreditWalletPublic> {
  const admin = adminOrNull();
  if (!admin) return emptyWallet("Supabase required");

  const ensured = await ensureWalletRow(userId);
  if (!ensured.ok) return emptyWallet(ensured.error);
  if (ensured.row.onboarded_at) return toPublic(ensured.row);

  const { data } = await admin
    .from("credit_wallets")
    .update({
      onboarded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select(
      "user_id, balance, lifetime_granted, lifetime_spent, onboarded_at, welcome_bonus_at",
    )
    .single();

  return data ? toPublic(data as WalletRow) : toPublic(ensured.row);
}

export async function spendCredits(opts: {
  userId: string;
  action: CreditActionId;
  reason?: string;
  meta?: Record<string, unknown>;
}): Promise<
  | { ok: true; wallet: CreditWalletPublic; spent: number }
  | {
      ok: false;
      error: string;
      code?: "insufficient" | "unavailable";
      balance?: number;
      needed?: number;
    }
> {
  const admin = adminOrNull();
  if (!admin) {
    return { ok: false, error: "Supabase required", code: "unavailable" };
  }

  const cost = CREDIT_ACTIONS[opts.action].cost;
  const ensured = await ensureWalletRow(opts.userId);
  if (!ensured.ok) {
    // Soft-pass until migration is applied — do not brick the product.
    if (ensured.error.includes("20260920_credits")) {
      return {
        ok: true,
        wallet: emptyWallet(ensured.error),
        spent: 0,
      };
    }
    return { ok: false, error: ensured.error, code: "unavailable" };
  }

  if (ensured.row.balance < cost) {
    return {
      ok: false,
      error: `Necesitás ${cost} créditos. Tenés ${ensured.row.balance}.`,
      code: "insufficient",
      balance: ensured.row.balance,
      needed: cost,
    };
  }

  const nextBalance = ensured.row.balance - cost;
  const { data, error } = await admin
    .from("credit_wallets")
    .update({
      balance: nextBalance,
      lifetime_spent: ensured.row.lifetime_spent + cost,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", opts.userId)
    .gte("balance", cost)
    .select(
      "user_id, balance, lifetime_granted, lifetime_spent, onboarded_at, welcome_bonus_at",
    )
    .maybeSingle();

  if (error) return { ok: false, error: error.message, code: "unavailable" };
  if (!data) {
    return {
      ok: false,
      error: `Necesitás ${cost} créditos.`,
      code: "insufficient",
      balance: ensured.row.balance,
      needed: cost,
    };
  }

  await appendLedger({
    userId: opts.userId,
    delta: -cost,
    balanceAfter: nextBalance,
    action: opts.action,
    reason: opts.reason || CREDIT_ACTIONS[opts.action].label,
    meta: opts.meta,
  });

  return { ok: true, wallet: toPublic(data as WalletRow), spent: cost };
}

/** Refund a prior spend (empty scan, failed action). Soft-noops if wallet missing. */
export async function refundCredits(opts: {
  userId: string;
  action: CreditActionId;
  amount?: number;
  reason?: string;
  meta?: Record<string, unknown>;
}): Promise<{ ok: true; wallet: CreditWalletPublic; refunded: number } | { ok: false; error: string }> {
  const admin = adminOrNull();
  if (!admin) return { ok: false, error: "Supabase required" };

  const amount = Math.max(
    0,
    Math.floor(opts.amount ?? CREDIT_ACTIONS[opts.action].cost),
  );
  if (amount <= 0) {
    const wallet = await getCreditWallet(opts.userId);
    return { ok: true, wallet, refunded: 0 };
  }

  const ensured = await ensureWalletRow(opts.userId);
  if (!ensured.ok) {
    if (ensured.error.includes("20260920_credits")) {
      return { ok: true, wallet: emptyWallet(ensured.error), refunded: 0 };
    }
    return { ok: false, error: ensured.error };
  }

  const nextBalance = ensured.row.balance + amount;
  const nextSpent = Math.max(0, ensured.row.lifetime_spent - amount);
  const { data, error } = await admin
    .from("credit_wallets")
    .update({
      balance: nextBalance,
      lifetime_spent: nextSpent,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", opts.userId)
    .select(
      "user_id, balance, lifetime_granted, lifetime_spent, onboarded_at, welcome_bonus_at",
    )
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message || "Refund failed" };
  }

  await appendLedger({
    userId: opts.userId,
    delta: amount,
    balanceAfter: nextBalance,
    action: `${opts.action}_refund`,
    reason: opts.reason || `Refund ${CREDIT_ACTIONS[opts.action].label}`,
    meta: { ...opts.meta, refundOf: opts.action },
  });

  return { ok: true, wallet: toPublic(data as WalletRow), refunded: amount };
}

export async function rechargeCreditsMock(opts: {
  userId: string;
  packId: CreditPackId | string;
}): Promise<
  | { ok: true; wallet: CreditWalletPublic; granted: number; packId: string }
  | { ok: false; error: string }
> {
  const pack = getCreditPack(opts.packId);
  if (!pack) return { ok: false, error: "Pack inválido" };

  const admin = adminOrNull();
  if (!admin) return { ok: false, error: "Supabase required" };

  const ensured = await ensureWalletRow(opts.userId);
  if (!ensured.ok) return ensured;

  const nextBalance = ensured.row.balance + pack.credits;
  const { data, error } = await admin
    .from("credit_wallets")
    .update({
      balance: nextBalance,
      lifetime_granted: ensured.row.lifetime_granted + pack.credits,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", opts.userId)
    .select(
      "user_id, balance, lifetime_granted, lifetime_spent, onboarded_at, welcome_bonus_at",
    )
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || "Recharge failed" };
  }

  await appendLedger({
    userId: opts.userId,
    delta: pack.credits,
    balanceAfter: nextBalance,
    action: "recharge_mock",
    reason: `Pack ${pack.name} (Stripe pendiente)`,
    meta: {
      packId: pack.id,
      priceUsd: pack.priceUsd,
      stripeReady: false,
    },
  });

  return {
    ok: true,
    wallet: toPublic(data as WalletRow),
    granted: pack.credits,
    packId: pack.id,
  };
}

export async function listCreditLedger(userId: string, limit = 20) {
  const admin = adminOrNull();
  if (!admin) return [];
  const { data } = await admin
    .from("credit_ledger")
    .select("id, delta, balance_after, action, reason, created_at, meta")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

export type CreditEntitlements = {
  plan: "free" | "pro";
  unlockedFeatures: string[];
};

/** Derive Pro plan + feature unlocks from ledger (no extra columns required). */
export async function getCreditEntitlements(
  userId: string,
): Promise<CreditEntitlements> {
  const rows = await listCreditLedger(userId, 120);
  const unlocked = new Set<string>();
  let plan: "free" | "pro" = "free";

  for (const row of rows) {
    const action = String((row as { action?: string }).action || "");
    const meta = ((row as { meta?: Record<string, unknown> }).meta ||
      {}) as Record<string, unknown>;
    if (
      action === "recharge_mock" &&
      (meta.packId === "pro" || meta.unlockPro === true)
    ) {
      plan = "pro";
    }
    if (action === "unlock_pro_plan") plan = "pro";
    if (action === "unlock_pro_feature") {
      const id = String(meta.featureId || "").trim();
      if (id) unlocked.add(id);
    }
  }

  return { plan, unlockedFeatures: [...unlocked] };
}

export async function unlockProFeature(opts: {
  userId: string;
  featureId: string;
  cost: number;
  title: string;
}): Promise<
  | { ok: true; wallet: CreditWalletPublic; entitlements: CreditEntitlements }
  | {
      ok: false;
      error: string;
      code?: "insufficient" | "already" | "unavailable";
      balance?: number;
      needed?: number;
    }
> {
  const entitlements = await getCreditEntitlements(opts.userId);
  if (
    entitlements.plan === "pro" ||
    entitlements.unlockedFeatures.includes(opts.featureId)
  ) {
    return {
      ok: true,
      wallet: await getCreditWallet(opts.userId),
      entitlements,
    };
  }

  const admin = adminOrNull();
  if (!admin) return { ok: false, error: "Supabase required", code: "unavailable" };

  const ensured = await ensureWalletRow(opts.userId);
  if (!ensured.ok) {
    if (ensured.error.includes("20260920_credits")) {
      return {
        ok: true,
        wallet: emptyWallet(ensured.error),
        entitlements: { plan: "pro", unlockedFeatures: [opts.featureId] },
      };
    }
    return { ok: false, error: ensured.error, code: "unavailable" };
  }

  const cost = Math.max(1, Math.floor(opts.cost));
  if (ensured.row.balance < cost) {
    return {
      ok: false,
      error: `Necesitás ${cost} créditos para desbloquear. Tenés ${ensured.row.balance}.`,
      code: "insufficient",
      balance: ensured.row.balance,
      needed: cost,
    };
  }

  const nextBalance = ensured.row.balance - cost;
  const { data, error } = await admin
    .from("credit_wallets")
    .update({
      balance: nextBalance,
      lifetime_spent: ensured.row.lifetime_spent + cost,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", opts.userId)
    .gte("balance", cost)
    .select(
      "user_id, balance, lifetime_granted, lifetime_spent, onboarded_at, welcome_bonus_at",
    )
    .maybeSingle();

  if (error) return { ok: false, error: error.message, code: "unavailable" };
  if (!data) {
    return {
      ok: false,
      error: `Necesitás ${cost} créditos.`,
      code: "insufficient",
      balance: ensured.row.balance,
      needed: cost,
    };
  }

  await appendLedger({
    userId: opts.userId,
    delta: -cost,
    balanceAfter: nextBalance,
    action: "unlock_pro_feature",
    reason: `Unlock Pro · ${opts.title}`,
    meta: { featureId: opts.featureId, cost },
  });

  return {
    ok: true,
    wallet: toPublic(data as WalletRow),
    entitlements: await getCreditEntitlements(opts.userId),
  };
}

export async function unlockProPlanWithCredits(opts: {
  userId: string;
  cost: number;
}): Promise<
  | { ok: true; wallet: CreditWalletPublic; entitlements: CreditEntitlements }
  | {
      ok: false;
      error: string;
      code?: "insufficient" | "unavailable";
      balance?: number;
      needed?: number;
    }
> {
  const entitlements = await getCreditEntitlements(opts.userId);
  if (entitlements.plan === "pro") {
    return {
      ok: true,
      wallet: await getCreditWallet(opts.userId),
      entitlements,
    };
  }

  const admin = adminOrNull();
  if (!admin) return { ok: false, error: "Supabase required", code: "unavailable" };

  const ensured = await ensureWalletRow(opts.userId);
  if (!ensured.ok) {
    if (ensured.error.includes("20260920_credits")) {
      return {
        ok: true,
        wallet: emptyWallet(ensured.error),
        entitlements: { plan: "pro", unlockedFeatures: [] },
      };
    }
    return { ok: false, error: ensured.error, code: "unavailable" };
  }

  const cost = Math.max(1, Math.floor(opts.cost));
  if (ensured.row.balance < cost) {
    return {
      ok: false,
      error: `Necesitás ${cost} créditos para Pro. Tenés ${ensured.row.balance}.`,
      code: "insufficient",
      balance: ensured.row.balance,
      needed: cost,
    };
  }

  const nextBalance = ensured.row.balance - cost;
  const { data, error } = await admin
    .from("credit_wallets")
    .update({
      balance: nextBalance,
      lifetime_spent: ensured.row.lifetime_spent + cost,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", opts.userId)
    .gte("balance", cost)
    .select(
      "user_id, balance, lifetime_granted, lifetime_spent, onboarded_at, welcome_bonus_at",
    )
    .maybeSingle();

  if (error) return { ok: false, error: error.message, code: "unavailable" };
  if (!data) {
    return {
      ok: false,
      error: `Necesitás ${cost} créditos.`,
      code: "insufficient",
      balance: ensured.row.balance,
      needed: cost,
    };
  }

  await appendLedger({
    userId: opts.userId,
    delta: -cost,
    balanceAfter: nextBalance,
    action: "unlock_pro_plan",
    reason: "Unlock Plan Pro",
    meta: { cost },
  });

  return {
    ok: true,
    wallet: toPublic(data as WalletRow),
    entitlements: { plan: "pro", unlockedFeatures: entitlements.unlockedFeatures },
  };
}
