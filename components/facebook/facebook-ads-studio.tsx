"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  Check,
  LayoutGrid,
  Loader2,
  PanelsTopLeft,
  RefreshCw,
  Share2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { FacebookFMark } from "@/components/brand/store-marks";
import { usePaidActionOptional } from "@/components/credits/paid-action-provider";
import {
  amazonAsinImageCandidates,
  amazonAsinPrimaryImage,
} from "@/lib/amazon/asin-image";
import { CREDIT_ACTIONS } from "@/lib/credits/costs";
import { promoPriceLabelForLink } from "@/lib/facebook/destination-price";
import {
  buildFacebookPromoCopy,
  defaultFacebookCollectionTitle,
  defaultFacebookPromoMessage,
} from "@/lib/facebook/promo-copy";
import {
  dedupePromoCards,
  isJunkBrand,
  productImageKey,
  suggestPromoPacks,
  type PromoPackSuggestion,
} from "@/lib/facebook/promo-groups";
import { cn } from "@/lib/utils";

type AffLink = {
  id: string;
  asin: string;
  destination_url: string;
  source: string | null;
  click_count: number | null;
  smartPath?: string | null;
  imageUrl?: string | null;
  title?: string | null;
  /** Live Amazon buy box when Keepa hydrated the link */
  amazonPrice?: number | null;
  associateTag?: string | null;
  /** True when destination_url carries Associate tag= */
  earnsCommission?: boolean;
};

type ImportedProduct = {
  id: string;
  title: string;
  brand?: string | null;
  amazonAsin?: string | null;
  price?: number | null;
  coverUrl?: string | null;
  photos?: string[];
  ebayListingId?: string | null;
  status?: string | null;
};

type MarketDrop = {
  id: string;
  asin: string;
  title: string;
  photo: string;
  affiliateUrl?: string | null;
  sell?: number | null;
  buy?: number | null;
  lane?: "arbitrage" | "amazon" | "retail";
  amazonPrice?: number | null;
  ebayPrice?: number | null;
};

type FbConn = {
  connected: boolean;
  pageName: string | null;
  pageId: string | null;
  lastError?: string | null;
};

type SourceTab = "affiliate" | "imported" | "market" | "custom";
type PromoFormat = "ads" | "carousel" | "vitrina";

type PickCard = {
  id: string;
  title: string;
  imageUrl: string;
  imageFallbacks?: string[];
  linkUrl: string;
  priceLabel?: string | null;
  meta?: string;
  asin?: string | null;
};

type CustomDraft = {
  title: string;
  linkUrl: string;
  imageUrl: string;
};

const EASE = [0.22, 1, 0.36, 1] as const;
const MAX = 10;

function absoluteUrl(path: string | null | undefined, fallback: string) {
  if (path) {
    if (typeof window !== "undefined") return `${window.location.origin}${path}`;
    return path;
  }
  return fallback;
}

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function Thumb({
  url,
  alt,
  fallbacks = [],
}: {
  url: string;
  alt: string;
  fallbacks?: string[];
}) {
  const [idx, setIdx] = useState(0);
  const chain = [url, ...fallbacks].filter(
    (u, i, arr) => Boolean(u) && arr.indexOf(u) === i,
  );
  const src = chain[Math.min(idx, Math.max(chain.length - 1, 0))] || "";

  const advance = () => {
    setIdx((n) => (n + 1 < chain.length ? n + 1 : n));
  };

  if (!src) {
    return (
      <span className="grid size-full place-items-center bg-[#f0f0f0] text-[10px] font-semibold text-[#a8a8a8]">
        Sin foto
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src}
      src={src}
      alt={alt}
      className="size-full object-contain bg-white p-1"
      onError={advance}
      onLoad={(e) => {
        // Amazon often returns a 1×1 transparent GIF with HTTP 200
        const img = e.currentTarget;
        if (img.naturalWidth < 8 || img.naturalHeight < 8) advance();
      }}
    />
  );
}

function resolveProductImage(opts: {
  preferred?: string | null;
  asin?: string | null;
  marketByAsin?: Map<string, string>;
}): { url: string; fallbacks: string[] } {
  const preferred = String(opts.preferred || "").trim();
  const asin = String(opts.asin || "").trim().toUpperCase();
  const market = asin ? opts.marketByAsin?.get(asin) || "" : "";
  const asinCandidates = amazonAsinImageCandidates(asin);
  const chain = [preferred, market, ...asinCandidates].filter(
    (u, i, arr) => Boolean(u) && /^https?:\/\//i.test(u) && arr.indexOf(u) === i,
  );
  return { url: chain[0] || "", fallbacks: chain.slice(1) };
}

