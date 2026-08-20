import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { variationsFromListing } from "@/lib/listing/variations";

const softString = z.preprocess(
  (value) => (value == null ? "" : String(value)),
  z.string(),
);

const softStringArray = z.preprocess((value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item == null ? "" : String(item).trim()))
    .filter(Boolean);
}, z.array(z.string()));

const softPrice = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}, z.number().nullable().optional());

const softQuantity = z.preprocess((value) => {
  const num = Math.floor(Number(value));
  return Number.isFinite(num) && num > 0 ? num : 1;
}, z.number().int().positive());

const softHandling = z.preprocess((value) => {
  const num = Math.floor(Number(value));
  return Number.isFinite(num) && num >= 0 ? num : 1;
}, z.number().int());

const softConfidence = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}, z.number().nullable().optional());

const PRODUCT_STATUSES = [
  "Uploaded",
  "Analyzing",
  "Needs Review",
  "Ready",
  "CSV Generated",
  "Published",
] as const;

const softStatus = z.preprocess((value) => {
  const raw = String(value ?? "").trim();
  if ((PRODUCT_STATUSES as readonly string[]).includes(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower.includes("csv")) return "CSV Generated";
  if (lower.includes("publish")) return "Published";
  if (lower.includes("ready")) return "Ready";
  if (lower.includes("analy")) return "Analyzing";
  if (lower.includes("review") || lower.includes("draft")) return "Needs Review";
  return "Uploaded";
}, z.enum(PRODUCT_STATUSES));

export const productBodySchema = z.object({
  title: softString.optional().default(""),
  subtitle: softString.optional().default(""),
  brand: softString.optional().default(""),
  collection: softString.optional().default(""),
  model: softString.optional().default(""),
  sku: softString.optional().default(""),
  amazonAsin: softString.optional().default(""),
  upc: softString.optional().default(""),
  mpn: softString.optional().default(""),
  categoryId: softString.optional().default(""),
  categoryName: softString.optional().default(""),
  condition: softString.optional().default(""),
  conditionId: softString.optional().default(""),
  conditionDescription: softString.optional().default(""),
  price: softPrice,
  quantity: softQuantity.optional().default(1),
  listingFormat: softString.optional().default("FixedPrice"),
  descriptionHtml: softString.optional().default(""),
  descriptionSummary: softString.optional().default(""),
  itemSpecifics: z
    .array(
      z.object({
        key: softString,
        label: softString,
        value: softString.optional().default(""),
        required: z.boolean().optional(),
        confidence: softConfidence,
        isCustom: z.boolean().optional(),
      }),
    )
    .optional()
    .default([]),
  features: softStringArray.optional().default([]),
  setIncludes: softStringArray.optional().default([]),
  colors: softStringArray.optional().default([]),
  materials: softStringArray.optional().default([]),
  size: softString.optional().default(""),
  productType: softString.optional().default(""),
  shippingPolicyId: softString.optional().default(""),
  returnPolicyId: softString.optional().default(""),
  paymentPolicyId: softString.optional().default(""),
  handlingTime: softHandling.optional().default(1),
  itemLocation: softString.optional().default(""),
  postalCode: softString.optional().default(""),
  country: softString.optional().default("US"),
  status: softStatus.optional().default("Uploaded"),
  packageWeightLbs: z.preprocess((value) => {
    if (value === null || value === undefined || value === "") return null;
    const num = Math.floor(Number(value));
    return Number.isFinite(num) && num >= 0 ? num : null;
  }, z.number().int().nullable().optional()),
  packageWeightOz: z.preprocess((value) => {
    if (value === null || value === undefined || value === "") return null;
    const num = Math.floor(Number(value));
    return Number.isFinite(num) && num >= 0 && num <= 15 ? num : null;
  }, z.number().int().nullable().optional()),
  packageLengthIn: z.preprocess((value) => {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : null;
  }, z.number().nullable().optional()),
  packageWidthIn: z.preprocess((value) => {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : null;
  }, z.number().nullable().optional()),
  packageDepthIn: z.preprocess((value) => {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : null;
  }, z.number().nullable().optional()),
  packageSource: z
    .enum(["auto", "manual"])
    .optional()
    .default("auto"),
  images: z
    .array(
      z.object({
        publicUrl: z.preprocess(
          (value) => String(value ?? "").trim(),
          z.string().min(8),
        ),
        storagePath: softString,
        fileName: softString,
        sortOrder: z.preprocess((value) => {
          const num = Math.floor(Number(value));
          return Number.isFinite(num) ? num : 0;
        }, z.number().int()),
        isPrimary: z.boolean().optional().default(false),
        mimeType: softString.optional().default("image/jpeg"),
        sizeBytes: z.preprocess((value) => {
          const num = Math.floor(Number(value));
          return Number.isFinite(num) && num >= 0 ? num : 0;
        }, z.number().int()),
      }),
    )
    .optional()
    .default([]),
});

const PRODUCT_JSON_TO_COLUMN: Record<string, string> = {
  title: "title",
  subtitle: "subtitle",
  brand: "brand",
  collection: "collection",
  model: "model",
  sku: "sku",
  amazonAsin: "amazon_asin",
  upc: "upc",
  mpn: "mpn",
  categoryId: "category_id",
  categoryName: "category_name",
  condition: "condition",
  conditionId: "condition_id",
  conditionDescription: "condition_description",
  price: "price",
  quantity: "quantity",
  listingFormat: "listing_format",
  descriptionHtml: "description_html",
  descriptionSummary: "description_summary",
  features: "features",
  setIncludes: "set_includes",
  colors: "colors",
  materials: "materials",
  size: "size",
  productType: "product_type",
  shippingPolicyId: "shipping_policy_id",
  returnPolicyId: "return_policy_id",
  paymentPolicyId: "payment_policy_id",
  handlingTime: "handling_time",
  itemLocation: "item_location",
  postalCode: "postal_code",
  country: "country",
  status: "status",
  packageWeightLbs: "package_weight_lbs",
  packageWeightOz: "package_weight_oz",
  packageLengthIn: "package_length_in",
  packageWidthIn: "package_width_in",
  packageDepthIn: "package_depth_in",
  packageSource: "package_source",
};

/**
 * Partial product PATCH. Zod defaults must not fill omitted keys — a price-only
 * save was wiping category_id/title and eBay publish then failed with "(empty)".
 */
export function parseProductPatch(json: unknown): {
  data: Partial<z.infer<typeof productBodySchema>>;
  columns: Record<string, unknown>;
  requested: Set<string>;
} {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Send a JSON object");
  }
  const requested = new Set(Object.keys(json));
  const data = productBodySchema.partial().parse(json);
  const columns: Record<string, unknown> = {};
  for (const key of requested) {
    if (key === "images" || key === "itemSpecifics") continue;
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    const value = data[key as keyof typeof data];
    if (value === undefined) continue;
    const column = PRODUCT_JSON_TO_COLUMN[key];
    if (column) columns[column] = value;
  }
  return { data, columns, requested };
}

