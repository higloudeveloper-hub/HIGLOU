/**
 * Reset Higlou login password for a user (service role).
 * Usage: node scripts/_reset-higlou-password.mjs email@example.com NewPassword123!
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

const email = (process.argv[2] || "").trim().toLowerCase();
const password = process.argv[3] || "";
if (!email || !password || password.length < 8) {
  console.error(
    "Usage: node scripts/_reset-higlou-password.mjs email@example.com NewPassword123!",
  );
  process.exit(1);
}

const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data, error } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (error) {
  console.error(error.message);
  process.exit(1);
}

const user = data.users.find((u) => u.email?.toLowerCase() === email);
if (!user) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true,
});
if (updateError) {
  console.error(updateError.message);
  process.exit(1);
}

console.log(`Password updated for ${email}`);
