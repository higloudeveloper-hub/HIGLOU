import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cleanEnvUrl } from "@/lib/images/url-sanitize";

export async function createClient() {
  const url = cleanEnvUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !key) {
    throw new Error("Supabase server env vars are not configured");
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component; middleware can refresh sessions.
        }
      },
    },
  });
}
