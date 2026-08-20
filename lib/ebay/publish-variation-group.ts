import type { ProductListing } from "@/types/product";
import {
  isVariantSelected,
  type ListingVariationSet,
} from "@/lib/listing/variations";
import {
  clearOffersForSku,
  createOrReplaceInventoryItem,
  createOrReplaceInventoryItemGroup,
  publishOfferByInventoryItemGroup,
  upsertOfferForSku,
  type EbayInventoryItemInput,
  type EbayOfferInput,
} from "@/lib/ebay/inventory-api";
import { toEbayInventorySku, sanitizeEbayPolicyCopy } from "@/lib/ebay/listing-helpers";
import {
  ensureEbayBrandAspect,
  ensureInferredApparelAspects,
  inferFilledAspectForEbayError,
  parseMissingAspectFromEbayError,
} from "@/lib/ebay/infer-voltage";

export type VariationGroupPlan = {
  groupKey: string;
  variantSkus: string[];
  specifications: Array<{ name: string; values: string[] }>;
};

/** eBay 25013: a variation specific may list at most ~60 values, and 2 names. */
export const EBAY_MAX_VARIATION_AXES = 2;
export const EBAY_MAX_VALUES_PER_AXIS = 60;

const AXIS_RANK: Record<string, number> = {
  color: 0,
  colour: 0,
  size: 1,
  style: 2,
  pattern: 3,
  flavor: 4,
  flavour: 4,
  scent: 5,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "");
}

function isEbay25001(error: unknown): boolean {
  return /25001|core inventory service internal/i.test(errorText(error));
}

function isEbay25013(error: unknown): boolean {
  return /25013|too many trait values/i.test(errorText(error));
}

function oneTrait(raw: string): string {
  return sanitizeEbayPolicyCopy(String(raw || "").replace(/\s+/g, " ")).slice(
    0,
    65,
  );
}

function axisRank(name: string): number {
  const key = name.trim().toLowerCase();
  return AXIS_RANK[key] ?? 20;
}

export function planVariationGroup(
  set: ListingVariationSet,
  parentSku: string,
  opts?: { maxAxes?: number; maxValuesPerAxis?: number },
): VariationGroupPlan | null {
  const variants = (set?.variants || []).filter(isVariantSelected);
  if (variants.length < 2) return null;

  const maxAxes = opts?.maxAxes ?? EBAY_MAX_VARIATION_AXES;
  const maxValues = opts?.maxValuesPerAxis ?? EBAY_MAX_VALUES_PER_AXIS;

  const rawSpecs = (set.axisNames.length
    ? set.axisNames
    : [...new Set(variants.flatMap((row) => Object.keys(row.aspects)))]
  )
    .map((name) => ({
      name,
      values: [
        ...new Set(
          variants
            .map((row) => oneTrait(row.aspects[name] || ""))
            .filter(Boolean),
        ),
      ],
    }))
    .filter((row) => row.name && row.values.length >= 2)
    .sort(
      (a, b) =>
        axisRank(a.name) - axisRank(b.name) ||
        b.values.length - a.values.length,
    )
    .slice(0, Math.max(1, maxAxes));

  const specifications = rawSpecs.map((row) => ({
    name: row.name,
    values: row.values.slice(0, maxValues),
  }));

  if (!specifications.length) return null;

  const allowed = new Map(
    specifications.map((row) => [row.name, new Set(row.values)]),
  );

  const seen = new Set<string>();
  const combos = new Set<string>();
  const variantSkus: string[] = [];
  for (const variant of variants) {
    const sku = toEbayInventorySku(variant.sku || `AMZ-${variant.asin}`);
    if (seen.has(sku)) continue;
    const hasEveryAxis = specifications.every((axis) => {
      const value = oneTrait(variant.aspects[axis.name] || "");
      return value && allowed.get(axis.name)?.has(value);
    });
    if (!hasEveryAxis) continue;
    const combo = specifications
      .map((axis) => oneTrait(variant.aspects[axis.name] || ""))
      .join("|");
    if (combos.has(combo)) continue;
    seen.add(sku);
    combos.add(combo);
    variantSkus.push(sku);
    if (variantSkus.length >= maxValues) break;
  }
  if (variantSkus.length < 2) return null;

  const groupKey = `${toEbayInventorySku(parentSku || variantSkus[0] || "ITEM")}G`.slice(
    0,
    50,
  );
  return { groupKey, variantSkus, specifications };
}

function planFromAcceptedSkus(
  set: ListingVariationSet,
  parentSku: string,
  acceptedSkus: string[],
  opts?: { maxAxes?: number; maxValuesPerAxis?: number },
): VariationGroupPlan | null {
  const want = new Set(acceptedSkus);
  return planVariationGroup(
    {
      axisNames: set.axisNames,
      variants: set.variants.filter((row) =>
        want.has(toEbayInventorySku(row.sku || `AMZ-${row.asin}`)),
      ),
    },
    parentSku,
    opts,
  );
}

