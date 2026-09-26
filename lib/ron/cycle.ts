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
  buildMoneyHint,
  buildNextAction,
  isShoppingPeakWindow,
  scoreCardMoneyOpportunity,
  scorePackMoneyOpportunity,
  shouldHoldForPeak,
} from "@/lib/ron/marketplace-logic";
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
import { hasHttpsProductImage } from "@/lib/admin/purge-listings-winners";

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
 * Uses admin client so cron / force cycles never miss rows due to RLS edge cases.
 */
async function loadKeepaHits(
  _supabase: SupabaseClient,
  userId: string,
): Promise<OpportunityProduct[]> {
  const { createAdminClient, isSupabaseConfigured } = await import(
    "@/lib/supabase/admin"
  );
  if (!isSupabaseConfigured()) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("opportunity_ledger")
    .select("asin, payload, title, brand, image_url, net_profit, score, mode")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false })
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
    if (!hasHttpsProductImage(merged.imageUrl)) continue;
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

  // Soft-unlock publish memory only — never wipe Keepa ledger mid-cycle
  try {
    const { createAdminClient, isSupabaseConfigured } = await import(
      "@/lib/supabase/admin"
    );
    if (isSupabaseConfigured()) {
      const admin = createAdminClient();
      const { maybeResetRonPublishMemory } = await import(
        "@/lib/admin/purge-listings-winners"
      );
      await maybeResetRonPublishMemory(admin);
    }
  } catch {
    /* unlock optional */
  }

  let state = await loadRonState(supabase, userId);

  if (!state.enabled && !opts.force) {
    return { ok: true, state, skipped: "RON está apagado" };
  }

  // Manual "Forzar ciclo" always clears publish cooldown so RON can ship again
  let learning = state.learning;
  if (opts.force) {
    learning = { ...learning, recentPacks: {} };
    await appendRonActivity(
      supabase,
      userId,
      {
        at: new Date().toISOString(),
        kind: "wake",
        message: "Forzar ciclo · memoria de publicados limpiada",
      },
      { learning, statusMessage: "Trabajando · memoria limpia", working: true },
    );
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

  learning = await learnFromAffiliateClicks(
    supabase,
    userId,
    // Prefer force-cleared learning when present
    opts.force ? { ...learning, recentPacks: {} } : learning,
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

  // Empty ledger after purge → seed Keepa winners once so RON has something to ship
  if (!ledgerHits.length && !keepa.winners.length) {
    try {
      const { createAdminClient, isSupabaseConfigured } = await import(
        "@/lib/supabase/admin"
      );
      if (isSupabaseConfigured()) {
        const { maybeSeedEmptyFloor } = await import(
          "@/lib/opportunity/seed-floor"
        );
        const seeded = await maybeSeedEmptyFloor(createAdminClient(), {
          userId,
          supabase,
          limit: 12,
          pageOrigin: appOrigin(),
          force: Boolean(opts.force),
        });
        if (seeded.seeded) {
          await appendRonActivity(
            supabase,
            userId,
            {
              at: new Date().toISOString(),
              kind: "scan",
              message: `Floor sembrado · ${seeded.saved} Keepa · ${seeded.affiliates} afiliados`,
            },
            {
              statusMessage: `Trabajando · ${seeded.saved} Keepa sembrados`,
              working: true,
            },
          );
          ledgerHits = await loadKeepaHits(supabase, userId);
        }
      }
    } catch {
      /* seed optional */
    }
  }

  const byAsin = new Map<string, OpportunityProduct>();
  for (const h of [...keepa.winners, ...ledgerHits]) {
    const n = normalizeRonHit(h);
    if (!n) continue;
    if (!byAsin.has(n.asin)) byAsin.set(n.asin, n);
  }
  let hits = [...byAsin.values()];

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

  // Affiliates exist but ledger empty → hydrate titles/images from Keepa so catalog isn't blind
  if (!hits.length && affiliateByAsin.size > 0) {
    try {
      const { keepaProducts } = await import("@/lib/keepa/finder");
      const asins = [...affiliateByAsin.keys()].slice(0, 24);
      const snaps = await keepaProducts(asins);
      for (const snap of snaps) {
        const n = normalizeRonHit({
          asin: snap.asin,
          title: snap.title,
          brand: snap.brand,
          imageUrl: snap.imageUrl,
          amazonPrice: snap.buyBoxPrice ?? snap.newPrice,
          buyBoxPrice: snap.buyBoxPrice,
          salesRank: snap.salesRank,
          avgSalesRank90: snap.avgSalesRank90,
          bsrDrops90: snap.bsrDrops90,
          discount90: snap.discount90,
          monthlySold: snap.monthlySold,
          sellerCount: snap.sellerCount,
          rating: snap.rating,
          reviewCount: snap.reviewCount,
          keepa: true,
          mode: "amazon",
        });
        if (!n || byAsin.has(n.asin)) continue;
        byAsin.set(n.asin, n);
        const row = affiliateByAsin.get(n.asin);
        if (row) {
          if (!row.imageUrl) row.imageUrl = n.imageUrl;
          if (!row.title) row.title = n.title;
          if (!row.brand) row.brand = n.brand;
        }
      }
      hits = [...byAsin.values()];
      if (hits.length) {
        await appendRonActivity(
          supabase,
          userId,
          {
            at: new Date().toISOString(),
            kind: "scan",
            message: `Keepa hidrató ${hits.length} afiliados sin ledger`,
          },
          {
            statusMessage: `Trabajando · ${hits.length} afiliados hidratados`,
            working: true,
          },
        );
      }
    } catch {
      /* hydrate optional */
    }
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
  let freshCatalog = filterFreshCatalogAsins(
    catalog,
    learning,
    RON_ASIN_COOLDOWN_HOURS,
  );

  // Catalog blocked by stale “already published” memory → unlock (affiliates or Keepa)
  if (catalog.length > 0 && freshCatalog.length === 0) {
    learning = {
      ...learning,
      recentPacks: {},
    };
    freshCatalog = catalog;
    await appendRonActivity(
      supabase,
      userId,
      {
        at: new Date().toISOString(),
        kind: "scan",
        message:
          "Memoria de publicados limpiada · catálogo estaba bloqueado por cooldown viejo",
      },
      {
        statusMessage: `Trabajando · ${catalog.length} desbloqueados`,
        learning,
        working: true,
      },
    );
  }

  if (!freshCatalog.length) {
    const msg =
      hits.length > 0
        ? `Keepa trajo ${hits.length} pero ninguno es publicable aún (falta foto real o link). Reintento en el próximo ciclo.`
        : affiliateByAsin.size > 0
          ? `Tengo ${affiliateByAsin.size} afiliados pero sin foto/Keepa usable · reintento próximo ciclo`
          : "Sin oportunidades nuevas · espero Keepa fresco (escaneá Find Winners o Forzar ciclo)";
    learning = {
      ...learning,
      opsSnapshot: {
        freshAsins: 0,
        catalogAsins: catalog.length,
        lastMoneyScore: 0,
        lastFormat: null,
        pipeline: "idle",
        peakWindow: false,
        moneyHint: msg,
        nextAction: "Forzar ciclo o Escanear winners",
      },
    };
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

  const moneyScore =
    publishDecision.cards.length >= 2
      ? scorePackMoneyOpportunity(publishDecision.cards, learning)
      : scoreCardMoneyOpportunity(publishDecision.cards[0]!, learning);

  // Off-peak: hold weak solo posts for US shopping windows (force bypasses)
  if (
    shouldHoldForPeak({
      force: Boolean(opts.force),
      format: publishDecision.format,
      moneyScore,
    })
  ) {
    const msg =
      "Ventana off-peak US · guardo este deal para el pico (mejor conversión)";
    learning = {
      ...learning,
      opsSnapshot: {
        freshAsins: freshCatalog.length,
        catalogAsins: catalog.length,
        lastMoneyScore: moneyScore,
        lastFormat: publishDecision.format,
        pipeline: "wait",
        peakWindow: false,
        moneyHint: buildMoneyHint({
          postsToday: state.postsToday,
          clicksSeen: learning.clicksSeen,
          freshAsins: freshCatalog.length,
          peakWindow: false,
        }),
        nextAction: "Esperando pico US (10–14 / 18–22 ET) o un deal más fuerte",
      },
    };
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
      message: `Publicando ${publishDecision.format} · ${publishDecision.cards.length} · score ${moneyScore} · ${publishDecision.niche}…`,
      format: publishDecision.format,
    },
    {
      statusMessage: `Trabajando · publicando ${publishDecision.format} (score ${moneyScore})…`,
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
  const peak = isShoppingPeakWindow();
  learning = {
    ...learning,
    opsSnapshot: {
      freshAsins: Math.max(0, freshCatalog.length - packAsins.length),
      catalogAsins: catalog.length,
      lastMoneyScore: moneyScore,
      lastFormat: publishDecision.format,
      pipeline: "wait",
      peakWindow: peak,
      moneyHint: buildMoneyHint({
        postsToday: state.postsToday + 1,
        clicksSeen: learning.clicksSeen,
        freshAsins: Math.max(0, freshCatalog.length - packAsins.length),
        peakWindow: peak,
      }),
      nextAction: buildNextAction({
        enabled: true,
        working: false,
        peakWindow: peak,
        freshAsins: Math.max(0, freshCatalog.length - packAsins.length),
        lastError: null,
      }),
    },
  };

  const postUrl =
    published.mode === "page_post"
      ? published.postUrl
      : published.mode === "sharer"
        ? published.shareUrl
        : null;
  const okMsg = `Publicé ${publishDecision.format} · ${publishDecision.cards.length} · score ${moneyScore} · ${publishDecision.niche}`;
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
