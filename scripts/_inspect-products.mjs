/**
 * Inspect Higlou products table for the logged-in user's listings.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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
    if (v === "[SENSITIVE]") continue;
    values[t.slice(0, i).trim()] = v;
  }
  return values;
}

const env = {
  ...parseEnv(".env"),
  ...parseEnv(".env.local"),
  ...parseEnv(".env.vercel.pull"),
};

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || key === "[SENSITIVE]") {
  console.error("Missing supabase creds", { url: !!url, key: !!key });
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: products, error } = await sb
  .from("products")
  .select("id,title,brand,status,user_id,created_at,updated_at")
  .order("updated_at", { ascending: false })
  .limit(30);

console.log("ERROR", error);
console.log("COUNT", products?.length);
for (const p of products || []) {
  console.log(
    `${(p.updated_at || "").slice(0, 19)} | ${p.status} | ${(p.brand || "").slice(0, 12).padEnd(12)} | ${(p.title || "").slice(0, 50)} | user=${String(p.user_id).slice(0, 8)}`,
  );
}

const { data: users } = await sb
  .from("users")
  .select("id,email,full_name")
  .limit(20);
console.log("\nUSERS", users);

const { count } = await sb
  .from("products")
  .select("*", { count: "exact", head: true });
console.log("TOTAL PRODUCTS", count);