export function FacebookAdsStudio() {
  const reduce = useReducedMotion();
  const { confirmSpend, requirePro, refresh } = usePaidActionOptional();
  const [links, setLinks] = useState<AffLink[]>([]);
  const [imported, setImported] = useState<ImportedProduct[]>([]);
  const [drops, setDrops] = useState<MarketDrop[]>([]);
  const [customCards, setCustomCards] = useState<PickCard[]>([]);
  const [customDraft, setCustomDraft] = useState<CustomDraft>({
    title: "",
    linkUrl: "",
    imageUrl: "",
  });
  const [fb, setFb] = useState<FbConn | null>(null);
  const [hasTag, setHasTag] = useState(false);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<SourceTab>("affiliate");
  const [format, setFormat] = useState<PromoFormat>("ads");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState(() => defaultFacebookPromoMessage("ads"));
  const [collectionTitle, setCollectionTitle] = useState(() =>
    defaultFacebookCollectionTitle(),
  );
  const [coverId, setCoverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [postUrl, setPostUrl] = useState<string | null>(null);
  const [panel, setPanel] = useState<"elegir" | "publicar">("elegir");
  const [copySeed, setCopySeed] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [affRes, prodRes, feedRes, fbRes, moneyRes] = await Promise.all([
        fetch("/api/money/affiliate/links", { cache: "no-store" }),
        fetch("/api/products", { cache: "no-store" }),
        fetch("/api/market/feed", { cache: "no-store" }),
        fetch("/api/facebook/connection", { cache: "no-store" }),
        fetch("/api/settings/money-machine", { cache: "no-store" }),
      ]);

      if (affRes.ok) {
        const body = (await affRes.json()) as { links?: AffLink[] };
        setLinks(body.links || []);
        // Backfill Keepa ledger winners → affiliate (idempotent)
        void fetch("/api/money/affiliate/sync-keepa-winners", {
          method: "POST",
        })
          .then(async (res) => {
            if (!res.ok) return;
            const sync = (await res.json()) as { created?: number };
            if ((sync.created || 0) > 0) {
              const refreshed = await fetch("/api/money/affiliate/links", {
                cache: "no-store",
              });
              if (refreshed.ok) {
                const again = (await refreshed.json()) as { links?: AffLink[] };
                setLinks(again.links || []);
              }
            }
          })
          .catch(() => undefined);
      } else setLinks([]);

      if (prodRes.ok) {
        const body = (await prodRes.json()) as { products?: ImportedProduct[] };
        // All user listings (eBay / Amazon / drafts) — not only those with photos
        setImported(body.products || []);
      } else setImported([]);

      if (feedRes.ok) {
        const body = (await feedRes.json()) as { drops?: MarketDrop[] };
        setDrops((body.drops || []).filter((d) => d.asin && d.photo).slice(0, 30));
      } else setDrops([]);

      if (fbRes.ok) {
        const body = (await fbRes.json()) as { connection?: FbConn };
        setFb(body.connection || null);
      }

      if (moneyRes.ok) {
        const body = (await moneyRes.json()) as {
          prefs?: { associateTag?: string };
          services?: Array<{ id: string; status: string }>;
        };
        setHasTag(
          Boolean(body.prefs?.associateTag?.trim()) ||
            body.services?.some(
              (s) =>
                s.id === "amazon_associates" &&
                (s.status === "ready" || s.status === "connected"),
            ) === true,
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Prefer Mis listings when there are no affiliate links yet
  useEffect(() => {
    if (loading) return;
    if (imported.length > 0 && links.length === 0) {
      setSource("imported");
    }
  }, [loading, imported.length, links.length]);

  const marketPhotoByAsin = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drops) {
      const asin = String(d.asin || "").trim().toUpperCase();
      const photo = String(d.photo || "").trim();
      if (asin && photo && !map.has(asin)) map.set(asin, photo);
    }
    for (const p of imported) {
      const asin = String(p.amazonAsin || "").trim().toUpperCase();
      const photo = String(p.coverUrl || p.photos?.[0] || "").trim();
      if (asin && photo && !map.has(asin)) map.set(asin, photo);
    }
    return map;
  }, [drops, imported]);

  const titleByAsin = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drops) {
      const asin = String(d.asin || "").trim().toUpperCase();
      const title = String(d.title || "").trim();
      if (asin && title) map.set(asin, title);
    }
    for (const p of imported) {
      const asin = String(p.amazonAsin || "").trim().toUpperCase();
      const title = String(p.title || "").trim();
      if (asin && title && !map.has(asin)) map.set(asin, title);
    }
    return map;
  }, [drops, imported]);

  const catalog = useMemo(() => {
    const affiliateCards: PickCard[] = links.map((l) => {
      const asin = String(l.asin || "").trim().toUpperCase();
      const img = resolveProductImage({
        preferred: l.imageUrl,
        asin: l.asin,
        marketByAsin: marketPhotoByAsin,
      });
      const rawTitle =
        titleByAsin.get(asin) ||
        String(l.title || "").trim() ||
        "Selección Higlou";
      const title =
        rawTitle.replace(/^ASIN\s+[A-Z0-9]{10}\s*/i, "").trim() ||
        "Selección Higlou";
      const linkUrl = absoluteUrl(l.smartPath, l.destination_url);
      const marketDrop = drops.find(
        (d) => String(d.asin || "").toUpperCase() === asin,
      );
      return {
        id: `aff:${l.id}`,
        title: title.slice(0, 80),
        imageUrl: img.url || amazonAsinPrimaryImage(l.asin),
        imageFallbacks: img.fallbacks,
        linkUrl,
        meta:
          l.earnsCommission === false
            ? "⚠ sin tag= — se reparará al publicar"
            : l.smartPath
              ? `Afiliado · /go`
              : l.source || "affiliate",
        asin: asin || null,
        priceLabel: promoPriceLabelForLink({
          linkUrl: l.destination_url || linkUrl,
          amazonPrice: l.amazonPrice ?? marketDrop?.amazonPrice ?? null,
        }),
      };
    });

    const importedCards: PickCard[] = imported.map((p) => {
      const asin = String(p.amazonAsin || "").trim();
      const ebayId = String(p.ebayListingId || "").trim();
      const preferred = p.coverUrl || p.photos?.[0] || "";
      const img = resolveProductImage({
        preferred,
        asin,
        marketByAsin: marketPhotoByAsin,
      });
      const linkUrl = ebayId
        ? `https://www.ebay.com/itm/${ebayId}`
        : asin
          ? `https://www.amazon.com/dp/${asin}`
          : typeof window !== "undefined"
            ? `${window.location.origin}/listings/${p.id}`
            : `/listings/${p.id}`;
      const channel = ebayId ? "eBay" : asin ? "Amazon" : "Listing";
      const marketDrop = asin
        ? drops.find(
            (d) =>
              String(d.asin || "").toUpperCase() === asin.toUpperCase(),
          )
        : undefined;
      const priceLabel = ebayId
        ? money(p.price)
        : promoPriceLabelForLink({
            linkUrl,
            amazonPrice: marketDrop?.amazonPrice ?? null,
          });
      return {
        id: `imp:${p.id}`,
        title: p.title || "Listing",
        imageUrl: img.url,
        imageFallbacks: img.fallbacks,
        linkUrl,
        priceLabel,
        asin: asin || null,
        meta: p.brand ? `${channel} · ${p.brand}` : channel,
      };
    });

    const marketCards: PickCard[] = drops.map((d) => {
      const linkUrl = d.affiliateUrl || `https://www.amazon.com/dp/${d.asin}`;
      const amazonPrice =
        d.amazonPrice ??
        (d.lane === "amazon" ? d.sell : null) ??
        d.buy ??
        null;
      return {
        id: `mkt:${d.id}`,
        title: d.title,
        imageUrl: d.photo,
        imageFallbacks: amazonAsinImageCandidates(d.asin),
        linkUrl,
        priceLabel: promoPriceLabelForLink({
          linkUrl,
          amazonPrice,
          ebayPrice: d.ebayPrice,
        }),
        asin: d.asin || null,
        meta: d.asin,
      };
    });

    const all = [...affiliateCards, ...importedCards, ...marketCards, ...customCards];
    // Dedupe by ASIN + identical image — prefer affiliate (tagged) over market
    const seenAsin = new Set<string>();
    const seenImg = new Set<string>();
    const deduped: PickCard[] = [];
    for (const c of all) {
      const asin = String(c.asin || "").toUpperCase();
      if (asin && seenAsin.has(asin)) continue;
      const img = productImageKey(c.imageUrl);
      if (img && seenImg.has(img)) continue;
      if (asin) seenAsin.add(asin);
      if (img) seenImg.add(img);
      deduped.push(c);
    }

    return {
      affiliate: affiliateCards,
      imported: importedCards,
      market: marketCards,
      custom: customCards,
      all: deduped,
    };
  }, [
    links,
    imported,
    drops,
    customCards,
    marketPhotoByAsin,
    titleByAsin,
  ]);

  const cards: PickCard[] = useMemo(() => {
    if (source === "affiliate") return catalog.affiliate;
    if (source === "imported") return catalog.imported;
    if (source === "custom") return catalog.custom;
    return catalog.market;
  }, [source, catalog]);

  const addCustomCard = () => {
    const title = customDraft.title.trim() || "Promo";
    const linkUrl = customDraft.linkUrl.trim();
    const imageUrl = customDraft.imageUrl.trim();
    if (!/^https?:\/\//i.test(linkUrl)) {
      toast.message("Pegá un link https válido");
      return;
    }
    if (!/^https?:\/\//i.test(imageUrl)) {
      toast.message("Pegá una URL de imagen https");
      return;
    }
    if (customCards.length >= MAX) {
      toast.message(`Máximo ${MAX} items`);
      return;
    }
    const id = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const card: PickCard = {
      id,
      title,
      imageUrl,
      linkUrl,
      meta: "Cualquiera",
      priceLabel: null,
    };
    setCustomCards((prev) => [...prev, card]);
    setSelectedIds((prev) =>
      format === "ads" ? [id] : prev.includes(id) ? prev : [...prev, id].slice(0, MAX),
    );
    setCustomDraft({ title: "", linkUrl: "", imageUrl: "" });
    toast.success("Agregado a Cualquiera");
  };

  const selectedCards = useMemo(() => {
    const byId = new Map(catalog.all.map((c) => [c.id, c]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((c): c is PickCard => Boolean(c));
  }, [catalog.all, selectedIds]);

  const packSuggestions = useMemo(() => {
    const groupCards = catalog.all.map((c) => {
      const metaBrand = c.meta?.includes("·")
        ? c.meta.split("·").slice(1).join("·").trim() || null
        : null;
      const brand =
        metaBrand && !isJunkBrand(metaBrand) && !/afiliado|\/go/i.test(c.meta || "")
          ? metaBrand
          : null;
      return {
        id: c.id,
        title: c.title,
        priceLabel: c.priceLabel,
        asin: c.asin,
        meta: c.meta,
        imageUrl: c.imageUrl,
        brand,
      };
    });
    return suggestPromoPacks(dedupePromoCards(groupCards), {
      limit: 6,
      preferVitrina: true,
    });
  }, [catalog.all]);

  const readyVitrinas = useMemo(
    () => packSuggestions.filter((p) => p.format === "vitrina"),
    [packSuggestions],
  );
  const readyCarousels = useMemo(
    () => packSuggestions.filter((p) => p.format === "carousel"),
    [packSuggestions],
  );

  const applyCopy = useCallback(
    (
      nextFormat: PromoFormat,
      picks: PickCard[],
      seed: number,
      niche?: string | null,
    ) => {
      const copy = buildFacebookPromoCopy({
        format: nextFormat,
        titles: picks.map((c) => c.title),
        prices: picks.map((c) => c.priceLabel),
        niche: niche || null,
        seed,
      });
      setMessage(copy.message);
      if (nextFormat === "vitrina") setCollectionTitle(copy.collectionTitle);
    },
    [],
  );

  const regenerateCopy = () => {
    const nextSeed = copySeed + 1;
    setCopySeed(nextSeed);
    applyCopy(format, selectedCards, nextSeed);
    toast.message("Copy regenerado · tono pro Higlou");
  };

  const applyPack = (pack: PromoPackSuggestion) => {
    const byId = new Map(catalog.all.map((c) => [c.id, c]));
    const seenAsin = new Set<string>();
    const seenImg = new Set<string>();
    const uniqueIds: string[] = [];
    for (const id of pack.cardIds) {
      const c = byId.get(id);
      if (!c) continue;
      const asin = String(c.asin || "").toUpperCase();
      if (asin && seenAsin.has(asin)) continue;
      const img = productImageKey(c.imageUrl);
      if (img && seenImg.has(img)) continue;
      if (asin) seenAsin.add(asin);
      if (img) seenImg.add(img);
      uniqueIds.push(id);
    }
    const picks = uniqueIds
      .map((id) => byId.get(id))
      .filter((c): c is PickCard => Boolean(c));
    const niche =
      pack.niche && !isJunkBrand(pack.niche) ? pack.niche : null;
    setFormat(pack.format);
    setSelectedIds(uniqueIds);
    setCoverId(uniqueIds[0] || null);
    setPanel("publicar");
    const nextSeed = copySeed + 1;
    setCopySeed(nextSeed);
    applyCopy(pack.format, picks, nextSeed, niche);
    toast.success(
      pack.format === "vitrina"
        ? `Vitrina lista · ${niche || "Selección"} · ${uniqueIds.length} productos`
        : `${pack.label} listo · revisá y publicá`,
    );
  };

  const coverCard =
    selectedCards.find((c) => c.id === coverId) || selectedCards[0] || null;

  const minNeeded = format === "vitrina" ? 3 : format === "carousel" ? 2 : 1;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (format === "ads") return prev.includes(id) ? [] : [id];
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX) {
        toast.message(`Máximo ${MAX} productos`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const switchSource = (next: SourceTab) => {
    setSource(next);
    setSelectedIds([]);
    setCoverId(null);
    setPostUrl(null);
  };

  const switchFormat = (next: PromoFormat) => {
    setFormat(next);
    const picks =
      next === "ads" ? selectedCards.slice(0, 1) : selectedCards;
    setSelectedIds((prev) => (next === "ads" ? prev.slice(0, 1) : prev));
    setPostUrl(null);
    const nextSeed = copySeed + 1;
    setCopySeed(nextSeed);
    applyCopy(next, picks, nextSeed);
  };

  const publish = async () => {
    if (selectedCards.length < minNeeded) {
      toast.message(
        format === "ads"
          ? "Elegí un producto"
          : `Elegí al menos ${minNeeded} productos`,
      );
      return;
    }
    if (format === "carousel" || format === "vitrina") {
      const pro = await requirePro("facebook_carousel");
      if (!pro) return;
    }
    const ok = await confirmSpend(
      "facebook_share",
      format === "ads"
        ? "Post Ads en tu Page"
        : format === "vitrina"
          ? "Publicar vitrina en tu Page"
          : "Publicar carrusel en tu Page",
    );
    if (!ok) return;

    // Hard block: paid ads without Associate tag = $0 commission
    const amazonBound = selectedCards.some((c) => {
      const asin = c.asin || (c.meta && /^[A-Z0-9]{10}$/i.test(c.meta) ? c.meta : "");
      if (asin) return true;
      return /amazon\.|\/dp\/|\/go\//i.test(c.linkUrl);
    });
    if (amazonBound && !hasTag) {
      toast.error(
        "Sin Associate tag no hay comisión. Pegalo en Affiliate antes de publicar ads.",
        {
          action: {
            label: "Affiliate",
            onClick: () => {
              window.location.href = "/affiliate";
            },
          },
        },
      );
      return;
    }

    setBusy(true);
    setPostUrl(null);
    try {
      // Ensure absolute https links for affiliate smart paths / listing URLs
      const seenAsinPub = new Set<string>();
      const seenImgPub = new Set<string>();
      const payloadCards = selectedCards
        .map((c) => {
          const asin =
            c.asin ||
            (c.meta && /^[A-Z0-9]{10}$/i.test(c.meta) ? c.meta : null);
          const preferred =
            c.imageUrl ||
            c.imageFallbacks?.find((u) => /^https?:\/\//i.test(u)) ||
            "";
          // Prefer CDN images Facebook can scrape (not ads-system widgets)
          const cdnFallback = c.imageFallbacks?.find(
            (u) =>
              /^https?:\/\//i.test(u) &&
              /(m\.media-amazon\.com|images-na\.ssl-images-amazon\.com)/i.test(
                u,
              ),
          );
          const imageUrl =
            cdnFallback && /amazon-adsystem\.com/i.test(preferred)
              ? cdnFallback
              : preferred;
          return {
            id: c.id,
            title: c.title,
            imageUrl,
            linkUrl: absoluteUrl(
              c.linkUrl.startsWith("/") ? c.linkUrl : null,
              c.linkUrl,
            ),
            priceLabel: c.priceLabel,
            asin,
          };
        })
        .filter((c) => {
          const asin = String(c.asin || "").toUpperCase();
          if (asin && seenAsinPub.has(asin)) return false;
          const img = productImageKey(c.imageUrl);
          if (img && seenImgPub.has(img)) return false;
          if (asin) seenAsinPub.add(asin);
          if (img) seenImgPub.add(img);
          return true;
        });
      if (payloadCards.some((c) => !c.imageUrl)) {
        toast.error("Falta imagen en algún producto. Probá Mis listings o Market.");
        return;
      }
      if (format !== "ads" && payloadCards.length < selectedCards.length) {
        toast.error(
          `Seleccionaste ${selectedCards.length} pero solo ${payloadCards.length} son únicos con foto. Sacá duplicados.`,
        );
        return;
      }
      if (format !== "ads" && payloadCards.length < minNeeded) {
        toast.error(
          `Quedaron menos de ${minNeeded} productos únicos. Sacá duplicados y volvé a armar la vitrina.`,
        );
        return;
      }

      // Mint/reuse tagged smart links for every Amazon ASIN (ads + carousel + vitrina)
      for (const card of payloadCards) {
        const asin = String(card.asin || "").trim().toUpperCase();
        if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
        // Already a /go/ smart link — server will heal tag=
        if (/\/go\/[a-z0-9]+/i.test(card.linkUrl)) continue;
        // Already a tagged Amazon URL
        if (/amazon\./i.test(card.linkUrl) && /[?&]tag=/i.test(card.linkUrl)) {
          continue;
        }
        try {
          const created = await fetch("/api/money/affiliate/links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              asin,
              campaignName: "Facebook Ads",
              source: "facebook",
              createSmartLink: true,
              platform: "facebook",
            }),
          });
          if (created.ok) {
            const body = (await created.json()) as {
              smartLink?: { path?: string };
              link?: { destinationUrl?: string };
              error?: string;
            };
            const url = body.smartLink?.path
              ? `${window.location.origin}${body.smartLink.path}`
              : body.link?.destinationUrl;
            if (url) card.linkUrl = url;
          } else {
            const body = (await created.json().catch(() => null)) as {
              error?: string;
            } | null;
            toast.error(
              body?.error ||
                "No se pudo crear el link de afiliado con tag=. Abortando.",
            );
            return;
          }
        } catch {
          toast.error("Error creando link de afiliado. No se publicó.");
          return;
        }
      }

      // Final client guard: never send bare Amazon /dp without tag=
      const untagged = payloadCards.filter(
        (c) =>
          /amazon\./i.test(c.linkUrl) &&
          /\/(?:dp|gp\/product)\//i.test(c.linkUrl) &&
          !/[?&]tag=/i.test(c.linkUrl),
      );
      if (untagged.length) {
        toast.error(
          "Hay links Amazon sin tag= Associates. Revisá Affiliate y reintentá.",
        );
        return;
      }

      const res = await fetch("/api/facebook/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          message,
          cards: payloadCards,
          coverImageUrl:
            format === "vitrina" ? coverCard?.imageUrl || null : null,
          collectionTitle: format === "vitrina" ? collectionTitle : null,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        code?: string;
        mode?: string;
        shareUrl?: string;
        postUrl?: string;
      };
      if (!res.ok) {
        if (body.code === "insufficient") {
          toast.error(body.error || "Sin créditos", {
            action: {
              label: "Recargar",
              onClick: () => {
                window.location.href = "/credits";
              },
            },
          });
          return;
        }
        toast.error(body.error || "No se pudo publicar");
        return;
      }
      if (body.mode === "page_post") {
        toast.success(
          format === "ads"
            ? "Publicado · tarjeta con link"
            : format === "vitrina"
              ? "Vitrina Alibaba publicada"
              : "Carrusel Alibaba publicado",
        );
        if (body.postUrl) {
          setPostUrl(body.postUrl);
          // Stay in Higlou — link to open the post if they want
        }
      } else if (body.shareUrl) {
        // Manual sharer only when Page is NOT connected
        if (fb?.connected) {
          toast.error(
            "La Page está marcada conectada pero Graph no publicó. Reconectá el token en Settings → Facebook.",
          );
          return;
        }
        window.open(body.shareUrl, "_blank", "noopener,noreferrer");
        toast.message("Conectá tu Page en Settings para publicar por API");
      }
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white md:h-full">
      <div className="flex shrink-0 flex-wrap items-center gap-3 bg-[#191919] px-4 py-2.5 text-white md:px-5">
        <motion.span
          className="size-2 rounded-full bg-[#3665F3]"
          animate={reduce ? undefined : { opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">
          Higlou · Facebook
        </p>
        <p className="hidden min-w-0 flex-1 truncate text-[13px] text-white/80 sm:block">
          Precios más bajos · productos mejores · copy que convierte
        </p>
        <Link
          href="/settings#facebook-store"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12px] font-semibold text-white hover:bg-white/20"
        >
          <FacebookFMark className="size-3.5" />
          {fb?.connected ? fb.pageName || "Page OK" : "Conectar Page"}
        </Link>
        <Link
          href="/affiliate"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-semibold text-[#191919]"
        >
          <Sparkles className="size-3.5 text-[#3665F3]" />
          Affiliate
        </Link>
      </div>

      {!fb?.connected || !hasTag || fb?.lastError ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#e5e5e5] bg-[#f7f7f7] px-4 py-2 text-[12px] text-[#707070] md:px-5">
          {!fb?.connected ? (
            <Link href="/settings#facebook-store" className="font-medium text-[#3665F3] hover:underline">
              Conectá tu Page
            </Link>
          ) : null}
          {!fb?.connected && !hasTag ? <span>·</span> : null}
          {!hasTag ? (
            <Link href="/affiliate" className="font-medium text-[#b42318] hover:underline">
              Obligatorio: pegá tu Associate tag (sin tag= no hay comisión en ads)
            </Link>
          ) : (
            <span className="font-medium text-[#0f7b3a]">
              Associate tag listo · los posts usan /go → Amazon?tag=
            </span>
          )}
          {fb?.lastError ? (
            <span className="w-full font-medium text-[#b42318] sm:w-auto">
              Último error Graph: {fb.lastError}
            </span>
          ) : null}
        </div>
      ) : hasTag ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#d8efe0] bg-[#f3faf5] px-4 py-2 text-[12px] text-[#0f7b3a] md:px-5">
          <span className="font-semibold">Comisión protegida</span>
          <span>·</span>
          <span>
            Cada Amazon se publica con smart link /go → destino Associates con tu tag=
          </span>
        </div>
      ) : null}

      <div className="sticky top-0 z-10 border-b border-[#e5e5e5] bg-white px-4 py-2 md:px-5">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-[#f7f7f7] p-1">
          {(
            [
              { id: "elegir" as const, label: "1 · Elegir" },
              { id: "publicar" as const, label: "2 · Publicar" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPanel(t.id)}
              className={cn(
                "rounded-full py-2.5 text-[13px] font-semibold transition",
                panel === t.id
                  ? "bg-[#191919] text-white shadow-sm"
                  : "text-[#707070]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 bg-[#f7f7f7] lg:grid-cols-[minmax(0,1.15fr)_340px]">
        <div
          className={cn(
            "min-h-0 overflow-y-auto p-4 md:p-5",
            panel !== "elegir" && "max-lg:hidden",
          )}
        >
          <div className="mb-4 inline-flex w-full max-w-lg rounded-full border border-[#e5e5e5] bg-white p-1">
            {(
              [
                { id: "ads" as const, label: "Ads", icon: Share2 },
                { id: "carousel" as const, label: "Carrusel · Pro", icon: PanelsTopLeft },
                { id: "vitrina" as const, label: "Vitrina · Pro", icon: LayoutGrid },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => switchFormat(f.id)}
                className={cn(
                  "relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px] font-semibold transition",
                  format === f.id ? "text-[#191919]" : "text-[#707070]",
                )}
              >
                {format === f.id ? (
                  <motion.span
                    layoutId="fb-format-pill"
                    className="absolute inset-0 rounded-full bg-[#f0f0f0]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <f.icon className="relative z-10 size-3.5" />
                <span className="relative z-10">{f.label}</span>
              </button>
            ))}
          </div>
          <p className="mb-3 text-[13px] text-[#707070]">
            {format === "ads"
              ? "1 producto · tarjeta limpia: título + precio."
              : format === "carousel"
                ? `Carrusel · ${minNeeded}–${MAX} · TOP DEALS · swipe to shop.`
                : `Vitrina · ${minNeeded}–${MAX} · selección editorial.`}
          </p>

          {readyVitrinas.length > 0 || readyCarousels.length > 0 ? (
            <div className="mb-4 space-y-3">
              {readyVitrinas.length > 0 ? (
                <div className="rounded-2xl border border-[#191919]/10 bg-white p-3 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="size-3.5 text-[#3665F3]" />
                      <p className="text-[12px] font-semibold text-[#191919]">
                        Vitrinas ya hechas
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold tracking-wide text-[#8a8a8a] uppercase">
                      Productos relacionados
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {readyVitrinas.map((pack) => (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => applyPack(pack)}
                        className="group w-full rounded-xl border border-[#ebebeb] bg-[#fafafa] p-2.5 text-left transition hover:border-[#3665F3]/50 hover:bg-white"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-[#191919]">
                              {pack.label}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-[#707070]">
                              {pack.blurb}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-[#191919] px-2.5 py-1 text-[10px] font-bold tracking-wide text-white uppercase group-hover:bg-[#3665F3]">
                            Abrir
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {pack.cardIds.slice(0, 5).map((id) => {
                            const card = catalog.all.find((c) => c.id === id);
                            const url =
                              card?.imageUrl ||
                              pack.imageUrls[
                                pack.cardIds.indexOf(id)
                              ] ||
                              "";
                            return (
                              <span
                                key={`${pack.id}-${id}`}
                                className="size-11 shrink-0 overflow-hidden rounded-lg border border-[#e5e5e5] bg-white"
                              >
                                <Thumb
                                  url={url}
                                  alt=""
                                  fallbacks={card?.imageFallbacks}
                                />
                              </span>
                            );
                          })}
                          {pack.cardIds.length > 5 ? (
                            <span className="text-[11px] font-semibold text-[#8a8a8a]">
                              +{pack.cardIds.length - 5}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#e5e5e5] bg-white px-3 py-3">
                  <p className="text-[12px] font-semibold text-[#191919]">
                    Vitrinas ya hechas
                  </p>
                  <p className="mt-1 text-[11px] text-[#8a8a8a]">
                    Cuando haya 3+ productos relacionados (misma marca o tipo),
                    Higlou te arma la vitrina sola.
                  </p>
                </div>
              )}

              {readyCarousels.length > 0 ? (
                <div className="rounded-2xl border border-[#e5e5e5] bg-white p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Wand2 className="size-3.5 text-[#3665F3]" />
                    <p className="text-[12px] font-semibold text-[#191919]">
                      Carruseles sugeridos
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {readyCarousels.map((pack) => (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => applyPack(pack)}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#ebebeb] bg-[#fafafa] px-3 py-2 text-left transition hover:border-[#3665F3]/40 hover:bg-white"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex shrink-0 items-center -space-x-2">
                            {pack.cardIds.slice(0, 3).map((id) => {
                              const card = catalog.all.find((c) => c.id === id);
                              return (
                                <span
                                  key={`${pack.id}-c-${id}`}
                                  className="size-8 overflow-hidden rounded-md border border-white bg-white shadow-sm"
                                >
                                  <Thumb
                                    url={card?.imageUrl || ""}
                                    alt=""
                                    fallbacks={card?.imageFallbacks}
                                  />
                                </span>
                              );
                            })}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-[#191919]">
                              {pack.label}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-[#707070]">
                              {pack.blurb}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-[#191919] px-2.5 py-1 text-[10px] font-bold tracking-wide text-white uppercase">
                          Usar
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap gap-1 rounded-full border border-[#e5e5e5] bg-white p-1">
            {(
              [
                { id: "affiliate" as const, label: "Afiliados", count: links.length },
                { id: "imported" as const, label: "Mis listings", count: imported.length },
                { id: "market" as const, label: "Market", count: drops.length },
                { id: "custom" as const, label: "Cualquiera", count: customCards.length },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchSource(t.id)}
                className={cn(
                  "rounded-full px-3 py-2 text-[12px] font-semibold transition",
                  source === t.id
                    ? "bg-[#191919] text-white"
                    : "text-[#707070] hover:bg-[#f7f7f7]",
                )}
              >
                {t.label}
                <span className={cn("ml-1 tabular-nums", source === t.id ? "text-white/55" : "text-[#a8a8a8]")}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {source === "custom" ? (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 space-y-2 rounded-2xl border border-[#e5e5e5] bg-white p-3"
            >
              <input
                value={customDraft.title}
                onChange={(e) => setCustomDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Título"
                className="h-10 w-full rounded-xl border border-[#e5e5e5] px-3 text-[13px] outline-none focus:border-[#3665F3]"
              />
              <input
                value={customDraft.linkUrl}
                onChange={(e) => setCustomDraft((d) => ({ ...d, linkUrl: e.target.value }))}
                placeholder="https://… link"
                className="h-10 w-full rounded-xl border border-[#e5e5e5] px-3 text-[13px] outline-none focus:border-[#3665F3]"
              />
              <input
                value={customDraft.imageUrl}
                onChange={(e) => setCustomDraft((d) => ({ ...d, imageUrl: e.target.value }))}
                placeholder="https://… imagen"
                className="h-10 w-full rounded-xl border border-[#e5e5e5] px-3 text-[13px] outline-none focus:border-[#3665F3]"
              />
              <button
                type="button"
                onClick={addCustomCard}
                className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[#3665F3] text-[13px] font-semibold text-white"
              >
                Agregar
              </button>
            </motion.div>
          ) : null}

          {loading && source !== "custom" ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-[#8a8a8a]" />
            </div>
          ) : cards.length === 0 ? (
            <EmptySource source={source} />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              <AnimatePresence initial={false}>
                {cards.map((card, i) => {
                  const on = selectedIds.includes(card.id);
                  return (
                    <motion.li
                      key={card.id}
                      layout
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.18), ease: EASE }}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(card.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border bg-white p-2.5 text-left transition",
                          on
                            ? "border-[#3665F3] ring-2 ring-[#3665F3]/20"
                            : "border-[#e5e5e5] hover:border-[#c8c8c8]",
                        )}
                      >
                        <span className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-[#eee] bg-white">
                          <Thumb
                            url={card.imageUrl}
                            alt=""
                            fallbacks={card.imageFallbacks}
                          />
                          {on ? (
                            <motion.span
                              initial={{ scale: 0.6, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="absolute inset-0 grid place-items-center bg-[#3665F3]/90 text-white"
                            >
                              <Check className="size-4" />
                            </motion.span>
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-[#191919]">
                            {card.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-[#8a8a8a]">
                            {card.meta}
                            {card.priceLabel ? ` · ${card.priceLabel}` : ""}
                          </span>
                        </span>
                        {source === "custom" ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCustomCards((prev) => prev.filter((x) => x.id !== card.id));
                              setSelectedIds((prev) => prev.filter((x) => x !== card.id));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                                setCustomCards((prev) => prev.filter((x) => x.id !== card.id));
                                setSelectedIds((prev) => prev.filter((x) => x !== card.id));
                              }
                            }}
                            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#707070] hover:bg-[#f0f0f0]"
                          >
                            Quitar
                          </span>
                        ) : null}
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <aside
          className={cn(
            "min-h-0 overflow-y-auto border-t border-[#e5e5e5] bg-white p-4 lg:border-t-0 lg:border-l",
            panel !== "publicar" && "max-lg:hidden",
          )}
        >
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8a8a8a] uppercase">
            {format === "ads" ? "Ads" : format === "vitrina" ? "Vitrina" : "Carrusel"}
          </p>
          <p className="mt-1 text-[15px] font-semibold text-[#191919]">
            {selectedCards.length} listo
            {format !== "ads" ? ` · min ${minNeeded}` : ""}
          </p>

          <AnimatePresence mode="wait">
            {selectedCards.length > 0 ? (
              <motion.div
                key={format + selectedCards.map((c) => c.id).join()}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-[#f7f7f7]"
              >
                <div className="flex items-center gap-2 border-b border-[#e5e5e5] bg-white px-3 py-2">
                  <FacebookFMark className="size-3.5" />
                  <span className="text-[12px] font-semibold text-[#191919]">Preview</span>
                </div>
                {format === "ads" ? (
                  <div className="bg-white p-3">
                    <p className="mb-2 whitespace-pre-line text-[13px] leading-snug text-[#191919]">
                      {message || "…"}
                    </p>
                    <div className="overflow-hidden rounded-xl border border-[#e5e5e5]">
                      <div className="aspect-[1.91/1] bg-white">
                        <Thumb
                          url={selectedCards[0]!.imageUrl}
                          alt=""
                          fallbacks={selectedCards[0]!.imageFallbacks}
                        />
                      </div>
                      <div className="border-t border-[#e5e5e5] px-3 py-2">
                        <p className="truncate text-[13px] font-semibold text-[#191919]">
                          {selectedCards[0]!.title}
                        </p>
                        {selectedCards[0]!.priceLabel ? (
                          <p className="text-[11px] font-semibold text-[#3665F3]">
                            {selectedCards[0]!.priceLabel}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : format === "vitrina" ? (
                  <div className="bg-white p-3">
                    <p className="mb-1 whitespace-pre-line text-[12px] leading-snug text-[#707070]">
                      {message}
                    </p>
                    <p className="mb-2 text-[14px] font-semibold tracking-tight text-[#191919]">
                      {collectionTitle || "Vitrina Higlou"}
                    </p>
                    <div className="mb-2 aspect-[4/5] max-h-36 overflow-hidden rounded-xl border border-[#e5e5e5]">
                      <Thumb
                        url={coverCard?.imageUrl || selectedCards[0]!.imageUrl}
                        alt=""
                        fallbacks={
                          coverCard?.imageFallbacks ||
                          selectedCards[0]!.imageFallbacks
                        }
                      />
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto">
                      {selectedCards.map((c) => (
                        <span
                          key={c.id}
                          className="size-11 shrink-0 overflow-hidden rounded-lg border border-[#e5e5e5]"
                        >
                          <Thumb
                            url={c.imageUrl}
                            alt=""
                            fallbacks={c.imageFallbacks}
                          />
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-3">
                    <p className="mb-2 whitespace-pre-line text-[12px] leading-snug text-[#191919]">
                      {message}
                    </p>
                    <div className="flex gap-2 overflow-x-auto">
                      {selectedCards.map((c) => (
                        <div
                          key={c.id}
                          className="w-24 shrink-0 overflow-hidden rounded-xl border border-[#e5e5e5]"
                        >
                          <div className="aspect-square">
                            <Thumb
                              url={c.imageUrl}
                              alt=""
                              fallbacks={c.imageFallbacks}
                            />
                          </div>
                          <p className="truncate px-1.5 py-1 text-[10px] font-semibold">
                            {c.title}
                          </p>
                          {c.priceLabel ? (
                            <p className="truncate px-1.5 pb-1 text-[9px] font-semibold text-[#3665F3]">
                              {c.priceLabel}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <p className="mt-4 text-[13px] text-[#8a8a8a]">Elegí productos a la izquierda.</p>
            )}
          </AnimatePresence>

          {format === "vitrina" ? (
            <div className="mt-4 space-y-3">
              <label className="block text-[12px] font-semibold text-[#707070]">
                Título
                <input
                  value={collectionTitle}
                  onChange={(e) => setCollectionTitle(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#e5e5e5] px-3 text-[14px] outline-none focus:border-[#3665F3]"
                />
              </label>
              {selectedCards.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedCards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCoverId(c.id)}
                      className={cn(
                        "size-12 overflow-hidden rounded-xl border",
                        (coverId || selectedCards[0]?.id) === c.id
                          ? "border-[#191919] ring-2 ring-[#191919]"
                          : "border-[#e5e5e5]",
                      )}
                    >
                      <Thumb url={c.imageUrl} alt="" fallbacks={c.imageFallbacks} />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[12px] font-semibold text-[#707070]">
                Mensaje · negrita pro
              </label>
              <button
                type="button"
                onClick={regenerateCopy}
                disabled={!selectedCards.length}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-2.5 text-[11px] font-semibold text-[#191919] disabled:opacity-40"
              >
                <RefreshCw className="size-3" />
                Regenerar
              </button>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="mt-1.5 w-full resize-none rounded-xl border border-[#e5e5e5] px-3 py-2.5 text-[14px] leading-snug outline-none focus:border-[#3665F3]"
            />
            <p className="mt-1.5 text-[11px] text-[#8a8a8a]">
              La primera línea va en negrita Unicode · se ve bold en Facebook.
            </p>
          </div>

          <button
            type="button"
            disabled={
              busy ||
              selectedCards.length < minNeeded ||
              (Boolean(
                selectedCards.some(
                  (c) =>
                    Boolean(c.asin) ||
                    /amazon\.|\/dp\/|\/go\//i.test(c.linkUrl),
                ),
              ) &&
                !hasTag)
            }
            onClick={() => void publish()}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#1877F2] text-[14px] font-semibold text-white hover:bg-[#166fe5] disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FacebookFMark className="size-3.5" />}
            {format === "ads" ? "Publicar" : format === "vitrina" ? "Publicar vitrina" : "Publicar carrusel"}
            <span className="ml-1 opacity-80">
              · {CREDIT_ACTIONS.facebook_share.cost} cr
              {format !== "ads" ? " · Pro" : ""}
            </span>
          </button>

          {postUrl ? (
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block text-center text-[13px] font-semibold text-[#1877F2] hover:underline"
            >
              Ver post
            </a>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function EmptySource({ source }: { source: SourceTab }) {
  const copy =
    source === "affiliate"
      ? {
          title: "Sin afiliados aún",
          body: "Escaneá Find Winners (Keepa Amazon) — cada ganador se convierte solo en link de afiliado listo para ads.",
          href: "/winners",
          cta: "Find Winners",
        }
      : source === "imported"
        ? {
            title: "Sin listings",
            body: "Importá a eBay/Amazon desde Find Winners o Listings. Acá podés publicarlos en Facebook.",
            href: "/listings",
            cta: "Listings",
          }
        : source === "custom"
          ? {
              title: "Pegá cualquier link",
              body: "Título + URL + imagen https.",
              href: "#",
              cta: "",
            }
          : {
              title: "Market vacío",
              body: "Escaneá Find Winners para llenar el floor.",
              href: "/winners",
              cta: "Find Winners",
            };
  return (
    <div className="rounded-2xl border border-dashed border-[#ddd] bg-white px-6 py-12 text-center">
      <p className="text-[18px] font-semibold text-[#191919]">{copy.title}</p>
      <p className="mx-auto mt-2 max-w-sm text-[14px] text-[#707070]">{copy.body}</p>
      {copy.cta ? (
        <Link
          href={copy.href}
          className="mt-5 inline-flex h-10 items-center rounded-full bg-[#3665F3] px-5 text-[13px] font-semibold text-white"
        >
          {copy.cta}
        </Link>
      ) : null}
    </div>
  );
}
