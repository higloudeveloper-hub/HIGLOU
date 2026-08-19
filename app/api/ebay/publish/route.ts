import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import {
  ebayOAuthMissingReason,
  isEbayOAuthConfigured,
} from "@/lib/ebay/config";
import {
  getEbayConnectionPublic,
  getValidAccessToken,
} from "@/lib/ebay/oauth";
import {
  createOrReplaceInventoryItem,
  publishOffer,
  sanitizeEbayUpc,
  upsertOfferForSku,
} from "@/lib/ebay/inventory-api";
import { organizeListingOnPublish, prepareStoreCategoriesForPublish } from "@/lib/ebay/store-organize";
import {
  listingToInventoryItem,
  listingToOfferInput,
} from "@/lib/ebay/listing-to-inventory";
import { toEbayListingTitle } from "@/lib/ebay/listing-helpers";
import { ensureEbayCompatibleImageUrls } from "@/lib/ebay/ensure-ebay-images";
import {
  ensureHiglouBusinessPolicies,
  resolveSellerBusinessPolicyIds,
} from "@/lib/ebay/account-policies";
import { loadSellerDraftDefaults } from "@/lib/ebay/draft-defaults";
import { ensureListableEbayCategory } from "@/lib/ebay/taxonomy-categories";
import { fetchCategoryAspectMeta } from "@/lib/ebay/sanitize-aspects";
import {
  ensureCompatibleAspects,
  ensureInferredElectricalAspects,
  ensureRequiredCategoryAspects,
  formatEbayVoltage,
  inferAspectValueFromText,
  inferVoltageFromText,
  parseMissingAspectFromEbayError,
} from "@/lib/ebay/infer-voltage";
import { ensureInferredDimensionAspects, fallbackDimensionAspect } from "@/lib/ebay/infer-item-dimensions";
import { mapProductRow } from "@/lib/products/persistence";
import type { ProductListing } from "@/types/product";
import { createEmptyListing } from "@/lib/demo/sample-listing";
import { DEFAULT_VALUES } from "@/config/default-values";
import { isListableEbayCategoryId, resolveEbayCategory } from "@/config/ebay-categories";
import { resolveListingPackage } from "@/lib/ebay/package-shipping";

const bodySchema = z.object({
  productId: z.string().uuid().optional(),
  mode: z.enum(["draft", "live"]).default("draft"),
  listing: z
    .object({
      sku: z.string().min(1),
      title: z.string().min(1),
      descriptionHtml: z.string().optional().default(""),
      descriptionSummary: z.string().optional().default(""),
      categoryId: z.string().optional().default(""),
      categoryName: z.string().optional().default(""),
      brand: z.string().optional().default(""),
      model: z.string().optional().default(""),
      mpn: z.string().optional().default(""),
      upc: z.string().optional().default(""),
      size: z.string().optional().default(""),
      productType: z.string().optional().default(""),
      type: z.string().optional().default(""),
      condition: z.string().optional().default("New"),
      conditionId: z.string().optional().default("1000"),
      price: z.preprocess((value) => {
        if (value == null || value === "") return undefined;
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? num : undefined;
      }, z.number().positive().optional()),
      quantity: z.number().int().min(1).default(1),
      colors: z.array(z.string()).optional().default([]),
      materials: z.array(z.string()).optional().default([]),
      features: z.array(z.string()).optional().default([]),
      itemSpecifics: z
        .array(
          z.object({
            key: z.string(),
            value: z.string(),
            label: z.string().optional(),
          }),
        )
        .optional()
        .default([]),
      images: z
        .array(
          z.object({
            url: z.string(),
          }),
        )
        .optional()
        .default([]),
      shippingPolicyId: z.string().optional().default(""),
      returnPolicyId: z.string().optional().default(""),
      paymentPolicyId: z.string().optional().default(""),
      packageWeightLbs: z.number().int().min(0).nullable().optional(),
      packageWeightOz: z.number().int().min(0).max(15).nullable().optional(),
      packageLengthIn: z.number().min(0).nullable().optional(),
      packageWidthIn: z.number().min(0).nullable().optional(),
      packageDepthIn: z.number().min(0).nullable().optional(),
      packageSource: z.enum(["auto", "manual"]).optional().default("auto"),
    })
    .optional(),
});

