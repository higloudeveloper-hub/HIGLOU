/**
 * Sanitize env / stored HTTPS URLs.
 * Vercel paste often leaves trailing \n or quotes on NEXT_PUBLIC_SUPABASE_URL,
 * which breaks createClient ("Invalid supabaseUrl") and image public URLs.
 */
export function cleanEnvUrl(value: string | undefined | null): string {
  let v = String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/[\r\n\t]+/g, "")
    .trim();
  // Strip accidental quotes from dashboard paste: "https://..." or 'https://...'
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith("`") && v.endsWith("`"))
  ) {
    v = v.slice(1, -1).trim();
  }
  v = v.replace(/\/+$/, "");
  return v;
}

/** Remove whitespace/newlines that break absolute image URLs. */
export function cleanHttpsUrl(value: string | undefined | null): string {
  return String(value || "")
    .replace(/[\r\n\t]+/g, "")
    .trim();
}

export function getPublicSupabaseUrl(): string {
  const base = cleanEnvUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!base || !/^https?:\/\//i.test(base)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is missing or invalid (must be https://….supabase.co with no quotes/newlines)",
    );
  }
  return base;
}