export function mapProductRow(
  row: Record<string, unknown>,
  images: Array<Record<string, unknown>> = [],
  specifics: Array<Record<string, unknown>> = [],
) {
  const itemSpecifics = specifics.length
    ? specifics.map((s) => ({
        key: String(s.csv_column || ""),
        label: String(s.label || ""),
        value: String(s.value || ""),
        required: Boolean(s.required),
        confidence:
          s.confidence === null || s.confidence === undefined
            ? undefined
            : Number(s.confidence),
        isCustom: Boolean(s.is_custom),
      }))
    : Array.isArray(row.item_specifics)
      ? (row.item_specifics as Array<{
          key: string;
          label: string;
          value: string;
          required?: boolean;
          confidence?: number;
          isCustom?: boolean;
        }>)
      : [];
  const variationSet = variationsFromListing({ itemSpecifics });
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    subtitle: row.subtitle,
    brand: row.brand,
    collection: row.collection,
    model: row.model,
    sku: row.sku,
    amazonAsin: String(row.amazon_asin || ""),
    upc: row.upc,
    mpn: row.mpn,
    categoryId: row.category_id,
    categoryName: row.category_name,
    condition: row.condition,
    conditionId: row.condition_id,
    conditionDescription: row.condition_description,
    price:
      row.price === null || row.price === undefined ? null : Number(row.price),
    quantity: row.quantity,
    listingFormat: row.listing_format,
    descriptionHtml: row.description_html,
    descriptionSummary: row.description_summary,
    itemSpecifics,
    features: row.features,
    setIncludes: row.set_includes,
    colors: row.colors,
    materials: row.materials,
    size: row.size,
    productType: row.product_type,
    shippingPolicyId: row.shipping_policy_id,
    returnPolicyId: row.return_policy_id,
    paymentPolicyId: row.payment_policy_id,
    handlingTime: row.handling_time,
    itemLocation: row.item_location,
    postalCode: row.postal_code,
    country: row.country,
    packageWeightLbs:
      row.package_weight_lbs === null || row.package_weight_lbs === undefined
        ? null
        : Number(row.package_weight_lbs),
    packageWeightOz:
      row.package_weight_oz === null || row.package_weight_oz === undefined
        ? null
        : Number(row.package_weight_oz),
    packageLengthIn:
      row.package_length_in === null || row.package_length_in === undefined
        ? null
        : Number(row.package_length_in),
    packageWidthIn:
      row.package_width_in === null || row.package_width_in === undefined
        ? null
        : Number(row.package_width_in),
    packageDepthIn:
      row.package_depth_in === null || row.package_depth_in === undefined
        ? null
        : Number(row.package_depth_in),
    packageSource:
      String(row.package_source || "auto") === "manual" ? "manual" : "auto",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images: images.map((img) => ({
      id: img.id,
      url: String(img.public_url || "").replace(/[\r\n\t]+/g, "").trim(),
      storagePath: img.storage_path,
      fileName: img.file_name,
      sortOrder: img.sort_order,
      isPrimary: img.is_primary,
      mimeType: img.mime_type,
      sizeBytes: img.size_bytes,
    })),
    variations: variationSet?.variants,
    variationAxes: variationSet?.axisNames,
  };
}

