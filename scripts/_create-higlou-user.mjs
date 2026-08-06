/**
 * Create a new Higlou auth user (service role).
 * Usage: node scripts/_create-higlou-user.mjs email@example.com Password123!
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
    "Usage: node scripts/_create-higlou-user.mjs email@example.com Password123!",
  );
  process.exit(1);
}

const env = { ...parseEnv(".env"), ...parseEnv(".env.local") };
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: listed, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (listError) {
  console.error(listError.message);
  process.exit(1);
}

const existing = listed.users.find((u) => u.email?.toLowerCase() === email);
let userId = existing?.id;

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(`Updated existing user: ${email}`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Higlou Admin" },
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  userId = data.user?.id;
  console.log(`Created user: ${email}`);
}

if (!userId) {
  console.error("No user id");
  process.exit(1);
}

const { error: profileError } = await admin.from("users").upsert(
  {
    id: userId,
    email,
    full_name: "Higlou Admin",
  },
  { onConflict: "id" },
);

if (profileError) {
  console.warn("Profile upsert warning:", profileError.message);
} else {
  console.log("Profile ok");
}

// Verify password works
const anon = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const { data: signIn, error: signInError } =
  await anon.auth.signInWithPassword({ email, password });
if (signInError) {
  console.error("VERIFY FAILED:", signInError.message);
  process.exit(1);
}
console.log("VERIFY OK signed in as", signIn.user?.email);
await anon.auth.signOut();
