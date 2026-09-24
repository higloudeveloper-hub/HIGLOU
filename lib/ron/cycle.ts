import type { SupabaseClient } from "@supabase/supabase-js";
import { spendCredits } from "@/lib/credits/wallet";
import { publishFacebookPromo } from "@/lib/facebook/promo";
import { loadFacebookPageCredentials } from "@/lib/facebook/connection";
import {
  ensureAffiliateLinksFromKeepaWinners,
  keepaAffiliateShareUrl,
} from "@/lib/monetization/affiliate/from-keepa-winners";
import { resolveUserAssociateTag } from "@/lib/monetization/affiliate/links";
import {
  ensureTaggedAmazonDestination,
  extractAsinFromAmazonUrl,
} from "@/lib/monetization/affiliate/tagged-url";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import {
  buildRonCatalog,
  decideRonPublish,
  rememberPublish,
} from "@/lib/ron/brain";
import {
  filterFreshCatalogAsins,
  learnFromAffiliateClicks,
  loadAsinClickMap,
  shouldSkipPackForCooldown,
} from "@/lib/ron/learn";
import { maybeRunRonKeepaScan } from "@/lib/ron/keepa-scan";
import {
  appendRonActivity,
  loadRonState,
  saveRonPrefs,
  setRonWorking,
} from "@/lib/ron/memory";
import { normalizeRonHit } from "@/lib/ron/normalize-hit";
import {
  RON_ASIN_COOLDOWN_HOURS,
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

type RonAffRow = {
  linkUrl: string;
  imageUrl?: string | null;
  title?: string | null;
  brand?: string | null;
  priceLabel?: string | null;
  clickCount?: number;
};

async function loadAffiliateMap(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, RonAffRow>> {
  const map = new Map<string, RonAffRow>();

  const { data: links } = await supabase
    .from("affiliate_links")
    .select("id, asin, destination_url, click_count")
    .eq("user_id", userId)
    .order("click_count", { ascending: false })
    .limit(200);

  const { data: smart } = await supabase
    .from("smart_links")
    .select("slug, affiliate_link_id, label, destination_url")
    .eq("user_id", userId)
    .limit(200);

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
    const dest = String(link.destination_url || "").trim();
    const asin = (
      String(link.asin || "").trim().toUpperCase() ||
      extractAsinFromAmazonUrl(dest) ||
      ""
    ).toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || map.has(asin)) continue;
    const sl = smartByAff.get(String(link.id));
    const linkUrl = sl ? `${origin}${sl.path}` : dest;
    if (!/^https?:\/\//i.test(linkUrl)) continue;
    map.set(asin, {
      linkUrl,
      // Never use smart-link campaign labels ("Higlou Market", "RON Agent")
      // as the product title — Keepa/ledger fills the real name later.
      title: null,
      clickCount: Number(link.click_count) || 0,
    });
  }

  // Orphan smart links (no affiliate_link_id) — still recoverable via destination ASIN
  for (const s of smart || []) {
    if (s.affiliate_link_id) continue;
    const dest = String(s.destination_url || "").trim();
    const asin = extractAsinFromAmazonUrl(dest);
    if (!asin || map.has(asin)) continue;
    const linkUrl = `${origin}/go/${s.slug}`;
    map.set(asin, {
      linkUrl,
      title: null,
      clickCount: 0,
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
  // Manual "trabajar ahora" + empty ledger → full multi-modality Keepa pass
  const shouldForceScan =
    Boolean(opts.forceScan) ||
    Boolean(opts.force) ||
    ledgerHits.length === 0;

  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "scan",
      message: shouldForceScan
        ? "Escaneo general Keepa · 6 modalidades…"
        : `Ledger: ${ledgerHits.length} oportunidades · Keepa si toca`,
    },
    {
      statusMessage: shouldForceScan
        ? "Trabajando · escaneo general Keepa…"
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
      message: keepa.reason || (keepa.ran ? "Escaneo general listo" : "Keepa en espera"),
    },
    {
      learning,
      statusMessage: keepa.ran
        ? `Trabajando · ${keepa.winners.length} decisiones Keepa`
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
      message: `Pool: ${hits.length} Keepa · ${synced.created} links nuevos · ${synced.reused} listos${
        synced.error ? ` · ${synced.error}` : ""
      }`,
    },
    {
      statusMessage: synced.error
        ? `Trabajando · ${synced.error}`
        : "Trabajando · armando catálogo…",
      working: true,
      lastError: synced.error || null,
    },
  );

  // Existing affiliates first (clicks already prove they convert)
  const affiliateByAsin = await loadAffiliateMap(supabase, userId);

  // Merge just-minted links
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
      clickCount: prev?.clickCount || 0,
    });
  }

  // Fallback: tagged Amazon URL when affiliate engine couldn't mint DB rows
  for (const hit of hits) {
    const asin = String(hit.asin || "")
      .trim()
      .toUpperCase();
    if (!asin || affiliateByAsin.has(asin)) continue;
    const tagged = ensureTaggedAmazonDestination({
      asin,
      associateTag: tag,
    });
    if (!tagged) continue;
    affiliateByAsin.set(asin, {
      linkUrl: tagged,
      imageUrl: hit.imageUrl || null,
      title: hit.title || null,
      brand: hit.brand || null,
      clickCount: 0,
    });
  }

  for (const hit of hits) {
    const asin = String(hit.asin || "")
      .trim()
      .toUpperCase();
    const row = affiliateByAsin.get(asin);
    if (!row) continue;
    if (!row.imageUrl && hit.imageUrl) row.imageUrl = hit.imageUrl;
    if (!row.title && hit.title) row.title = hit.title;
    if (!row.brand && hit.brand) row.brand = hit.brand;
  }

  const catalog = buildRonCatalog({
    hits,
    affiliateByAsin,
    appOrigin: appOrigin(),
  });

  const emptyReason =
    catalog.length > 0
      ? undefined
      : affiliateByAsin.size === 0 && hits.length === 0
        ? "Sin Keepa ni links de afiliado aún · esperá el próximo scan"
        : affiliateByAsin.size === 0
          ? `Tengo ${hits.length} Keepa pero no pude crear links (revisá Associate tag / Money Engine)`
          : `Tengo ${affiliateByAsin.size} links pero sin imagen/ASIN usable`;

  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "scan",
      message: `Catálogo: ${catalog.length} publicables · ${affiliateByAsin.size} afiliados · ${hits.length} Keepa`,
    },
    {
      statusMessage:
        catalog.length > 0
          ? `Trabajando · ${catalog.length} listos para Facebook`
          : `Trabajando · ${emptyReason}`,
      working: true,
    },
  );

  const clickMap = await loadAsinClickMap(supabase, userId);

  // Only never-published ASINs — never fall back to the old catalog
  const freshCatalog = filterFreshCatalogAsins(
    catalog,
    learning,
    RON_ASIN_COOLDOWN_HOURS,
  );

  if (!freshCatalog.length) {
    const msg =
      "Sin oportunidades nuevas · todo el catálogo ya se publicó · espero Keepa fresco";
    await appendRonActivity(
      supabase,
      userId,
      {
        at: new Date().toISOString(),
        kind: "skip",
        message: msg,
      },
      { statusMessage: msg, learning, lastError: null, working: false },
    );
    state = await loadRonState(supabase, userId);
    return finish({ ok: true, state, skipped: msg });
  }

  const decision = decideRonPublish({
    catalog: freshCatalog,
    learning,
    emptyReason:
      "Sin pack nuevo relacionado · espero más oportunidades Keepa",
  });
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

  let publishDecision = decision;
  let packAsins = publishDecision.cards
    .map((c) => String(c.asin || "").toUpperCase())
    .filter(Boolean);

  const gate = shouldSkipPackForCooldown(
    learning,
    packAsins,
    RON_SAME_PACK_COOLDOWN_HOURS,
  );

  if (gate.skip) {
    // Look for a different pack using only fresh ASINs (never republish)
    const altCatalog = freshCatalog.filter((c) => {
      const a = String(c.asin || "").toUpperCase();
      return !packAsins.includes(a);
    });
    const alt = decideRonPublish({
      catalog: altCatalog,
      learning,
      emptyReason:
        "Sin vitrina nueva distinta · no republico lo ya publicado",
    });
    if (alt.action === "publish") {
      const altAsins = alt.cards
        .map((c) => String(c.asin || "").toUpperCase())
        .filter(Boolean);
      const altGate = shouldSkipPackForCooldown(
        learning,
        altAsins,
        RON_SAME_PACK_COOLDOWN_HOURS,
      );
      if (!altGate.skip) {
        publishDecision = alt;
        packAsins = altAsins;
      } else {
        const msg =
          "Sin vitrina nueva · memoria bloquea packs ya publicados · próximo ciclo Keepa";
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
    } else {
      const msg = alt.reason;
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
  }

  const dry = opts.dryRun || state.mode === "watch";
  if (dry) {
    const msg = `Modo watch · preparé ${publishDecision.format}: ${publishDecision.reason}`;
    await appendRonActivity(
      supabase,
      userId,
      {
        at: new Date().toISOString(),
        kind: "skip",
        message: msg,
        format: publishDecision.format,
      },
      { statusMessage: msg, learning, working: false },
    );
    state = await loadRonState(supabase, userId);
    return finish({ ok: true, state, skipped: msg });
  }

  // Solo ads must still carry a live https link (tap → product)
  if (
    publishDecision.format === "ads" &&
    (publishDecision.cards.length < 1 ||
      !/^https?:\/\//i.test(publishDecision.cards[0]?.linkUrl || ""))
  ) {
    const msg = "Abortado · producto sin enlace activo · no publico sin click";
    await appendRonActivity(
      supabase,
      userId,
      {
        at: new Date().toISOString(),
        kind: "skip",
        message: msg,
        format: publishDecision.format,
      },
      { statusMessage: msg, learning, lastError: null, working: false },
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
      message: `Publicando ${publishDecision.format} · ${publishDecision.cards.length} productos · ${publishDecision.niche}…`,
      format: publishDecision.format,
    },
    {
      statusMessage: `Trabajando · publicando ${publishDecision.format} en Facebook…`,
      working: true,
      learning,
    },
  );

  const spent = await spendCredits({
    userId,
    action: "facebook_share",
    reason: `RON ${publishDecision.format}`,
    meta: {
      agent: "ron",
      format: publishDecision.format,
      niche: publishDecision.niche,
    },
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
    format: publishDecision.format,
    message: publishDecision.message,
    cards: publishDecision.cards.map((c) => ({
      id: c.id,
      title: c.title,
      imageUrl: c.imageUrl,
      linkUrl: c.linkUrl,
      priceLabel: c.priceLabel,
      asin: c.asin,
      imageFallbacks: c.imageFallbacks,
      discountPercent: c.discountPercent,
      sourcePlatform: c.sourcePlatform,
    })),
    coverImageUrl: publishDecision.coverImageUrl,
    collectionTitle: publishDecision.collectionTitle,
  });

  if (!published.ok) {
    await appendRonActivity(
      supabase,
      userId,
      {
        at: new Date().toISOString(),
        kind: "error",
        message: published.error,
        format: publishDecision.format,
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
    format: publishDecision.format,
    niche: publishDecision.niche,
    asins: packAsins,
    clicksByAsin: clickMap,
  });

  const postUrl =
    published.mode === "page_post"
      ? published.postUrl
      : published.mode === "sharer"
        ? published.shareUrl
        : null;
  const okMsg = `Publicé ${publishDecision.format} · ${publishDecision.cards.length} productos · ${publishDecision.niche}`;
  await appendRonActivity(
    supabase,
    userId,
    {
      at: new Date().toISOString(),
      kind: "publish",
      message: okMsg,
      format: publishDecision.format,
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
