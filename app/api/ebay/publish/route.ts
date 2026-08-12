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
  upsertOfferForSku,
} from "@/lib/ebay/inventory-api";
import {
  listingToInventoryItem,
  listingToOfferInput,
} from "@/lib/ebay/listing-to-inventory";
import { ensureEbayCompatibleImageUrls } from "@/lib/ebay/ensure-ebay-images";
import {
  ensureHiglouBusinessPolicies,
  resolveSellerBusinessPolicyIds,
} from "@/lib/ebay/account-policies";
import { loadSellerDraftDefaults } from "@/lib/ebay/draft-defaults";
import { ensureListableEbayCategory } from "@/lib/ebay/taxonomy-categories";
import { fetchAspectCardinalityMap } from "@/lib/ebay/sanitize-aspects";
import { mapProductRow } from "@/lib/products/persistence";
import type { ProductListing } from "@/types/product";
import { createEmptyListing } from "@/lib/demo/sample-listing";
import { DEFAULT_VALUES } from "@/config/default-values";
import { isListableEbayCategoryId } from "@/config/ebay-categories";

const bodySchema = z.object({
  productId: z.string().uuid().optional(),
  mode: z.enum(["draft", "live"]).default("draft"),
  listing: z
    .object({
      sku: z.string().min(1),
      title: z.string().min(1),
      descriptionHtml: z.string().optional().default(""),
      descriptionSummary: z.string().optional().default(""),
      categoryId: z.string().min(1),
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
      price: z.number().positive(),
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
    price: snap.price,
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
    status: (mapped.status as ProductListing["status"]) || "Ready",
    images: Array.isArray(mapped.images)
      ? (mapped.images as ProductListing["images"])
      : [],
    createdAt: String(mapped.createdAt || base.createdAt),
    updatedAt: String(mapped.updatedAt || base.updatedAt),
  };
}

export async function POST(request: Request) {
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
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid publish payload",
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
  } else if (data.listing) {
    listing = snapshotToListing(data.listing);
  }

  if (!listing) {
    return NextResponse.json(
      { error: "Provide productId or listing snapshot" },
      { status: 400 },
    );
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
        const resolved = await resolveSellerBusinessPolicyIds(accessToken, {
          marketplaceId: connection.marketplaceId || "EBAY_US",
          // Ignore stale listing/settings IDs — always use corrected Higlou policies.
          preferred: {},
          createIfMissing: true,
        });
        listing.shippingPolicyId = resolved.shippingPolicyId;
        listing.returnPolicyId = resolved.returnPolicyId;
        listing.paymentPolicyId = resolved.paymentPolicyId;
        listing.shippingService = "USPSGroundAdvantage";
        listing.freeShipping = false;
        listing.shippingCost = null;

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

    const aspectCardinality = await fetchAspectCardinalityMap(
      accessToken,
      listing.categoryId,
    );
    await createOrReplaceInventoryItem(accessToken, inventory, {
      aspectCardinality,
    });

    const offerInput = listingToOfferInput(listing, {
      fulfillmentPolicyId: listing.shippingPolicyId,
      paymentPolicyId: listing.paymentPolicyId,
      returnPolicyId: listing.returnPolicyId,
    });

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
          .replace(/-H[a-z0-9]+$/i, "")
          .slice(0, 40);
        const retrySku = `${freshSku}-H${Date.now().toString(36)}`;
        inventory.sku = retrySku;
        await createOrReplaceInventoryItem(accessToken, inventory, {
          aspectCardinality,
        });
        ({ offerId } = await upsertOfferForSku(accessToken, {
          ...offerInput,
          sku: retrySku,
        }));
        listing.sku = retrySku;
      } else if (/25087|216118|shipping service option|Fulfillment policy/i.test(message)) {
        // Fulfillment policy exists but has no valid shipping services (or belongs to another seller).
        const fixed = await ensureHiglouBusinessPolicies(accessToken, {
          marketplaceId: connection.marketplaceId || "EBAY_US",
          forceRecreateFulfillment: true,
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
      } else {
        throw offerError;
      }
    }

    let listingId = "";
    let status = "UNPUBLISHED";
    if (data.mode === "live") {
      const published = await publishOffer(accessToken, offerId);
      listingId = published.listingId;
      status = "PUBLISHED";
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
      sellerHubHint:
        data.mode === "draft"
          ? "Offer created unpublished with eBay-hosted photos. Finish location/policies in Seller Hub if needed, then publish."
          : "Listing published to eBay.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "eBay publish failed",
      },
      { status: 502 },
    );
  }
}
