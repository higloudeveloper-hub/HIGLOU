export type RonMode = "auto" | "watch";

export type RonFormat = "ads" | "carousel" | "vitrina";

export type RonActivity = {
  at: string;
  kind: "scan" | "learn" | "publish" | "skip" | "error" | "wake";
  message: string;
  format?: RonFormat;
  postUrl?: string | null;
};

export type RonLearning = {
  /** niche → success score */
  niches: Record<string, number>;
  /** format → success score */
  formats: Record<string, number>;
  /** asin → times published / click boost */
  asins: Record<string, number>;
  /** total observed affiliate clicks attributed after posts */
  clicksSeen: number;
  cycles: number;
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
};

export const RON_DEFAULT_LEARNING: RonLearning = {
  niches: {},
  formats: { ads: 1, carousel: 1.2, vitrina: 1.4 },
  asins: {},
  clicksSeen: 0,
  cycles: 0,
};

/** Max organic posts RON may publish per calendar day (credits + spam safety). */
export const RON_MAX_POSTS_PER_DAY = 6;

/** Minimum minutes between automatic publishes. */
export const RON_MIN_MINUTES_BETWEEN_POSTS = 90;