function snapshotToListing(
  snap: NonNullable<z.infer<typeof bodySchema>["listing"]>,
): ProductListing {
  const base = createEmptyListing();
  return {
    ...base,
    title: snap.title,
    brand: snap.brand,
    model: snap.model,
    mpn: snap.mpn,
    upc: snap.upc,
    sku: snap.sku,
    productType: snap.productType,
    categoryId: snap.categoryId,
    categoryName: snap.categoryName,
    condition: snap.condition,
    conditionId: snap.conditionId,
    price: snap.price ?? null,
    quantity: snap.quantity,
    size: snap.size,
    type: snap.type,
    colors: snap.colors,
    materials: snap.materials,
    features: snap.features,
    descriptionSummary: snap.descriptionSummary,
    descriptionHtml: snap.descriptionHtml,
    itemSpecifics: snap.itemSpecifics.map((f) => ({
      key: f.key,
      label: f.label || f.key.replace(/^C:/, ""),
      value: f.value,
    })),
    images: snap.images.map((img, i) => ({
      id: `img-${i}`,
      url: img.url,
      fileName: `image-${i}.jpg`,
      sortOrder: i,
      isPrimary: i === 0,
      mimeType: "image/jpeg",
      sizeBytes: 0,
    })),
    shippingPolicyId: snap.shippingPolicyId,
    returnPolicyId: snap.returnPolicyId,
    paymentPolicyId: snap.paymentPolicyId,
    packageWeightLbs: snap.packageWeightLbs ?? null,
    packageWeightOz: snap.packageWeightOz ?? null,
    packageLengthIn: snap.packageLengthIn ?? null,
    packageWidthIn: snap.packageWidthIn ?? null,
    packageDepthIn: snap.packageDepthIn ?? null,
    packageSource: snap.packageSource === "manual" ? "manual" : "auto",
    status: "Ready",
  };
}

function dbRowToListing(
  row: Record<string, unknown>,
  images: Array<Record<string, unknown>>,
  specifics: Array<Record<string, unknown>>,
): ProductListing {
  const mapped = mapProductRow(row, images, specifics);
  const base = createEmptyListing();
  return {
    ...base,
    ...mapped,
    id: String(mapped.id),
    title: String(mapped.title || ""),
    subtitle: String(mapped.subtitle || ""),
    brand: String(mapped.brand || ""),
    collection: String(mapped.collection || ""),
    model: String(mapped.model || ""),
    sku: String(mapped.sku || ""),
    amazonAsin: String(mapped.amazonAsin || ""),
    upc: String(mapped.upc || ""),
    mpn: String(mapped.mpn || ""),
    categoryId: String(mapped.categoryId || ""),
    categoryName: String(mapped.categoryName || ""),
    condition: String(mapped.condition || ""),
    conditionId: String(mapped.conditionId || ""),
    conditionDescription: String(mapped.conditionDescription || ""),
    price:
      mapped.price === null || mapped.price === undefined
        ? null
        : Number(mapped.price),
    quantity: Number(mapped.quantity || 1),
    listingFormat:
      mapped.listingFormat === "Auction" ? "Auction" : "FixedPrice",
    descriptionHtml: String(mapped.descriptionHtml || ""),
    descriptionSummary: String(mapped.descriptionSummary || ""),
    itemSpecifics: Array.isArray(mapped.itemSpecifics)
      ? (mapped.itemSpecifics as ProductListing["itemSpecifics"])
      : [],
    features: Array.isArray(mapped.features)
      ? (mapped.features as string[])
      : [],
    setIncludes: Array.isArray(mapped.setIncludes)
      ? (mapped.setIncludes as string[])
      : [],
    colors: Array.isArray(mapped.colors) ? (mapped.colors as string[]) : [],
    materials: Array.isArray(mapped.materials)
      ? (mapped.materials as string[])
      : [],
    size: String(mapped.size || ""),
    productType: String(mapped.productType || ""),
    shippingPolicyId: String(mapped.shippingPolicyId || ""),
    returnPolicyId: String(mapped.returnPolicyId || ""),
    paymentPolicyId: String(mapped.paymentPolicyId || ""),
    handlingTime: Number(mapped.handlingTime || 1),
    itemLocation: String(mapped.itemLocation || ""),
    postalCode: String(mapped.postalCode || ""),
    country: String(mapped.country || "US"),
    packageWeightLbs:
      mapped.packageWeightLbs === null || mapped.packageWeightLbs === undefined
        ? null
        : Number(mapped.packageWeightLbs),
    packageWeightOz:
      mapped.packageWeightOz === null || mapped.packageWeightOz === undefined
        ? null
        : Number(mapped.packageWeightOz),
    packageLengthIn:
      mapped.packageLengthIn === null || mapped.packageLengthIn === undefined
        ? null
        : Number(mapped.packageLengthIn),
    packageWidthIn:
      mapped.packageWidthIn === null || mapped.packageWidthIn === undefined
        ? null
        : Number(mapped.packageWidthIn),
    packageDepthIn:
      mapped.packageDepthIn === null || mapped.packageDepthIn === undefined
        ? null
        : Number(mapped.packageDepthIn),
    packageSource:
      String(mapped.packageSource || "auto") === "manual" ? "manual" : "auto",
    status: (mapped.status as ProductListing["status"]) || "Ready",
    images: Array.isArray(mapped.images)
      ? (mapped.images as ProductListing["images"])
      : [],
    createdAt: String(mapped.createdAt || base.createdAt),
    updatedAt: String(mapped.updatedAt || base.updatedAt),
  };
}

