"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  QrCode,
  ShieldCheck,
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

function LaneChip({
  label,
  tone,
  detail,
}: {
  label: string;
  tone: "ok" | "warn" | "bad" | "muted";
  detail: string;
}) {
  const toneCls =
    tone === "ok"
      ? "border-[#b8dfc8] bg-[#e8f5ee] text-[#1a6b45]"
      : tone === "warn"
        ? "border-[#f0d9a8] bg-[#fff8e8] text-[#8a6a10]"
        : tone === "bad"
          ? "border-[#f0c4c0] bg-[#fdf2f1] text-[#b42318]"
          : "border-[#ebe7e0] bg-[#faf9f6] text-[#8a847c]";
  return (
    <div className={cn("rounded-2xl border px-3.5 py-3", toneCls)}>
      <p className="text-[10px] font-bold tracking-[0.14em] uppercase opacity-80">
        {label}
      </p>
      <p className="mt-1 text-[13px] leading-snug font-medium">{detail}</p>
    </div>
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
    const amazon =
      seedUrls?.amazon || amazonProductUrl(asin) || null;
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
          "flex min-h-[140px] items-center justify-center rounded-3xl border border-[#ebe7e0] bg-white",
          className,
        )}
      >
        <Loader2 className="size-4 animate-spin text-[#9b9b9b]" />
      </div>
    );
  }
  if (!decision && !error) return null;

  const amz = decision?.channels.amazonSeller;
  const ebay = decision?.channels.ebaySeller;
  const aff = decision?.channels.amazonAffiliate;
  const scoreLabel =
    !flags.moneyScore ||
    decision?.moneyScoreAvailability === "insufficient" ||
    decision?.moneyScore == null
      ? "—"
      : `${decision.moneyScore}`;

  const amzTone: "ok" | "warn" | "bad" | "muted" =
    amz?.status === "SELLABLE"
      ? "ok"
      : amz?.status === "APPROVAL_REQUIRED"
        ? "warn"
        : amz?.status === "RESTRICTED" ||
            amz?.status === "CONDITION_RESTRICTED"
          ? "bad"
          : "muted";

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "ganar", label: "Ganar" },
    { id: "vender", label: "Vender" },
    { id: "comparar", label: "Comparar" },
  ];

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className={cn(
        "overflow-hidden rounded-3xl border border-[#ebe7e0] bg-white shadow-[0_1px_0_rgba(20,20,20,0.04)]",
        className,
      )}
      data-money-card
    >
      <div className="relative overflow-hidden border-b border-[#efeae2] px-5 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 80% at 0% 0%, rgba(244,201,40,0.1), transparent 55%), radial-gradient(ellipse 40% 60% at 100% 0%, rgba(31,122,77,0.06), transparent 50%)",
          }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-[#6b6560] uppercase">
              <ShieldCheck className="size-3.5 text-[#1f7a4d]" />
              Money Engine
            </p>
            <h3 className="mt-1 font-display text-[24px] leading-none tracking-tight text-[#141414]">
              Gana con este producto
            </h3>
            <p className="mt-1.5 max-w-md text-[12px] text-[#8a847c]">
              Elige cómo monetizar: vender, affiliate o comparar precios del
              mismo SKU.
            </p>
          </div>
          <div className="rounded-2xl border border-[#ebe7e0] bg-white/90 px-3.5 py-2.5 text-right shadow-sm">
            <p className="text-[9px] font-bold tracking-[0.14em] text-[#8a847c] uppercase">
              Money score
            </p>
            <p className="font-display text-[28px] leading-none tabular-nums text-[#141414]">
              {scoreLabel}
              {scoreLabel !== "—" ? (
                <span className="text-[12px] text-[#8a847c]">/100</span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="relative mt-4 inline-flex rounded-full border border-[#ebe7e0] bg-[#f4f2ed] p-1">
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative rounded-full px-4 py-1.5 text-[12px] font-semibold transition",
                  on ? "text-[#141414]" : "text-[#6b6560] hover:text-[#141414]",
                )}
              >
                {on ? (
                  <motion.span
                    layoutId="money-tab-pill"
                    className="absolute inset-0 rounded-full bg-white shadow-sm"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-5">
        {error ? (
          <p className="text-sm text-amber-800">{error}</p>
        ) : decision ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="space-y-4"
            >
              {tab === "ganar" ? (
                <>
                  <div className="rounded-2xl border border-[#ebe7e0] bg-[#faf9f6] px-4 py-3.5">
                    <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a847c] uppercase">
                      Recomendación
                    </p>
                    <p className="mt-1 text-[16px] font-semibold text-[#141414]">
                      {decision.primaryAction}
                    </p>
                    {decision.secondaryAction ? (
                      <p className="mt-1 text-[13px] text-[#6b6560]">
                        También: {decision.secondaryAction}
                      </p>
                    ) : null}
                    <ul className="mt-3 space-y-1.5">
                      {decision.reasons.slice(0, 3).map((reason) => (
                        <li
                          key={reason.text}
                          className="flex gap-2 text-[12.5px] text-[#6b6560]"
                        >
                          <span
                            className={cn(
                              "mt-1 size-1.5 shrink-0 rounded-full",
                              reason.ok ? "bg-[#1f7a4d]" : "bg-[#c5bfb5]",
                            )}
                          />
                          {reason.text}
                        </li>
                      ))}
                    </ul>
                    {decision.warnings[0] ? (
                      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                        {decision.warnings[0]}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!flags.affiliateEngine || busy === "affiliate"}
                      onClick={() => void createAffiliate()}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#141414] px-4 text-[12.5px] font-semibold text-white disabled:opacity-40"
                    >
                      {busy === "affiliate" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="size-3.5" />
                      )}
                      Crear affiliate
                    </button>
                    <button
                      type="button"
                      disabled={!flags.smartLinks || busy === "affiliate"}
                      onClick={() => void createAffiliate()}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#ddd7cd] bg-white px-4 text-[12.5px] font-semibold text-[#141414] disabled:opacity-40"
                    >
                      <Link2 className="size-3.5" />
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
                      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#ddd7cd] bg-white px-4 text-[12.5px] font-semibold text-[#141414] disabled:opacity-40"
                    >
                      <QrCode className="size-3.5" />
                      QR
                    </button>
                    <button
                      type="button"
                      disabled={busy === "watch"}
                      onClick={() => void watchProduct()}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#ddd7cd] bg-white px-4 text-[12.5px] font-semibold text-[#141414] disabled:opacity-40"
                    >
                      <Eye className="size-3.5" />
                      Watch
                    </button>
                  </div>
                  {smartPath ? (
                    <p className="text-[12px] text-[#6b6560]">
                      Smart link:{" "}
                      <span className="font-medium text-[#141414]">
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
                  <div className="grid gap-2 sm:grid-cols-2">
                    <LaneChip
                      label="Amazon seller"
                      tone={amzTone}
                      detail={amz?.message || "Sin datos"}
                    />
                    <LaneChip
                      label="eBay seller"
                      tone={ebay?.available ? "ok" : "muted"}
                      detail={ebay?.message || "Sin datos"}
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
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={productId ? `/listings/${productId}` : "/listings/new"}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#f4c928] px-4 text-[12.5px] font-semibold text-[#141414]"
                    >
                      <Store className="size-3.5" />
                      Publicar listing
                    </Link>
                    <Link
                      href="/winners"
                      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#ddd7cd] bg-white px-4 text-[12.5px] font-semibold text-[#141414]"
                    >
                      Buscar winners
                    </Link>
                  </div>
                </>
              ) : null}

              {tab === "comparar" ? (
                <>
                  <p className="text-[12px] text-[#6b6560]">
                    Solo enlaces al mismo producto (ASIN / item id / UPC). Si no
                    hay match exacto, no inventamos un similar.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
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
                    ).map((row) => {
                      const inner = (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold tracking-wide text-[#8a847c] uppercase">
                              {row.label}
                            </p>
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
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
                          <p className="mt-2 font-display text-[22px] leading-none tabular-nums">
                            {formatMoney(row.price)}
                          </p>
                          {row.href ? (
                            <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#2162a1]">
                              Abrir
                              <ExternalLink className="size-3 opacity-70" />
                            </p>
                          ) : (
                            <p className="mt-2 text-[11px] text-[#8a847c]">
                              Sin enlace confirmado
                            </p>
                          )}
                        </>
                      );
                      return row.href ? (
                        <a
                          key={row.key}
                          href={row.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-2xl border border-[#ebe7e0] bg-[#faf9f6] p-3 transition hover:border-[#141414]"
                        >
                          {inner}
                        </a>
                      ) : (
                        <div
                          key={row.key}
                          className="rounded-2xl border border-dashed border-[#ebe7e0] bg-white p-3 opacity-70"
                        >
                          {inner}
                        </div>
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
