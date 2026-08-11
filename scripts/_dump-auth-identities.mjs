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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    values[t.slice(0, i).trim()] = v;
  }
  return values;
}
const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
if (error) throw error;
for (const u of data.users) {
  console.log(JSON.stringify({
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    providers: u.app_metadata?.providers || u.app_metadata?.provider,
    identities: (u.identities || []).map((i) => ({
      provider: i.provider,
      email: i.identity_data?.email,
      name: i.identity_data?.full_name || i.identity_data?.name,
      sub: i.identity_data?.sub,
    })),
    user_metadata: u.user_metadata,
  }));
}
