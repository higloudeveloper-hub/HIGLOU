export type RonMode = "auto" | "watch";

export type RonFormat = "ads" | "carousel" | "vitrina";

export type RonActivity = {
  at: string;
  kind: "scan" | "learn" | "publish" | "skip" | "error" | "wake";
  message: string;
  format?: RonFormat;
  postUrl?: string | null;
};

export type RonPublicState = {
  enabled: boolean;
  mode: RonMode;
  statusMessage: string;
  lastRunAt: string | null;
  lastPostAt: string | null;
  lastError: string | null;
  postsToday: number;
  learning: RonLearning;
  activity: RonActivity[];
  working: boolean;
  /** Live marketplace ops snapshot (no extra table) */
  ops?: {
    freshAsins: number;
    catalogAsins: number;
    lastMoneyScore: number;
    lastFormat: string | null;
    pipeline: string;
    peakWindow: boolean;
    moneyHint: string;
    nextAction: string;
  };
};

export type RonLearning = {
  /** niche → success score */
  niches: Record<string, number>;
  /** format → success score */
  formats: Record<string, number>;
  /** asin → times published / click boost */
  asins: Record<string, number>;
  /** Keepa modality → success score (velocity, hot_deals, …) */
  strategies: Record<string, number>;
  /** total observed affiliate clicks attributed after posts */
  clicksSeen: number;
  cycles: number;
  /** ISO timestamp of last live Keepa scan (max 1/hour) */
  lastKeepaScanAt?: string | null;
  /**
   * Fingerprints of recent publishes (sorted ASINs).
   * Used so RON only posts again when there is a *new* opportunity.
   */
  recentPacks?: Record<string, number>;
  /** Soft memory-reset stamp — once set, auto-purge must not wipe recentPacks */
  memoryResetVersion?: string | null;
  /** Last marketplace ops snapshot persisted with learning */
  opsSnapshot?: {
    freshAsins: number;
    catalogAsins: number;
    lastMoneyScore: number;
    lastFormat: string | null;
    pipeline: string;
    peakWindow: boolean;
    moneyHint: string;
    nextAction: string;
  };
};

export const RON_DEFAULT_LEARNING: RonLearning = {
  niches: {},
  formats: { ads: 1, carousel: 1.2, vitrina: 1.4 },
  asins: {},
  strategies: {
    velocity: 1.2,
    amazon_oos: 1.1,
    price_drop: 1.15,
    seller_vacuum: 1.05,
    rising_price: 1,
    hot_deals: 1.25,
  },
  clicksSeen: 0,
  cycles: 0,
  lastKeepaScanAt: null,
  recentPacks: {},
};

/** Soft safety for credits — opportunity-driven, not a timer between posts. */
export const RON_MAX_POSTS_PER_DAY = 12;

/** Live Keepa scans: at most one per hour. */
export const RON_KEEPA_SCAN_MIN_MINUTES = 60;

/** Don't re-publish the exact same pack within this window (hours). */
export const RON_SAME_PACK_COOLDOWN_HOURS = 168; // 7 days — never spam same vitrina

/** Don't reuse an ASIN that already went out recently (hours). */
export const RON_ASIN_COOLDOWN_HOURS = 168; // 7 days — same as pack cooldown

/**
 * How long to keep publish fingerprints in learning memory (hours).
 * Longer than ASIN cooldown so RON remembers what already shipped.
 */
export const RON_PACK_MEMORY_HOURS = 720; // 30 days

/**
 * @deprecated Interest republish disabled — same vitrina never goes out twice.
 * Kept for type compat; always treat as unreachable.
 */
export const RON_REPUBLISH_MIN_CLICK_GAIN = 999;

/** Soft floor: niche cooldown so variety stays high across cycles (hours). */
export const RON_NICHE_COOLDOWN_HOURS = 12;
