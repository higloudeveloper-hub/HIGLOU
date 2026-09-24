import type { SupabaseClient } from "@supabase/supabase-js";
import { spendCredits } from "@/lib/credits/wallet";
import { publishFacebookPromo } from "@/lib/facebook/promo";
import { loadFacebookPageCredentials } from "@/lib/facebook/connection";
import {
  ensureAffiliateLinksFromKeepaWinners,
  keepaAffiliateShareUrl,
} from "@/lib/monetization/affiliate/from-keepa-winners";
import { resolveUserAssociateTag } from "@/lib/monetization/affiliate/links";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import {
  buildRonCatalog,
  decideRonPublish,
  rememberPublish,
} from "@/lib/ron/brain";
import { isRecentSamePack, learnFromAffiliateClicks } from "@/lib/ron/learn";
import { maybeRunRonKeepaScan } from "@/lib/ron/keepa-scan";
import {
  appendRonActivity,
  loadRonState,
  saveRonPrefs,
  setRonWorking,
} from "@/lib/ron/memory";
import { normalizeRonHit } from "@/lib/ron/normalize-hit";
import {
  RON_MAX_POSTS_PER_DAY,
  RON_SAME_PACK_COOLDOWN_HOURS,
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

/**
 * Load Keepa opportunities from the ledger.
 * Prefer row.asin (always present) over payload-only — payload can be partial.
 */
async function loadKeepaHits(
  supabase: SupabaseClient,
  userId: string,
): Promise<OpportunityProduct[]> {
  const { data } = await supabase
    .from("opportunity_ledger")
    .select("asin, payload, title, brand, image_url, net_profit, score, mode")
    .eq("user_id", userId)
    .order("net_profit", { ascending: false })
    .limit(80);

  const hits: OpportunityProduct[] = [];
  const seen = new Set<string>();

  for (const row of data || []) {
    const payload = (row.payload && typeof row.payload === "object"
      ? row.payload
      : {}) as Partial<OpportunityProduct>;
    const merged = normalizeRonHit({
      ...payload,
      asin: payload.asin || row.asin,
      title: payload.title || row.title || payload.ebayTitle,
      brand: payload.brand || row.brand,
      imageUrl: payload.imageUrl || String(row.image_url || ""),
      image_url: row.image_url,
      net_profit: row.net_profit,
      netProfit: payload.netProfit ?? row.net_profit,
      score: payload.score ?? row.score,
      mode: payload.mode || (row.mode as OpportunityProduct["mode"]) || "amazon",
      keepa: payload.keepa ?? true,
    });
    if (!merged) continue;
    if (seen.has(merged.asin)) continue;
    seen.add(merged.asin);
    hits.push(merged);
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
    .limit(120);

  const { data: smart } = await supabase
    .from("smart_links")
    .select("slug, affiliate_link_id, label, destination_url")
    .eq("user_id", userId)
    .limit(120);

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
 * One RON work cycle:
 * Learn → Keepa scan (max 1/h, forced when empty/manual) → sync affiliates →
 * publish when there is a NEW opportunity. No fixed minutes-between-posts timer.
 */
export async function runRonCycle(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    /** Manual "trabajar ahora" */
    force?: boolean;
    forceScan?: boolean;
    dryRun?: boolean;
  },
): Promise<RonCycleResult> {
  const userId = opts.userId;
  let state = await loadRonState(supabase, userId);

  if (!state.enabled && !opts.force) {
    return { ok: true, state, skipped: "RON está apagado" };
  }

  await setRonWorking(supabase, userId, true, "Trabajando · despertando…");
  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "wake",
      message: "RON despertó · buscando oportunidades…",
    },
    { statusMessage: "Trabajando · buscando oportunidades", working: true },
  );

  const finish = async (
    result: RonCycleResult,
    workingMsg?: string,
  ): Promise<RonCycleResult> => {
    await setRonWorking(
      supabase,
      userId,
      false,
      workingMsg || result.state.statusMessage,
    );
    result.state = await loadRonState(supabase, userId);
    return result;
  };

  // Soft daily credit safety (not a timer between posts)
  if (!opts.force && state.postsToday >= RON_MAX_POSTS_PER_DAY) {
    const msg = `Tope diario ${RON_MAX_POSTS_PER_DAY} posts · mañana sigo`;
    await appendRonActivity(
      supabase,
      userId,
      { at: new Date().toISOString(), kind: "skip", message: msg },
      { statusMessage: msg, lastError: null, working: false },
    );
    state = await loadRonState(supabase, userId);
    return finish({ ok: true, state, skipped: msg });
  }

  const creds = await loadFacebookPageCredentials(supabase, userId);
  if (!creds) {
    const msg = "Conectá tu Page de Facebook para que RON publique solo";
    await appendRonActivity(
      supabase,
      userId,
      { at: new Date().toISOString(), kind: "error", message: msg },
      { statusMessage: msg, lastError: msg, working: false },
    );
    state = await loadRonState(supabase, userId);
    return finish({ ok: false, state, error: msg });
  }

  const tag = await resolveUserAssociateTag(supabase, userId);
  if (!tag) {
    const msg = "Falta Associate tag · RON no publica sin comisión";
    await appendRonActivity(
      supabase,
      userId,
      { at: new Date().toISOString(), kind: "error", message: msg },
      { statusMessage: msg, lastError: msg, working: false },
    );
    state = await loadRonState(supabase, userId);
    return finish({ ok: false, state, error: msg });
  }

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
    { learning, statusMessage: "Trabajando · aprendiendo de clicks…", working: true },
  );

  // Peek ledger first — if empty, force a Keepa scan even inside the hour window
  let ledgerHits = await loadKeepaHits(supabase, userId);
  const shouldForceScan =
    Boolean(opts.forceScan) || ledgerHits.length === 0;

  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "scan",
      message: shouldForceScan
        ? "Escaneando Keepa en vivo…"
        : `Ledger: ${ledgerHits.length} oportunidades · Keepa si toca`,
    },
    {
      statusMessage: shouldForceScan
        ? "Trabajando · Keepa en vivo…"
        : "Trabajando · revisando ledger Keepa…",
      working: true,
    },
  );

  const keepa = await maybeRunRonKeepaScan(supabase, {
    userId,
    learning,
    force: shouldForceScan,
    pageOrigin: appOrigin(),
  });
  learning = keepa.learning;
  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "scan",
      message: keepa.reason || (keepa.ran ? "Keepa listo" : "Keepa en espera"),
    },
    {
      learning,
      statusMessage: keepa.ran
        ? `Trabajando · Keepa: ${keepa.winners.length} trends`
        : keepa.reason || "Trabajando · usando ledger Keepa…",
      working: true,
    },
  );

  // Fresh ledger after scan (scan persists winners)
  ledgerHits = await loadKeepaHits(supabase, userId);

  const byAsin = new Map<string, OpportunityProduct>();
  for (const h of [...keepa.winners, ...ledgerHits]) {
    const n = normalizeRonHit(h);
    if (!n) continue;
    if (!byAsin.has(n.asin)) byAsin.set(n.asin, n);
  }
  const hits = [...byAsin.values()];

  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "scan",
      message: `Sincronizando afiliados · ${hits.length} ASINs`,
    },
    { statusMessage: "Trabajando · creando links de afiliado…", working: true },
  );

  const synced = await ensureAffiliateLinksFromKeepaWinners(supabase, {
    userId,
    hits,
    source: "ron",
    campaignName: "RON Agent",
    limit: 40,
  });

  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "scan",
      message: `Pool: ${hits.length} winners · ${synced.created} links nuevos · ${synced.reused} listos${
        synced.error ? ` · ${synced.error}` : ""
      }`,
    },
    {
      statusMessage: synced.error
        ? `Trabajando · ${synced.error}`
        : "Trabajando · eligiendo oportunidad…",
      working: true,
      lastError: synced.error || null,
    },
  );

  const affiliateByAsin = await loadAffiliateMap(supabase, userId);

  // Immediately merge just-minted links (avoid race / stale read)
  for (const link of synced.links) {
    const asin = String(link.asin || "")
      .trim()
      .toUpperCase();
    if (!asin) continue;
    const url = keepaAffiliateShareUrl(link);
    if (!/^https?:\/\//i.test(url)) continue;
    const hit = byAsin.get(asin);
    const prev = affiliateByAsin.get(asin);
    affiliateByAsin.set(asin, {
      linkUrl: url,
      imageUrl: prev?.imageUrl || hit?.imageUrl || null,
      title: prev?.title || hit?.title || null,
    });
  }

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

  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "scan",
      message: `Catálogo listo: ${catalog.length} productos publicables`,
    },
    {
      statusMessage:
        catalog.length > 0
          ? `Trabajando · ${catalog.length} listos para Facebook`
          : "Trabajando · sin catálogo aún…",
      working: true,
    },
  );

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
      { statusMessage: decision.reason, learning, lastError: null, working: false },
    );
    state = await loadRonState(supabase, userId);
    return finish({ ok: true, state, skipped: decision.reason });
  }

  const packAsins = decision.cards
    .map((c) => String(c.asin || "").toUpperCase())
    .filter(Boolean);

  // Intelligent: only skip if THIS same opportunity was already posted recently
  if (
    !opts.force &&
    isRecentSamePack(learning, packAsins, RON_SAME_PACK_COOLDOWN_HOURS)
  ) {
    const msg =
      "Misma oportunidad ya publicada · espero trends nuevas de Keepa";
    await appendRonActivity(
      supabase,
      userId,
      {
        at: new Date().toISOString(),
        kind: "skip",
        message: msg,
        format: decision.format,
      },
      { statusMessage: msg, learning, lastError: null, working: false },
    );
    state = await loadRonState(supabase, userId);
    return finish({ ok: true, state, skipped: msg });
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
      { statusMessage: msg, learning, working: false },
    );
    state = await loadRonState(supabase, userId);
    return finish({ ok: true, state, skipped: msg });
  }

  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "publish",
      message: `Publicando ${decision.format} · ${decision.niche}…`,
      format: decision.format,
    },
    {
      statusMessage: `Trabajando · publicando ${decision.format} en Facebook…`,
      working: true,
      learning,
    },
  );

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
      { statusMessage: msg, lastError: msg, learning, working: false },
    );
    state = await loadRonState(supabase, userId);
    return finish({ ok: false, state, error: msg });
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
      {
        statusMessage: published.error,
        lastError: published.error,
        learning,
        working: false,
      },
    );
    state = await loadRonState(supabase, userId);
    return finish({ ok: false, state, error: published.error });
  }

  learning = rememberPublish(learning, {
    format: decision.format,
    niche: decision.niche,
    asins: packAsins,
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
      working: false,
    },
  );

  await saveRonPrefs(supabase, userId, {
    enabled: true,
    statusMessage: `Listo · ${okMsg}`,
  });

  state = await loadRonState(supabase, userId);
  return finish({
    ok: true,
    state,
    published: true,
    postUrl,
  });
}
