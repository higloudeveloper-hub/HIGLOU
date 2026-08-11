import { createBrowserClient } from "@supabase/ssr";
import { cleanEnvUrl } from "@/lib/images/url-sanitize";

export function createClient() {
  const url = cleanEnvUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !key) {
    throw new Error("Supabase browser env vars are not configured");
  }
  return createBrowserClient(url, key);
}
