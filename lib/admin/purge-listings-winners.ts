import type { SupabaseClient } from "@supabase/supabase-js";

/** Bump to force another full wipe of listings + Find Winners + affiliate ghosts. */
export const LISTINGS_WINNERS_PURGE_VERSION = "2026-09-24-v2-vitrinas";

/** Soft reset: clear RON “already published” memory without wiping affiliates. */
export const RON_MEMORY_RESET_VERSION = "2026-09-25-v3-keepa-unlock";

export type PurgeResult = {
  ok: true;
  cleared: Record<string, number | string>;
  notes: string[];
  version: string;
};

export type PurgeSkipResult = {
  ok: true;
  skipped: true;
  version: string;
  stamped?: number;
};

async function countRows(
  admin: SupabaseClient,
  table: string,
): Promise<number | null> {
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}

/** Delete all rows in a table (service role). Returns deleted estimate. */
async function wipeTable(
  admin: SupabaseClient,
  table: string,
  filterCol: string,
): Promise<{ table: string; before: number | null; error?: string }> {
  const before = await countRows(admin, table);
  if (before === null) {
    return { table, before: null, error: "missing or inaccessible" };
  }
  if (before === 0) return { table, before: 0 };

  // Broad filter so PostgREST accepts DELETE (needs a WHERE)
  const { error } =
    filterCol === "id"
      ? await admin
          .from(table)
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000")
      : filterCol === "asin"
        ? await admin.from(table).delete().neq("asin", "")
        : filterCol === "user_id"
          ? await admin
              .from(table)
              .delete()
              .neq("user_id", "00000000-0000-0000-0000-000000000000")
          : await admin.from(table).delete().gte("created_at", "1970-01-01");

  if (error) return { table, before, error: error.message };
  return { table, before };
}

function stampLearning(
  learning: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next =
    learning && typeof learning === "object" ? { ...learning } : {};
  next.historyPurgeVersion = LISTINGS_WINNERS_PURGE_VERSION;
  next.memoryResetVersion = RON_MEMORY_RESET_VERSION;
  // Wipe publish memory so RON can use Keepa hits again after a catalog wipe
  next.recentPacks = {};
  next.publishedAsins = [];
  next.lastPublishedAt = null;
  next.opsSnapshot = {
    freshAsins: 0,
    catalogAsins: 0,
    lastMoneyScore: 0,
    lastFormat: null,
    pipeline: "idle",
    peakWindow: false,
    moneyHint: "Historial limpio · RON arranca autónomo",
    nextAction: "Escaneo Keepa general en el próximo ciclo",
  };
  return next;
}

/**
 * Clear RON publish cooldowns without deleting affiliate / Keepa data.
 * Call after a hard purge so Keepa hits are not blocked as “already published”.
 */
export async function maybeResetRonPublishMemory(
  admin: SupabaseClient,
): Promise<{ reset: number; skipped: boolean; error?: string }> {
  const { data: ronRows, error } = await admin
    .from("ron_agent_state")
    .select("user_id, learning");
  if (error) return { reset: 0, skipped: true, error: error.message };
  if (!ronRows?.length) {
    // Force-clear via broad update in case select shape differs
    const blank = stampLearning({});
    const { error: upErr, count } = await admin
      .from("ron_agent_state")
      .update(
        {
          learning: blank,
          status_message: "Memoria RON limpia · Keepa desbloqueado",
          last_error: null,
          is_working: false,
        },
        { count: "exact" },
      )
      .neq("user_id", "00000000-0000-0000-0000-000000000000");
    if (upErr) return { reset: 0, skipped: true, error: upErr.message };
    return { reset: count ?? 0, skipped: (count ?? 0) === 0 };
  }

  let reset = 0;
  for (const row of ronRows) {
    const learning =
      row.learning && typeof row.learning === "object"
        ? (row.learning as Record<string, unknown>)
        : {};
    if (learning.memoryResetVersion === RON_MEMORY_RESET_VERSION) {
      // Still ensure recentPacks is empty (partial stamps)
      const packs = learning.recentPacks;
      const packCount =
        packs && typeof packs === "object" ? Object.keys(packs).length : 0;
      if (packCount === 0) continue;
    }
    const next = stampLearning(learning);
    const { error: upErr } = await admin
      .from("ron_agent_state")
      .update({
        learning: next,
        status_message: "Memoria RON limpia · Keepa desbloqueado",
        last_error: null,
        is_working: false,
      })
      .eq("user_id", row.user_id);
    if (!upErr) reset += 1;
  }
  return { reset, skipped: reset === 0 };
}

/**
 * Wipe Find Winners ledger + listings + affiliate ghosts so Facebook
 * vitrinas don't resurrect empty-photo ASINs.
 */
