"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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
  Sparkles,
  Store,
} from "lucide-react";
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
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const offset = c * (1 - pct);
  const tone =
    value == null
      ? "#a8a29a"
      : value >= 70
        ? "#1f7a4d"
        : value >= 45
          ? "#c9a227"
          : "#b42318";

  return (
    <div className="relative size-[88px] shrink-0">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="6"
        />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <p className="font-display text-[26px] leading-none tabular-nums">
          {value == null ? "—" : Math.round(value)}
        </p>
        <p className="mt-0.5 text-[8px] font-bold tracking-[0.16em] text-white/50 uppercase">
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
      ? "border-[#1f7a4d]/25 bg-gradient-to-br from-[#e8f5ee] to-white"
      : tone === "warn"
        ? "border-[#c9a227]/35 bg-gradient-to-br from-[#fff8e8] to-white"
        : tone === "bad"
          ? "border-[#b42318]/25 bg-gradient-to-br from-[#fdf2f1] to-white"
          : "border-[#ebe7e0] bg-gradient-to-br from-[#faf9f6] to-white";
  const bar =
    tone === "ok"
      ? "bg-[#1f7a4d]"
      : tone === "warn"
        ? "bg-[#c9a227]"
        : tone === "bad"
          ? "bg-[#b42318]"
          : "bg-[#c5bfb5]";
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: EASE }}
      className={cn(
        "relative overflow-hidden rounded-2xl border px-3.5 py-3.5",
        toneCls,
      )}
    >
      <span className={cn("absolute top-0 left-0 h-full w-1", bar)} />
      <p className="pl-2 text-[10px] font-bold tracking-[0.14em] text-[#6b6560] uppercase">
        {label}
      </p>
      <p className="mt-1.5 pl-2 text-[13px] leading-snug font-semibold text-[#141414]">
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
          "flex min-h-[180px] items-center justify-center overflow-hidden rounded-3xl border border-[#1a1f1c]/10 bg-[#141814]",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="size-5 animate-spin text-[#e8c547]" />
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
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className={cn(
        "overflow-hidden rounded-[28px] border border-[#1a1f1c]/12 bg-[#f7f5f1] shadow-[0_20px_50px_-28px_rgba(20,24,20,0.45)]",
        className,
      )}
      data-money-card
      style={
        {
          "--me-ink": "#141814",
          "--me-gold": "#e8c547",
          "--me-mint": "#1f7a4d",
        } as CSSProperties
      }
    >
      {/* Hero terminal header */}
      <div className="relative overflow-hidden bg-[var(--me-ink)] px-5 pt-5 pb-4 text-white sm:px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 90% at 0% -10%, rgba(232,197,71,0.22), transparent 50%), radial-gradient(ellipse 50% 70% at 100% 0%, rgba(31,122,77,0.18), transparent 45%), linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.25))",
          }}
        />
        {!reduce ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/6 to-transparent"
            animate={{ left: ["-25%", "120%"] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: "linear" }}
          />
        ) : null}

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.22em] text-[var(--me-gold)] uppercase">
              <span className="relative flex size-2">
                {!reduce ? (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--me-gold)]/50" />
                ) : null}
                <span className="relative size-2 rounded-full bg-[var(--me-gold)]" />
              </span>
              <ShieldCheck className="size-3.5" />
              Money Engine · live
            </p>
            <h3 className="mt-2 font-display text-[32px] leading-[0.92] tracking-tight sm:text-[36px]">
              Gana con
              <br />
              <span className="text-[var(--me-gold)]">este producto</span>
            </h3>
            <p className="mt-2.5 max-w-sm text-[13px] leading-relaxed text-white/65">
              Ruta clara: affiliate, vender en tienda o comparar el mismo SKU —
              sin inventar márgenes.
            </p>
          </div>
          <ScoreRing value={scoreNum} reduce={reduce} />
        </div>

        {/* Architectural tab rail */}
        <div className="relative mt-5 grid grid-cols-3 gap-1 rounded-2xl bg-white/6 p-1 ring-1 ring-white/10 backdrop-blur-sm">
          {tabs.map((t) => {
            const on = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative z-10 flex flex-col items-center gap-0.5 rounded-xl px-2 py-2.5 transition",
                  on ? "text-[var(--me-ink)]" : "text-white/55 hover:text-white/85",
                )}
              >
                {on ? (
                  <motion.span
                    layoutId="money-engine-tab"
                    className="absolute inset-0 rounded-xl bg-[var(--me-gold)] shadow-[0_8px_24px_-8px_rgba(232,197,71,0.7)]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10 inline-flex items-center gap-1.5 text-[13px] font-bold tracking-tight">
                  <Icon className="size-3.5 opacity-80" />
                  {t.label}
                </span>
                <span
                  className={cn(
                    "relative z-10 text-[9px] font-semibold tracking-[0.12em] uppercase",
                    on ? "text-[var(--me-ink)]/55" : "text-white/35",
                  )}
                >
                  {t.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {error ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
                  <div className="relative overflow-hidden rounded-3xl border border-[#ebe7e0] bg-white">
                    <div
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[var(--me-gold)] via-[var(--me-mint)] to-[var(--me-ink)]"
                    />
                    <div className="px-5 py-5 pl-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#141814] px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-[var(--me-gold)] uppercase">
                          <Sparkles className="size-3" />
                          Recomendación
                        </span>
                        {aff?.configured ? (
                          <span className="rounded-full bg-[#e8f5ee] px-2.5 py-1 text-[10px] font-bold tracking-wide text-[#1f7a4d] uppercase">
                            Associates listo
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 font-display text-[26px] leading-[1.05] tracking-tight text-[#141414] sm:text-[30px]">
                        {decision.primaryAction}
                      </p>
                      {decision.secondaryAction ? (
                        <p className="mt-2 text-[14px] text-[#6b6560]">
                          También:{" "}
                          <span className="font-semibold text-[#141414]">
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
                            className="flex gap-3 text-[13px] leading-snug text-[#5a554e]"
                          >
                            <span
                              className={cn(
                                "mt-1.5 size-2 shrink-0 rounded-full ring-4",
                                reason.ok
                                  ? "bg-[#1f7a4d] ring-[#1f7a4d]/15"
                                  : "bg-[#c5bfb5] ring-[#ebe7e0]",
                              )}
                            />
                            {reason.text}
                          </motion.li>
                        ))}
                      </ul>

                      {decision.warnings[0] ? (
                        <p className="mt-4 rounded-2xl border border-[#e8d9a8] bg-[#fffbf0] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#6b5510]">
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
                      className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--me-ink)] px-5 text-[13px] font-bold text-white shadow-[0_12px_28px_-12px_rgba(20,24,20,0.55)] transition hover:bg-[#1f2620] disabled:opacity-40"
                    >
                      {busy === "affiliate" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Banknote className="size-4 text-[var(--me-gold)]" />
                      )}
                      Crear affiliate
                    </button>
                    <button
                      type="button"
                      disabled={!flags.smartLinks || busy === "affiliate"}
                      onClick={() => void createAffiliate()}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[#ddd7cd] bg-white px-4 text-[13px] font-semibold text-[#141414] hover:border-[#141414] disabled:opacity-40"
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
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[#ddd7cd] bg-white px-4 text-[13px] font-semibold text-[#141414] hover:border-[#141414] disabled:opacity-40"
                    >
                      <QrCode className="size-4" />
                      QR
                    </button>
                    <button
                      type="button"
                      disabled={busy === "watch"}
                      onClick={() => void watchProduct()}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[#ddd7cd] bg-white px-4 text-[13px] font-semibold text-[#141414] hover:border-[#141414] disabled:opacity-40"
                    >
                      <Eye className="size-4" />
                      Watch
                    </button>
                  </div>
                  {smartPath ? (
                    <p className="rounded-2xl border border-dashed border-[#ddd7cd] bg-white px-3.5 py-2.5 text-[12px] text-[#6b6560]">
                      Smart link:{" "}
                      <span className="font-semibold text-[#141414]">
                        {smartPath}
                      </span>
                    </p>
                  ) : null}
                  {aff?.message ? (
                    <p className="text-[12px] text-[#8a847c]">{aff.message}</p>
                  ) : null}
                </>
              ) : null}

              {tab === "vender" ? (
                <>
                  <div className="mb-1 flex items-center gap-2">
                    <Scale className="size-4 text-[#1f7a4d]" />
                    <p className="text-[12px] font-semibold text-[#6b6560]">
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
                      className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--me-gold)] px-5 text-[13px] font-bold text-[var(--me-ink)] shadow-[0_12px_28px_-12px_rgba(232,197,71,0.65)] hover:brightness-105"
                    >
                      <Store className="size-4" />
                      Publicar listing
                    </Link>
                    <Link
                      href="/winners"
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[#ddd7cd] bg-white px-4 text-[13px] font-semibold text-[#141414] hover:border-[#141414]"
                    >
                      Buscar winners
                    </Link>
                  </div>
                </>
              ) : null}

              {tab === "comparar" ? (
                <>
                  <p className="text-[13px] leading-relaxed text-[#6b6560]">
                    Solo el{" "}
                    <strong className="font-semibold text-[#141414]">
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
                            <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a847c] uppercase">
                              {row.label}
                            </p>
                            <span
                              className={cn(
                                "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase",
                                row.exact
                                  ? "bg-[#e8f5ee] text-[#1f7a4d]"
                                  : row.href
                                    ? "bg-[#fff8e8] text-[#8a6a10]"
                                    : "bg-[#f0ebe3] text-[#8a847c]",
                              )}
                            >
                              {row.exact
                                ? "Mismo SKU"
                                : row.href
                                  ? "Buscar UPC"
                                  : "Sin match"}
                            </span>
                          </div>
                          <p className="mt-3 font-display text-[26px] leading-none tabular-nums tracking-tight">
                            {formatMoney(row.price)}
                          </p>
                          {row.href ? (
                            <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[#2162a1]">
                              Abrir plataforma
                              <ExternalLink className="size-3 opacity-70" />
                            </p>
                          ) : (
                            <p className="mt-3 text-[11px] text-[#8a847c]">
                              Sin enlace confirmado
                            </p>
                          )}
                        </>
                      );
                      const cls = cn(
                        "rounded-2xl border p-3.5 transition",
                        row.href
                          ? "border-[#ebe7e0] bg-white hover:border-[#141814] hover:shadow-[0_12px_28px_-16px_rgba(20,24,20,0.35)]"
                          : "border-dashed border-[#ebe7e0] bg-[#faf9f6] opacity-70",
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
