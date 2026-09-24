import type { SupabaseClient } from "@supabase/supabase-js";
import type { RonFormat, RonLearning } from "@/lib/ron/types";
import {
  RON_DEFAULT_LEARNING,
  RON_NICHE_COOLDOWN_HOURS,
  RON_PACK_MEMORY_HOURS,
} from "@/lib/ron/types";

export type AsinClickMap = Map<string, number>;

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
    opsSnapshot: learning.opsSnapshot,
  };

  const { data: links } = await supabase
    .from("affiliate_links")
    .select("asin, click_count, source")
    .eq("user_id", userId)
    .order("click_count", { ascending: false })
    .limit(80);

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

  if (clicks > learning.clicksSeen) {
    const gained = clicks - learning.clicksSeen;
    next.formats.vitrina = (next.formats.vitrina || 1) + gained * 0.05;
    next.formats.carousel = (next.formats.carousel || 1) + gained * 0.03;
    next.formats.ads = (next.formats.ads || 1) + gained * 0.02;
  }
  next.clicksSeen = Math.max(clicks, learning.clicksSeen);

  return next;
}

/** Live click counts per ASIN for interest detection. */
export async function loadAsinClickMap(
  supabase: SupabaseClient,
  userId: string,
): Promise<AsinClickMap> {
  const map: AsinClickMap = new Map();
  const { data: links } = await supabase
    .from("affiliate_links")
    .select("asin, destination_url, click_count")
    .eq("user_id", userId)
    .order("click_count", { ascending: false })
    .limit(200);
  for (const row of links || []) {
    const asin = String(row.asin || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
    const count = Number(row.click_count) || 0;
    map.set(asin, Math.max(map.get(asin) || 0, count));
  }
  return map;
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

/** True if this niche was published recently (variety guard). */
export function isRecentNiche(
  learning: RonLearning,
  niche: string,
  cooldownHours = RON_NICHE_COOLDOWN_HOURS,
): boolean {
  const key = String(niche || "")
    .trim()
    .toLowerCase();
  if (!key) return false;
  const ts = Number(learning.recentPacks?.[`niche:${key}`] || 0);
  if (!ts) return false;
  return Date.now() - ts < cooldownHours * 60 * 60_000;
}

/** After a successful post, remember what RON shipped + click snapshot. */
export function rememberPublish(
  learning: RonLearning,
  opts: {
    format: RonFormat;
    niche?: string;
    asins: string[];
    /** Click counts at publish time — used later to detect interest */
    clicksByAsin?: Record<string, number> | AsinClickMap;
  },
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
    opsSnapshot: learning.opsSnapshot,
  };
  next.formats[opts.format] = (next.formats[opts.format] || 1) + 0.2;
  const niche = String(opts.niche || "")
    .trim()
    .toLowerCase();
  if (niche) {
    next.niches[niche] = (next.niches[niche] || 0) + 0.35;
    next.recentPacks![`niche:${niche}`] = Date.now();
  }
  const asins: string[] = [];
  const now = Date.now();
  const clickSrc = opts.clicksByAsin;
  for (const asin of opts.asins) {
    const id = asin.toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(id)) continue;
    next.asins[id] = (next.asins[id] || 0) + 0.25;
    asins.push(id);
    next.recentPacks![`asin:${id}`] = now;
    let clicksAt = 0;
    if (clickSrc instanceof Map) clicksAt = Number(clickSrc.get(id) || 0);
    else if (clickSrc) clicksAt = Number(clickSrc[id] || 0);
    next.recentPacks![`clicksAt:${id}`] = clicksAt;
  }
  if (asins.length) {
    const key = [...asins].sort().join("|");
    next.recentPacks![key] = now;
    const cutoff = now - RON_PACK_MEMORY_HOURS * 60 * 60_000;
    for (const [k, ts] of Object.entries(next.recentPacks!)) {
      if (k.startsWith("clicksAt:")) continue;
      if (Number(ts) < cutoff) {
        delete next.recentPacks![k];
        if (k.startsWith("asin:")) {
          const id = k.slice(5);
          delete next.recentPacks![`clicksAt:${id}`];
        }
      }
    }
  }
  return next;
}

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

export function isRecentOverlappingPack(
  learning: RonLearning,
  asins: string[],
  cooldownHours: number,
): boolean {
  const ids = [
    ...new Set(
      asins.map((a) => a.toUpperCase()).filter((a) => /^[A-Z0-9]{10}$/.test(a)),
    ),
  ];
  if (!ids.length) return false;
  if (isRecentSamePack(learning, ids, cooldownHours)) return true;
  const cutoff = Date.now() - cooldownHours * 60 * 60_000;
  // Any shared ASIN already published → overlapping (never re-mix old into new)
  for (const id of ids) {
    const ts = Number(learning.recentPacks?.[`asin:${id}`] || 0);
    if (ts >= cutoff) return true;
  }
  return false;
}

/**
 * How many new clicks this pack earned since RON last published those ASINs.
 * Kept for analytics — does NOT unlock republish.
 */
export function packClickGainSincePublish(
  learning: RonLearning,
  asins: string[],
  currentClicks: AsinClickMap | Record<string, number>,
): number {
  const ids = [
    ...new Set(
      asins.map((a) => a.toUpperCase()).filter((a) => /^[A-Z0-9]{10}$/.test(a)),
    ),
  ];
  let gain = 0;
  for (const id of ids) {
    const published = Number(learning.recentPacks?.[`asin:${id}`] || 0);
    if (!published) continue;
    const at = Number(learning.recentPacks?.[`clicksAt:${id}`] || 0);
    const now =
      currentClicks instanceof Map
        ? Number(currentClicks.get(id) || 0)
        : Number(currentClicks[id] || 0);
    gain += Math.max(0, now - at);
  }
  return gain;
}

/** @deprecated Interest never unlocks the same vitrina again. */
export function packHasInterest(
  _learning: RonLearning,
  _asins: string[],
  _currentClicks: AsinClickMap | Record<string, number>,
  _minGain?: number,
): boolean {
  return false;
}

/**
 * Block same/overlapping packs always.
 * Fresh opportunities only — never republish a vitrina already shipped.
 */
export function shouldSkipPackForCooldown(
  learning: RonLearning,
  asins: string[],
  cooldownHours: number,
  _currentClicks?: AsinClickMap | Record<string, number> | null,
): { skip: boolean; reason: "fresh" | "cooldown" | "interest" } {
  if (!isRecentOverlappingPack(learning, asins, cooldownHours)) {
    return { skip: false, reason: "fresh" };
  }
  return { skip: true, reason: "cooldown" };
}

/**
 * Catalog slice with only never-published (or cooldown-expired) ASINs.
 * Interest republish is disabled — published ASINs stay out until cooldown ends.
 */
export function filterFreshCatalogAsins<T extends { asin?: string | null }>(
  catalog: T[],
  learning: RonLearning,
  cooldownHours: number,
  _opts?: {
    currentClicks?: AsinClickMap | Record<string, number> | null;
    keepInterest?: boolean;
  },
): T[] {
  const cutoff = Date.now() - cooldownHours * 60 * 60_000;
  return catalog.filter((c) => {
    const id = String(c.asin || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(id)) return true;
    const ts = Number(learning.recentPacks?.[`asin:${id}`] || 0);
    if (!ts || ts < cutoff) return true;
    return false;
  });
}
