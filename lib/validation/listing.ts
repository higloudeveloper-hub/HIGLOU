import type { ProductListing } from "@/types/product";
import type { ValidationItem } from "@/components/validation/validation-checklist";
import { DEFAULT_VALUES } from "@/config/default-values";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Description HTML mentions the active store (name or header display). */
export function descriptionIncludesStoreBranding(
  html: string,
  storeName: string,
  storeNameDisplay?: string,
): boolean {
  const candidates = [storeName, storeNameDisplay]
    .map((v) => String(v || "").trim())
    .filter((v) => v.length >= 2);
  if (!candidates.length) return true;
  return candidates.some((name) =>
    new RegExp(escapeRegExp(name), "i").test(html),
  );
}

export function validateListing(
  listing: ProductListing,
  storeName = "Higlou Store",
  storeNameDisplay?: string,
): ValidationItem[] {
  const httpsCount = listing.images.filter((img) =>
    /^https:\/\//i.test(String(img.url || "").trim()),
  ).length;
  const nonHttpsCount = listing.images.filter((img) => {
    const url = String(img.url || "").trim();
    return url.length > 0 && !/^https:\/\//i.test(url);
  }).length;
  const hasBlob = listing.images.some((img) => {
    const url = String(img.url || img.previewUrl || "");
    return url.startsWith("blob:") || url.startsWith("file:");
  });

  return [
    {
      id: "template",
      label: "Official eBay template loaded",
      ok: true,
      severity: "critical",
      detail: "Seed draft template present in /templates",
    },
    {
      id: "title",
      label: "Title is present",
      ok: listing.title.trim().length > 0,
      severity: "critical",
    },
    {
      id: "title-length",
      label: "Title is 80 characters or fewer",
      ok: listing.title.length <= DEFAULT_VALUES.titleMaxLength,
      severity: "critical",
      detail: `${listing.title.length}/${DEFAULT_VALUES.titleMaxLength}`,
    },
    {
      id: "price",
      label: "Price is valid",
      ok: typeof listing.price === "number" && listing.price > 0,
      severity: "critical",
    },
    {
      id: "quantity",
      label: "Quantity is valid",
      ok: Number.isInteger(listing.quantity) && listing.quantity >= 1,
      severity: "critical",
    },
    {
      id: "condition",
      label: "Condition is selected",
      ok: Boolean(listing.condition && listing.conditionId),
      severity: "critical",
    },
    {
      id: "category",
      label: "Category ID is a numeric eBay leaf ID",
      ok: /^\d{3,8}$/.test(String(listing.categoryId || "").trim()),
      severity: "warning",
      detail: /^\d{3,8}$/.test(String(listing.categoryId || "").trim())
        ? undefined
        : `Got "${listing.categoryId || "(empty)"}" — export will resolve/create a leaf automatically.`,
    },
    {
      id: "description",
      label: "Description is present",
      ok:
        listing.descriptionHtml.trim().length > 0 &&
        !/^<p>\s*<\/p>$/i.test(listing.descriptionHtml.trim()),
      severity: "critical",
    },
    {
      id: "description-body",
      label: "Description has product copy (not just branding shell)",
      ok:
        listing.descriptionSummary.trim().length >= 20 ||
        listing.features.some((f) => f.trim()) ||
        listing.setIncludes.some((f) => f.trim()) ||
        (listing.descriptionHtml.replace(/<[^>]+>/g, " ").trim().length > 180 &&
          !/see photos and details for key features/i.test(
            listing.descriptionHtml,
          )),
      severity: "warning",
      detail:
        "If empty, export will auto-build from title/features before CSV.",
    },
    {
      id: "sku",
      label: "SKU is present",
      ok: listing.sku.trim().length > 0,
      severity: "critical",
    },
    {
      id: "images",
      label: "At least one image is present",
      ok: listing.images.length > 0,
      severity: "warning",
      detail:
        "Draft templates allow empty photo URLs; HTTPS images are recommended.",
    },
    {
      id: "image-public",
      label: "CSV can use public HTTPS photo URLs",
      // Allow export when at least one HTTPS URL exists (or no images).
      // Local/blob previews are skipped at export time — do not block drafts.
      ok: listing.images.length === 0 || httpsCount > 0 || nonHttpsCount === 0,
      severity: httpsCount > 0 ? "warning" : "critical",
      detail:
        httpsCount > 0 && nonHttpsCount > 0
          ? `${nonHttpsCount} local preview(s) will be skipped; ${httpsCount} HTTPS photo(s) will export.`
          : httpsCount === 0 && nonHttpsCount > 0
            ? "Upload photos to HTTPS (Supabase) before CSV — local previews cannot go to eBay."
            : undefined,
    },
    {
      id: "no-blob",
      label: "Blob previews will not be written to CSV",
      ok: !hasBlob || httpsCount > 0,
      severity: httpsCount > 0 ? "warning" : hasBlob ? "critical" : "warning",
      detail: hasBlob
        ? httpsCount > 0
          ? "Preview blobs stay local; only HTTPS URLs are written to the CSV."
          : "Preview blobs are fine locally; CSV requires public HTTPS URLs."
        : undefined,
    },
    {
      id: "upc",
      label: "UPC has a valid format when provided",
      ok: !listing.upc || /^\d{12,14}$/.test(listing.upc),
      severity: "warning",
    },
    {
      id: "branding",
      label: `Description includes ${storeName.trim() || "store"} branding`,
      ok: descriptionIncludesStoreBranding(
        listing.descriptionHtml,
        storeName,
        storeNameDisplay,
      ),
      // Soft for drafts: export rebuilds HTML from the active store before CSV.
      severity: "warning",
      detail:
        "Export rebuilds the description with your active store name automatically.",
    },
  ];
}

export function hasCriticalErrors(items: ValidationItem[]) {
  return items.some((item) => !item.ok && item.severity === "critical");
}

export function criticalErrorLabels(items: ValidationItem[]) {
  return items
    .filter((item) => !item.ok && item.severity === "critical")
    .map((item) => item.label);
}