export function toDbColumns(data: z.infer<typeof productBodySchema>) {
  return {
    title: data.title,
    subtitle: data.subtitle,
    brand: data.brand,
    collection: data.collection,
    model: data.model,
    sku: data.sku,
    amazon_asin: data.amazonAsin || null,
    upc: data.upc,
    mpn: data.mpn,
    category_id: data.categoryId,
    category_name: data.categoryName,
    condition: data.condition,
    condition_id: data.conditionId,
    condition_description: data.conditionDescription,
    price: data.price,
    quantity: data.quantity,
    listing_format: data.listingFormat,
    description_html: data.descriptionHtml,
    description_summary: data.descriptionSummary,
    item_specifics: data.itemSpecifics,
    features: data.features,
    set_includes: data.setIncludes,
    colors: data.colors,
    materials: data.materials,
    size: data.size,
    product_type: data.productType,
    shipping_policy_id: data.shippingPolicyId,
    return_policy_id: data.returnPolicyId,
    payment_policy_id: data.paymentPolicyId,
    handling_time: data.handlingTime,
    item_location: data.itemLocation,
    postal_code: data.postalCode,
    country: data.country,
    package_weight_lbs: data.packageWeightLbs ?? 0,
    package_weight_oz: data.packageWeightOz ?? 0,
    package_length_in: data.packageLengthIn ?? 0,
    package_width_in: data.packageWidthIn ?? 0,
    package_depth_in: data.packageDepthIn ?? 0,
    package_source: data.packageSource || "auto",
    status: data.status,
    updated_at: new Date().toISOString(),
  };
}

export async function syncRelated(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  productId: string,
  data: z.infer<typeof productBodySchema>,
) {
  if (data.images.length) {
    await supabase.from("product_images").delete().eq("product_id", productId);
    const { error: imageError } = await supabase.from("product_images").insert(
      data.images.map((img, index) => ({
        product_id: productId,
        user_id: userId,
        public_url: img.publicUrl,
        storage_path: img.storagePath || `products/${productId}/${index}`,
        file_name: img.fileName || `image-${index}.jpg`,
        sort_order: img.sortOrder ?? index,
        is_primary: img.isPrimary ?? index === 0,
        mime_type: img.mimeType || "image/jpeg",
        size_bytes: img.sizeBytes ?? 0,
      })),
    );
    if (imageError) throw new Error(imageError.message);
  }

  if (data.itemSpecifics.length) {
    await supabase
      .from("product_item_specifics")
      .delete()
      .eq("product_id", productId);
    const { error: specificError } = await supabase
      .from("product_item_specifics")
      .insert(
        data.itemSpecifics
          .filter((field) => field.key.trim() || field.label.trim())
          .map((field) => ({
            product_id: productId,
            csv_column: field.key || `C:${field.label || "Custom"}`,
            label: field.label || field.key || "Custom",
            value: field.value ?? "",
            required: field.required ?? false,
            confidence: field.confidence ?? null,
            is_custom: field.isCustom ?? false,
          })),
      );
    if (specificError) throw new Error(specificError.message);
  }
}
