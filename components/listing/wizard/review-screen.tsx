"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  MapPin,
  Package,
  PencilLine,
  Sparkles,
  Truck,
} from "lucide-react";
import { DescriptionEditor } from "@/components/description/description-editor";
import { StoreTemplatePicker } from "@/components/listing/store-template-picker";
import { EditPromoStrip } from "@/components/listing/wizard/edit-promo-strip";
import { StickyActionBar } from "@/components/listing/wizard/sticky-action-bar";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CONDITION_OPTIONS } from "@/config/condition-map";
import { EBAY_CATEGORY_OPTIONS } from "@/config/ebay-categories";
import {
  SHIPPING_SERVICE_OPTIONS,
  findShippingServiceOption,
} from "@/config/shipping-services";
import {
  resolveListingPackage,
  seedPackageOnListing,
} from "@/lib/ebay/package-shipping";
import {
  TITLE_HELPER_ACTIONS,
  isCategoryPerfectMatch,
  type AttentionField,
  type ReviewFieldId,
} from "@/components/listing/review-helpers";
import type { ProductImage, ProductListing } from "@/types/product";
import type { StoreBranding } from "@/config/store-branding";
import { cn } from "@/lib/utils";
import { ImageUploader } from "@/components/uploader/image-uploader";
import { AmazonSourceLink } from "@/components/listing/amazon-source-link";
import { VariationPicker } from "@/components/listing/variation-picker";
import {
  isVariationsSpecific,
  listingWithVariationSet,
  variationsFromListing,
} from "@/lib/listing/variations";