async function putVariantInventory(opts: {
  accessToken: string;
  listing: ProductListing;
  inventory: EbayInventoryItemInput;
  sku: string;
  aspects: Record<string, string[]>;
  lockAspects: Record<string, string>;
  imageUrls: string[];
  aspectCardinality?: Map<string, "SINGLE" | "MULTI">;
}): Promise<void> {
  const payload = {
    ...opts.inventory,
    sku: opts.sku,
    aspects: opts.aspects,
    imageUrls: opts.imageUrls.length ? opts.imageUrls : opts.inventory.imageUrls,
  };
  ensureEbayBrandAspect(payload.aspects, opts.listing.brand || opts.inventory.brand);
  payload.brand = payload.aspects.Brand?.[0] || "Unbranded";
  try {
    await createOrReplaceInventoryItem(opts.accessToken, payload, {
      aspectCardinality: opts.aspectCardinality,
      lockAspects: opts.lockAspects,
    });
    return;
  } catch (error) {
    const message = errorText(error);
    const missingAspect = parseMissingAspectFromEbayError(message);
    if (!/25002/i.test(message) || !missingAspect) throw error;
    const hay = [
      opts.listing.title,
      opts.listing.productType,
      opts.listing.type,
      opts.listing.categoryName,
      opts.listing.brand,
      opts.listing.model,
      opts.listing.size,
    ]
      .filter(Boolean)
      .join(" ");
    const filled = inferFilledAspectForEbayError(missingAspect, hay, {
      title: opts.listing.title,
      brand: opts.listing.brand,
      model: opts.listing.model,
      mpn: opts.listing.mpn,
      productType: opts.listing.productType || opts.listing.type,
      categoryName: opts.listing.categoryName,
      categoryId: opts.listing.categoryId,
      department: opts.listing.department,
      packageLengthIn: opts.listing.packageLengthIn,
      packageWidthIn: opts.listing.packageWidthIn,
      packageDepthIn: opts.listing.packageDepthIn,
    });
    if (!filled) throw error;
    opts.inventory.aspects = {
      ...(opts.inventory.aspects || {}),
      [missingAspect]: [filled],
    };
    payload.aspects = {
      ...opts.aspects,
      [missingAspect]: [filled],
    };
    await createOrReplaceInventoryItem(opts.accessToken, payload, {
      aspectCardinality: opts.aspectCardinality,
      lockAspects: opts.lockAspects,
    });
  }
}

