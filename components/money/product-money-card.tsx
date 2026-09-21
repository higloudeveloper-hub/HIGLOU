"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  Banknote,
  ExternalLink,
  Eye,
  GitCompareArrows,
  Link2,
  Loader2,
  QrCode,
  Scale,
  ShieldCheck,
  Share2,
  Sparkles,
  Store,
} from "lucide-react";
import { FacebookFMark } from "@/components/brand/store-marks";
import type { MonetizationDecision, MonetizationInput } from "@/lib/monetization/types";
import { takeOpportunityMoneySeed } from "@/lib/monetization/from-opportunity";
import {
  amazonProductUrl,
  buildPlatformUrls,
  type PlatformUrls,
} from "@/lib/opportunity/platform-links";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

type TabId = "ganar" | "vender" | "comparar";

type MoneyFlags = {
  moneyEngine: boolean;
  affiliateEngine: boolean;
  smartLinks: boolean;
  moneyScore: boolean;
};

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

function ScoreRing({
  value,
  reduce,
}: {
  value: number | null;
  reduce: boolean;
}) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const offset = c * (1 - pct);
  const tone =
    value == null
      ? "#c8c8c8"
      : value >= 70
        ? "#1f7a4d"
        : value >= 45
          ? "#3665F3"
          : "#b42318";

  return (
    <div className="relative size-[72px] shrink-0">
      <svg viewBox="0 0 72 72" className="size-full -rotate-90">
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="#ececec"
          strokeWidth="4"
        />
        <motion.circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.85, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-[18px] leading-none font-semibold tabular-nums text-[#191919]">
          {value == null ? "—" : Math.round(value)}
        </p>
        <p className="mt-0.5 text-[8px] font-semibold tracking-[0.14em] text-[#8a8a8a] uppercase">
          Score
        </p>
      </div>
    </div>
  );
}

function LaneChip({
  label,
  tone,
  detail,
  index,
  reduce,
}: {
  label: string;
  tone: "ok" | "warn" | "bad" | "muted";
  detail: string;
  index: number;
  reduce: boolean;
}) {
  const toneCls =
    tone === "ok"
      ? "border-[#cfe8d9] bg-white"
      : tone === "warn"
        ? "border-[#e8dfc8] bg-white"
        : tone === "bad"
          ? "border-[#edd5d2] bg-white"
          : "border-[#e5e5e5] bg-white";
  const bar =
    tone === "ok"
      ? "bg-[#1f7a4d]"
      : tone === "warn"
        ? "bg-[#a8841a]"
        : tone === "bad"
          ? "bg-[#b42318]"
          : "bg-[#c8c8c8]";
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3, ease: EASE }}
      className={cn(
        "relative overflow-hidden rounded-xl border px-3.5 py-3",
        toneCls,
      )}
    >
      <span className={cn("absolute top-0 left-0 h-full w-0.5", bar)} />
      <p className="pl-2 text-[10px] font-semibold tracking-[0.12em] text-[#8a8a8a] uppercase">
        {label}
      </p>
      <p className="mt-1 pl-2 text-[13px] leading-snug font-medium text-[#191919]">
        {detail}
      </p>
    </motion.div>
  );
}

