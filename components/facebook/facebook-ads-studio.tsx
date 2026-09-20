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
  Share2,
  Sparkles,
} from "lucide-react";
import { FacebookFMark } from "@/components/brand/store-marks";
import { usePaidActionOptional } from "@/components/credits/paid-action-provider";
import { CREDIT_ACTIONS } from "@/lib/credits/costs";
import { cn } from "@/lib/utils";

type AffLink = {
  id: string;
  asin: string;
  destination_url: string;
  source: string | null;
  click_count: number | null;
  smartPath?: string | null;
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
};

type MarketDrop = {
  id: string;
  asin: string;
  title: string;
  photo: string;
  affiliateUrl?: string | null;
  sell?: number | null;
};

type FbConn = {
  connected: boolean;
  pageName: string | null;
  pageId: string | null;
};

type SourceTab = "affiliate" | "imported" | "market" | "custom";
type PromoFormat = "ads" | "carousel" | "vitrina";

type PickCard = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  priceLabel?: string | null;
  meta?: string;
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
  if (n == null || !Number.isFinite(n)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function Thumb({ url, alt }: { url: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className="size-full object-contain bg-white p-1"
    />
  );
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
  const [message, setMessage] = useState(
    "Oferta verificada · tocá el link y comprá seguro.",
  );
  const [collectionTitle, setCollectionTitle] = useState("Ofertas Higlou");
  const [coverId, setCoverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [postUrl, setPostUrl] = useState<string | null>(null);
  const [panel, setPanel] = useState<"elegir" | "publicar">("elegir");

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
      } else setLinks([]);

      if (prodRes.ok) {
        const body = (await prodRes.json()) as { products?: ImportedProduct[] };
        setImported(
          (body.products || []).filter(
            (p) => p.coverUrl || (p.photos && p.photos.length > 0),
          ),
        );
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

  const cards: PickCard[] = useMemo(() => {
    if (source === "affiliate") {
      return links.map((l) => ({
        id: `aff:${l.id}`,
        title: `ASIN ${l.asin}`,
        imageUrl: `https://images-na.ssl-images-amazon.com/images/P/${l.asin}.01.LZZZZZZZ.jpg`,
        linkUrl: absoluteUrl(l.smartPath, l.destination_url),
        meta: l.smartPath || l.source || "affiliate",
        priceLabel: null,
      }));
    }
    if (source === "imported") {
      return imported.map((p) => {
        const photo = p.coverUrl || p.photos?.[0] || "";
        const asin = String(p.amazonAsin || "").trim();
        const ebayId = String(p.ebayListingId || "").trim();
        const linkUrl = ebayId
          ? `https://www.ebay.com/itm/${ebayId}`
          : asin
            ? `https://www.amazon.com/dp/${asin}`
            : typeof window !== "undefined"
              ? `${window.location.origin}/listings/${p.id}`
              : `/listings/${p.id}`;
        return {
          id: `imp:${p.id}`,
          title: p.title || "Listing",
          imageUrl: photo,
          linkUrl,
          priceLabel: money(p.price),
          meta: p.brand || (ebayId ? "eBay" : asin ? "Amazon" : "Importado"),
        };
      });
    }
    if (source === "custom") {
      return customCards;
    }
    return drops.map((d) => ({
      id: `mkt:${d.id}`,
      title: d.title,
      imageUrl: d.photo,
      linkUrl: d.affiliateUrl || `https://www.amazon.com/dp/${d.asin}`,
      priceLabel: money(d.sell),
      meta: d.asin,
    }));
  }, [source, links, imported, drops, customCards]);

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

  const selectedCards = useMemo(
    () => cards.filter((c) => selectedIds.includes(c.id)),
    [cards, selectedIds],
  );

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
    setSelectedIds((prev) => (next === "ads" ? prev.slice(0, 1) : prev));
    setPostUrl(null);
    if (next !== "ads") {
      setMessage(
        next === "vitrina"
          ? "Pensado para vos. Deslizá y descubrí estas ofertas."
          : "Ofertas verificadas · deslizá y tocá el que te guste.",
      );
    } else {
      setMessage("Oferta verificada · tocá el link y comprá seguro.");
    }
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
    setBusy(true);
    setPostUrl(null);
    try {
      // Ensure absolute https links for affiliate smart paths / listing URLs
      const payloadCards = selectedCards.map((c) => ({
        id: c.id,
        title: c.title,
        imageUrl: c.imageUrl,
        linkUrl: absoluteUrl(
          c.linkUrl.startsWith("/") ? c.linkUrl : null,
          c.linkUrl,
        ),
        priceLabel: c.priceLabel,
      }));

      // For market picks without affiliate, create smart link when possible
      if (source === "market" && format === "ads" && selectedCards[0]) {
        const asin = selectedCards[0].meta;
        if (asin && /^[A-Z0-9]{10}$/i.test(asin)) {
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
            };
            const url = body.smartLink?.path
              ? `${window.location.origin}${body.smartLink.path}`
              : body.link?.destinationUrl;
            if (url && payloadCards[0]) payloadCards[0].linkUrl = url;
          }
        }
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
            ? "Publicado en tu Page"
            : format === "vitrina"
              ? "Vitrina publicada"
              : "Carrusel publicado",
        );
        if (body.postUrl) {
          setPostUrl(body.postUrl);
          window.open(body.postUrl, "_blank", "noopener,noreferrer");
        }
      } else if (body.shareUrl) {
        window.open(body.shareUrl, "_blank", "noopener,noreferrer");
        toast.message(
          fb?.connected
            ? "Abriendo Facebook…"
            : "Conectá tu Page para publicar directo",
        );
      }
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white md:h-full">
      <div className="flex shrink-0 flex-wrap items-center gap-3 bg-[#3665F3] px-4 py-2.5 text-white md:px-5">
        <span className="size-2 rounded-full bg-white" />
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">
          Facebook Ads
        </p>
        <p className="hidden min-w-0 flex-1 truncate text-[13px] text-white/85 sm:block">
          Elegí fuente · estilo · publicá
        </p>
        <Link
          href="/settings#facebook-store"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3 text-[12px] font-semibold text-white hover:bg-white/25"
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

      {!fb?.connected || !hasTag ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#e5e5e5] bg-[#f7f7f7] px-4 py-2 text-[12px] text-[#707070] md:px-5">
          {!fb?.connected ? (
            <Link href="/settings#facebook-store" className="font-medium text-[#3665F3] hover:underline">
              Conectá tu Page
            </Link>
          ) : null}
          {!fb?.connected && !hasTag ? <span>·</span> : null}
          {!hasTag ? (
            <Link href="/affiliate" className="font-medium text-[#3665F3] hover:underline">
              Pegá tu Associate tag
            </Link>
          ) : null}
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
              ? "1 producto con link."
              : format === "carousel"
                ? `Carrusel · elegí ${minNeeded} a ${MAX}.`
                : `Vitrina · elegí ${minNeeded} a ${MAX} + portada.`}
          </p>

          <div className="mb-4 flex flex-wrap gap-1 rounded-full border border-[#e5e5e5] bg-white p-1">
            {(
              [
                { id: "affiliate" as const, label: "Afiliados", count: links.length },
                { id: "imported" as const, label: "Importados", count: imported.length },
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
                          <Thumb url={card.imageUrl} alt="" />
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
                    <p className="mb-2 line-clamp-2 text-[13px] text-[#191919]">{message || "…"}</p>
                    <div className="overflow-hidden rounded-xl border border-[#e5e5e5]">
                      <div className="aspect-[1.91/1] bg-white">
                        <Thumb url={selectedCards[0]!.imageUrl} alt="" />
                      </div>
                      <div className="border-t border-[#e5e5e5] px-3 py-2">
                        <p className="truncate text-[13px] font-semibold text-[#191919]">
                          {selectedCards[0]!.title}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : format === "vitrina" ? (
                  <div className="bg-white p-3">
                    <p className="mb-1 text-[13px] font-semibold">{collectionTitle || "Vitrina"}</p>
                    <div className="mb-2 aspect-[4/5] max-h-36 overflow-hidden rounded-xl border border-[#e5e5e5]">
                      <Thumb url={coverCard?.imageUrl || selectedCards[0]!.imageUrl} alt="" />
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto">
                      {selectedCards.map((c) => (
                        <span key={c.id} className="size-11 shrink-0 overflow-hidden rounded-lg border border-[#e5e5e5]">
                          <Thumb url={c.imageUrl} alt="" />
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 overflow-x-auto bg-white p-3">
                    {selectedCards.map((c) => (
                      <div key={c.id} className="w-24 shrink-0 overflow-hidden rounded-xl border border-[#e5e5e5]">
                        <div className="aspect-square"><Thumb url={c.imageUrl} alt="" /></div>
                        <p className="truncate px-1.5 py-1 text-[10px] font-semibold">{c.title}</p>
                      </div>
                    ))}
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
                      <Thumb url={c.imageUrl} alt="" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <label className="mt-4 block text-[12px] font-semibold text-[#707070]">
            Mensaje
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="mt-1.5 w-full resize-none rounded-xl border border-[#e5e5e5] px-3 py-2.5 text-[14px] outline-none focus:border-[#3665F3]"
            />
          </label>

          <button
            type="button"
            disabled={busy || selectedCards.length < minNeeded}
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
      ? { title: "Sin afiliados", body: "Creá un link desde Market → Ganar.", href: "/market", cta: "Market" }
      : source === "imported"
        ? { title: "Sin importados", body: "Importá desde Find Winners.", href: "/listings", cta: "Listings" }
        : source === "custom"
          ? { title: "Nada todavía", body: "Pegá un link + imagen arriba.", href: "/facebook", cta: "" }
          : { title: "Market vacío", body: "Escaneá Find Winners primero.", href: "/winners", cta: "Find Winners" };
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
