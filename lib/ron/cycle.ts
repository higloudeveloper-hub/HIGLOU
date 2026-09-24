import type { SupabaseClient } from "@supabase/supabase-js";
import { spendCredits } from "@/lib/credits/wallet";
import { publishFacebookPromo } from "@/lib/facebook/promo";
import { loadFacebookPageCredentials } from "@/lib/facebook/connection";
import { ensureAffiliateLinksFromKeepaWinners } from "@/lib/monetization/affiliate/from-keepa-winners";
import { resolveUserAssociateTag } from "@/lib/monetization/affiliate/links";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import {
  buildRonCatalog,
  decideRonPublish,
  rememberPublish,
} from "@/lib/ron/brain";
import { learnFromAffiliateClicks } from "@/lib/ron/learn";
import {
  appendRonActivity,
  loadRonState,
  saveRonPrefs,
} from "@/lib/ron/memory";
import {
  RON_MAX_POSTS_PER_DAY,
  RON_MIN_MINUTES_BETWEEN_POSTS,
  type RonPublicState,
} from "@/lib/ron/types";

function appOrigin(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  return "https://higlou.vercel.app";
}

async function loadKeepaHits(
  supabase: SupabaseClient,
  userId: string,
): Promise<OpportunityProduct[]> {
  const { data } = await supabase
    .from("opportunity_ledger")
    .select("asin, payload, title, brand, image_url, net_profit")
    .eq("user_id", userId)
    .order("net_profit", { ascending: false })
    .limit(60);

  const hits: OpportunityProduct[] = [];
  for (const row of data || []) {
    const payload = (row.payload || {}) as OpportunityProduct;
    if (payload?.asin) {
      hits.push({
        ...payload,
        imageUrl: payload.imageUrl || String(row.image_url || ""),
        title: payload.title || String(row.title || payload.asin),
        brand: payload.brand || String(row.brand || ""),
      });
    }
  }
  return hits;
}