export function ProductMoneyCard({
  productId,
  asin,
  ebayPrice,
  title,
  brand,
  upc,
  amazonPrice,
  cost,
  className,
}: {
  productId?: string | null;
  asin?: string | null;
  ebayPrice?: number | null;
  title?: string | null;
  brand?: string | null;
  upc?: string | null;
  amazonPrice?: number | null;
  cost?: number | null;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const [decision, setDecision] = useState<MonetizationDecision | null>(null);
  const [flags, setFlags] = useState<MoneyFlags | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [smartPath, setSmartPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("ganar");
  const [seedUrls, setSeedUrls] = useState<PlatformUrls | null>(null);
  const [seedPrices, setSeedPrices] = useState<{
    amazon: number | null;
    ebay: number | null;
  }>({ amazon: null, ebay: null });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const seed: MonetizationInput | null = takeOpportunityMoneySeed(asin);
        const resolvedAsin = asin || seed?.asin || undefined;
        const resolvedTitle = title || seed?.title || undefined;
        const resolvedBrand = brand || seed?.brand || undefined;
        const resolvedUpc = upc || seed?.upc || undefined;
        const resolvedAmazon =
          amazonPrice ?? seed?.amazonPrice ?? seed?.cost ?? null;
        const resolvedEbay = ebayPrice ?? seed?.ebayPrice ?? null;

        setSeedPrices({
          amazon: resolvedAmazon ?? null,
          ebay: resolvedEbay ?? null,
        });
        setSeedUrls(
          buildPlatformUrls({
            asin: resolvedAsin || "",
            title: resolvedTitle || "",
            brand: resolvedBrand || "",
            upc: resolvedUpc || "",
          }),
        );

        const res = await fetch("/api/money/recommendation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: productId || undefined,
            asin: resolvedAsin,
            ebayPrice: resolvedEbay ?? undefined,
            amazonPrice: resolvedAmazon ?? undefined,
            cost: cost ?? seed?.cost ?? undefined,
            amazonFees: seed?.amazonFees ?? undefined,
            ebayFees: seed?.ebayFees ?? undefined,
            shipping: seed?.shipping ?? undefined,
            packing: seed?.packing ?? undefined,
            amazonEligibility: seed?.amazonEligibility ?? undefined,
            amazonEligibilityMessage: seed?.amazonEligibilityMessage ?? undefined,
            demandScore: seed?.demandScore ?? undefined,
            sellerCount: seed?.sellerCount ?? undefined,
            opportunityScore: seed?.opportunityScore ?? undefined,
            opportunityVerdict: seed?.opportunityVerdict ?? undefined,
            soldVerified: seed?.soldVerified ?? undefined,
            title: resolvedTitle,
            brand: resolvedBrand,
            upc: resolvedUpc,
          }),
        });
        if (res.status === 404) {
          if (!cancelled) {
            setFlags({
              moneyEngine: false,
              affiliateEngine: false,
              smartLinks: false,
              moneyScore: false,
            });
            setLoading(false);
          }
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setError("Money recommendation unavailable");
            setLoading(false);
          }
          return;
        }
        const body = (await res.json()) as {
          enabled?: boolean;
          flags?: MoneyFlags;
          decision?: MonetizationDecision;
        };
        if (cancelled) return;
        setFlags(
          body.flags || {
            moneyEngine: body.enabled !== false,
            affiliateEngine: false,
            smartLinks: false,
            moneyScore: true,
          },
        );
        setDecision(body.decision ?? null);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Money recommendation failed");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, asin, ebayPrice, title, brand, upc, amazonPrice, cost]);

  const createAffiliate = useCallback(async () => {
    if (!asin) {
      toast.message("ASIN required for Amazon Affiliate");
      return;
    }
    setBusy("affiliate");
    try {
      const res = await fetch("/api/money/affiliate/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asin,
          productId: productId || undefined,
          campaignName: "Product card",
          source: "manual",
          createSmartLink: true,
          platform: "manual",
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        link?: { destinationUrl: string };
        smartLink?: { path: string };
        qrDataUrl?: string | null;
        warnings?: string[];
      };
      if (!res.ok) {
        toast.error(body.error || "Could not create affiliate link");
        return;
      }
      setSmartPath(body.smartLink?.path || null);
      setQrDataUrl(body.qrDataUrl || null);
      toast.success("Affiliate link created", {
        description: body.link?.destinationUrl,
      });
      body.warnings?.slice(0, 1).forEach((w) => toast.message(w));
    } finally {
      setBusy(null);
    }
  }, [asin, productId]);

  const watchProduct = useCallback(async () => {
    if (!productId) {
      toast.message("Save the product first");
      return;
    }
    setBusy("watch");
    try {
      const res = await fetch("/api/money/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, asin: asin || undefined }),
      });
      const body = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        toast.error(body.error || "Could not watch product");
        return;
      }
      toast.success("Added to Money watchlist");
    } finally {
      setBusy(null);
    }
  }, [productId, asin]);

  const shareFacebook = useCallback(async () => {
    if (!asin) {
      toast.message("ASIN required");
      return;
    }
    setBusy("facebook");
    try {
      // Ensure we have a fresh affiliate + smart link first
      const created = await fetch("/api/money/affiliate/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asin,
          productId: productId || undefined,
          campaignName: "Facebook share",
          source: "facebook",
          createSmartLink: true,
          platform: "facebook",
        }),
      });
      const createdBody = (await created.json()) as {
        error?: string;
        link?: { destinationUrl?: string };
        smartLink?: { path?: string };
      };
      if (!created.ok) {
        toast.error(createdBody.error || "Crea el affiliate primero");
        return;
      }
      const path = createdBody.smartLink?.path;
      const url = path
        ? `${window.location.origin}${path}`
        : createdBody.link?.destinationUrl;
      if (!url) {
        toast.error("No hay URL para compartir");
        return;
      }
      const res = await fetch("/api/facebook/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          asin,
          message: `Oferta verificada · ${title || asin}`,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        mode?: string;
        shareUrl?: string;
        postUrl?: string;
      };
      if (!res.ok) {
        toast.error(body.error || "Facebook share failed");
        return;
      }
      if (body.mode === "page_post") {
        toast.success("Publicado en tu Facebook Page");
        if (body.postUrl) window.open(body.postUrl, "_blank", "noopener,noreferrer");
      } else if (body.shareUrl) {
        window.open(body.shareUrl, "_blank", "noopener,noreferrer");
        toast.message("Abriendo Facebook — conectá tu Page en Settings para post directo");
      }
      if (path) setSmartPath(path);
    } finally {
      setBusy(null);
    }
  }, [asin, productId, title]);

  const urls = useMemo(() => {
    const amazon = seedUrls?.amazon || amazonProductUrl(asin) || null;
    return {
      amazon,
      ebay: seedUrls?.ebay || null,
      walmart: seedUrls?.walmart || null,
      homedepot: seedUrls?.homedepot || null,
    };
  }, [seedUrls, asin]);

  if (!flags?.moneyEngine) return null;
  if (loading) {
    return (
      <div
        className={cn(
          "flex min-h-[180px] items-center justify-center overflow-hidden rounded-xl border border-[#1a1f1c]/10 bg-[#141814]",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="size-5 animate-spin text-[#3665F3]" />
          <p className="text-[11px] tracking-[0.18em] text-white/50 uppercase">
            Analizando money paths…
          </p>
        </div>
      </div>
    );
  }
  if (!decision && !error) return null;

  const amz = decision?.channels.amazonSeller;
  const ebay = decision?.channels.ebaySeller;
  const aff = decision?.channels.amazonAffiliate;
  const scoreNum =
    !flags.moneyScore ||
    decision?.moneyScoreAvailability === "insufficient" ||
    decision?.moneyScore == null
      ? null
      : decision.moneyScore;

  const amzTone: "ok" | "warn" | "bad" | "muted" =
    amz?.status === "SELLABLE"
      ? "ok"
      : amz?.status === "APPROVAL_REQUIRED"
        ? "warn"
        : amz?.status === "RESTRICTED" ||
            amz?.status === "CONDITION_RESTRICTED"
          ? "bad"
          : "muted";

  const tabs: Array<{
    id: TabId;
    label: string;
    hint: string;
    icon: typeof Banknote;
  }> = [
    { id: "ganar", label: "Ganar", hint: "Affiliate", icon: Banknote },
    { id: "vender", label: "Vender", hint: "Tiendas", icon: Store },
    { id: "comparar", label: "Comparar", hint: "Mismo SKU", icon: GitCompareArrows },
  ];

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={cn(
        "overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]",
        className,
      )}
      data-money-card
    >
      {/* Pro header — matches Home / Find Winners chrome */}
      <div className="border-b border-[#e5e5e5] bg-white px-5 pt-4 pb-3 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-[#707070] uppercase">
              <span className="relative flex size-1.5">
                {!reduce ? (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#1f7a4d]/40" />
                ) : null}
                <span className="relative size-1.5 rounded-full bg-[#1f7a4d]" />
              </span>
              <ShieldCheck className="size-3.5 text-[#3665F3]" />
              Money Engine · live
            </p>
            <h3 className="mt-2 text-[22px] leading-tight font-semibold tracking-tight text-[#191919] sm:text-[24px]">
              Monetizá este producto
            </h3>
            <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#707070]">
              Affiliate, vender en tienda o comparar el mismo SKU — sin inventar
              márgenes.
            </p>
          </div>
          <ScoreRing value={scoreNum} reduce={reduce} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-1">
          {tabs.map((t) => {
            const on = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative z-10 flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 transition",
                  on ? "text-[#191919]" : "text-[#8a8a8a] hover:text-[#555]",
                )}
              >
                {on ? (
                  <motion.span
                    layoutId="money-engine-tab"
                    className="absolute inset-0 rounded-lg bg-white shadow-sm"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10 inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-tight">
                  <Icon className="size-3.5 opacity-70" />
                  {t.label}
                </span>
                <span
                  className={cn(
                    "relative z-10 text-[9px] font-medium tracking-[0.1em] uppercase",
                    on ? "text-[#8a8a8a]" : "text-[#b0b0b0]",
                  )}
                >
                  {t.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-[#f7f7f7] p-4 sm:p-5">
        {error ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </p>
        ) : decision ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="space-y-4"
            >
              {tab === "ganar" ? (
                <>
                  <div className="relative overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
                    <div
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-1.5 bg-[#3665F3]"
                    />
                    <div className="px-5 py-5 pl-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#191919] px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-white uppercase">
                          <Sparkles className="size-3" />
                          Recomendación
                        </span>
                        {aff?.configured ? (
                          <span className="rounded-full bg-[#e8f5ee] px-2.5 py-1 text-[10px] font-bold tracking-wide text-[#1f7a4d] uppercase">
                            Associates listo
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-[20px] font-semibold leading-[1.05] tracking-tight text-[#191919] sm:text-[30px]">
                        {decision.primaryAction}
                      </p>
                      {decision.secondaryAction ? (
                        <p className="mt-2 text-[14px] text-[#707070]">
                          También:{" "}
                          <span className="font-semibold text-[#191919]">
                            {decision.secondaryAction}
                          </span>
                        </p>
                      ) : null}

                      <ul className="mt-4 space-y-2.5">
                        {decision.reasons.slice(0, 3).map((reason, i) => (
                          <motion.li
                            key={reason.text}
                            initial={reduce ? false : { opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.08 + i * 0.06 }}
                            className="flex gap-3 text-[13px] leading-snug text-[#555]"
                          >
                            <span
                              className={cn(
                                "mt-1.5 size-2 shrink-0 rounded-full ring-4",
                                reason.ok
                                  ? "bg-[#1f7a4d] ring-[#1f7a4d]/15"
                                  : "bg-[#c8c8c8] ring-[#e5e5e5]",
                              )}
                            />
                            {reason.text}
                          </motion.li>
                        ))}
                      </ul>

                      {decision.warnings[0] ? (
                        <p className="mt-4 rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#707070]">
                          {decision.warnings[0]}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!flags.affiliateEngine || busy === "affiliate"}
                      onClick={() => void createAffiliate()}
                      className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#191919] px-5 text-[13px] font-semibold text-white hover:bg-[#2a2a2a] disabled:opacity-40"
                    >
                      {busy === "affiliate" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Banknote className="size-4 text-white/80" />
                      )}
                      Crear affiliate
                    </button>
                    <button
                      type="button"
                      disabled={!flags.smartLinks || busy === "affiliate"}
                      onClick={() => void createAffiliate()}
                      className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 text-[13px] font-semibold text-[#191919] hover:border-[#191919] disabled:opacity-40"
                    >
                      <Link2 className="size-4" />
                      Smart link
                    </button>
                    <button
                      type="button"
                      disabled={!qrDataUrl && !smartPath}
                      onClick={() => {
                        if (qrDataUrl) {
                          const w = window.open("");
                          w?.document.write(
                            `<img alt="QR" src="${qrDataUrl}" /><p>${smartPath || ""}</p>`,
                          );
                        } else toast.message("Crea un Smart Link primero");
                      }}
                      className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 text-[13px] font-semibold text-[#191919] hover:border-[#191919] disabled:opacity-40"
                    >
                      <QrCode className="size-4" />
                      QR
                    </button>
                    <button
                      type="button"
                      disabled={!flags.affiliateEngine || busy === "facebook"}
                      onClick={() => void shareFacebook()}
                      className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#1877F2] px-4 text-[13px] font-semibold text-white hover:bg-[#166fe5] disabled:opacity-40"
                    >
                      {busy === "facebook" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <FacebookFMark className="size-3.5" />
                      )}
                      Facebook ads
                    </button>
                    <button
                      type="button"
                      disabled={busy === "watch"}
                      onClick={() => void watchProduct()}
                      className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 text-[13px] font-semibold text-[#191919] hover:border-[#191919] disabled:opacity-40"
                    >
                      <Eye className="size-4" />
                      Watch
                    </button>
                    <Link
                      href="/affiliate"
                      className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 text-[13px] font-semibold text-[#191919] hover:border-[#191919]"
                    >
                      <Share2 className="size-4" />
                      Ver affiliate
                    </Link>
                  </div>
                  {smartPath ? (
                    <p className="rounded-xl border border-dashed border-[#e5e5e5] bg-white px-3.5 py-2.5 text-[12px] text-[#707070]">
                      Smart link:{" "}
                      <span className="font-semibold text-[#191919]">
                        {smartPath}
                      </span>
                    </p>
                  ) : null}
                  {aff?.message ? (
                    <p className="text-[12px] text-[#8a8a8a]">{aff.message}</p>
                  ) : null}
                </>
              ) : null}

              {tab === "vender" ? (
                <>
                  <div className="mb-1 flex items-center gap-2">
                    <Scale className="size-4 text-[#1f7a4d]" />
                    <p className="text-[12px] font-semibold text-[#707070]">
                      Canales de venta · estado real
                    </p>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <LaneChip
                      label="Amazon seller"
                      tone={amzTone}
                      detail={amz?.message || "Sin datos"}
                      index={0}
                      reduce={reduce}
                    />
                    <LaneChip
                      label="eBay seller"
                      tone={ebay?.available ? "ok" : "muted"}
                      detail={ebay?.message || "Sin datos"}
                      index={1}
                      reduce={reduce}
                    />
                    <LaneChip
                      label="Profit estimado"
                      tone={
                        ebay?.netProfit.value != null && ebay.netProfit.value > 0
                          ? "ok"
                          : "muted"
                      }
                      detail={
                        ebay?.netProfit.value != null
                          ? formatMoney(ebay.netProfit.value)
                          : "Insufficient Data"
                      }
                      index={2}
                      reduce={reduce}
                    />
                    <LaneChip
                      label="Affiliate"
                      tone={
                        aff?.configured
                          ? aff.available
                            ? "ok"
                            : "warn"
                          : "muted"
                      }
                      detail={aff?.message || "No configurado"}
                      index={3}
                      reduce={reduce}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link
                      href={productId ? `/listings/${productId}` : "/listings/new"}
                      className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#3665F3] px-5 text-[13px] font-semibold text-white hover:bg-[#2f5ae0]"
                    >
                      <Store className="size-4" />
                      Publicar listing
                    </Link>
                    <Link
                      href="/winners"
                      className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 text-[13px] font-semibold text-[#191919] hover:border-[#191919]"
                    >
                      Buscar winners
                    </Link>
                  </div>
                </>
              ) : null}

              {tab === "comparar" ? (
                <>
                  <p className="text-[13px] leading-relaxed text-[#707070]">
                    Solo el{" "}
                    <strong className="font-semibold text-[#191919]">
                      mismo producto
                    </strong>{" "}
                    (ASIN / item id / UPC). Sin inventar similares.
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {(
                      [
                        {
                          key: "amazon",
                          label: "Amazon",
                          price:
                            seedPrices.amazon ??
                            amz?.salePrice.value ??
                            amz?.cost.value ??
                            null,
                          href: urls.amazon,
                          exact: Boolean(urls.amazon?.includes("/dp/")),
                        },
                        {
                          key: "ebay",
                          label: "eBay",
                          price:
                            seedPrices.ebay ?? ebay?.salePrice.value ?? null,
                          href: urls.ebay,
                          exact: Boolean(urls.ebay?.includes("/itm/")),
                        },
                        {
                          key: "walmart",
                          label: "Walmart",
                          price: null,
                          href: urls.walmart,
                          exact: Boolean(urls.walmart?.includes("/ip/")),
                        },
                        {
                          key: "homedepot",
                          label: "Home Depot",
                          price: null,
                          href: urls.homedepot,
                          exact: Boolean(
                            urls.homedepot?.match(/homedepot\.com\/p\//),
                          ),
                        },
                      ] as const
                    ).map((row, i) => {
                      const inner = (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a8a8a] uppercase">
                              {row.label}
                            </p>
                            <span
                              className={cn(
                                "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase",
                                row.exact
                                  ? "bg-[#e8f5ee] text-[#1f7a4d]"
                                  : row.href
                                    ? "bg-[#f7f7f7] text-[#707070]"
                                    : "bg-[#f0f0f0] text-[#8a8a8a]",
                              )}
                            >
                              {row.exact
                                ? "Mismo SKU"
                                : row.href
                                  ? "Buscar UPC"
                                  : "Sin match"}
                            </span>
                          </div>
                          <p className="mt-3 text-[20px] font-semibold leading-none tabular-nums tracking-tight">
                            {formatMoney(row.price)}
                          </p>
                          {row.href ? (
                            <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[#2162a1]">
                              Abrir plataforma
                              <ExternalLink className="size-3 opacity-70" />
                            </p>
                          ) : (
                            <p className="mt-3 text-[11px] text-[#8a8a8a]">
                              Sin enlace confirmado
                            </p>
                          )}
                        </>
                      );
                      const cls = cn(
                        "rounded-xl border p-3.5 transition",
                        row.href
                          ? "border-[#e5e5e5] bg-white hover:border-[#191919] hover:shadow-[0_12px_28px_-16px_rgba(20,24,20,0.35)]"
                          : "border-dashed border-[#e5e5e5] bg-[#fafafa] opacity-70",
                      );
                      return row.href ? (
                        <motion.a
                          key={row.key}
                          href={row.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          initial={reduce ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className={cls}
                        >
                          {inner}
                        </motion.a>
                      ) : (
                        <motion.div
                          key={row.key}
                          initial={reduce ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className={cls}
                        >
                          {inner}
                        </motion.div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </motion.div>
          </AnimatePresence>
        ) : null}
      </div>
    </motion.section>
  );
}
