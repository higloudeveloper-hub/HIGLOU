/**
 * Sanitize env / stored HTTPS URLs.
 * Vercel paste often leaves trailing \n on NEXT_PUBLIC_SUPABASE_URL, which
 * produces broken image URLs like "https://xxx.supabase.co\n/storage/...".
 */
export function cleanEnvUrl(value: string | undefined | null): string {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/[\r\n\t]+/g, "")
    .trim()
    .replace(/\/+$/, "");
}

/** Remove whitespace/newlines that break absolute image URLs. */
export function cleanHttpsUrl(value: string | undefined | null): string {
  return String(value || "")
    .replace(/[\r\n\t]+/g, "")
    .trim();
}

export function getPublicSupabaseUrl(): string {
  const base = cleanEnvUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!base) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  }
  return base;
}
