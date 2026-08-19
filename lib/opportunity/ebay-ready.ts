import { resolveEbayCategory } from "@/config/ebay-categories";
import { DEFAULT_VALUES } from "@/config/default-values";
import { synthesizeDescriptionSummary, buildListingDescriptionHtml } from "@/lib/ebay/description-html";
import { STORE_BRANDING_DEFAULTS } from "@/config/store-branding";
import { seedPackageOnListing } from "@/lib/ebay/package-shipping";
import { toEbayListingTitle } from "@/lib/ebay/listing-helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function ebayReadyImportFields(opts: {
  title: string;
  brand: string;
  features: string[];
  ebayToken?: string;
  userId: string;
  supabase: SupabaseClient;
  fast?: boolean;
}): Promise<{
  categoryId: string;
  categoryName: string;
  descriptionSummary: string;
  descriptionHtml: string;
  packageWeightLbs: number;
  packageWeightOz: number;
  packageLengthIn: number;
  packageWidthIn: number;
  packageDepthIn: number;
  packageSource: "auto";
  itemLocation: string;
  postalCode: string;
  country: string;
  handlingTime: number;
}> {
  const title = toEbayListingTitle(String(opts.title || "").trim());
  const brand = String(opts.brand || "").trim();
  const features = (opts.features || []).map(String).filter(Boolean);
  let categoryId = "";
  let categoryName = "";

  if (opts.ebayToken && !opts.fast) {
    try {
      const { ensureListableEbayCategory } = await import(
        "@/lib/ebay/taxonomy-categories"
      );
      const ensured = await ensureListableEbayCategory(opts.ebayToken, {
        title,
        brand,
        productType: title,
      });
      categoryId = ensured.categoryId;
      categoryName = ensured.categoryName;
    } catch {
      /* catalog / AI next */
    }
  }

  if (!categoryId) {
    const catalog = resolveEbayCategory({
      title,
      brand,
      features,
      productType: title,
    });
    categoryId = catalog.categoryId;
    categoryName = catalog.categoryName;
  }

  if (!categoryId && !opts.fast) {
    const { ensureEbayCategory } = await import("@/lib/ebay/ensure-category");
    const ai = await ensureEbayCategory({
      title,
      brand,
      features,
      productType: title,
      userId: opts.userId,
      supabase: opts.supabase,
      allowAi: true,
    });
    categoryId = ai.categoryId;
    categoryName = ai.categoryName;
  }

  const pkg = seedPackageOnListing(
    {
      title,
      brand,
      categoryName,
      quantity: 1,
      packageWeightLbs: null,
      packageWeightOz: null,
      packageLengthIn: null,
      packageWidthIn: null,
      packageDepthIn: null,
      packageSource: "auto" as const,
    },
    true,
  );
  const descriptionSummary = synthesizeDescriptionSummary({
    title,
    brand,
    features,
    condition: "New",
  });
  const descriptionHtml = buildListingDescriptionHtml(
    {
      title,
      brand,
      features,
      descriptionSummary,
      condition: "New",
    },
    STORE_BRANDING_DEFAULTS,
  );

  return {
    categoryId,
    categoryName,
    descriptionSummary,
    descriptionHtml,
    packageWeightLbs: pkg.packageWeightLbs ?? 1,
    packageWeightOz: pkg.packageWeightOz ?? 0,
    packageLengthIn: pkg.packageLengthIn ?? 8,
    packageWidthIn: pkg.packageWidthIn ?? 6,
    packageDepthIn: pkg.packageDepthIn ?? 4,
    packageSource: "auto",
    itemLocation: DEFAULT_VALUES.itemLocation,
    postalCode: DEFAULT_VALUES.postalCode,
    country: DEFAULT_VALUES.country,
    handlingTime: DEFAULT_VALUES.handlingTime,
  };
}