function FieldNote({
  attentionFields,
  id,
}: {
  attentionFields: AttentionField[];
  id: ReviewFieldId;
}) {
  const note = attentionFields.find((f) => f.id === id)?.reason;
  if (!note) return null;
  return <p className="mt-1 text-[12px] text-amber-800">{note}</p>;
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function ReviewScreen({
  listing,
  attentionFields,
  analyzing,
  firstAttentionRef,
  onUpdate,
  onCategoryChange,
  onConditionChange,
  onImproveTitle,
  onRegenerateDescription,
  onContinue,
  onBack,
  onOpenMore,
  storeBranding,
  onStoreBrandingChange,
  onImagesChange,
  productId,
}: {
  listing: ProductListing;
  attentionFields: AttentionField[];
  analyzing?: boolean;
  firstAttentionRef?: React.RefObject<HTMLDivElement | null>;
  onUpdate: <K extends keyof ProductListing>(
    key: K,
    value: ProductListing[K],
  ) => void;
  onCategoryChange: (categoryId: string) => void;
  onConditionChange: (condition: string) => void;
  onImproveTitle: (instruction: string) => void;
  onRegenerateDescription: () => void;
  onContinue: () => void;
  onBack?: () => void;
  onOpenMore: () => void;
  storeBranding?: StoreBranding;
  onStoreBrandingChange?: (next: StoreBranding) => void;
  onImagesChange?: (images: ProductImage[]) => void;
  productId?: string;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const [activePhoto, setActivePhoto] = useState(0);
  const [panel, setPanel] = useState("listing");

  const photos = useMemo(
    () =>
      [...listing.images].sort((a, b) => {
        if (a.isPrimary === b.isPrimary) return a.sortOrder - b.sortOrder;
        return a.isPrimary ? -1 : 1;
      }),
    [listing.images],
  );
  const hero = photos[Math.min(activePhoto, Math.max(0, photos.length - 1))];
  const attentionCount = attentionFields.length;
  const perfectCategory = isCategoryPerfectMatch(listing);
  const filledSpecs = listing.itemSpecifics.filter(
    (f) => f.value?.trim() && !isVariationsSpecific(f),
  );
  const variationSet = variationsFromListing(listing);
  const titleLen = listing.title.length;

  const packageInfo = useMemo(
    () =>
      resolveListingPackage({
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
      }),
    [
      listing.title,
      listing.productType,
      listing.type,
      listing.size,
      listing.categoryName,
      listing.brand,
      listing.quantity,
      listing.packageWeightLbs,
      listing.packageWeightOz,
      listing.packageLengthIn,
      listing.packageWidthIn,
      listing.packageDepthIn,
      listing.packageSource,
    ],
  );
  const packageMeasured = listing.packageSource === "manual";
  const recommendedService = packageInfo.shippingService;
  const selectedService =
    listing.shippingService || recommendedService || "USPSGroundAdvantage";
  const recommendedMeta = findShippingServiceOption(recommendedService);
  const isUsingRecommendation = selectedService === recommendedService;
  const serviceOptions = useMemo(() => {
    if (SHIPPING_SERVICE_OPTIONS.some((o) => o.code === selectedService)) {
      return SHIPPING_SERVICE_OPTIONS;
    }
    return [
      {
        code: selectedService,
        label: selectedService,
        hint: "Current selection",
      },
      ...SHIPPING_SERVICE_OPTIONS,
    ];
  }, [selectedService]);

  const fade = reduceMotion
    ? { duration: 0 }
    : { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const };

  const categoryLabel =
    EBAY_CATEGORY_OPTIONS.find((o) => o.id === listing.categoryId)?.name ||
    listing.categoryName ||
    "Choose category";

  return (
    <div className="relative min-h-[70vh] pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,oklch(0.985_0.02_90)_0%,var(--background)_40%)]"
      />

      <motion.div
        ref={firstAttentionRef}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={fade}
        className="mx-auto max-w-[1120px] px-4 pt-3 sm:px-6"
      >
        {/* One workspace: listing first, store look as a slim bar */}
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-[0_20px_50px_-40px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  attentionCount > 0
                    ? "border-amber-300/70 bg-amber-50 text-amber-900"
                    : "border-success/30 bg-success-soft text-success",
                )}
              >
                {attentionCount > 0 ? (
                  <>
                    <Sparkles className="size-3" />
                    {attentionCount} to check
                  </>
                ) : (
                  <>
                    <Check className="size-3" strokeWidth={3} />
                    Ready
                  </>
                )}
              </span>
              <p className="truncate text-[13px] text-muted-foreground">
                {[listing.brand, listing.productType || listing.type, listing.sku]
                  .filter(Boolean)
                  .join(" · ") || "Confirm fields, then export"}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenMore}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-[12px] font-medium hover:bg-muted"
            >
              <PencilLine className="size-3.5" />
              More
            </button>
          </div>

          <div className="border-b border-border/60 px-4 py-2.5 sm:px-5">
            {storeBranding && onStoreBrandingChange ? (
              <StoreTemplatePicker
                branding={storeBranding}
                onChange={onStoreBrandingChange}
                compact
              />
            ) : (
              <p className="text-[12.5px] text-muted-foreground">
                Store look lives in{" "}
                <a
                  className="font-semibold text-foreground underline"
                  href="/settings#branding"
                >
                  Settings
                </a>
                .
              </p>
            )}
          </div>

          <div className="border-b border-border/60 bg-[linear-gradient(180deg,oklch(0.99_0.01_90),transparent)] px-4 py-4 sm:px-5">
            <div className="flex gap-4">
              <div className="w-[112px] shrink-0 sm:w-[132px]">
                <div className="relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted/40">
                  {hero ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={hero.url}
                      alt=""
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-[11px] text-muted-foreground">
                      No photo
                    </div>
                  )}
                </div>
                {photos.length > 1 ? (
                  <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                    {photos.map((photo, index) => (
                      <button
                        key={photo.id || photo.url}
                        type="button"
                        onClick={() => setActivePhoto(index)}
                        className={cn(
                          "size-9 shrink-0 overflow-hidden rounded-md border",
                          index === activePhoto
                            ? "border-brand ring-1 ring-brand/40"
                            : "border-border/50 opacity-75 hover:opacity-100",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <Field
                  label={`Title · ${titleLen}/80`}
                  className="space-y-1.5"
                >
                  <Input
                    value={listing.title}
                    maxLength={80}
                    onChange={(e) => onUpdate("title", e.target.value)}
                    className="h-11 rounded-xl border-border/70 text-[15px] font-medium tracking-tight"
                    placeholder="Clear, searchable product title"
                  />
                  <FieldNote attentionFields={attentionFields} id="title" />
                  <div className="flex flex-wrap items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={analyzing}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-[12px] font-medium outline-none hover:bg-muted disabled:opacity-50"
                      >
                        Improve
                        <ChevronDown className="size-3 opacity-60" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-44">
                        {TITLE_HELPER_ACTIONS.map((action) => (
                          <DropdownMenuItem
                            key={action.label}
                            onClick={() => onImproveTitle(action.instruction)}
                          >
                            {action.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {listing.brand ? (
                      <span className="text-[12px] text-muted-foreground">
                        Brand:{" "}
                        <span className="text-foreground">{listing.brand}</span>
                      </span>
                    ) : null}
                    <AmazonSourceLink listing={listing} />
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Price">
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={listing.price ?? ""}
                        onChange={(e) =>
                          onUpdate(
                            "price",
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                        className="h-10 rounded-lg pl-6 text-[14px] font-medium"
                        placeholder="0.00"
                      />
                    </div>
                    <FieldNote attentionFields={attentionFields} id="price" />
                  </Field>
                  <Field label="Qty">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={listing.quantity}
                      onChange={(e) =>
                        onUpdate("quantity", Number(e.target.value))
                      }
                      className="h-10 rounded-lg"
                    />
                    <FieldNote
                      attentionFields={attentionFields}
                      id="quantity"
                    />
                  </Field>
                  <Field label="Format">
                    <Select
                      value={listing.listingFormat}
                      onValueChange={(value) => {
                        if (!value) return;
                        onUpdate(
                          "listingFormat",
                          value as ProductListing["listingFormat"],
                        );
                      }}
                    >
                      <SelectTrigger className="h-10 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FixedPrice">Fixed price</SelectItem>
                        <SelectItem value="Auction">Auction</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Condition">
                    <Select
                      value={listing.condition}
                      onValueChange={(value) => {
                        if (!value) return;
                        onConditionChange(value);
                      }}
                    >
                      <SelectTrigger className="h-10 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITION_OPTIONS.map((option) => (
                          <SelectItem key={option.label} value={option.label}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldNote
                      attentionFields={attentionFields}
                      id="condition"
                    />
                  </Field>
                </div>

                <Field label="eBay category">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={listing.categoryId || undefined}
                      onValueChange={(value) => {
                        if (!value) return;
                        onCategoryChange(value);
                      }}
                    >
                      <SelectTrigger className="h-10 min-w-[220px] flex-1 rounded-lg">
                        <SelectValue placeholder="Choose category">
                          {categoryLabel}
                          {listing.categoryId
                            ? ` · ${listing.categoryId}`
                            : ""}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {EBAY_CATEGORY_OPTIONS.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name} ({option.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        perfectCategory
                          ? "bg-success-soft text-success"
                          : "bg-amber-50 text-amber-800",
                      )}
                    >
                      {perfectCategory ? "Match" : "Review"}
                    </span>
                  </div>
                  <FieldNote attentionFields={attentionFields} id="category" />
                </Field>
              </div>
            </div>
          </div>

          {onImagesChange ? (
            <div className="border-b border-border/60 px-4 py-3 sm:px-5">
              <Label className="mb-2 block text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Photos
              </Label>
              <ImageUploader
                images={listing.images}
                onChange={(next) => {
                  onImagesChange(next);
                  setActivePhoto(0);
                }}
                productId={productId}
                variant="tray"
              />
            </div>
          ) : null}

          {variationSet ? (
            <div className="border-b border-border/60 px-4 py-4 sm:px-5">
              <VariationPicker
                set={variationSet}
                onChange={(next) => {
                  const updated = listingWithVariationSet(listing, next);
                  onUpdate("itemSpecifics", updated.itemSpecifics);
                  onUpdate("variations", updated.variations);
                  onUpdate("variationAxes", updated.variationAxes);
                }}
              />
            </div>
          ) : null}

          {/* Tabbed details — switch panels instead of endless scroll */}
          <Tabs
            value={panel}
            onValueChange={(value) => {
              if (value) setPanel(value);
            }}
            className="gap-0"
          >
            <div className="border-b border-border/60 px-4 sm:px-5">
              <TabsList
                variant="line"
                className="h-11 w-full justify-start gap-0 rounded-none bg-transparent p-0"
              >
                <TabsTrigger
                  value="listing"
                  className="h-11 flex-none rounded-none px-3 text-[13px] data-active:bg-transparent"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="specifics"
                  className="h-11 flex-none rounded-none px-3 text-[13px] data-active:bg-transparent"
                >
                  Specifics
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    {filledSpecs.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="description"
                  className="h-11 flex-none rounded-none px-3 text-[13px] data-active:bg-transparent"
                >
                  Description
                </TabsTrigger>
                <TabsTrigger
                  value="shipping"
                  className="h-11 flex-none rounded-none px-3 text-[13px] data-active:bg-transparent"
                >
                  Shipping
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="listing" className="p-4 sm:p-5">
              <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Package className="size-3.5" /> Product
                  </dt>
                  <dd className="truncate font-medium">
                    {[listing.brand, listing.productType || listing.type]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="size-3.5" /> Ships from
                  </dt>
                  <dd className="truncate font-medium">
                    {listing.itemLocation || "Logansport, IN"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Truck className="size-3.5" /> Service
                  </dt>
                  <dd className="truncate font-medium">
                    {findShippingServiceOption(selectedService)?.label ||
                      selectedService}
                  </dd>
                </div>
              </dl>
            </TabsContent>

            <TabsContent value="specifics" className="p-4 sm:p-5">
              {listing.itemSpecifics.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  No specifics yet. Open More details to add them.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/60">
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-muted/40 text-[11px] tracking-wide text-muted-foreground uppercase">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Field</th>
                        <th className="px-3 py-2 font-semibold">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listing.itemSpecifics.map((field, index) =>
                        isVariationsSpecific(field) ? null : (
                        <tr
                          key={field.key}
                          className="border-t border-border/50"
                        >
                          <td className="w-[34%] px-3 py-1.5 align-middle font-medium text-muted-foreground">
                            {field.label || "Custom"}
                          </td>
                          <td className="px-2 py-1 align-middle">
                            <Input
                              value={field.value}
                              onChange={(e) => {
                                const next = [...listing.itemSpecifics];
                                next[index] = {
                                  ...field,
                                  value: e.target.value,
                                };
                                onUpdate("itemSpecifics", next);
                              }}
                              className="h-9 rounded-lg border-transparent bg-transparent px-1 shadow-none focus-visible:border-border focus-visible:bg-background focus-visible:px-2"
                              placeholder="—"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                type="button"
                onClick={onOpenMore}
                className="mt-3 text-[13px] font-medium underline-offset-2 hover:underline"
              >
                Edit includes, missing items & policies
              </button>
            </TabsContent>

            <TabsContent value="description" className="p-4 sm:p-5">
              <DescriptionEditor
                html={listing.descriptionHtml}
                onChange={(html) => onUpdate("descriptionHtml", html)}
                onRegenerate={onRegenerateDescription}
                title={listing.title}
                storeName={storeBranding?.storeName}
                compact
              />
            </TabsContent>

            <TabsContent value="shipping" className="p-4 sm:p-5">
              <div className="mb-4 rounded-xl border border-brand/35 bg-brand-soft/40 px-3.5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      AI recommendation
                    </p>
                    <p className="mt-1 text-[14px] font-semibold">
                      {recommendedMeta?.label || recommendedService}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                      {packageInfo.reason}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdate("shippingService", recommendedService);
                      onUpdate("shippingCost", packageInfo.shippingCost);
                      onUpdate("freeShipping", false);
                    }}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-[12px] font-semibold",
                      isUsingRecommendation
                        ? "bg-success-soft text-success"
                        : "bg-brand text-brand-foreground",
                    )}
                  >
                    {isUsingRecommendation ? "Using recommendation" : "Use recommendation"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Item location">
                  <Input
                    value={listing.itemLocation}
                    onChange={(e) => onUpdate("itemLocation", e.target.value)}
                    className="h-10 rounded-lg"
                  />
                </Field>
                <Field label="Postal code">
                  <Input
                    value={listing.postalCode}
                    onChange={(e) => onUpdate("postalCode", e.target.value)}
                    className="h-10 rounded-lg"
                  />
                </Field>
                <Field label="Shipping service" className="sm:col-span-2">
                  <Select
                    value={selectedService}
                    onValueChange={(value) => {
                      if (!value) return;
                      onUpdate("shippingService", value);
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-lg">
                      <SelectValue placeholder="Choose shipping service" />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceOptions.map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          <span className="flex flex-col gap-0.5 py-0.5 text-left">
                            <span className="font-medium">
                              {option.label}
                              {option.code === recommendedService
                                ? " · Recommended"
                                : ""}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {option.hint}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Package weight">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      className="h-10 tabular-nums"
                      value={
                        listing.packageWeightLbs ?? packageInfo.weightLbs
                      }
                      onChange={(e) => {
                        const lbs = Math.max(
                          0,
                          Math.floor(Number(e.target.value) || 0),
                        );
                        onUpdate("packageWeightLbs", lbs);
                        onUpdate("packageSource", "manual");
                      }}
                      aria-label="Package weight pounds"
                    />
                    <span className="text-[12px] text-muted-foreground">lb</span>
                    <Input
                      type="number"
                      min={0}
                      max={15}
                      step={1}
                      className="h-10 tabular-nums"
                      value={
                        listing.packageWeightOz ?? packageInfo.weightOz
                      }
                      onChange={(e) => {
                        const oz = Math.min(
                          15,
                          Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        );
                        onUpdate("packageWeightOz", oz);
                        onUpdate("packageSource", "manual");
                      }}
                      aria-label="Package weight ounces"
                    />
                    <span className="text-[12px] text-muted-foreground">oz</span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold",
                        packageMeasured
                          ? "bg-amber-100 text-amber-950"
                          : "bg-emerald-100 text-emerald-900",
                      )}
                    >
                      {packageMeasured ? "Edited" : "Auto"}
                    </span>
                  </div>
                </Field>
                <Field label="Package dimensions (inches)">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      min={0.5}
                      step={0.5}
                      className="h-10 w-20 tabular-nums"
                      value={
                        listing.packageLengthIn ?? packageInfo.lengthIn
                      }
                      onChange={(e) => {
                        onUpdate(
                          "packageLengthIn",
                          Math.max(0.5, Number(e.target.value) || 0.5),
                        );
                        onUpdate("packageSource", "manual");
                      }}
                      aria-label="Package length inches"
                    />
                    <span className="text-muted-foreground">×</span>
                    <Input
                      type="number"
                      min={0.5}
                      step={0.5}
                      className="h-10 w-20 tabular-nums"
                      value={
                        listing.packageWidthIn ?? packageInfo.widthIn
                      }
                      onChange={(e) => {
                        onUpdate(
                          "packageWidthIn",
                          Math.max(0.5, Number(e.target.value) || 0.5),
                        );
                        onUpdate("packageSource", "manual");
                      }}
                      aria-label="Package width inches"
                    />
                    <span className="text-muted-foreground">×</span>
                    <Input
                      type="number"
                      min={0.5}
                      step={0.5}
                      className="h-10 w-20 tabular-nums"
                      value={
                        listing.packageDepthIn ?? packageInfo.depthIn
                      }
                      onChange={(e) => {
                        onUpdate(
                          "packageDepthIn",
                          Math.max(0.5, Number(e.target.value) || 0.5),
                        );
                        onUpdate("packageSource", "manual");
                      }}
                      aria-label="Package depth inches"
                    />
                    <span className="text-[12px] text-muted-foreground">in</span>
                  </div>
                </Field>
                <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12.5px] text-muted-foreground">
                    Filled automatically from packaging photos, OCR, and product
                    type. Edit only if you want to override.
                  </p>
                  <button
                    type="button"
                    className="text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline"
                    onClick={() => {
                      const seeded = seedPackageOnListing(listing, true);
                      onUpdate(
                        "packageWeightLbs",
                        seeded.packageWeightLbs ?? null,
                      );
                      onUpdate(
                        "packageWeightOz",
                        seeded.packageWeightOz ?? null,
                      );
                      onUpdate(
                        "packageLengthIn",
                        seeded.packageLengthIn ?? null,
                      );
                      onUpdate(
                        "packageWidthIn",
                        seeded.packageWidthIn ?? null,
                      );
                      onUpdate(
                        "packageDepthIn",
                        seeded.packageDepthIn ?? null,
                      );
                      onUpdate("packageSource", "auto");
                      onUpdate(
                        "shippingService",
                        seeded.shippingService || recommendedService,
                      );
                      onUpdate(
                        "shippingCost",
                        seeded.shippingCost ?? packageInfo.shippingCost,
                      );
                    }}
                  >
                    Re-run auto estimate
                  </button>
                </div>
              </div>
              <p className="mt-3 text-[12.5px] text-muted-foreground">
                Pick a service for reference when you finish the draft on eBay.
                Create Drafts CSV cannot pre-fill shipping or location — eBay
                requires those in Seller Hub.
              </p>
            </TabsContent>
          </Tabs>
        </div>

        <EditPromoStrip
          photoSrc={hero?.previewUrl || hero?.url}
          title={listing.title}
          priceLabel={
            listing.price != null ? `$${listing.price.toFixed(2)}` : "Set price"
          }
          storeName={storeBranding?.storeName || ""}
          categoryLabel={categoryLabel}
          categoryMatch={perfectCategory}
          photoCount={photos.length}
          shipsFrom={listing.itemLocation || "Logansport, IN"}
          shippingLabel={
            findShippingServiceOption(selectedService)?.label || selectedService
          }
          onGoLive={onContinue}
        />
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
            {listing.brand ? `${listing.brand} · ` : ""}
            {photos.length} photo{photos.length === 1 ? "" : "s"} · CSV ready
          </span>
        }
        right={
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-brand-foreground shadow-sm transition-transform hover:-translate-y-px"
          >
            Review &amp; Export <ArrowRight className="h-4 w-4" />
          </button>
        }
      />
    </div>
  );
}
