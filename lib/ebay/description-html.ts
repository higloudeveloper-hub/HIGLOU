import {
  STORE_BRANDING_DEFAULTS,
  type StoreBranding,
} from "@/config/store-branding";
import { renderDescriptionTemplate } from "@/lib/ebay/description-templates";
import type {
  DescriptionContent,
  DescriptionSpec,
} from "@/lib/ebay/description-content";

export type { DescriptionContent, DescriptionSpec };

/** Minimal listing shape needed to rebuild eBay description HTML. */
export interface ListingDescriptionSource {
  title?: string;
  brand?: string;
  model?: string;
  collection?: string;
  productType?: string;
  type?: string;
  size?: string;
  colors?: string[];
  materials?: string[];
  style?: string;
  department?: string;
  features?: string[];
  setIncludes?: string[];
  missingItems?: string[];
  condition?: string;
  conditionDescription?: string;
  descriptionSummary?: string;
  descriptionHtml?: string;
}

/**
 * Build a usable intro when OpenAI left descriptionSummary empty/thin.
 * Prevents eBay drafts from shipping with a blank product paragraph.
 */
export function synthesizeDescriptionSummary(
  listing: ListingDescriptionSource,
): string {
  const existing = String(listing.descriptionSummary || "").trim();
  if (existing.length >= 40) return existing;

  const bits: string[] = [];
  const title = String(listing.title || "").trim();
  if (title) bits.push(`This listing is for: ${title}.`);

  const identity = [
    listing.brand,
    listing.model || listing.collection,
    listing.productType || listing.type,
    listing.size,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (identity.length) bits.push(`Details: ${identity.join(" · ")}.`);

  const colors = (listing.colors || []).map(String).filter((c) => c.trim());
  if (colors.length) bits.push(`Color: ${colors.join(", ")}.`);

  const materials = (listing.materials || [])
    .map(String)
    .filter((m) => m.trim());
  if (materials.length) bits.push(`Material: ${materials.join(", ")}.`);

  const feats = (listing.features || [])
    .map(String)
    .filter((f) => f.trim())
    .slice(0, 4);
  if (feats.length) bits.push(`Highlights: ${feats.join("; ")}.`);

  const built = bits.join(" ").trim();
  if (built.length >= 40) return built;
  if (existing) return existing;
  return built || "See photos and item specifics for full product details.";
}

export function listingToDescriptionContent(
  listing: ListingDescriptionSource,
  branding: StoreBranding = STORE_BRANDING_DEFAULTS,
): DescriptionContent {
  const introduction = synthesizeDescriptionSummary(listing);
  const includes = [
    ...(listing.setIncludes || []).map(String).filter((v) => v.trim()),
    ...(listing.missingItems || [])
      .map(String)
      .filter((v) => v.trim())
      .map((m) => `Missing: ${m}`),
  ];
  const condition = `${listing.condition || "See listing"}${
    listing.conditionDescription
      ? ` — ${listing.conditionDescription}`
      : ""
  }`;

  return {
    productTitle: String(listing.title || "").trim() || "Product",
    productIntroduction: introduction,
    features: (listing.features || []).map(String).filter((f) => f.trim()),
    itemCondition: condition,
    packageContents: includes,
    shippingInformation: branding.shippingInformation,
    specs: [
      { label: "Brand", value: String(listing.brand || "") },
      {
        label: "Model",
        value: String(listing.model || listing.collection || ""),
      },
      { label: "Size", value: String(listing.size || "") },
      {
        label: "Color",
        value: (listing.colors || []).filter(Boolean).join(" / "),
      },
      {
        label: "Type",
        value: String(listing.productType || listing.type || ""),
      },
      {
        label: "Material",
        value: (listing.materials || []).filter(Boolean).join(" / "),
      },
      { label: "Style", value: String(listing.style || "") },
      { label: "Department", value: String(listing.department || "") },
    ].filter((row) => row.value.trim()),
  };
}

/** True when HTML is empty, placeholder-only, or missing real product copy. */
export function isWeakDescriptionHtml(html: string): boolean {
  const raw = String(html || "").trim();
  if (!raw || raw === "<p></p>") return true;
  const text = raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 120) return true;
  const hasBothPlaceholders =
    /see photos and details for key features/i.test(text) &&
    /see listing photos for package contents/i.test(text);
  const withoutBrand = text
    .replace(/higlou store/gi, "")
    .replace(/boutique premium/gi, "")
    .replace(/home hub/gi, "")
    .replace(/tech clear/gi, "")
    .replace(/atelier market/gi, "")
    .trim();
  if (hasBothPlaceholders && withoutBrand.length < 220) return true;
  return false;
}

/**
 * Build store description HTML using the selected template + branding.
 * Kept name for backward compatibility with existing imports/tests.
 */
export function buildHiglouDescriptionHtml(
  content: DescriptionContent,
  branding: StoreBranding = STORE_BRANDING_DEFAULTS,
): string {
  const merged: StoreBranding = {
    ...STORE_BRANDING_DEFAULTS,
    ...branding,
    colors: {
      ...STORE_BRANDING_DEFAULTS.colors,
      ...(branding.colors || {}),
    },
    templateId: branding.templateId || STORE_BRANDING_DEFAULTS.templateId,
  };
  // Prefer content shipping override when provided.
  if (content.shippingInformation?.trim()) {
    merged.shippingInformation = content.shippingInformation;
  }
  return renderDescriptionTemplate(content, merged);
}

/**
 * Always-fresh HTML from current listing fields + active store branding/template.
 */
export function buildListingDescriptionHtml(
  listing: ListingDescriptionSource,
  branding: StoreBranding = STORE_BRANDING_DEFAULTS,
): string {
  return buildHiglouDescriptionHtml(
    listingToDescriptionContent(listing, branding),
    branding,
  );
}
