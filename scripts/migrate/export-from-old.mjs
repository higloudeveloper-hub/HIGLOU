/**
 * Export all Higlou tables + auth users from the OLD Supabase (service role).
 * Usage: node scripts/migrate/export-from-old.mjs
 * Writes: _migration_backup/export-YYYYMMDD-HHMMSS/
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function parseEnv(file) {
  const values = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    values[t.slice(0, i).trim()] = v;
  }
  return values;
}

const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const TABLES = [
  "users",
  "products",
  "product_images",
  "product_item_specifics",
  "ebay_templates",
  "ebay_policy_settings",
  "store_branding",
  "generated_csv_files",
  "analysis_history",
  "ai_usage_events",
  "image_analysis_cache",
  "product_analysis_cache",
  "budget_settings",
  "provider_pricing_settings",
  "db_products",
  "db_product_images",
  "db_offers",
  "db_offer_notifications",
  "db_buyer_profiles",
  "don_baraton_orders",
  "don_baraton_order_items",
  "don_baraton_shipments",
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join("_migration_backup", `export-${stamp}`);
mkdirSync(outDir, { recursive: true });

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAll(table) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) {
      if (
        error.code === "PGRST205" ||
        /Could not find the table/i.test(error.message)
      ) {
        return { missing: true, rows: [] };
      }
      throw new Error(`${table}: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { missing: false, rows };
}

const summary = {
  source: url,
  exported_at: new Date().toISOString(),
  tables: {},
  auth_users: 0,
};

console.log("Exporting from", url);
console.log("Output:", outDir);

for (const table of TABLES) {
  process.stdout.write(`  ${table}... `);
  const { missing, rows } = await fetchAll(table);
  if (missing) {
    console.log("MISSING");
    summary.tables[table] = { missing: true, count: 0 };
    continue;
  }
  writeFileSync(join(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
  console.log(rows.length);
  summary.tables[table] = { missing: false, count: rows.length };
}

// Auth users (for recreate)
const { data: authData, error: authErr } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (authErr) {
  console.error("auth listUsers:", authErr.message);
} else {
  const users = (authData.users || []).map((u) => ({
    id: u.id,
    email: u.email,
    email_confirmed_at: u.email_confirmed_at,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    user_metadata: u.user_metadata,
    app_metadata: u.app_metadata,
    providers: u.app_metadata?.providers || u.app_metadata?.provider,
  }));
  writeFileSync(join(outDir, "auth_users.json"), JSON.stringify(users, null, 2));
  summary.auth_users = users.length;
  console.log(`  auth_users... ${users.length}`);
}

writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
writeFileSync(
  join("_migration_backup", "LATEST"),
  outDir.replace(/\\/g, "/"),
  "utf8",
);
console.log("\nDONE. summary:", JSON.stringify(summary.tables, null, 2));
console.log("Auth users:", summary.auth_users);
