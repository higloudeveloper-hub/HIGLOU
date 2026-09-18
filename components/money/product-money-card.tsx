"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ExternalLink, Eye, Link2, Loader2, QrCode, Store } from "lucide-react";
import type { MonetizationDecision, MonetizationInput } from "@/lib/monetization/types";
import { takeOpportunityMoneySeed } from "@/lib/monetization/from-opportunity";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Insufficient Data";
  return `$${value.toFixed(2)}`;
}

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean | "warn";
  detail: string;
}) {
  const mark = ok === true ? "OK" : ok === "warn" ? "WARN" : "—";
  const color =
    ok === true
      ? "text-emerald-700"
      : ok === "warn"
        ? "text-amber-800"
        : "text-[#9b9b9b]";
  return (
    <div className="flex items-start justify-between gap-3 text-[13px]">
      <span className="text-[#707070]">{label}</span>
      <span className={cn("text-right font-medium", color)}>
        {mark} · {detail}
      </span>
    </div>
  );
}

type MoneyFlags = {
  moneyEngine: boolean;
  affiliateEngine: boolean;
  smartLinks: boolean;
  moneyScore: boolean;
};

export function ProductMoneyCard({
  productId,
  asin,
  ebayPrice,
  className,
}: {
  productId?: string | null;
  asin?: string | null;
  ebayPrice?: number | null;
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const seed: MonetizationInput | null = takeOpportunityMoneySeed(asin);
        const res = await fetch("/api/money/recommendation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: productId || undefined,
            asin: asin || seed?.asin || undefined,
            ebayPrice: ebayPrice ?? seed?.ebayPrice ?? undefined,
            amazonPrice: seed?.amazonPrice ?? undefined,
            cost: seed?.cost ?? undefined,
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
            title: seed?.title ?? undefined,
            brand: seed?.brand ?? undefined,
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
  }, [productId, asin, ebayPrice]);

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

  const createSmartOnly = useCallback(async () => {
    if (!asin) {
      toast.message("Create an affiliate link first (ASIN required)");
      return;
    }
    await createAffiliate();
  }, [asin, createAffiliate]);

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

  if (!flags?.moneyEngine) return null;
  if (loading) {
    return (
      <div
        className={cn(
          "flex min-h-[120px] items-center justify-center rounded-2xl border border-[#e5e5e5] bg-white",
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

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className={cn(
        "overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white",
        className,
      )}
      data-money-card
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#e5e5e5] px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9b9b9b] uppercase">
            Money Engine
          </p>
          <h3 className="mt-0.5 text-[16px] font-semibold tracking-tight text-[#191919]">
            Make Money With This Product
          </h3>
        </div>
        <div className="rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] px-3 py-2 text-right">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-[#9b9b9b] uppercase">
            Money Score
          </p>
          <p className="text-lg font-semibold tabular-nums text-[#191919]">
            {!flags.moneyScore ||
            decision?.moneyScoreAvailability === "insufficient" ||
            decision?.moneyScore == null
              ? "—"
              : `${decision.moneyScore}/100`}
          </p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {error ? (
          <p className="text-sm text-amber-800">{error}</p>
        ) : decision ? (
          <AnimatePresence>
            <motion.div
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="space-y-2.5 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-3.5">
                <StatusRow
                  label="Amazon Seller"
                  ok={
                    amz?.status === "SELLABLE"
                      ? true
                      : amz?.status === "APPROVAL_REQUIRED"
                        ? "warn"
                        : false
                  }
                  detail={amz?.message || "Unknown"}
                />
                <StatusRow
                  label="eBay Seller"
                  ok={Boolean(ebay?.available)}
                  detail={ebay?.message || "Unknown"}
                />
                <StatusRow
                  label="Amazon Affiliate"
                  ok={aff?.configured ? (aff.available ? true : "warn") : false}
                  detail={aff?.message || "Not configured"}
                />
                <StatusRow
                  label="Estimated Profit"
                  ok={ebay?.netProfit.value != null && ebay.netProfit.value > 0}
                  detail={formatMoney(ebay?.netProfit.value ?? null)}
                />
              </div>

              <div>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-[#9b9b9b] uppercase">
                  Recommendation
                </p>
                <p className="mt-1 text-[15px] font-semibold text-[#191919]">
                  {decision.primaryAction}
                </p>
                {decision.secondaryAction ? (
                  <p className="mt-1 text-[13px] text-[#707070]">
                    Secondary: {decision.secondaryAction}
                  </p>
                ) : null}
                <ul className="mt-2 space-y-1">
                  {decision.reasons.slice(0, 4).map((reason) => (
                    <li key={reason.text} className="text-[12.5px] text-[#707070]">
                      · {reason.text}
                    </li>
                  ))}
                </ul>
                {decision.warnings.length ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                    {decision.warnings[0]}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={productId ? `/listings/${productId}` : "/listings/new"}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#191919] px-3.5 text-[12.5px] font-semibold text-white"
                >
                  <Store className="size-3.5" />
                  Publish
                </Link>
                <button
                  type="button"
                  disabled={!flags.affiliateEngine || busy === "affiliate"}
                  onClick={() => void createAffiliate()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-3.5 text-[12.5px] font-medium text-[#191919] disabled:opacity-40"
                >
                  <ExternalLink className="size-3.5" />
                  Affiliate Link
                </button>
                <button
                  type="button"
                  disabled={!flags.smartLinks || busy === "affiliate"}
                  onClick={() => void createSmartOnly()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-3.5 text-[12.5px] font-medium text-[#191919] disabled:opacity-40"
                >
                  <Link2 className="size-3.5" />
                  Smart Link
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
                    } else toast.message("Create a Smart Link first");
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-3.5 text-[12.5px] font-medium text-[#191919] disabled:opacity-40"
                >
                  <QrCode className="size-3.5" />
                  QR
                </button>
                <button
                  type="button"
                  disabled={busy === "watch"}
                  onClick={() => void watchProduct()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-3.5 text-[12.5px] font-medium text-[#191919] disabled:opacity-40"
                >
                  <Eye className="size-3.5" />
                  Watch
                </button>
              </div>
              {smartPath ? (
                <p className="text-[12px] text-[#707070]">
                  Smart link:{" "}
                  <span className="font-medium text-[#191919]">{smartPath}</span>
                </p>
              ) : null}
            </motion.div>
          </AnimatePresence>
        ) : null}
      </div>
    </motion.section>
  );
}