export async function publishEbayVariationGroup(opts: {
  accessToken: string;
  listing: ProductListing;
  set: ListingVariationSet;
  inventory: EbayInventoryItemInput;
  offer: EbayOfferInput;
  aspectCardinality?: Map<string, "SINGLE" | "MULTI">;
  live: boolean;
  hostImages?: (urls: string[]) => Promise<string[]>;
}): Promise<{ offerId: string; listingId: string; skipped?: number }> {
  const planned = planVariationGroup(opts.set, opts.listing.sku);
  if (!planned) {
    throw new Error(
      "Pick at least two complete Color/Size options so eBay can show a dropdown.",
    );
  }

  if (!opts.inventory.aspects) opts.inventory.aspects = {};
  ensureInferredApparelAspects(opts.inventory.aspects, {
    title: opts.listing.title,
    productType: opts.listing.productType || opts.listing.type,
    categoryName: opts.listing.categoryName,
    categoryId: opts.listing.categoryId,
  });

  const skuToVariant = new Map(
    opts.set.variants.map((row) => [
      toEbayInventorySku(row.sku || `AMZ-${row.asin}`),
      row,
    ]),
  );

  const epsByUrl = new Map<string, string>();
  const hostImages = async (urls: string[]): Promise<string[]> => {
    const unique = [...new Set(urls.filter((url) => /^https:\/\//i.test(url)))];
    if (!unique.length) return opts.inventory.imageUrls.slice(0, 8);
    if (!opts.hostImages) {
      return unique.slice(0, 8);
    }
    for (const url of unique.slice(0, 4)) {
      if (epsByUrl.has(url)) continue;
      try {
        const hosted = await opts.hostImages([url]);
        if (hosted[0]) epsByUrl.set(url, hosted[0]);
      } catch {
        /* keep Amazon URL only if EPS already exists; else parent gallery */
      }
    }
    const out = unique
      .map((url) => epsByUrl.get(url))
      .filter((url): url is string => Boolean(url));
    return out.length ? out.slice(0, 8) : opts.inventory.imageUrls.slice(0, 8);
  };

  const acceptedSkus: string[] = [];
  const variantHeroes: string[] = [];

  for (let i = 0; i < planned.variantSkus.length; i += 1) {
    const sku = planned.variantSkus[i]!;
    const variant = skuToVariant.get(sku);
    const aspects = { ...(opts.inventory.aspects || {}) };
    const lockAspects: Record<string, string> = {};
    for (const name of Object.keys(aspects)) {
      if (/^(colou?r|size|style|pattern|scent|flavou?r)$/i.test(name)) {
        delete aspects[name];
      }
    }
    for (const axis of planned.specifications) {
      const value = oneTrait(variant?.aspects[axis.name] || "");
      if (!value) continue;
      aspects[axis.name] = [value];
      lockAspects[axis.name] = value;
    }
    const scent = lockAspects.Color || lockAspects.Size || "";
    if (scent) {
      for (const name of Object.keys(aspects)) {
        if (/^(fragrance\s*name|scent|notes)$/i.test(name) && !lockAspects[name]) {
          aspects[name] = [scent];
          lockAspects[name] = scent;
        }
      }
    }
    const variantPhotos = await hostImages(
      (variant?.imageUrls || []).slice(0, 4),
    );
    if (variantPhotos[0]) variantHeroes.push(variantPhotos[0]);
    try {
      await putVariantInventory({
        accessToken: opts.accessToken,
        listing: opts.listing,
        inventory: opts.inventory,
        sku,
        aspects,
        lockAspects,
        imageUrls: variantPhotos,
        aspectCardinality: opts.aspectCardinality,
      });
      await clearOffersForSku(opts.accessToken, sku);
      acceptedSkus.push(sku);
    } catch (error) {
      console.warn(
        "[ebay/publish] skipped variant",
        sku,
        errorText(error),
      );
    }
    if (i < planned.variantSkus.length - 1) await sleep(250);
  }

  const plan = planFromAcceptedSkus(opts.set, opts.listing.sku, acceptedSkus);
  if (!plan) {
    throw new Error(
      acceptedSkus.length
        ? "eBay could not take enough of those options together. Uncheck a few sizes and try again."
        : "eBay rejected these options. Uncheck a color or size and try again.",
    );
  }

  const groupImages = [
    ...opts.inventory.imageUrls,
    ...variantHeroes,
  ].filter((url, index, all) => url && all.indexOf(url) === index);

  const imageVariesBy = plan.specifications
    .filter((axis) =>
      plan.variantSkus.some((sku) => skuToVariant.get(sku)?.imageUrls[0]),
    )
    .map((axis) => axis.name)
    .slice(0, 1);

  const putGroup = async (current: VariationGroupPlan, withPhotos: boolean) =>
    createOrReplaceInventoryItemGroup(opts.accessToken, {
      inventoryItemGroupKey: current.groupKey,
      variantSKUs: current.variantSkus,
      title: opts.inventory.title,
      description: opts.inventory.description,
      imageUrls: groupImages,
      variesBy: {
        specifications: current.specifications,
        ...(withPhotos && imageVariesBy.length
          ? { aspectsImageVariesBy: imageVariesBy }
          : {}),
      },
    });

  const shrinkFor25013 = (current: VariationGroupPlan): VariationGroupPlan | null => {
    if (current.specifications.length > 1) {
      return planFromAcceptedSkus(opts.set, opts.listing.sku, acceptedSkus, {
        maxAxes: 1,
        maxValuesPerAxis: EBAY_MAX_VALUES_PER_AXIS,
      });
    }
    if (current.specifications[0] && current.specifications[0].values.length > 12) {
      return planFromAcceptedSkus(opts.set, opts.listing.sku, acceptedSkus, {
        maxAxes: 1,
        maxValuesPerAxis: 12,
      });
    }
    return null;
  };

  let groupPlan = plan;
  let withPhotos = true;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await putGroup(groupPlan, withPhotos);
      break;
    } catch (error) {
      if (isEbay25001(error)) {
        await sleep(1500);
        withPhotos = false;
        if (attempt === 3) throw error;
        continue;
      }
      if (isEbay25013(error)) {
        withPhotos = false;
        const next = shrinkFor25013(groupPlan);
        if (!next || attempt === 3) {
          throw new Error(
            "VARIATIONS_TOO_COMPLEX: eBay will not take that many color/size options together. Higlou will list this as one item.",
          );
        }
        groupPlan = next;
        await sleep(400);
        continue;
      }
      throw error;
    }
  }

  let offerId = "";
  for (const sku of groupPlan.variantSkus) {
    const created = await upsertOfferForSku(opts.accessToken, {
      ...opts.offer,
      sku,
    });
    if (!offerId) offerId = created.offerId;
  }

  const skipped = planned.variantSkus.length - groupPlan.variantSkus.length;

  if (!opts.live) {
    return { offerId, listingId: "", skipped };
  }

  try {
    const published = await publishOfferByInventoryItemGroup(
      opts.accessToken,
      groupPlan.groupKey,
    );
    return { offerId, listingId: published.listingId, skipped };
  } catch (error) {
    if (!isEbay25001(error)) throw error;
    await sleep(1500);
    try {
      const published = await publishOfferByInventoryItemGroup(
        opts.accessToken,
        groupPlan.groupKey,
      );
      return { offerId, listingId: published.listingId, skipped };
    } catch {
      throw new Error(
        "eBay hit a variation glitch (25001). Wait a few seconds and Try again. Do not change the title or prices first.",
      );
    }
  }
}