export async function purgeListingsAndFindWinners(
  admin: SupabaseClient,
): Promise<PurgeResult> {
  const cleared: Record<string, number | string> = {};
  const notes: string[] = [];

  // Order matters: clicks → smart_links → affiliate_links → campaigns
  for (const [table, col] of [
    ["affiliate_clicks", "id"],
    ["smart_links", "id"],
    ["affiliate_links", "id"],
    ["affiliate_campaigns", "id"],
    ["opportunity_ledger", "asin"],
    ["opportunity_niche_stats", "user_id"],
    ["products", "id"],
  ] as const) {
    const r = await wipeTable(admin, table, col);
    if (r.error) {
      cleared[table] = `skip: ${r.error}`;
      notes.push(`${table}: ${r.error}`);
    } else {
      cleared[table] = r.before ?? 0;
    }
  }

  // Soft-reset RON memory so it does not avoid “already published” ghosts
  const { data: ronRows, error: ronErr } = await admin
    .from("ron_agent_state")
    .select("user_id, learning");
  if (ronErr) {
    notes.push(`ron_agent_state: ${ronErr.message}`);
  } else {
    let reset = 0;
    for (const row of ronRows || []) {
      const learning = stampLearning(
        row.learning as Record<string, unknown> | null,
      );
      const { error } = await admin
        .from("ron_agent_state")
        .update({
          learning,
          activity_log: [],
          status_message: "Historial limpio · listo para trabajar solo",
          last_error: null,
          posts_today: 0,
          is_working: false,
        })
        .eq("user_id", row.user_id);
      if (!error) reset += 1;
    }
    cleared.ron_agent_state_reset = reset;
  }

  notes.push(
    "Find Winners + listings + afiliados fantasma borrados. RON reescanea Keepa con fotos reales.",
  );

  return {
    ok: true,
    cleared,
    notes,
    version: LISTINGS_WINNERS_PURGE_VERSION,
  };
}

/**
 * One-shot on production: wipe ghost history once per
 * LISTINGS_WINNERS_PURGE_VERSION, then stamp RON so it never re-runs.
 *
 * Safety: if ANY row is already stamped for this version, never wipe again
 * (avoids wiping Keepa winners when a select returns empty / partial).
 * If there are zero ron rows, skip — do not nuke the ledger blindly.
 */
export async function maybeAutoPurgeListingsWinners(
  admin: SupabaseClient,
): Promise<PurgeResult | PurgeSkipResult> {
  const { data: ronRows, error } = await admin
    .from("ron_agent_state")
    .select("user_id, learning")
    .limit(100);

  if (error) {
    return {
      ok: true,
      skipped: true,
      version: LISTINGS_WINNERS_PURGE_VERSION,
    };
  }

  const rows = ronRows || [];
  // No agent rows yet → do not wipe Keepa / affiliates
  if (rows.length === 0) {
    return {
      ok: true,
      skipped: true,
      version: LISTINGS_WINNERS_PURGE_VERSION,
    };
  }

  const anyStamped = rows.some((row) => {
    const learning =
      row.learning && typeof row.learning === "object"
        ? (row.learning as Record<string, unknown>)
        : {};
    return learning.historyPurgeVersion === LISTINGS_WINNERS_PURGE_VERSION;
  });

  if (anyStamped) {
    // Stamp any unstamped rows without wiping live Keepa data
    for (const row of rows) {
      const learning =
        row.learning && typeof row.learning === "object"
          ? (row.learning as Record<string, unknown>)
          : {};
      if (learning.historyPurgeVersion === LISTINGS_WINNERS_PURGE_VERSION) {
        continue;
      }
      const next = {
        ...learning,
        historyPurgeVersion: LISTINGS_WINNERS_PURGE_VERSION,
        memoryResetVersion: RON_MEMORY_RESET_VERSION,
      };
      await admin
        .from("ron_agent_state")
        .update({ learning: next })
        .eq("user_id", row.user_id);
    }
    return {
      ok: true,
      skipped: true,
      version: LISTINGS_WINNERS_PURGE_VERSION,
      stamped: rows.length,
    };
  }

  // First run for this version — full wipe including affiliate ghosts
  return purgeListingsAndFindWinners(admin);
}

/**
 * True when a ledger/hit image is usable for Facebook / Market.
 * Prefer a real https URL; ASIN alone is OK only as a signal that Amazon CDN
 * can fill — callers must still resolve to https before upsert.
 */
export function hasUsableProductImage(
  imageUrl?: string | null,
  asin?: string | null,
): boolean {
  const url = String(imageUrl || "").trim();
  if (
    /^https?:\/\//i.test(url) &&
    !/placeholder|via\.placeholder|example\.com/i.test(url)
  ) {
    return true;
  }
  return /^[A-Z0-9]{10}$/i.test(String(asin || "").trim());
}

/** Require a real https image URL (after CDN fill). */
export function hasHttpsProductImage(imageUrl?: string | null): boolean {
  const url = String(imageUrl || "").trim();
  return (
    /^https?:\/\//i.test(url) &&
    !/placeholder|via\.placeholder|example\.com/i.test(url)
  );
}
