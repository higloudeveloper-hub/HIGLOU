/** Drop Amazon/Home Depot chrome that is not a real product bullet. */
export function isUsableCatalogBullet(line: string): boolean {
  const t = String(line || "").replace(/\s+/g, " ").trim();
  if (t.length < 8) return false;
  if (/https?:\/\//i.test(t)) return false;
  if (/\[[^\]]+\]\(/i.test(t)) return false;
  if (
    /video|va-related-videos|widget_feature|make sure this fits|skip to|sign in|cookie|see more/i.test(
      t,
    )
  ) {
    return false;
  }
  return true;
}
