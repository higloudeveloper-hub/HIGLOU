"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, Eye, Link2, QrCode, Store } from "lucide-react";
import type { MonetizationDecision } from "@/lib/monetization/types";
import { cn } from "@/lib/utils";

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
  const mark = ok === true ? "✓" : ok === "warn" ? "⚠" : "·";
  const color =
    ok === true
      ? "text-emerald-700"
      : ok === "warn"
        ? "text-amber-800"
        : "text-muted-foreground";
  return (
    <div className="flex items-start justify-between gap-3 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-medium", color)}>
        {mark} {detail}
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
  const [decision, setDecision] = useState<MonetizationDecision | null>(null);
  const [flags, setFlags] = useState<MoneyFlags | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [smartPath, setSmartPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/money/recommendation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: productId || undefined,
            asin: asin || undefined,
            ebayPrice: ebayPrice ?? undefined,
          }),
        });
        if (res.status === 404) {
          if (!cancelled) setFlags({
            moneyEngine: false,
            affiliateEngine: false,
            smartLinks: false,
            moneyScore: false,
          });
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError("Money recommendation unavailable");
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
      } catch {
        if (!cancelled) setError("Money recommendation failed");
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
  if (!decision && !error) return null;

  const amz = decision?.channels.amazonSeller;
  const ebay = decision?.channels.ebaySeller;
  const aff = decision?.channels.amazonAffiliate;

  return (
    <section
      className={cn(
        "rounded-2xl border border-border/80 bg-surface p-5 shadow-xs",
        className,
      )}
      data-money-card
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Money Engine
          </p>
          <h3 className="font-display text-xl tracking-tight text-foreground">
            Make Money With This Product
          </h3>
        </div>
        <div className="rounded-lg bg-brand-soft px-3 py-2 text-right">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Money Score
          </p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {!flags.moneyScore ||
            decision?.moneyScoreAvailability === "insufficient" ||
            decision?.moneyScore == null
              ? "Insufficient Data"
              : `${decision.moneyScore}/100`}
          </p>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-amber-800">{error}</p>
      ) : decision ? (
        <>
          <div className="space-y-2 border-b border-border/60 pb-4">
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

          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Recommendation
            </p>
            <p className="text-base font-semibold text-foreground">
              {decision.primaryAction}
            </p>
            {decision.secondaryAction ? (
              <p className="text-sm text-muted-foreground">
                Secondary: {decision.secondaryAction}
              </p>
            ) : null}
            <ul className="mt-2 space-y-1">
              {decision.reasons.slice(0, 4).map((reason) => (
                <li
                  key={reason.text}
                  className="text-[12.5px] text-muted-foreground"
                >
                  • {reason.text}
                </li>
              ))}
            </ul>
            {decision.warnings.length ? (
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                {decision.warnings[0]}
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={productId ? `/listings/${productId}` : "/listings/new"}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[12.5px] font-medium text-foreground"
            >
              <Store className="size-3.5" />
              Publish
            </Link>
            <button
              type="button"
              disabled={!flags.affiliateEngine || busy === "affiliate"}
              onClick={() => void createAffiliate()}
              title={
                flags.affiliateEngine
                  ? "Create Amazon Associates link"
                  : "Enable AFFILIATE_ENGINE_ENABLED"
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[12.5px] font-medium text-foreground disabled:opacity-40"
            >
              <ExternalLink className="size-3.5" />
              Create Affiliate Link
            </button>
            <button
              type="button"
              disabled={!flags.smartLinks || busy === "affiliate"}
              onClick={() => void createSmartOnly()}
              title={
                flags.smartLinks
                  ? "Create tracked /go link"
                  : "Enable SMART_LINKS_ENABLED"
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[12.5px] font-medium text-foreground disabled:opacity-40"
            >
              <Link2 className="size-3.5" />
              Create Smart Link
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
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[12.5px] font-medium text-foreground disabled:opacity-40"
            >
              <QrCode className="size-3.5" />
              Generate QR
            </button>
            <button
              type="button"
              disabled={busy === "watch"}
              onClick={() => void watchProduct()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[12.5px] font-medium text-foreground disabled:opacity-40"
            >
              <Eye className="size-3.5" />
              Watch Product
            </button>
          </div>
          {smartPath ? (
            <p className="mt-3 text-[12px] text-muted-foreground">
              Smart link: <span className="font-medium text-foreground">{smartPath}</span>
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
