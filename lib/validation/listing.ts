import type { ProductListing } from "@/types/product";
import type { ValidationItem } from "@/components/validation/validation-checklist";
import { DEFAULT_VALUES } from "@/config/default-values";

export function validateListing(
  listing: ProductListing,
  storeName = "Higlou Store",
): ValidationItem[] {
  const hasLocalOnly =
    listing.images.length > 0 &&
    listing.images.every((img) => !/^https:\/\//i.test(img.url));
  const hasBlob = listing.images.some(
    (img) =>
      (img.url || "").startsWith("blob:") ||
      (img.previewUrl || "").startsWith("blob:"),
  );

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
      label: "Image URLs are public HTTPS when provided",
      ok:
        listing.images.length === 0 ||
        listing.images.every(
          (img) => !img.url || /^https:\/\//i.test(img.url),
        ),
      severity: "critical",
      detail: hasLocalOnly
        ? "Local previews cannot be written to CSV until Supabase HTTPS upload (Phase 2)."
        : undefined,
    },
    {
      id: "no-blob",
      label: "No unsupported blob/local image paths for CSV",
      ok: listing.images.every(
        (image) =>
          !image.url.startsWith("blob:") &&
          !image.url.startsWith("file:") &&
          !image.url.startsWith("/"),
      ),
      severity: "critical",
      detail: hasBlob
        ? "Preview blobs are fine locally; CSV requires public HTTPS URLs."
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
      label: `Description includes ${storeName} branding`,
      ok: new RegExp(
        storeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      ).test(listing.descriptionHtml),
      severity: "critical",
    },
  ];
}

export function hasCriticalErrors(items: ValidationItem[]) {
  return items.some((item) => !item.ok && item.severity === "critical");
}