export async function POST(request: Request) {
  try {
    return await postEbayPublish(request);
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "eBay publish failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function postEbayPublish(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  if (!isEbayOAuthConfigured()) {
    return NextResponse.json(
      { error: ebayOAuthMissingReason() },
      { status: 503 },
    );
  }

  const connection = await getEbayConnectionPublic(
    auth.supabase,
    auth.user.id,
  );
  if (!connection.connected) {
    return NextResponse.json(
      {
        error: "Connect your eBay store in Settings first.",
        code: "EBAY_NOT_CONNECTED",
      },
      { status: 400 },
    );
  }

  let data: z.infer<typeof bodySchema>;
  try {
    data = bodySchema.parse(await request.json());
  } catch (error) {
    const issues =
      error && typeof error === "object" && "issues" in error
        ? (error as { issues: Array<{ path: (string | number)[]; message: string }> })
            .issues
        : [];
    const first = issues[0];
    const field = first?.path?.filter(Boolean).join(".") || "";
    const categoryIssue = issues.some((issue) =>
      issue.path.includes("categoryId"),
    );
    const priceIssue = issues.some((issue) => issue.path.includes("price"));
    return NextResponse.json(
      {
        error: priceIssue
          ? "Set a selling price before publishing to eBay."
          : categoryIssue
            ? "This listing still needs an eBay category. Higlou will pick one from the title on the next try."
            : field
              ? `The listing is missing ${field}. Open Review and try publish again.`
              : "The listing is missing a required field. Open Review and try publish again.",
      },
      { status: 400 },
    );
  }

  let listing: ProductListing | null = null;
  const productId = data.productId;

  if (data.productId) {
    const { data: row, error } = await auth.supabase
      .from("products")
      .select("*")
      .eq("id", data.productId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const [{ data: images }, { data: specifics }] = await Promise.all([
      auth.supabase
        .from("product_images")
        .select("*")
        .eq("product_id", data.productId)
        .order("sort_order", { ascending: true }),
      auth.supabase
        .from("product_item_specifics")
        .select("*")
        .eq("product_id", data.productId),
    ]);
    listing = dbRowToListing(
      row as Record<string, unknown>,
      (images || []) as Array<Record<string, unknown>>,
      (specifics || []) as Array<Record<string, unknown>>,
    );
  }

  if (data.listing) {
    const snap = snapshotToListing(data.listing);
    listing = listing
      ? {
          ...listing,
          title: snap.title || listing.title,
          sku: snap.sku || listing.sku,
          brand: snap.brand || listing.brand,
          model: snap.model || listing.model,
          mpn: snap.mpn || listing.mpn,
          upc: snap.upc || listing.upc,
          categoryId: snap.categoryId || listing.categoryId,
          categoryName: snap.categoryName || listing.categoryName,
          condition: snap.condition || listing.condition,
          conditionId: snap.conditionId || listing.conditionId,
          price: snap.price ?? listing.price,
          quantity: snap.quantity || listing.quantity,
          size: snap.size || listing.size,
          productType: snap.productType || listing.productType,
          type: snap.type || listing.type,
          colors: snap.colors.length ? snap.colors : listing.colors,
          materials: snap.materials.length ? snap.materials : listing.materials,
          features: snap.features.length ? snap.features : listing.features,
          descriptionSummary:
            snap.descriptionSummary || listing.descriptionSummary,
          descriptionHtml: snap.descriptionHtml || listing.descriptionHtml,
          itemSpecifics: snap.itemSpecifics.length
            ? snap.itemSpecifics
            : listing.itemSpecifics,
          images: snap.images.length ? snap.images : listing.images,
          shippingPolicyId: snap.shippingPolicyId || listing.shippingPolicyId,
          returnPolicyId: snap.returnPolicyId || listing.returnPolicyId,
          paymentPolicyId: snap.paymentPolicyId || listing.paymentPolicyId,
          packageWeightLbs: snap.packageWeightLbs ?? listing.packageWeightLbs,
          packageWeightOz: snap.packageWeightOz ?? listing.packageWeightOz,
          packageLengthIn: snap.packageLengthIn ?? listing.packageLengthIn,
          packageWidthIn: snap.packageWidthIn ?? listing.packageWidthIn,
          packageDepthIn: snap.packageDepthIn ?? listing.packageDepthIn,
          packageSource: snap.packageSource || listing.packageSource,
        }
      : snap;
  }

  if (!listing) {
    return NextResponse.json(
      { error: "Provide productId or listing snapshot" },
      { status: 400 },
    );
  }

  if (!listing.price || listing.price <= 0) {
    return NextResponse.json(
      { error: "Set a selling price before publishing to eBay." },
      { status: 400 },
    );
  }

  if (!isListableEbayCategoryId(listing.categoryId)) {
    const catalog = resolveEbayCategory({
      title: listing.title,
      brand: listing.brand,
      features: listing.features,
      productType: listing.productType || listing.type,
    });
    if (isListableEbayCategoryId(catalog.categoryId)) {
      listing.categoryId = catalog.categoryId;
      listing.categoryName = catalog.categoryName;
    }
  }

  try {
    const accessToken = await getValidAccessToken(
      auth.supabase,
      auth.user.id,
    );

    // Inventory offers require a live US leaf category (25005 if parent/retired ID).
    try {
      const ensured = await ensureListableEbayCategory(accessToken, {
        categoryId: listing.categoryId,
        categoryName: listing.categoryName,
        title: listing.title,
        productType: listing.productType || listing.type,
        brand: listing.brand,
      });
      if (
        ensured.categoryId !== String(listing.categoryId || "").trim() ||
        (ensured.categoryName &&
          ensured.categoryName !== String(listing.categoryName || "").trim())
      ) {
        listing.categoryId = ensured.categoryId;
        if (ensured.categoryName) listing.categoryName = ensured.categoryName;
        if (productId) {
          await auth.supabase
            .from("products")
            .update({
              category_id: ensured.categoryId,
              category_name: ensured.categoryName || listing.categoryName,
              updated_at: new Date().toISOString(),
            })
            .eq("id", productId)
            .eq("user_id", auth.user.id);
        }
      }
    } catch (categoryError) {
      return NextResponse.json(
        {
          error:
            categoryError instanceof Error
              ? categoryError.message
              : "Invalid eBay category ID",
          code: "EBAY_CATEGORY_INVALID",
        },
        { status: 400 },
      );
    }

    if (!isListableEbayCategoryId(listing.categoryId)) {
      return NextResponse.json(
        {
          error: `Invalid eBay category ID "${listing.categoryId}". Select a leaf category in Review.`,
          code: "EBAY_CATEGORY_INVALID",
        },
        { status: 400 },
      );
    }

    // Draft + live both require policies that belong to the *currently*
    // connected eBay seller. IDs from a previous account cause 25087.
    {
      const defaults = await loadSellerDraftDefaults({
        userId: auth.user.id,
        supabase: auth.supabase,
        listingOverrides: {
          shippingPolicyId: listing.shippingPolicyId,
          returnPolicyId: listing.returnPolicyId,
          paymentPolicyId: listing.paymentPolicyId,
        },
      });

      try {
        const pkgEstimate = resolveListingPackage({
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
        const resolved = await resolveSellerBusinessPolicyIds(accessToken, {
          marketplaceId: connection.marketplaceId || "EBAY_US",
          // Prefer Settings / listing IDs; never invent First Class over a manual policy.
          preferred: {
            shippingPolicyId:
              defaults.shippingPolicyId || listing.shippingPolicyId || "",
            paymentPolicyId:
              defaults.paymentPolicyId || listing.paymentPolicyId || "",
            returnPolicyId:
              defaults.returnPolicyId || listing.returnPolicyId || "",
          },
          createIfMissing: true,
          packageWeightOz: pkgEstimate.totalOz,
        });
        listing.shippingPolicyId = resolved.shippingPolicyId;
        listing.returnPolicyId = resolved.returnPolicyId;
        listing.paymentPolicyId = resolved.paymentPolicyId;
        listing.shippingService = "USPSGroundAdvantage";
        listing.freeShipping = false;
        if (!(typeof listing.shippingCost === "number" && listing.shippingCost > 0)) {
          listing.shippingCost = pkgEstimate.shippingCost;
        }
        // Keep resolved package on listing for inventory item
        listing.packageWeightLbs = pkgEstimate.weightLbs;
        listing.packageWeightOz = pkgEstimate.weightOz;
        listing.packageLengthIn = pkgEstimate.lengthIn;
        listing.packageWidthIn = pkgEstimate.widthIn;
        listing.packageDepthIn = pkgEstimate.depthIn;

        await auth.supabase.from("ebay_policy_settings").upsert(
          {
            user_id: auth.user.id,
            shipping_policy_id: listing.shippingPolicyId,
            return_policy_id: listing.returnPolicyId,
            payment_policy_id: listing.paymentPolicyId,
            default_item_location: defaults.itemLocation,
            default_postal_code:
              defaults.postalCode || DEFAULT_VALUES.postalCode,
            default_handling_time: defaults.handlingTime,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      } catch (policyError) {
        return NextResponse.json(
          {
            error:
              policyError instanceof Error
                ? policyError.message
                : "Could not resolve or create eBay business policies for this seller account.",
            code: "EBAY_POLICIES_REQUIRED",
          },
          { status: 400 },
        );
      }
    }
    const inventory = listingToInventoryItem(listing);
    try {
      inventory.imageUrls = await ensureEbayCompatibleImageUrls({
        urls: inventory.imageUrls,
        userId: auth.user.id,
        accessToken,
      });
    } catch (imageError) {
      return NextResponse.json(
        {
          error:
            imageError instanceof Error
              ? imageError.message
              : "No eBay-compatible image URLs",
          code: "EBAY_IMAGE_URLS_INVALID",
        },
        { status: 400 },
      );
    }
    if (!inventory.imageUrls.length) {
      return NextResponse.json(
        {
          error:
            "At least one HTTPS JPEG/PNG image is required to create an eBay draft.",
          code: "EBAY_IMAGE_URLS_INVALID",
        },
        { status: 400 },
      );
    }

    const aspectMeta = await fetchCategoryAspectMeta(
      accessToken,
      listing.categoryId,
    );
    const aspectCardinality = aspectMeta.cardinality;
    const compatibleExtras = {
      title: listing.title,
      brand: listing.brand,
      model: listing.model,
      mpn: listing.mpn,
      productType: listing.productType || listing.type,
      categoryName: listing.categoryName,
      packageLengthIn: listing.packageLengthIn,
      packageWidthIn: listing.packageWidthIn,
      packageDepthIn: listing.packageDepthIn,
    };
    if (!inventory.aspects) inventory.aspects = {};
    ensureCompatibleAspects(
      inventory.aspects,
      aspectMeta.required,
      compatibleExtras,
    );
    ensureRequiredCategoryAspects(
      inventory.aspects,
      aspectMeta.required,
      compatibleExtras,
    );

    // Drop bad OCR UPCs before Inventory PUT (invalid checksum → eBay 25002).
    inventory.upc = undefined;
    const safeUpc = sanitizeEbayUpc(listing.upc);
    if (safeUpc) inventory.upc = safeUpc;
    else listing.upc = "";

    try {
      await createOrReplaceInventoryItem(accessToken, inventory, {
        aspectCardinality,
      });
    } catch (inventoryError) {
      const invMsg =
        inventoryError instanceof Error
          ? inventoryError.message
          : String(inventoryError);

      // Required item specific missing (often Voltage) → infer + retry once.
      const missingAspect = parseMissingAspectFromEbayError(invMsg);
      if (/25002/i.test(invMsg) && missingAspect) {
        const hay = [
          listing.title,
          listing.productType,
          listing.type,
          listing.categoryName,
          listing.brand,
          listing.model,
          listing.size,
          ...(listing.features || []),
          ...(listing.itemSpecifics || []).map((s) => `${s.label} ${s.value}`),
        ]
          .filter(Boolean)
          .join(" ");

        let filled = "";
        if (/^voltage$/i.test(missingAspect)) {
          filled =
            inferVoltageFromText(hay) ||
            formatEbayVoltage(
              /\b(nacs|ccs|ev\s*charger|ev\s*adapter)\b/i.test(hay) ? 1000 : 0,
            );
        } else {
          filled =
            inferAspectValueFromText(missingAspect, hay, {
              title: listing.title,
              brand: listing.brand,
              model: listing.model,
              mpn: listing.mpn,
              productType: listing.productType || listing.type,
              categoryName: listing.categoryName,
              packageLengthIn: listing.packageLengthIn,
              packageWidthIn: listing.packageWidthIn,
              packageDepthIn: listing.packageDepthIn,
            }) || "";
        }

        if (
          !filled &&
          /^(model|mpn|compatible\s|fragrance|scent)/i.test(missingAspect)
        ) {
          filled = "Does Not Apply";
        }
        if (!filled && /^item\s*(length|width|height)$/i.test(missingAspect)) {
          filled = fallbackDimensionAspect(missingAspect, hay, {
            lengthIn: listing.packageLengthIn,
            widthIn: listing.packageWidthIn,
            depthIn: listing.packageDepthIn,
          });
        }

        if (filled) {
          inventory.aspects = {
            ...(inventory.aspects || {}),
            [missingAspect]: [filled],
          };
          ensureInferredElectricalAspects(inventory.aspects, hay);
          ensureInferredDimensionAspects(inventory.aspects, hay, {
            lengthIn: listing.packageLengthIn,
            widthIn: listing.packageWidthIn,
            depthIn: listing.packageDepthIn,
          });
          const key = `C:${missingAspect}`;
          const already = (listing.itemSpecifics || []).some(
            (s) =>
              s.key.replace(/^C:/i, "").toLowerCase() ===
                missingAspect.toLowerCase() && s.value?.trim(),
          );
          if (!already) {
            listing.itemSpecifics = [
              ...(listing.itemSpecifics || []),
              {
                key,
                label: missingAspect,
                value: filled,
                confidence: 0.55,
              },
            ];
          }
          await createOrReplaceInventoryItem(accessToken, inventory, {
            aspectCardinality,
          });
        } else if (/25002|invalid value.*upc|upc has an invalid/i.test(invMsg)) {
          inventory.upc = undefined;
          listing.upc = "";
          for (const key of Object.keys(inventory.aspects || {})) {
            if (/^upc$/i.test(key)) delete inventory.aspects[key];
          }
          await createOrReplaceInventoryItem(accessToken, inventory, {
            aspectCardinality,
          });
        } else {
          throw inventoryError;
        }
      } else if (/25002|invalid value.*upc|upc has an invalid/i.test(invMsg)) {
        // Catalog-unknown or still-invalid UPC: retry without product.upc.
        inventory.upc = undefined;
        listing.upc = "";
        for (const key of Object.keys(inventory.aspects || {})) {
          if (/^upc$/i.test(key)) delete inventory.aspects[key];
        }
        await createOrReplaceInventoryItem(accessToken, inventory, {
          aspectCardinality,
        });
      } else {
        throw inventoryError;
      }
    }

    const offerInput = listingToOfferInput(listing, {
      fulfillmentPolicyId: listing.shippingPolicyId,
      paymentPolicyId: listing.paymentPolicyId,
      returnPolicyId: listing.returnPolicyId,
    });

    // Inventory listings cannot get Store folders via Trading revise — set
    // storeCategoryNames on the offer before publishOffer.
    let preparedStore: Awaited<
      ReturnType<typeof prepareStoreCategoriesForPublish>
    > | null = null;
    try {
      preparedStore = await prepareStoreCategoriesForPublish(accessToken, {
        title: listing.title,
        sku: listing.sku,
        categoryId: listing.categoryId,
        categoryName: listing.categoryName,
        brand: listing.brand,
        productType: listing.productType || listing.type,
      });
      if (preparedStore.storeCategoryNames.length) {
        offerInput.storeCategoryNames = preparedStore.storeCategoryNames;
      }
    } catch (prepareError) {
      console.warn(
        "[ebay/publish] prepare store folders",
        prepareError instanceof Error ? prepareError.message : prepareError,
      );
    }

    let offerId = "";
    try {
      ({ offerId } = await upsertOfferForSku(accessToken, offerInput));
    } catch (offerError) {
      const message =
        offerError instanceof Error ? offerError.message : String(offerError);

      // 25005: invalid/non-leaf category — force Taxonomy suggestion and retry once.
      if (/25005|invalid category/i.test(message)) {
        const forced = await ensureListableEbayCategory(accessToken, {
          categoryId: "",
          categoryName: listing.categoryName,
          title: listing.title,
          productType: listing.productType || listing.type,
          brand: listing.brand,
        });
        listing.categoryId = forced.categoryId;
        if (forced.categoryName) listing.categoryName = forced.categoryName;
        const retryOffer = {
          ...offerInput,
          categoryId: forced.categoryId,
        };
        ({ offerId } = await upsertOfferForSku(accessToken, retryOffer));
        if (productId) {
          await auth.supabase
            .from("products")
            .update({
              category_id: forced.categoryId,
              category_name: forced.categoryName || listing.categoryName,
              updated_at: new Date().toISOString(),
            })
            .eq("id", productId)
            .eq("user_id", auth.user.id);
        }
      } else if (/25713|not available/i.test(message)) {
        // Sandbox/production sometimes sticks a dead offer on the SKU — retry with a fresh SKU.
        const freshSku = `${inventory.sku}`
          .replace(/[^A-Za-z0-9]/g, "")
          .slice(0, 40);
        const retrySku = `${freshSku}H${Date.now().toString(36)}`.slice(0, 50);
        inventory.sku = retrySku;
        await createOrReplaceInventoryItem(accessToken, inventory, {
          aspectCardinality,
        });
        ({ offerId } = await upsertOfferForSku(accessToken, {
          ...offerInput,
          sku: retrySku,
        }));
        listing.sku = retrySku;
      } else if (
        /25007|216138|weight limit|Standard Envelope|Package weight is over/i.test(
          message,
        )
      ) {
        throw new Error(
          "eBay rejected the shipping policy: package weight is over the service limit (often eBay Standard Envelope = 3 oz max). In Seller Hub → Business policies, edit your shipping policy to USPS Ground Advantage (buyer pays), then in Higlou Settings click Import from eBay, select that policy, Save, and publish again.",
        );
      } else if (/25087|216118|shipping service option|Fulfillment policy/i.test(message)) {
        // Refresh the existing Higlou fulfillment policy in place (never create duplicates).
        const fixed = await ensureHiglouBusinessPolicies(accessToken, {
          marketplaceId: connection.marketplaceId || "EBAY_US",
          forceRecreateFulfillment: true,
          preferred: {
            shippingPolicyId: listing.shippingPolicyId,
            paymentPolicyId: listing.paymentPolicyId,
            returnPolicyId: listing.returnPolicyId,
          },
        });
        listing.shippingPolicyId = fixed.shippingPolicyId;
        listing.paymentPolicyId = fixed.paymentPolicyId;
        listing.returnPolicyId = fixed.returnPolicyId;
        await auth.supabase.from("ebay_policy_settings").upsert(
          {
            user_id: auth.user.id,
            shipping_policy_id: listing.shippingPolicyId,
            return_policy_id: listing.returnPolicyId,
            payment_policy_id: listing.paymentPolicyId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
        ({ offerId } = await upsertOfferForSku(accessToken, {
          ...offerInput,
          fulfillmentPolicyId: listing.shippingPolicyId,
          paymentPolicyId: listing.paymentPolicyId,
          returnPolicyId: listing.returnPolicyId,
        }));
      } else if (
        /25019|improper words|looks like a sex doll|sexual wellness/i.test(
          message,
        )
      ) {
        listing.title = toEbayListingTitle(listing.title);
        const forced = await ensureListableEbayCategory(accessToken, {
          categoryId: "",
          categoryName: "Sex Dolls & Masturbators",
          title: `${listing.title} sex doll masturbator`,
          productType: "Sex Doll Masturbator",
          brand: listing.brand,
        });
        listing.categoryId = forced.categoryId;
        if (forced.categoryName) listing.categoryName = forced.categoryName;
        inventory.title = listing.title;
        try {
          const adultMeta = await fetchCategoryAspectMeta(
            accessToken,
            listing.categoryId,
          );
          await createOrReplaceInventoryItem(accessToken, inventory, {
            aspectCardinality: adultMeta.cardinality,
          });
          ({ offerId } = await upsertOfferForSku(accessToken, {
            ...offerInput,
            categoryId: forced.categoryId,
            listingDescription: listingToOfferInput(listing, {
              fulfillmentPolicyId: listing.shippingPolicyId,
              paymentPolicyId: listing.paymentPolicyId,
              returnPolicyId: listing.returnPolicyId,
            }).listingDescription,
          }));
        } catch (adultError) {
          const adultMsg =
            adultError instanceof Error
              ? adultError.message
              : String(adultError);
          throw new Error(
            `eBay blocked this adult item (25019). Higlou moved it to ${forced.categoryName || "Sex Dolls & Masturbators"} [${forced.categoryId}] and removed slang from the title. If it still fails, the photos may show nudity (eBay forbids that even in adult categories), or your seller account needs Sexual Wellness approval in Seller Hub. ${adultMsg}`,
          );
        }
        if (productId) {
          await auth.supabase
            .from("products")
            .update({
              title: listing.title,
              category_id: forced.categoryId,
              category_name: forced.categoryName || listing.categoryName,
              updated_at: new Date().toISOString(),
            })
            .eq("id", productId)
            .eq("user_id", auth.user.id);
        }
      } else {
        throw offerError;
      }
    }

    let listingId = "";
    let status = "UNPUBLISHED";
    let storeOrganize: {
      storePath: string;
      storePath2: string | null;
      createdFolder: boolean;
      confidence: number;
      reason: string;
    } | null = null;
    let storeOrganizeWarning: string | null = null;

    if (data.mode === "live") {
      const published = await publishOffer(accessToken, offerId);
      listingId = published.listingId;
      status = "PUBLISHED";

      // Same pattern as Settings → Organize Store: classify → create folder → assign.
      // Inventory listings fall back to updateOffer storeCategoryNames.
      if (listingId) {
        try {
          storeOrganize = await organizeListingOnPublish(accessToken, {
            listingId,
            title: listing.title,
            sku: listing.sku,
            categoryId: listing.categoryId,
            categoryName: listing.categoryName,
            brand: listing.brand,
            productType: listing.productType || listing.type,
            inventoryOfferId: offerId,
            preparedPaths: preparedStore?.storeCategoryNames || null,
          });
        } catch (organizeError) {
          // If we already stamped folders on createOffer, treat as soft success.
          if (preparedStore?.storeCategoryNames?.length) {
            storeOrganize = {
              storePath: preparedStore.storePath,
              storePath2: preparedStore.storePath2,
              createdFolder: preparedStore.createdFolder,
              confidence: preparedStore.confidence,
              reason: `${preparedStore.reason} (set on offer; post-publish sync lagged)`,
            };
          } else {
            storeOrganizeWarning =
              organizeError instanceof Error
                ? organizeError.message
                : String(organizeError);
          }
        }
      }
    }

    if (productId) {
      await auth.supabase
        .from("products")
        .update({
          ebay_offer_id: offerId,
          ebay_listing_id: listingId || null,
          ebay_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId)
        .eq("user_id", auth.user.id);
    }

    const liveHint = storeOrganize
      ? `Published and filed in Store ${storeOrganize.storePath}${storeOrganize.storePath2 ? ` + ${storeOrganize.storePath2}` : ""}${storeOrganize.createdFolder ? " (folder created)" : ""}.`
      : storeOrganizeWarning
        ? `Listing published to eBay, but Store folder was not set: ${storeOrganizeWarning}`
        : "Listing published to eBay.";

    return NextResponse.json({
      ok: true,
      mode: data.mode,
      offerId,
      listingId: listingId || null,
      status,
      imageCount: inventory.imageUrls.length,
      imageHost: "ebay-eps",
      ebayUsername: connection.ebayUsername,
      env: connection.env,
      storeOrganize,
      storeOrganizeWarning,
      sellerHubHint:
        data.mode === "draft"
          ? "Offer created unpublished with eBay-hosted photos. Finish location/policies in Seller Hub if needed, then publish."
          : storeOrganizeWarning
            ? `${liveHint} Store organize note: ${storeOrganizeWarning}`
            : liveHint,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : typeof error === "string" && error.trim()
          ? error
          : "eBay publish failed";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 502 },
    );
  }
}
