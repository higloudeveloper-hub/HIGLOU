"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  Download,
  Loader2,
  Pencil,
  Save,
  ShoppingBag,
  Store,
  X,
} from "lucide-react";
import { StickyActionBar } from "@/components/listing/wizard/sticky-action-bar";
import { PublishCelebrate } from "@/components/listing/wizard/publish-celebrate";
import { StoreTemplatePicker } from "@/components/listing/store-template-picker";
import { LiveDot } from "@/components/ui/studio";
import { resolveListingPackage } from "@/lib/ebay/package-shipping";
import { humanizeEbayPublishError } from "@/lib/ebay/infer-voltage";
import { displayNameFromEbayUsername } from "@/lib/ebay/store-display-name";
import type { ProductListing } from "@/types/product";
import type { StoreBranding } from "@/config/store-branding";
import { AmazonMark } from "@/components/brand/store-marks";
import { AmazonSourceLink } from "@/components/listing/amazon-source-link";
import { cn } from "@/lib/utils";

const LIVE_STAGES = [
  "Saving your listing",
  "Hosting photos on eBay",
  "Building the offer",
  "Publishing live",
  "Filing in your store",
] as const;

const DRAFT_STAGES = [
  "Saving your listing",
  "Hosting photos on eBay",
  "Creating unpublished draft",
] as const;

type EbayPublishResult = {
  mode: "draft" | "live";
  offerId?: string;
  listingId?: string | null;
  sellerHubHint?: string;
  imageCount?: number;
  storePath?: string;
};

