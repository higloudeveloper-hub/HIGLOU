/**
 * List Auth users (emails only) for the linked Supabase project.
 * Usage: node scripts/_list-auth-emails.mjs
 */
import { readFileSync, existsSync } from "node:fs";
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
    values[t.slice(0, i).trim()] = v;
  }
  return values;
}

const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 100,
});
if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log("project:", url);
for (const u of data.users) {
  const providers = (u.identities || []).map((i) => i.provider).join(",") || "-";
  console.log(
    `${(u.created_at || "").slice(0, 10)} | ${u.email} | providers=${providers}`,
  );
}
