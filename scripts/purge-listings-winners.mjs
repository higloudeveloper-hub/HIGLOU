/**
 * One-shot: wipe Find Winners ledger + Higlou listing products.
 * Usage: node scripts/purge-listings-winners.mjs
 * Loads .env.local manually (node --env-file can miss empty-overwrite cases).
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Never overwrite a non-empty process env with an empty file value
    if (!val && process.env[key]) continue;
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Prefer: curl production bootstrap after deploy");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function wipe(table, col) {
  const { count } = await admin
    .from(table)
    .select("*", { count: "exact", head: true });
  const before = count ?? 0;
  if (before === 0) return { table, before: 0 };

  let q = admin.from(table).delete();
  if (col === "id") {
    q = q.neq("id", "00000000-0000-0000-0000-000000000000");
  } else if (col === "asin") {
    q = q.neq("asin", "");
  } else if (col === "user_id") {
    q = q.neq("user_id", "00000000-0000-0000-0000-000000000000");
  } else {
    q = q.gte("created_at", "1970-01-01");
  }
  const { error } = await q;
  if (error) return { table, before, error: error.message };
  return { table, before };
}

const PURGE_VERSION = "2026-09-24-v1";

const results = [];
for (const [table, col] of [
  ["opportunity_ledger", "asin"],
  ["opportunity_niche_stats", "user_id"],
  ["products", "id"],
]) {
  const r = await wipe(table, col);
  results.push(r);
  console.log(r);
}

const { data: ronRows, error: ronErr } = await admin
  .from("ron_agent_state")
  .select("user_id, learning");
if (ronErr) {
  console.log("ron reset skip:", ronErr.message);
} else {
  let reset = 0;
  for (const row of ronRows || []) {
    const learning =
      row.learning && typeof row.learning === "object" ? { ...row.learning } : {};
    learning.historyPurgeVersion = PURGE_VERSION;
    learning.recentPacks = {};
    learning.opsSnapshot = {
      freshAsins: 0,
      catalogAsins: 0,
      lastMoneyScore: 0,
      lastFormat: null,
      pipeline: "idle",
      peakWindow: false,
      moneyHint: "Historial limpio · RON arranca autónomo",
      nextAction: "Escaneo Keepa general en el próximo ciclo",
    };
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
  console.log({ ron_agent_state_reset: reset, version: PURGE_VERSION });
}

console.log("DONE — Find Winners + listings purged");