function PublishProgressOverlay({
  mode,
  running,
  error,
  result,
  storeLabel,
  title,
  photoSrc,
  onRetry,
  onDismiss,
  onListAnother,
}: {
  mode: "draft" | "live";
  running: boolean;
  error: string | null;
  result: EbayPublishResult | null;
  storeLabel: string;
  title: string;
  photoSrc: string;
  onRetry: () => void;
  onDismiss: () => void;
  onListAnother?: () => void;
}) {
  const stages = mode === "live" ? LIVE_STAGES : DRAFT_STAGES;
  const done = Boolean(result) && !running && !error;
  const failed = Boolean(error) && !running;
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(8);
  const failAt =
    failed && /item specific|25002/i.test(error || "") ? 0 : stage;
  const friendly = error ? humanizeEbayPublishError(error) : null;

  useEffect(() => {
    if (done) {
      setStage(stages.length);
      setProgress(100);
      return;
    }
    if (failed) {
      setProgress(100);
      return;
    }
    if (!running) return;
    setStage(0);
    setProgress(8);
    const stageTick = window.setInterval(() => {
      setStage((s) => Math.min(s + 1, stages.length - 1));
    }, 1400);
    const barTick = window.setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + 3));
    }, 180);
    return () => {
      window.clearInterval(stageTick);
      window.clearInterval(barTick);
    };
  }, [running, done, failed, stages.length]);

  const listingUrl = result?.listingId
    ? `https://www.ebay.com/itm/${result.listingId}`
    : null;

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-md"
      >
        <PublishCelebrate
          mode={mode}
          storeLabel={storeLabel}
          title={title}
          photoSrc={photoSrc}
          listingUrl={listingUrl}
          listingId={result?.listingId}
          storePath={result?.storePath}
          onListAnother={onListAnother}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-md"
    >
      <motion.section
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[440px] overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_30px_80px_-40px_rgba(20,16,8,0.55)]"
      >
        <div className="relative bg-muted/40">
          {photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoSrc}
              alt=""
              className="h-[160px] w-full object-contain"
            />
          ) : (
            <div className="grid h-[160px] place-items-center text-sm text-muted-foreground">
              eBay
            </div>
          )}
          {running ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-brand/30 to-transparent [animation:higlou-scan_2.2s_ease-in-out_infinite]"
            />
          ) : null}
          <div className="absolute right-3 bottom-3 left-3 flex items-center justify-between rounded-xl bg-background/92 px-3 py-2 text-[12px] font-medium backdrop-blur-md">
            <span className="inline-flex items-center gap-2">
              {running ? <LiveDot /> : null}
              {failed
                ? "Paused"
                : done
                  ? mode === "live"
                    ? "Live on eBay"
                    : "Draft on eBay"
                  : mode === "live"
                    ? "Going live…"
                    : "Sending draft…"}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {progress}%
            </span>
          </div>
        </div>

        <div className="p-5">
          <h2 className="text-[17px] font-semibold tracking-tight">
            {failed
              ? friendly?.headline || "Couldn’t finish publish"
              : done
                ? mode === "live"
                  ? `Live in ${storeLabel}`
                  : `Draft in ${storeLabel}`
                : mode === "live"
                  ? `Publishing live to ${storeLabel}`
                  : `Creating a draft in ${storeLabel}`}
          </h2>
          <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
            {title || "Your listing"}
          </p>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className={cn(
                "h-full",
                failed ? "bg-destructive/70" : "bg-brand-gradient",
              )}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: "easeOut" }}
            />
          </div>

          <ol className="mt-4 space-y-1.5">
            {stages.map((label, i) => {
              const state = failed
                ? i < failAt
                  ? "done"
                  : i === failAt
                    ? "failed"
                    : "todo"
                : done || i < stage
                  ? "done"
                  : i === stage
                    ? "active"
                    : "todo";
              return (
                <li
                  key={label}
                  className="flex items-center gap-2.5 text-[13px]"
                >
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full",
                      state === "done" && "bg-success-soft text-success",
                      state === "active" && "bg-brand-soft text-foreground",
                      state === "failed" && "bg-destructive/10 text-destructive",
                      state === "todo" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {state === "active" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : state === "done" ? (
                      <Check className="size-3.5" strokeWidth={3} />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <span
                    className={cn(
                      state === "todo" && "text-muted-foreground",
                      state === "failed" && "text-destructive",
                      state === "active" && "font-medium",
                    )}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>

          {failed ? (
            <div className="mt-4 space-y-3">
              <p className="text-[13px] leading-relaxed text-destructive">
                {friendly?.detail || error}
              </p>
              {error && friendly?.detail !== error ? (
                <p className="text-[11px] leading-relaxed text-[#9b9b9b]">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-[13px] font-semibold text-background"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-xl border border-border px-4 py-2.5 text-[13px] font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </motion.section>
    </motion.div>
  );
}

function PublishEbayButton({
  connected,
  configured,
  publishing,
  disabled,
  storeLabel,
  onPublishDraft,
  size = "hero",
}: {
  connected: boolean;
  configured: boolean;
  publishing: boolean;
  disabled: boolean;
  storeLabel: string;
  onPublishDraft?: () => void;
  size?: "hero" | "bar";
}) {
  const hero = size === "hero";
  if (!connected) {
    return (
      <a
        href={configured ? "/api/ebay/oauth/start" : "/settings#ebay-store"}
        className={cn(
          "higlou-cta-pulse inline-flex items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-brand-foreground transition hover:-translate-y-px",
          hero ? "h-14 w-full px-6 text-[16px]" : "h-11 px-5 text-[14px]",
        )}
      >
        <Store className={hero ? "h-5 w-5" : "h-4 w-4"} />
        {configured ? "Connect eBay to publish" : "Open Settings → Connect eBay"}
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled || publishing || !onPublishDraft}
      onClick={onPublishDraft}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-brand-foreground transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0",
        !publishing && "higlou-cta-pulse",
        hero ? "h-14 w-full px-6 text-[16px]" : "h-11 px-5 text-[14px]",
      )}
    >
      {publishing ? (
        <Loader2 className={cn("animate-spin", hero ? "h-5 w-5" : "h-4 w-4")} />
      ) : (
        <Store className={hero ? "h-5 w-5" : "h-4 w-4"} />
      )}
      {publishing
        ? "Publishing…"
        : hero
          ? `Publish to eBay · ${storeLabel}`
          : `Publish live · ${storeLabel}`}
    </button>
  );
}

export function ExportScreen({
  listing,
  productName,
  photoCount,
  exported,
  exportDisabled,
  exportDisabledReason,
  onExport,
  onPublishToDonBaraton,
  publishingDonBaraton = false,
  donBaratonPublished = false,
  onBack,
  onOpenMore,
  onStartNew,
  onSaveDraft,
  storeBranding,
  onStoreBrandingChange,
  ebayConnected = false,
  ebayUsername = null,
  ebayStoreName = null,
  ebayConfigured = false,
  onPublishToEbay,
  publishingEbay = false,
  ebayPublishMode = null,
  ebayPublishResult = null,
  ebayPublishError = null,
  onRetryEbayPublish,
  onDismissEbayPublish,
  amazonConnected = false,
  amazonConfigured = false,
  onPublishToAmazon,
  publishingAmazon = false,
  amazonPublishError = null,
  amazonPublishResult = null,
}: {
  listing: ProductListing;
  productName?: string;
  photoCount: number;
  exported: boolean;
  exportDisabled: boolean;
  exportDisabledReason?: string;
  onExport: () => void | boolean | Promise<void | boolean>;
  onPublishToDonBaraton?: () => void;
  publishingDonBaraton?: boolean;
  donBaratonPublished?: boolean;
  onBack?: () => void;
  onOpenMore: () => void;
  onStartNew: () => void;
  onSaveDraft?: () => void;
  storeBranding?: StoreBranding;
  onStoreBrandingChange?: (next: StoreBranding) => void;
  ebayConnected?: boolean;
  ebayUsername?: string | null;
  ebayStoreName?: string | null;
  ebayConfigured?: boolean;
  onPublishToEbay?: (mode: "draft" | "live") => void;
  publishingEbay?: boolean;
  ebayPublishMode?: "draft" | "live" | null;
  ebayPublishResult?: EbayPublishResult | null;
  ebayPublishError?: string | null;
  onRetryEbayPublish?: () => void;
  onDismissEbayPublish?: () => void;
  amazonConnected?: boolean;
  amazonConfigured?: boolean;
  onPublishToAmazon?: () => void;
  publishingAmazon?: boolean;
  amazonPublishError?: string | null;
  amazonPublishResult?: {
    asin?: string;
    sku?: string;
    sellerCentralUrl?: string;
  } | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSucceeded, setExportSucceeded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const galleryUrls = listing.images.map((i) => i.url).filter(Boolean);
  const galleryCount = galleryUrls.length;

  const packageInfo = resolveListingPackage({
    title: listing.title,
    productType: listing.productType || listing.type,
    size: listing.size,
    categoryName: listing.categoryName,
    brand: listing.brand,
    quantity: listing.quantity,
    packageWeightLbs: listing.packageWeightLbs,
    packageWeightOz: listing.packageWeightOz,
    packageLengthIn: listing.packageLengthIn,
    packageWidthIn: listing.packageWidthIn,
    packageDepthIn: listing.packageDepthIn,
    packageSource: listing.packageSource,
  });

  const connectedStoreName =
    ebayStoreName?.trim() ||
    (ebayUsername ? displayNameFromEbayUsername(ebayUsername) : "") ||
    storeBranding?.storeName?.trim() ||
    "your store";

  const heroSrc =
    galleryUrls[0] ||
    listing.images[0]?.previewUrl ||
    listing.images[0]?.url ||
    "";

  const handleExport = async () => {
    if (exportDisabled || exporting) return;
    setExporting(true);
    try {
      const result = await Promise.resolve(onExport());
      if (result === false) return;
      setExportSucceeded(true);
      setDialogOpen(true);
    } catch {
      // onExport should toast; keep dialog closed on failure
    } finally {
      setExporting(false);
    }
  };

  const facts = [
    listing.price != null ? `$${listing.price.toFixed(2)}` : null,
    listing.condition,
    listing.categoryName,
    listing.brand,
  ].filter(Boolean);

  return (
    <div className="pb-28">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-[920px] px-4 pt-4 sm:px-6"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Ready to sell
            </p>
            <h2 className="text-[20px] font-semibold tracking-tight">
              Publish to {connectedStoreName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onOpenMore}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>

        {storeBranding && onStoreBrandingChange ? (
          <div className="mb-3">
            <StoreTemplatePicker
              branding={storeBranding}
              onChange={onStoreBrandingChange}
              compact
              nameSource={ebayConnected ? "eBay" : null}
            />
          </div>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-[0_24px_60px_-48px_rgba(20,16,8,0.45)]">
          <div className="grid md:grid-cols-[240px_1fr]">
            <div className="bg-muted/30 p-4 md:border-r md:border-border/60">
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-background">
                {heroSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={heroSrc}
                    alt={listing.title || "Product"}
                    className="h-[200px] w-full object-contain md:h-[240px]"
                  />
                ) : (
                  <div className="grid h-[200px] place-items-center text-sm text-muted-foreground">
                    No image
                  </div>
                )}
              </div>
              {galleryCount > 1 ? (
                <div className="mt-2 flex gap-1.5 overflow-x-auto">
                  {(galleryUrls.length
                    ? galleryUrls
                    : listing.images.map((i) => i.previewUrl || i.url)
                  )
                    .slice(0, 6)
                    .map((src, index) => (
                      <div
                        key={`${src}-${index}`}
                        className="size-10 shrink-0 overflow-hidden rounded-lg border border-border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="size-full object-cover" />
                      </div>
                    ))}
                </div>
              ) : null}
              <p className="mt-2 text-[12px] text-muted-foreground">
                {photoCount} photo{photoCount === 1 ? "" : "s"}
                {productName ? ` · ${productName}` : ""}
                <span className="block">
                  <AmazonSourceLink listing={listing} />
                </span>
              </p>
            </div>

            <div className="flex flex-col p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                  <Check className="size-3" strokeWidth={3} /> Ready
                </span>
                {ebayConnected ? (
                  <span className="text-[12px] text-muted-foreground">
                    Connected as {ebayUsername || connectedStoreName}
                  </span>
                ) : (
                  <span className="text-[12px] text-amber-800">
                    eBay not connected
                  </span>
                )}
              </div>
              <h3 className="mt-2 text-[18px] leading-snug font-semibold tracking-tight">
                {listing.title || "Untitled listing"}
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {facts.join(" · ") || "Confirm details, then publish"}
              </p>

              <div className="mt-5 space-y-2">
                {ebayConnected ? (
                  <button
                    type="button"
                    disabled={exportDisabled || publishingEbay || !onPublishToEbay}
                    onClick={() => onPublishToEbay?.("live")}
                    className="higlou-cta-pulse inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[16px] font-semibold text-brand-foreground transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {publishingEbay && ebayPublishMode === "live" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Store className="h-5 w-5" />
                    )}
                    Publish live · {connectedStoreName}
                  </button>
                ) : (
                  <PublishEbayButton
                    connected={ebayConnected}
                    configured={ebayConfigured}
                    publishing={publishingEbay}
                    disabled={exportDisabled}
                    storeLabel={connectedStoreName}
                    onPublishDraft={() => onPublishToEbay?.("draft")}
                  />
                )}
                {ebayConnected ? (
                  <button
                    type="button"
                    disabled={exportDisabled || publishingEbay || !onPublishToEbay}
                    onClick={() => onPublishToEbay?.("draft")}
                    className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border text-[13px] font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Create unpublished draft instead
                  </button>
                ) : null}
                {exportDisabledReason ? (
                  <p className="mt-2 text-[12px] text-amber-800">
                    {exportDisabledReason}
                  </p>
                ) : (
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    Live sends the listing to {connectedStoreName} now. Draft
                    stays unpublished in Seller Hub until you go live.
                  </p>
                )}

                {onPublishToDonBaraton ? (
                  <div className="mt-4 rounded-2xl border border-border/80 bg-muted/30 p-3">
                    <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Also publish
                    </p>
                    <button
                      type="button"
                      disabled={
                        exportDisabled ||
                        publishingDonBaraton ||
                        !onPublishToDonBaraton
                      }
                      onClick={onPublishToDonBaraton}
                      className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[15px] font-semibold text-background transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      {publishingDonBaraton ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShoppingBag className="h-4 w-4" />
                      )}
                      {publishingDonBaraton
                        ? "Publishing to Don Baratón…"
                        : donBaratonPublished
                          ? "Update on Don Baratón"
                          : "Publish to Don Baratón"}
                    </button>
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                      Sends this listing to donbaraton.shop. Separate from eBay.
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 rounded-2xl border border-border/80 bg-muted/30 p-3">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Amazon
                  </p>
                  {amazonConnected ? (
                    <button
                      type="button"
                      disabled={exportDisabled || publishingAmazon || !onPublishToAmazon}
                      onClick={() => onPublishToAmazon?.()}
                      className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#141414] text-[15px] font-semibold text-white transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      {publishingAmazon ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <AmazonMark invert className="h-4" />
                      )}
                      {publishingAmazon ? "Publishing to Amazon…" : "Publish to Amazon"}
                    </button>
                  ) : (
                    <a
                      href="/settings#amazon-store"
                      className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-[15px] font-semibold hover:bg-muted"
                    >
                      <AmazonMark className="h-4" />
                      {amazonConfigured
                        ? "Connect Amazon seller"
                        : "Set up Amazon in Settings"}
                    </a>
                  )}
                  {amazonPublishResult?.asin ? (
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                      Live on ASIN {amazonPublishResult.asin}
                      {amazonPublishResult.sellerCentralUrl ? (
                        <>
                          {" · "}
                          <a
                            href={amazonPublishResult.sellerCentralUrl}
                            className="underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Seller Central
                          </a>
                        </>
                      ) : null}
                    </p>
                  ) : amazonPublishError ? (
                    <p className="mt-1.5 text-[12px] text-amber-800">
                      {amazonPublishError}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                      Finds the exact Amazon catalog product, fills every required field, then goes live only if Amazon says it is valid.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="mt-4 text-[13px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {moreOpen ? "Hide CSV & shipping" : "CSV & shipping notes"}
        </button>

        <AnimatePresence>
          {moreOpen ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 grid gap-3">
                <div className="rounded-2xl border border-border bg-surface p-4">
                  <p className="text-[12px] font-semibold">CSV for Seller Hub</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Package {packageInfo.weightLbs} lb {packageInfo.weightOz} oz ·{" "}
                    {packageInfo.lengthIn}×{packageInfo.widthIn}×
                    {packageInfo.depthIn} in
                  </p>
                  <button
                    type="button"
                    disabled={exportDisabled || exporting}
                    onClick={() => void handleExport()}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-[13px] font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    {exporting ? "Generating…" : "Export CSV"}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <StickyActionBar
        left={
          onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[14px] font-medium hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : undefined
        }
        center={
          <span className="text-[12.5px] text-muted-foreground">
            {ebayConnected
              ? `eBay · ${connectedStoreName}`
              : "Connect eBay to publish"}
          </span>
        }
        right={
          <>
            {onSaveDraft ? (
              <button
                type="button"
                onClick={onSaveDraft}
                className="hidden items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[14px] font-medium hover:bg-muted sm:inline-flex"
              >
                <Save className="h-4 w-4" /> Save
              </button>
            ) : null}
            {exported ? (
              <button
                type="button"
                onClick={onStartNew}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[14px] font-medium hover:bg-muted"
              >
                List another
              </button>
            ) : null}
            <PublishEbayButton
              connected={ebayConnected}
              configured={ebayConfigured}
              publishing={publishingEbay}
              disabled={exportDisabled}
              storeLabel={connectedStoreName}
              onPublishDraft={() =>
                onPublishToEbay?.(ebayConnected ? "live" : "draft")
              }
              size="bar"
            />
          </>
        }
      />

      <AnimatePresence>
        {dialogOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
            onClick={() => setDialogOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="relative w-full max-w-md rounded-3xl bg-surface p-7 text-center shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
                <Check className="h-7 w-7" strokeWidth={3} />
              </div>
              <h3 className="mt-4 text-[20px] font-semibold tracking-tight">
                {exported || exportSucceeded
                  ? "Your CSV is ready"
                  : "Almost there"}
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {exported || exportSucceeded
                  ? "We've packaged your listing into an eBay-compatible CSV file."
                  : exportDisabledReason ||
                    "Fix any remaining issues, then export again."}
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-[14px] font-semibold text-brand-foreground shadow-sm"
                >
                  <Download className="h-4 w-4" /> Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {ebayPublishMode &&
        (publishingEbay || ebayPublishResult || ebayPublishError) ? (
          <PublishProgressOverlay
            key="ebay-publish-progress"
            mode={ebayPublishMode}
            running={publishingEbay}
            error={ebayPublishError}
            result={ebayPublishResult}
            storeLabel={connectedStoreName}
            title={listing.title}
            photoSrc={heroSrc}
            onRetry={() => onRetryEbayPublish?.()}
            onDismiss={() => onDismissEbayPublish?.()}
            onListAnother={
              onStartNew
                ? () => {
                    onDismissEbayPublish?.();
                    onStartNew();
                  }
                : undefined
            }
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