async function loadAffiliateMap(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  Map<string, { linkUrl: string; imageUrl?: string | null; title?: string | null }>
> {
  const map = new Map<
    string,
    { linkUrl: string; imageUrl?: string | null; title?: string | null }
  >();

  const { data: links } = await supabase
    .from("affiliate_links")
    .select("id, asin, destination_url")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(80);

  const { data: smart } = await supabase
    .from("smart_links")
    .select("slug, affiliate_link_id, label, destination_url")
    .eq("user_id", userId)
    .limit(80);

  const smartByAff = new Map<string, { path: string; label: string }>();
  for (const s of smart || []) {
    const id = String(s.affiliate_link_id || "");
    if (!id || smartByAff.has(id)) continue;
    smartByAff.set(id, {
      path: `/go/${s.slug}`,
      label: String(s.label || ""),
    });
  }

  const origin = appOrigin();
  for (const link of links || []) {
    const asin = String(link.asin || "")
      .trim()
      .toUpperCase();
    if (!asin || map.has(asin)) continue;
    const sl = smartByAff.get(String(link.id));
    const linkUrl = sl
      ? `${origin}${sl.path}`
      : String(link.destination_url || "");
    if (!/^https?:\/\//i.test(linkUrl)) continue;
    map.set(asin, {
      linkUrl,
      title: sl?.label || null,
    });
  }
  return map;
}

export type RonCycleResult = {
  ok: boolean;
  state: RonPublicState;
  published?: boolean;
  postUrl?: string | null;
  skipped?: string;
  error?: string;
};

/**
 * One RON work cycle: learn from Keepa + clicks → decide → publish Facebook.
 */
export async function runRonCycle(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    /** Force a publish even if cooldown (manual "trabajar ahora") */
    force?: boolean;
    /** watch mode never publishes */
    dryRun?: boolean;
  },
): Promise<RonCycleResult> {
  const userId = opts.userId;
  let state = await loadRonState(supabase, userId);

  if (!state.enabled && !opts.force) {
    return { ok: true, state, skipped: "RON está apagado" };
  }

  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "wake",
      message: "RON despertó · escaneando Keepa y la plataforma…",
    },
    { statusMessage: "Trabajando · escaneando" },
  );

  // Guardrails
  if (!opts.force && state.postsToday >= RON_MAX_POSTS_PER_DAY) {
    const msg = `Límite diario (${RON_MAX_POSTS_PER_DAY} posts). Duermo hasta mañana.`;
    await appendRonActivity(
      supabase,
      userId,
      { at: new Date().toISOString(), kind: "skip", message: msg },
      { statusMessage: msg, lastError: null },
    );
    state = await loadRonState(supabase, userId);
    return { ok: true, state, skipped: msg };
  }

  if (!opts.force && state.lastPostAt) {
    const mins =
      (Date.now() - new Date(state.lastPostAt).getTime()) / 60_000;
    if (mins < RON_MIN_MINUTES_BETWEEN_POSTS) {
      const wait = Math.ceil(RON_MIN_MINUTES_BETWEEN_POSTS - mins);
      const msg = `Cooldown ${wait} min · no spameo tu Page`;
      await appendRonActivity(
        supabase,
        userId,
        { at: new Date().toISOString(), kind: "skip", message: msg },
        { statusMessage: msg },
      );
      state = await loadRonState(supabase, userId);
      return { ok: true, state, skipped: msg };
    }
  }

  const creds = await loadFacebookPageCredentials(supabase, userId);
  if (!creds) {
    const msg = "Conectá tu Page de Facebook para que RON publique solo";
    await appendRonActivity(
      supabase,
      userId,
      { at: new Date().toISOString(), kind: "error", message: msg },
      { statusMessage: msg, lastError: msg },
    );
    state = await loadRonState(supabase, userId);
    return { ok: false, state, error: msg };
  }

  const tag = await resolveUserAssociateTag(supabase, userId);
  if (!tag) {
    const msg = "Falta Associate tag · RON no publica sin comisión";
    await appendRonActivity(
      supabase,
      userId,
      { at: new Date().toISOString(), kind: "error", message: msg },
      { statusMessage: msg, lastError: msg },
    );
    state = await loadRonState(supabase, userId);
    return { ok: false, state, error: msg };
  }

  // Learn from platform clicks
  let learning = await learnFromAffiliateClicks(
    supabase,
    userId,
    state.learning,
  );
  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "learn",
      message: `Aprendí de ${learning.clicksSeen} clicks · ciclo #${learning.cycles}`,
    },
    { learning, statusMessage: "Aprendiendo de Keepa y clicks…" },
  );

  // Keepa winners → affiliate links
  const hits = await loadKeepaHits(supabase, userId);
  const synced = await ensureAffiliateLinksFromKeepaWinners(supabase, {
    userId,
    hits,
    source: "ron",
    campaignName: "RON Agent",
    limit: 24,
  });

  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "scan",
      message: `Keepa: ${hits.length} winners · ${synced.created} links nuevos · ${synced.reused} listos`,
    },
    { statusMessage: "Eligiendo vitrina / carrusel…" },
  );

  const affiliateByAsin = await loadAffiliateMap(supabase, userId);
  // Enrich images from Keepa hits
  for (const hit of hits) {
    const asin = String(hit.asin || "")
      .trim()
      .toUpperCase();
    const row = affiliateByAsin.get(asin);
    if (row && !row.imageUrl && hit.imageUrl) {
      row.imageUrl = hit.imageUrl;
      row.title = row.title || hit.title;
    }
  }

  const catalog = buildRonCatalog({
    hits,
    affiliateByAsin,
    appOrigin: appOrigin(),
  });

  const decision = decideRonPublish({ catalog, learning });
  if (decision.action === "skip") {
    await appendRonActivity(
      supabase,
      userId,
      {
        at: new Date().toISOString(),
        kind: "skip",
        message: decision.reason,
      },
      { statusMessage: decision.reason, learning, lastError: null },
    );
    state = await loadRonState(supabase, userId);
    return { ok: true, state, skipped: decision.reason };
  }

  const dry = opts.dryRun || state.mode === "watch";
  if (dry) {
    const msg = `Modo watch · preparé ${decision.format}: ${decision.reason}`;
    await appendRonActivity(
      supabase,
      userId,
      {
        at: new Date().toISOString(),
        kind: "skip",
        message: msg,
        format: decision.format,
      },
      { statusMessage: msg, learning },
    );
    state = await loadRonState(supabase, userId);
    return { ok: true, state, skipped: msg };
  }

  // Spend credits then publish
  const spent = await spendCredits({
    userId,
    action: "facebook_share",
    reason: `RON ${decision.format}`,
    meta: { agent: "ron", format: decision.format, niche: decision.niche },
  });
  if (!spent.ok && spent.code === "insufficient") {
    const msg = "Sin créditos · recargá para que RON siga publicando";
    await appendRonActivity(
      supabase,
      userId,
      { at: new Date().toISOString(), kind: "error", message: msg },
      { statusMessage: msg, lastError: msg, learning },
    );
    state = await loadRonState(supabase, userId);
    return { ok: false, state, error: msg };
  }

  const published = await publishFacebookPromo(supabase, {
    userId,
    format: decision.format,
    message: decision.message,
    cards: decision.cards.map((c) => ({
      id: c.id,
      title: c.title,
      imageUrl: c.imageUrl,
      linkUrl: c.linkUrl,
      priceLabel: c.priceLabel,
      asin: c.asin,
      imageFallbacks: c.imageFallbacks,
    })),
    coverImageUrl: decision.coverImageUrl,
    collectionTitle: decision.collectionTitle,
  });

  if (!published.ok) {
    await appendRonActivity(
      supabase,
      userId,
      {
        at: new Date().toISOString(),
        kind: "error",
        message: published.error,
        format: decision.format,
      },
      { statusMessage: published.error, lastError: published.error, learning },
    );
    state = await loadRonState(supabase, userId);
    return { ok: false, state, error: published.error };
  }

  learning = rememberPublish(learning, {
    format: decision.format,
    niche: decision.niche,
    asins: decision.cards
      .map((c) => String(c.asin || ""))
      .filter(Boolean),
  });

  const postUrl =
    published.mode === "page_post" ? published.postUrl : null;
  const okMsg = `Publicé ${decision.format} · ${decision.niche}`;
  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "publish",
      message: okMsg,
      format: decision.format,
      postUrl,
    },
    {
      statusMessage: `Listo · ${okMsg}`,
      lastError: null,
      lastPostAt: new Date().toISOString(),
      learning,
      bumpPost: true,
    },
  );

  // Keep enabled status fresh
  await saveRonPrefs(supabase, userId, {
    enabled: true,
    statusMessage: `Listo · ${okMsg}`,
  });

  state = await loadRonState(supabase, userId);
  return {
    ok: true,
    state,
    published: true,
    postUrl,
  };
}
