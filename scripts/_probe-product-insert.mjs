/**
 * Try inserting a minimal product as admin@higlou.app via service role
 * to see if DB constraints reject typical payloads.
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const userId = "4a45fbb5-d90a-43ec-b473-6ffa0758aced";

const payload = {
  user_id: userId,
  title: "TEST SAVE PROBE — delete me",
  brand: "TestBrand",
  status: "Needs Review",
  quantity: 1,
  listing_format: "FixedPrice",
  country: "US",
  item_specifics: [
    { key: "C:Brand", label: "Brand", value: "TestBrand", confidence: 0.9 },
  ],
  features: ["a"],
  set_includes: [],
  colors: ["Black"],
  materials: [],
};

const { data, error } = await sb.from("products").insert(payload).select("*").single();
console.log("INSERT", error || { id: data.id, status: data.status, title: data.title });

if (data?.id) {
  const { error: delErr } = await sb.from("products").delete().eq("id", data.id);
  console.log("DELETE", delErr || "ok");
}

// Check column types / constraints via a failing status
const { error: badStatus } = await sb
  .from("products")
  .insert({ ...payload, title: "bad status", status: "Draft" })
  .select("id")
  .single();
console.log("BAD STATUS", badStatus?.message || "accepted Draft");
