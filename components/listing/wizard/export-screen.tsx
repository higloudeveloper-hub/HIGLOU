"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Barcode,
  AlertTriangle,
  Check,
  ChevronDown,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Hash,
  LayoutGrid,
  List,
  Bookmark,
  MessageCircle,
  Pencil,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
  Type,
  X,
} from "lucide-react";
import { StickyActionBar } from "@/components/listing/wizard/sticky-action-bar";
import { StoreTemplatePicker } from "@/components/listing/store-template-picker";
import {
  EBAY_CREATE_DRAFTS_INCLUDES,
  buildEbayDraftManualSteps,
} from "@/lib/ebay/draft-completion-checklist";
import { resolveListingPackage } from "@/lib/ebay/package-shipping";
import type { ProductListing } from "@/types/product";
import type { StoreBranding } from "@/config/store-branding";
import { cn } from "@/lib/utils";

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
  ebayConfigured = false,
  onPublishToEbay,
  publishingEbay = false,
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
  ebayConfigured?: boolean;
  onPublishToEbay?: (mode: "draft" | "live") => void;
  publishingEbay?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSucceeded, setExportSucceeded] = useState(false);
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

  const ebayManualSteps = buildEbayDraftManualSteps({
    itemLocation: listing.itemLocation,
    postalCode: listing.postalCode,
    shippingService: listing.shippingService,
    packageWeightLbs: packageInfo.weightLbs,
    packageWeightOz: packageInfo.weightOz,
    packageDims: `${packageInfo.lengthIn}×${packageInfo.widthIn}×${packageInfo.depthIn} in`,
    categoryId: listing.categoryId,
    itemSpecifics: listing.itemSpecifics,
  });

  const fields: {
    label: string;
    value: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { label: "Title", value: listing.title || "—", icon: Type },
    {
      label: "Category",
      value: listing.categoryName || "—",
      icon: LayoutGrid,
    },
    {
      label: "Condition",
      value: listing.condition || "—",
      icon: ShieldCheck,
    },
    {
      label: "Selling Price",
      value:
        listing.price != null ? `US $${listing.price.toFixed(2)}` : "—",
      icon: DollarSign,
    },
    { label: "Brand", value: listing.brand || "—", icon: Bookmark },
    { label: "MPN", value: listing.mpn || "—", icon: Hash },
    { label: "UPC", value: listing.upc || "—", icon: Barcode },
    {
      label: "Item Specifics",
      value:
        listing.itemSpecifics
          ?.filter((f) => f.value)
          .slice(0, 6)
          .map((f) => `${f.label}: ${f.value}`)
          .join("  |  ") || "—",
      icon: List,
    },
    {
      label: "Description",
      value:
        listing.descriptionSummary ||
        listing.descriptionHtml?.replace(/<[^>]+>/g, " ").slice(0, 220) ||
        "—",
      icon: FileText,
    },
  ];

  const summary = [
    {
      label: "Photos uploaded",
      sub: `${photoCount} photos`,
      active: false,
    },
    {
      label: "Product understood",
      sub: productName || listing.productType || "Ready",
      active: false,
    },
    {
      label: "Listing built",
      sub: "Title, description, specifics ready",
      active: false,
    },
    {
      label: "Photos attached",
      sub:
        galleryCount > 0
          ? `${galleryCount} source photo${galleryCount === 1 ? "" : "s"}`
          : "Add photos before export",
      active: false,
    },
    {
      label: "Publish",
      sub: "Send to eBay or export CSV",
      active: true,
    },
  ];

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

  return (
    <div className="pb-28">
      <div className="mx-auto grid max-w-[1600px] gap-6 px-6 py-8 lg:grid-cols-[300px_1fr_400px]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-success/30 bg-success-soft/70 p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-success text-white">
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
              <div>
                <div className="text-[14px] font-semibold">
                  {exported ? "Exported!" : "All done!"}
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Your listing is ready for eBay CSV and your marketplace.
                  {storeBranding?.storeName
                    ? ` · ${storeBranding.storeName}`
                    : ""}
                </p>
              </div>
            </div>
          </div>

          <ol className="space-y-1">
            {summary.map((s) => (
              <li
                key={s.label}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5",
                  s.active && "border-brand/40 bg-brand-soft/50",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full",
                    s.active
                      ? "bg-brand/25 text-brand-foreground"
                      : "bg-success-soft text-success",
                  )}
                >
                  {s.active ? (
                    <Sparkles className="h-4 w-4" />
                  ) : (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground">{s.sub}</div>
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <ShieldCheck className="h-4 w-4" /> Higlou Guarantee
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              We create high-quality listings designed to sell.
            </p>
            <ul className="mt-3 space-y-1.5 text-[12.5px]">
              {[
                "SEO-optimized content",
                "Accurate item specifics",
                "eBay + marketplace CSV",
                "Saves hours of work",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-success" strokeWidth={3} />{" "}
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-foreground">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[13px] font-semibold">Need any changes?</div>
                <p className="text-[11.5px] text-muted-foreground">
                  Open shipping & policies or edit details anytime.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenMore}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2 text-[13px] font-medium hover:bg-muted"
            >
              <MessageCircle className="h-4 w-4" /> Shipping & more
            </button>
          </div>
        </aside>

        <section className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight">
                <Sparkles className="h-5 w-5 text-brand-foreground" /> Review
                your listing
              </h2>
              <p className="mt-1 text-[13.5px] text-muted-foreground">
                Check everything below. You can edit any part before exporting.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onOpenMore}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-[13px] font-medium hover:bg-muted"
              >
                <Pencil className="h-4 w-4" /> Edit all
              </button>
            </div>
          </div>

          {storeBranding && onStoreBrandingChange ? (
            <div className="mb-6 rounded-2xl border-2 border-amber-400 bg-amber-50 p-1 shadow-sm">
              <StoreTemplatePicker
                branding={storeBranding}
                onChange={onStoreBrandingChange}
              />
            </div>
          ) : (
            <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              No se cargó el selector de tienda. Abre{" "}
              <a className="font-semibold underline" href="/settings#branding">
                Settings → Store branding
              </a>{" "}
              o recarga la página (Ctrl+Shift+R).
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-[1fr_280px]">
            <ul className="divide-y divide-border">
              {fields.map((f) => {
                const Icon = f.icon;
                return (
                  <li key={f.label} className="flex items-start gap-3 py-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] tracking-wider text-muted-foreground uppercase">
                        {f.label}
                      </div>
                      <div className="mt-0.5 line-clamp-3 whitespace-pre-line text-[13.5px] font-medium">
                        {f.value}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenMore}
                      className="text-[13px] font-semibold text-info hover:underline"
                    >
                      Edit
                    </button>
                  </li>
                );
              })}
            </ul>

            <div>
              <div className="overflow-hidden rounded-2xl border border-border bg-muted">
                {heroSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={heroSrc}
                    alt={listing.title || "Product"}
                    className="h-[280px] w-full object-cover lg:h-[380px]"
                  />
                ) : (
                  <div className="grid h-[280px] place-items-center text-sm text-muted-foreground">
                    No image
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onOpenMore}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-[12.5px] text-muted-foreground hover:bg-muted"
              >
                View full description <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <div className="mt-4 rounded-2xl border border-brand/40 bg-brand-soft/60 p-4">
                <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                  <Sparkles className="h-4 w-4 text-brand-foreground" />
                  Great job! Your listing looks powerful and professional.
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  You&apos;re ready to export and start selling.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[16px] font-semibold">
                Your product photos ({galleryCount || photoCount})
              </h3>
              <span className="rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success">
                Ready
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {(galleryUrls.length
                ? galleryUrls
                : listing.images.map((i) => i.previewUrl || i.url)
              )
                .slice(0, 9)
                .map((src, index) => (
                  <div key={`${src}-${index}`} className="relative">
                    <div className="aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <span className="absolute top-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-success text-white">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  </div>
                ))}
            </div>
          </div>

          <div className="rounded-3xl border-2 border-brand/35 bg-gradient-to-br from-brand-soft/50 to-surface p-5 shadow-sm">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Step 1 · Publish to eBay
            </p>
            <h3 className="mt-1 text-[15px] font-semibold text-foreground">
              Send this listing to your eBay store
            </h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {ebayConnected
                ? `Connected as ${ebayUsername || "seller"} — create an unpublished draft, or publish live when ready.`
                : ebayConfigured
                  ? "Connect your eBay seller account once, then publish drafts from Higlou."
                  : "Connect eBay in Settings first, then come back here to publish."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {ebayConnected ? (
                <>
                  <button
                    type="button"
                    disabled={exportDisabled || publishingEbay || !onPublishToEbay}
                    onClick={() => onPublishToEbay?.("draft")}
                    className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-[13px] font-semibold text-background disabled:opacity-50"
                  >
                    <Store className="h-4 w-4" />
                    {publishingEbay ? "Sending to eBay…" : "Create eBay draft"}
                  </button>
                  <button
                    type="button"
                    disabled={exportDisabled || publishingEbay || !onPublishToEbay}
                    onClick={() => onPublishToEbay?.("live")}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-foreground disabled:opacity-50"
                  >
                    Publish live
                  </button>
                </>
              ) : (
                <a
                  href={
                    ebayConfigured
                      ? "/api/ebay/oauth/start"
                      : "/settings#ebay-store"
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-[13px] font-semibold text-background"
                >
                  <Store className="h-4 w-4" />
                  {ebayConfigured
                    ? "Connect eBay account"
                    : "Open Settings → Connect eBay"}
                </a>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Step 2 · Optional exports
            </p>
            <h3 className="mt-1 text-[15px] font-semibold">Export CSV for Seller Hub</h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Official Create Drafts CSV — the <strong>same file</strong> also
              imports into Don Baraton Admin when needed.
            </p>
            {storeBranding && onStoreBrandingChange ? (
              <div className="mt-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-1">
                <StoreTemplatePicker
                  branding={storeBranding}
                  onChange={onStoreBrandingChange}
                  compact
                />
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
                Open{" "}
                <a className="font-semibold underline" href="/settings#branding">
                  Settings → Store branding
                </a>{" "}
                to pick store and HTML template.
              </div>
            )}
            <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50/80 px-3 py-2.5 text-[12px] text-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <strong className="font-semibold">eBay limit:</strong> Create
                  Drafts does not import shipping, item location, or return
                  policy. Complete those on eBay after upload (values below are
                  your cheat sheet).
                </p>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-[12px] text-foreground">
              <strong className="font-semibold">Upload as:</strong> Seller Hub →
              Reports → Upload → <strong>Create drafts</strong>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] items-start gap-3">
              <div className="space-y-3 text-[12.5px]">
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Included in CSV
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {EBAY_CREATE_DRAFTS_INCLUDES.map((t) => (
                      <li key={t} className="flex items-center gap-2">
                        <Check
                          className="h-3.5 w-3.5 text-success"
                          strokeWidth={3}
                        />{" "}
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Complete on eBay
                  </div>
                  <ul className="mt-1.5 space-y-2">
                    {ebayManualSteps.map((step) => (
                      <li key={step.id} className="rounded-lg border border-border/70 bg-background px-2.5 py-2">
                        <div className="font-medium">{step.label}</div>
                        <div className="mt-0.5 text-[12px] text-foreground">
                          {step.value}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="grid h-20 w-20 place-items-center rounded-xl border border-success/40 bg-success-soft/50">
                <FileSpreadsheet className="h-8 w-8 text-success" />
                <span className="mt-0.5 text-[9px] font-bold text-success">
                  CSV
                </span>
              </div>
            </div>
            {exportDisabledReason ? (
              <p className="mt-3 text-[12px] text-amber-800">
                {exportDisabledReason}
              </p>
            ) : null}
          </div>

          <div className="rounded-3xl border border-[#c8102e]/25 bg-gradient-to-br from-[#fff5f6] to-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Also available
            </p>
            <h3 className="mt-1 text-[15px] font-semibold text-[#9b0c24]">
              Don Baraton Marketplace
            </h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Pushes the same listing CSV to{" "}
              <span className="font-medium">www.donbaraton.shop</span> (create/update
              by SKU).
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={exportDisabled || publishingDonBaraton || !onPublishToDonBaraton}
                onClick={onPublishToDonBaraton}
                className="inline-flex items-center gap-2 rounded-xl bg-[#c8102e] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {publishingDonBaraton
                  ? "Publishing…"
                  : donBaratonPublished
                    ? "Update on Don Baraton"
                    : "Publish to Don Baraton"}
              </button>
              {donBaratonPublished ? (
                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-success">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} /> Live on storefront
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Storefront:{" "}
              <span className="font-medium">
                {process.env.NEXT_PUBLIC_DON_BARATON_URL ||
                  "https://www.donbaraton.shop"}
              </span>
            </p>
          </div>
        </section>
      </div>

      <StickyActionBar
        left={
          onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[14px] font-medium hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Back to listing
            </button>
          ) : undefined
        }
        center={
          <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success-soft/60 px-4 py-2 text-[12.5px]">
            <Check className="h-3.5 w-3.5 text-success" strokeWidth={3} />{" "}
            Auto-saved just now
          </div>
        }
        right={
          <>
            {onSaveDraft ? (
              <button
                type="button"
                onClick={onSaveDraft}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[14px] font-medium hover:bg-muted"
              >
                <Save className="h-4 w-4" /> Save as draft
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
            {onPublishToDonBaraton ? (
              <button
                type="button"
                disabled={exportDisabled || publishingDonBaraton}
                onClick={onPublishToDonBaraton}
                className="inline-flex items-center gap-2 rounded-xl bg-[#c8102e] px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-px hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Store className="h-4 w-4" />
                {publishingDonBaraton
                  ? "Publishing…"
                  : donBaratonPublished
                    ? "Update on Don Baratón"
                    : "Publish to Don Baratón"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={exportDisabled || exporting}
              onClick={() => void handleExport()}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-brand-foreground shadow-sm transition-transform hover:-translate-y-px hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? "Generating CSV…" : "Export CSV for eBay"}{" "}
              <Download className="h-4 w-4" />
            </button>
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
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="rounded-xl border border-border py-2.5 text-[13px] font-medium hover:bg-muted"
                >
                  Back to review
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
