import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RON_DEFAULT_LEARNING,
  type RonActivity,
  type RonLearning,
  type RonMode,
  type RonPublicState,
} from "@/lib/ron/types";

type Row = {
  user_id: string;
  enabled: boolean;
  mode: string;
  status_message: string;
  last_run_at: string | null;
  last_post_at: string | null;
  last_error: string | null;
  posts_today: number;
  posts_today_date: string | null;
  learning: RonLearning | null;
  activity_log: RonActivity[] | null;
  updated_at: string;
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseLearning(raw: unknown): RonLearning {
  if (!raw || typeof raw !== "object") return { ...RON_DEFAULT_LEARNING };
  const o = raw as Partial<RonLearning>;
  return {
    niches: o.niches && typeof o.niches === "object" ? o.niches : {},
    formats:
      o.formats && typeof o.formats === "object"
        ? { ...RON_DEFAULT_LEARNING.formats, ...o.formats }
        : { ...RON_DEFAULT_LEARNING.formats },
    asins: o.asins && typeof o.asins === "object" ? o.asins : {},
    clicksSeen: Number(o.clicksSeen) || 0,
    cycles: Number(o.cycles) || 0,
    lastKeepaScanAt: o.lastKeepaScanAt || null,
    recentPacks:
      o.recentPacks && typeof o.recentPacks === "object" ? o.recentPacks : {},
  };
}

function parseActivity(raw: unknown): RonActivity[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === "object" && "message" in a)
    .slice(0, 40) as RonActivity[];
}

export function toPublicState(
  row: Partial<Row> | null,
  opts?: { working?: boolean },
): RonPublicState {
  const postsDate = row?.posts_today_date || null;
  const postsToday =
    postsDate === todayUtc() ? Number(row?.posts_today) || 0 : 0;
  return {
    enabled: Boolean(row?.enabled),
    mode: row?.mode === "watch" ? "watch" : "auto",
    statusMessage: String(row?.status_message || "Apagado"),
    lastRunAt: row?.last_run_at || null,
    lastPostAt: row?.last_post_at || null,
    lastError: row?.last_error || null,
    postsToday,
    learning: parseLearning(row?.learning),
    activity: parseActivity(row?.activity_log),
    working: Boolean(opts?.working),
  };
}

export async function loadRonState(
  supabase: SupabaseClient,
  userId: string,
): Promise<RonPublicState> {
  const { data, error } = await supabase
    .from("ron_agent_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // Table not migrated yet — UI still boots with defaults
    if (/ron_agent_state|schema cache|does not exist|42P01/i.test(error.message)) {
      return toPublicState(null);
    }
    return toPublicState(null);
  }
  if (!data) return toPublicState(null);
  return toPublicState(data as Row);
}

export async function ensureRonRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  await supabase.from("ron_agent_state").upsert(
    {
      user_id: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
}

export async function saveRonPrefs(
  supabase: SupabaseClient,
  userId: string,
  prefs: { enabled?: boolean; mode?: RonMode; statusMessage?: string },
): Promise<RonPublicState> {
  await ensureRonRow(supabase, userId);
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (prefs.enabled != null) {
    patch.enabled = prefs.enabled;
    patch.status_message = prefs.enabled
      ? prefs.statusMessage || "Encendido · esperando ciclo"
      : "Apagado";
    if (!prefs.enabled) patch.last_error = null;
  }
  if (prefs.mode) patch.mode = prefs.mode;
  if (prefs.statusMessage) patch.status_message = prefs.statusMessage;

  await supabase.from("ron_agent_state").upsert(
    { user_id: userId, ...patch },
    { onConflict: "user_id" },
  );
  return loadRonState(supabase, userId);
}

export async function appendRonActivity(
  supabase: SupabaseClient,
  userId: string,
  entry: RonActivity,
  extra?: Partial<{
    statusMessage: string;
    lastError: string | null;
    lastRunAt: string;
    lastPostAt: string;
    learning: RonLearning;
    bumpPost: boolean;
  }>,
): Promise<void> {
  const current = await loadRonState(supabase, userId);
  const activity = [entry, ...current.activity].slice(0, 40);
  const today = todayUtc();
  let postsToday = current.postsToday;
  if (extra?.bumpPost) postsToday += 1;

  const patch: Record<string, unknown> = {
    user_id: userId,
    activity_log: activity,
    status_message: extra?.statusMessage || entry.message,
    last_run_at: extra?.lastRunAt || new Date().toISOString(),
    learning: extra?.learning || current.learning,
    posts_today: postsToday,
    posts_today_date: today,
    updated_at: new Date().toISOString(),
  };
  if (extra?.lastError !== undefined) patch.last_error = extra.lastError;
  if (extra?.lastPostAt) patch.last_post_at = extra.lastPostAt;

  await supabase.from("ron_agent_state").upsert(patch, {
    onConflict: "user_id",
  });
}

export async function listEnabledRonUsers(
  admin: SupabaseClient,
): Promise<string[]> {
  const { data } = await admin
    .from("ron_agent_state")
    .select("user_id")
    .eq("enabled", true)
    .limit(80);
  return (data || []).map((r) => String(r.user_id));
}
