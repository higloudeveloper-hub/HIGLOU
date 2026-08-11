/**
 * Import Higlou backup into a NEW Supabase project.
 *
 * Env (new project):
 *   NEW_SUPABASE_URL=
 *   NEW_SUPABASE_SERVICE_ROLE_KEY=
 *   NEW_ADMIN_EMAIL=higloudeveloper@gmail.com
 *   NEW_ADMIN_PASSWORD=  (optional; random if omitted)
 *
 * Optional:
 *   BACKUP_DIR=_migration_backup/export-...
 *
 * Usage:
 *   node scripts/migrate/import-to-new.mjs
 *
 * IMPORTANT: Run supabase/bootstrap/001_full_schema.sql in the new project's
 * SQL Editor BEFORE running this script.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

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

const fileEnv = { ...parseEnv(".env"), ...parseEnv(".env.local"), ...parseEnv(".env.migrate") };
const url = process.env.NEW_SUPABASE_URL || fileEnv.NEW_SUPABASE_URL;
const key =
  process.env.NEW_SUPABASE_SERVICE_ROLE_KEY ||
  fileEnv.NEW_SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = (
  process.env.NEW_ADMIN_EMAIL ||
  fileEnv.NEW_ADMIN_EMAIL ||
  "higloudeveloper@gmail.com"
).trim();
const adminPassword =
  process.env.NEW_ADMIN_PASSWORD ||
  fileEnv.NEW_ADMIN_PASSWORD ||
  `Higlou-${randomBytes(6).toString("hex")}!`;

if (!url || !key) {
  console.error(
    "Set NEW_SUPABASE_URL and NEW_SUPABASE_SERVICE_ROLE_KEY (env or .env.migrate)",
  );
  process.exit(1);
}

let backupDir =
  process.env.BACKUP_DIR ||
  fileEnv.BACKUP_DIR ||
  (existsSync("_migration_backup/LATEST")
    ? readFileSync("_migration_backup/LATEST", "utf8").trim()
    : "");
if (!backupDir || !existsSync(backupDir)) {
  console.error("No BACKUP_DIR. Run export-from-old.mjs first.");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ORDER = [
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

function loadJson(name) {
  const p = join(backupDir, name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

async function upsertBatch(table, rows) {
  if (!rows?.length) return 0;
  const chunk = 200;
  let n = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await admin.from(table).upsert(slice, { onConflict: "id" });
    if (error) {
      // users PK is id; some tables may lack id conflict — retry insert
      const { error: e2 } = await admin.from(table).insert(slice);
      if (e2) throw new Error(`${table}: ${error.message} / insert: ${e2.message}`);
    }
    n += slice.length;
  }
  return n;
}

console.log("Import target:", url);
console.log("Backup:", backupDir);

// 1) Recreate auth users (same UUIDs when possible)
const authUsers = loadJson("auth_users.json") || [];
const idMap = new Map(); // oldId -> newId (usually same)

for (const u of authUsers) {
  if (!u.email) continue;
  const isPrimary = u.email.toLowerCase() === adminEmail.toLowerCase();
  const password = isPrimary ? adminPassword : `Migrated-${randomBytes(8).toString("hex")}!`;

  // Try create with same UUID
  let createdId = u.id;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    id: u.id,
    email: u.email,
    email_confirm: true,
    password,
    user_metadata: u.user_metadata || {},
  });

  if (createErr) {
    // Maybe exists or id conflict — create without id / find by email
    const { data: created2, error: e2 } = await admin.auth.admin.createUser({
      email: u.email,
      email_confirm: true,
      password,
      user_metadata: u.user_metadata || {},
    });
    if (e2) {
      // list and match
      const { data: listed } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      const found = listed?.users?.find(
        (x) => x.email?.toLowerCase() === u.email.toLowerCase(),
      );
      if (found) {
        createdId = found.id;
        console.log(`  auth exists ${u.email} -> ${createdId}`);
      } else {
        console.warn(`  auth FAIL ${u.email}: ${createErr.message} / ${e2.message}`);
        continue;
      }
    } else {
      createdId = created2.user.id;
      console.log(`  auth created(new id) ${u.email} -> ${createdId}`);
    }
  } else {
    createdId = created.user.id;
    console.log(`  auth created ${u.email} -> ${createdId}`);
  }
  idMap.set(u.id, createdId);
}

// Ensure primary admin exists
if (![...idMap.values()].length || !authUsers.some((u) => u.email?.toLowerCase() === adminEmail.toLowerCase())) {
  const { data: adminUser, error } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    password: adminPassword,
    user_metadata: { full_name: "Higlou Developer" },
  });
  if (error) {
    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
    const found = listed?.users?.find(
      (x) => x.email?.toLowerCase() === adminEmail.toLowerCase(),
    );
    if (found) idMap.set(found.id, found.id);
    else console.warn("primary admin:", error.message);
  } else {
    idMap.set(adminUser.user.id, adminUser.user.id);
    console.log(`  primary admin ${adminEmail}`);
  }
}

// 2) Rewrite user_id FKs if auth ids changed
function remapUserId(row) {
  if (!row || !row.user_id) return row;
  const next = idMap.get(row.user_id);
  if (next) return { ...row, user_id: next };
  return row;
}
function remapUsersRow(row) {
  if (!row?.id) return row;
  const next = idMap.get(row.id) || row.id;
  return { ...row, id: next };
}

for (const table of ORDER) {
  const rows = loadJson(`${table}.json`);
  if (!rows) {
    console.log(`  skip ${table} (no file)`);
    continue;
  }
  let mapped = rows;
  if (table === "users") mapped = rows.map(remapUsersRow);
  else if (
    [
      "products",
      "product_images",
      "ebay_templates",
      "ebay_policy_settings",
      "store_branding",
      "generated_csv_files",
      "analysis_history",
      "ai_usage_events",
      "image_analysis_cache",
      "product_analysis_cache",
      "budget_settings",
    ].includes(table)
  ) {
    mapped = rows.map(remapUserId);
  }

  // Drop rows whose user_id no longer maps (orphan)
  if (table !== "users" && mapped[0]?.user_id !== undefined) {
    mapped = mapped.filter((r) => !r.user_id || idMap.has(r.user_id) || [...idMap.values()].includes(r.user_id));
  }

  process.stdout.write(`  ${table} (${mapped.length})... `);
  try {
    const n = await upsertBatch(table, mapped);
    console.log(n);
  } catch (e) {
    console.log("FAIL", e.message);
  }
}

const credsPath = join("_migration_backup", "NEW_ADMIN_CREDENTIALS.txt");
writeFileSync(
  credsPath,
  `NEW_SUPABASE_URL=${url}\nADMIN_EMAIL=${adminEmail}\nADMIN_PASSWORD=${adminPassword}\nImported from ${backupDir}\n`,
  "utf8",
);
console.log("\nDONE. Admin credentials written to", credsPath);
console.log(`Login email: ${adminEmail}`);
console.log(`Login password: ${adminPassword}`);
