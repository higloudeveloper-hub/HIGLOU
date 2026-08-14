"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfidenceBadge } from "@/components/listing/confidence-badge";
import { DescriptionEditor } from "@/components/description/description-editor";
import { StoreTemplatePicker } from "@/components/listing/store-template-picker";
import type { StoreBranding } from "@/config/store-branding";
import type { ConfidenceStatus } from "@/lib/ai/confidence-engine";
import type { ProductListing } from "@/types/product";
import { cn } from "@/lib/utils";

type FieldConfidence = Record<
  string,
  { status: ConfidenceStatus; sources: string[]; confidence: number }
>;

export function AdvancedDrawer({
  listing,
  fieldConfidence,
  analyzing,
  loadingProduct,
  onUpdate,
  onRegenerateDescription,
  setFieldConfidence,
  forceOpen = false,
  storeBranding,
  onStoreBrandingChange,
}: {
  listing: ProductListing;
  fieldConfidence: FieldConfidence;
  analyzing: boolean;
  loadingProduct: boolean;
  /** Kept for call-site compatibility; listing photos are not edited here. */
  httpsImageUrls?: string[];
  onUpdate: <K extends keyof ProductListing>(
    key: K,
    value: ProductListing[K],
  ) => void;
  onRegenerateDescription: () => void;
  setFieldConfidence: React.Dispatch<React.SetStateAction<FieldConfidence>>;
  /** Render body open without accordion chrome (dialog / sheet) */
  forceOpen?: boolean;
  storeBranding?: StoreBranding;
  onStoreBrandingChange?: (next: StoreBranding) => void;
}) {
  const body = (
      <div
        className={cn(
          "space-y-8",
          !forceOpen && "border-t border-zinc-100 px-5 pb-6 pt-5",
          forceOpen && "px-0 pb-2 pt-1",
        )}
      >
        {storeBranding && onStoreBrandingChange ? (
          <StoreTemplatePicker
            branding={storeBranding}
            onChange={onStoreBrandingChange}
            compact
          />
        ) : null}

        <section className="space-y-4">
          <h4 className="text-xs font-semibold tracking-wide text-zinc-500">
            IDENTITY
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Brand</Label>
                {fieldConfidence.brand ? (
                  <ConfidenceBadge
                    status={fieldConfidence.brand.status}
                    sources={fieldConfidence.brand.sources}
                    confidence={fieldConfidence.brand.confidence}
                  />
                ) : null}
              </div>
              <Input
                value={listing.brand}
                onChange={(e) => {
                  onUpdate("brand", e.target.value);
                  setFieldConfidence((prev) => ({
                    ...prev,
                    brand: {
                      status: "confirmed",
                      sources: ["user"],
                      confidence: 1,
                    },
                  }));
                }}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Subtitle</Label>
              <Input
                value={listing.subtitle}
                onChange={(e) => onUpdate("subtitle", e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Collection</Label>
              <Input
                value={listing.collection}
                onChange={(e) => onUpdate("collection", e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Model</Label>
                {fieldConfidence.model ? (
                  <ConfidenceBadge
                    status={fieldConfidence.model.status}
                    sources={fieldConfidence.model.sources}
                    confidence={fieldConfidence.model.confidence}
                  />
                ) : null}
              </div>
              <Input
                value={listing.model}
                onChange={(e) => {
                  onUpdate("model", e.target.value);
                  setFieldConfidence((prev) => ({
                    ...prev,
                    model: {
                      status: "confirmed",
                      sources: ["user"],
                      confidence: 1,
                    },
                  }));
                }}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>MPN</Label>
                {fieldConfidence.mpn ? (
                  <ConfidenceBadge
                    status={fieldConfidence.mpn.status}
                    sources={fieldConfidence.mpn.sources}
                    confidence={fieldConfidence.mpn.confidence}
                  />
                ) : null}
              </div>
              <Input
                value={listing.mpn}
                onChange={(e) => {
                  onUpdate("mpn", e.target.value);
                  setFieldConfidence((prev) => ({
                    ...prev,
                    mpn: {
                      status: "confirmed",
                      sources: ["user"],
                      confidence: 1,
                    },
                  }));
                }}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>UPC</Label>
                {fieldConfidence.upc ? (
                  <ConfidenceBadge
                    status={fieldConfidence.upc.status}
                    sources={fieldConfidence.upc.sources}
                    confidence={fieldConfidence.upc.confidence}
                  />
                ) : null}
              </div>
              <Input
                value={listing.upc}
                onChange={(e) => {
                  onUpdate("upc", e.target.value);
                  setFieldConfidence((prev) => ({
                    ...prev,
                    upc: {
                      status: "confirmed",
                      sources: ["user"],
                      confidence: 1,
                    },
                  }));
                }}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input
                value={listing.sku}
                onChange={(e) => onUpdate("sku", e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Product Type</Label>
              <Input
                value={listing.productType}
                onChange={(e) => onUpdate("productType", e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Size</Label>
              <Input
                value={listing.size}
                onChange={(e) => onUpdate("size", e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                checked={listing.bestOffer}
                onCheckedChange={(checked) =>
                  onUpdate("bestOffer", Boolean(checked))
                }
              />
              <Label>Best Offer</Label>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-zinc-500">
            CONDITION NOTES
          </h4>
          <Textarea
            value={listing.conditionDescription}
            onChange={(e) => onUpdate("conditionDescription", e.target.value)}
            className="rounded-xl"
            placeholder="Defects, wear, packaging notes…"
          />
          <Textarea
            value={listing.setIncludes.join("\n")}
            onChange={(e) =>
              onUpdate(
                "setIncludes",
                e.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean),
              )
            }
            className="rounded-xl"
            placeholder="What’s included — one item per line"
          />
          <Textarea
            value={listing.missingItems.join("\n")}
            onChange={(e) =>
              onUpdate(
                "missingItems",
                e.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean),
              )
            }
            className="rounded-xl"
            placeholder="Possibly missing — one item per line"
          />
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-zinc-500">
            ITEM SPECIFICS
          </h4>
          {listing.itemSpecifics.map((field, index) => (
            <div
              key={field.key}
              className="grid gap-2 sm:grid-cols-[160px_1fr_auto]"
            >
              <Input
                value={field.label}
                onChange={(e) => {
                  const next = [...listing.itemSpecifics];
                  next[index] = { ...field, label: e.target.value };
                  onUpdate("itemSpecifics", next);
                }}
                className="rounded-xl"
              />
              <Input
                value={field.value}
                onChange={(e) => {
                  const next = [...listing.itemSpecifics];
                  next[index] = { ...field, value: e.target.value };
                  onUpdate("itemSpecifics", next);
                }}
                className={cn(
                  "rounded-xl",
                  typeof field.confidence === "number" &&
                    field.confidence < 0.6 &&
                    "border-amber-400",
                )}
              />
              <Button
                type="button"
                variant="outline"
                className="rounded-lg"
                onClick={() =>
                  onUpdate(
                    "itemSpecifics",
                    listing.itemSpecifics.filter((_, i) => i !== index),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="rounded-lg"
            onClick={() =>
              onUpdate("itemSpecifics", [
                ...listing.itemSpecifics,
                {
                  key: `C:Custom${listing.itemSpecifics.length + 1}`,
                  label: "Custom",
                  value: "",
                  isCustom: true,
                },
              ])
            }
          >
            Add Item Specific
          </Button>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-zinc-500">
            DESCRIPTION / HTML
          </h4>
          <DescriptionEditor
            title={listing.title}
            html={listing.descriptionHtml}
            onChange={(html) => onUpdate("descriptionHtml", html)}
            onRegenerate={onRegenerateDescription}
          />
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold tracking-wide text-zinc-500">
            SHIPPING & POLICIES
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Shipping Policy ID</Label>
              <Input
                value={listing.shippingPolicyId}
                onChange={(e) => onUpdate("shippingPolicyId", e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Return Policy ID</Label>
              <Input
                value={listing.returnPolicyId}
                onChange={(e) => onUpdate("returnPolicyId", e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Policy ID</Label>
              <Input
                value={listing.paymentPolicyId}
                onChange={(e) => onUpdate("paymentPolicyId", e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Handling Time</Label>
              <Input
                type="number"
                min={0}
                value={listing.handlingTime}
                onChange={(e) =>
                  onUpdate("handlingTime", Number(e.target.value))
                }
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Item Location</Label>
              <Input
                value={listing.itemLocation}
                onChange={(e) => onUpdate("itemLocation", e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Postal Code</Label>
              <Input
                value={listing.postalCode}
                onChange={(e) => onUpdate("postalCode", e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
        </section>

      </div>
  );

  if (forceOpen) {
    return body;
  }

  return (
    <details className="group rounded-2xl border border-zinc-200/80 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="text-sm font-semibold text-zinc-950">More details</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Brand, UPC, description, shipping
          </p>
        </div>
        <ChevronDown className="size-4 shrink-0 text-zinc-400 transition group-open:rotate-180" />
      </summary>
      {body}
    </details>
  );
}
