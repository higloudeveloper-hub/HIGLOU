import type { SupabaseClient } from "@supabase/supabase-js";
import type { RonFormat, RonLearning } from "@/lib/ron/types";
import { RON_DEFAULT_LEARNING } from "@/lib/ron/types";

/**
 * Reinforce niches / formats / ASINs from affiliate click counts.
 * RON watches platform movement and leans into what converts.
 */
export async function learnFromAffiliateClicks(
  supabase: SupabaseClient,
  userId: string,
  learning: RonLearning,
): Promise<RonLearning> {
  const next: RonLearning = {
    niches: { ...learning.niches },
    formats: { ...RON_DEFAULT_LEARNING.formats, ...learning.formats },
    asins: { ...learning.asins },
    strategies: {
      ...RON_DEFAULT_LEARNING.strategies,
      ...(learning.strategies || {}),
    },
    clicksSeen: learning.clicksSeen,
    cycles: learning.cycles + 1,
    lastKeepaScanAt: learning.lastKeepaScanAt || null,
    recentPacks: { ...(learning.recentPacks || {}) },
  };

  const { data: links } = await supabase
    .from("affiliate_links")
    .select("asin, click_count, source")
    .eq("user_id", userId)
    .order("click_count", { ascending: false })
    .limit(40);

  let clicks = 0;
  for (const row of links || []) {
    const asin = String(row.asin || "")
      .trim()
      .toUpperCase();
    const count = Number(row.click_count) || 0;
    clicks += count;
    if (!asin || count <= 0) continue;
    next.asins[asin] = (next.asins[asin] || 0) + Math.min(count, 20) * 0.15;
  }

  // Soft boost formats that RON already used when clicks are growing
  if (clicks > learning.clicksSeen) {
    const gained = clicks - learning.clicksSeen;
    next.formats.vitrina = (next.formats.vitrina || 1) + gained * 0.05;
    next.formats.carousel = (next.formats.carousel || 1) + gained * 0.03;
    next.formats.ads = (next.formats.ads || 1) + gained * 0.02;
  }
  next.clicksSeen = Math.max(clicks, learning.clicksSeen);

  return next;
}

export function scoreFormat(learning: RonLearning, format: RonFormat): number {
  return Number(learning.formats[format]) || 1;
}

export function scoreAsin(learning: RonLearning, asin?: string | null): number {
  const id = String(asin || "")
    .trim()
    .toUpperCase();
  if (!id) return 1;
  return 1 + Math.min(3, Number(learning.asins[id]) || 0);
}

export function scoreNiche(learning: RonLearning, niche: string): number {
  const key = niche.trim().toLowerCase();
  if (!key) return 1;
  return 1 + Math.min(2, Number(learning.niches[key]) || 0);
}

/** After a successful post, remember what RON shipped. */
export function rememberPublish(
  learning: RonLearning,
  opts: { format: RonFormat; niche?: string; asins: string[] },
): RonLearning {
  const next: RonLearning = {
    niches: { ...learning.niches },
    formats: { ...learning.formats },
    asins: { ...learning.asins },
    strategies: {
      ...RON_DEFAULT_LEARNING.strategies,
      ...(learning.strategies || {}),
    },
    clicksSeen: learning.clicksSeen,
    cycles: learning.cycles,
    lastKeepaScanAt: learning.lastKeepaScanAt || null,
    recentPacks: { ...(learning.recentPacks || {}) },
  };
  next.formats[opts.format] = (next.formats[opts.format] || 1) + 0.2;
  const niche = String(opts.niche || "")
    .trim()
    .toLowerCase();
  if (niche) next.niches[niche] = (next.niches[niche] || 0) + 0.35;
  const asins: string[] = [];
  const now = Date.now();
  for (const asin of opts.asins) {
    const id = asin.toUpperCase();
    if (/^[A-Z0-9]{10}$/.test(id)) {
      next.asins[id] = (next.asins[id] || 0) + 0.25;
      asins.push(id);
      // Per-ASIN fingerprint so we don't reshuffle the same vitrina
      next.recentPacks![`asin:${id}`] = now;
    }
  }
  if (asins.length) {
    const key = [...asins].sort().join("|");
    next.recentPacks![key] = now;
    // Prune packs older than 72h
    const cutoff = now - 72 * 60 * 60_000;
    for (const [k, ts] of Object.entries(next.recentPacks!)) {
      if (Number(ts) < cutoff) delete next.recentPacks![k];
    }
  }
  return next;
}

/** True if this exact ASIN set was published recently (not a new opportunity). */
export function isRecentSamePack(
  learning: RonLearning,
  asins: string[],
  cooldownHours: number,
): boolean {
  const key = [...asins.map((a) => a.toUpperCase()).filter(Boolean)]
    .sort()
    .join("|");
  if (!key) return false;
  const ts = Number(learning.recentPacks?.[key] || 0);
  if (!ts) return false;
  return Date.now() - ts < cooldownHours * 60 * 60_000;
}

/**
 * True when ≥ half the ASINs (or any for packs ≤2) were posted recently.
 * Stops reshuffled “same vitrina” with one product swapped.
 */
export function isRecentOverlappingPack(
  learning: RonLearning,
  asins: string[],
  cooldownHours: number,
): boolean {
  const ids = [
    ...new Set(asins.map((a) => a.toUpperCase()).filter((a) => /^[A-Z0-9]{10}$/.test(a))),
  ];
  if (!ids.length) return false;
  if (isRecentSamePack(learning, ids, cooldownHours)) return true;
  const cutoff = Date.now() - cooldownHours * 60 * 60_000;
  let hit = 0;
  for (const id of ids) {
    const ts = Number(learning.recentPacks?.[`asin:${id}`] || 0);
    if (ts >= cutoff) hit += 1;
  }
  if (ids.length <= 2) return hit >= 1;
  return hit / ids.length >= 0.5;
}

/** Filter catalog down to ASINs that are still fresh to post. */
export function filterFreshCatalogAsins<T extends { asin?: string | null }>(
  catalog: T[],
  learning: RonLearning,
  cooldownHours: number,
): T[] {
  const cutoff = Date.now() - cooldownHours * 60 * 60_000;
  return catalog.filter((c) => {
    const id = String(c.asin || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(id)) return true;
    const ts = Number(learning.recentPacks?.[`asin:${id}`] || 0);
    return !ts || ts < cutoff;
  });
}
