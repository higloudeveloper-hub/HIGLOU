import type { SupabaseClient } from "@supabase/supabase-js";

/** Bump to force another full wipe of listings + Find Winners. */
export const LISTINGS_WINNERS_PURGE_VERSION = "2026-09-24-v1";

export type PurgeResult = {
  ok: true;
  cleared: Record<string, number | string>;
  notes: string[];
  version: string;
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
  next.recentPacks = {};
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
 * Wipe Find Winners ledger + Higlou listing products so RON / Market
 * start from a clean autonomous slate (no ghost ASINs without photos).
 */
export async function purgeListingsAndFindWinners(
  admin: SupabaseClient,
): Promise<PurgeResult> {
  const cleared: Record<string, number | string> = {};
  const notes: string[] = [];

  // Find Winners / Market feed source
  for (const [table, col] of [
    ["opportunity_ledger", "asin"],
    ["opportunity_niche_stats", "user_id"],
  ] as const) {
    const r = await wipeTable(admin, table, col);
    if (r.error) {
      cleared[table] = `skip: ${r.error}`;
      notes.push(`${table}: ${r.error}`);
    } else {
      cleared[table] = r.before ?? 0;
    }
  }

  // Listing history — product_images cascade from products
  const products = await wipeTable(admin, "products", "id");
  if (products.error) {
    cleared.products = `skip: ${products.error}`;
    notes.push(`products: ${products.error}`);
  } else {
    cleared.products = products.before ?? 0;
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
    "Find Winners + listings borrados. RON vuelve a escanear Keepa con fotos reales.",
  );

  return {
    ok: true,
    cleared,
    notes,
    version: LISTINGS_WINNERS_PURGE_VERSION,
  };
}

/**
 * One-shot on production: wipe ghost listing / Find Winners history once per
 * LISTINGS_WINNERS_PURGE_VERSION, then stamp RON so it never re-runs.
 */
export async function maybeAutoPurgeListingsWinners(
  admin: SupabaseClient,
): Promise<PurgeResult | { ok: true; skipped: true; version: string }> {
  const { data: ronRows } = await admin
    .from("ron_agent_state")
    .select("user_id, learning")
    .limit(100);

  const rows = ronRows || [];
  const allStamped =
    rows.length > 0 &&
    rows.every((row) => {
      const learning =
        row.learning && typeof row.learning === "object"
          ? (row.learning as Record<string, unknown>)
          : {};
      return learning.historyPurgeVersion === LISTINGS_WINNERS_PURGE_VERSION;
    });

  if (allStamped) {
    return {
      ok: true,
      skipped: true,
      version: LISTINGS_WINNERS_PURGE_VERSION,
    };
  }

  // Also wipe when there is ledger/product junk but no RON rows yet
  const ledgerCount = await countRows(admin, "opportunity_ledger");
  const productCount = await countRows(admin, "products");
  if (allStamped === false && rows.length === 0) {
    if ((ledgerCount || 0) === 0 && (productCount || 0) === 0) {
      return {
        ok: true,
        skipped: true,
        version: LISTINGS_WINNERS_PURGE_VERSION,
      };
    }
  }

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
