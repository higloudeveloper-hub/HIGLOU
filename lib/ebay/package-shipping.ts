/**
 * Estimate package weight / dimensions from the product (tight box + light
 * padding) and choose a domestic service. Shipping is always CALCULATED so
 * the buyer pays USPS/UPS rates based on the package — never free shipping.
 */

export type PackageEstimate = {
  weightLbs: number;
  weightOz: number;
  /** Total ounces for bands. */
  totalOz: number;
  packageType: string;
  lengthIn: number;
  widthIn: number;
  depthIn: number;
  measurementSystem: "ENGLISH";
  /** Flat = buyer pays the listed Ground Advantage cost (account-safe). */
  shippingType: "Flat";
  shippingService: string;
  /** Buyer-paid Ground Advantage estimate (never free). */
  shippingCost: number;
  shippingPriority: number;
  weightUnit: "lbs";
  freeShipping: false;
  reason: string;
};

/** Soft padding (inches) so the product fits with light packing material. */
const PACK_PAD_IN = 0.75;

function parseFluidOz(text: string): number | null {
  const fl = text.match(
    /(\d+(?:\.\d+)?)\s*(?:fl\.?\s*oz|fluid\s*ounces?)\b/i,
  );
  if (fl) return Number(fl[1]);
  const ml = text.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (ml) return Number(ml[1]) / 29.5735;
  const liter = text.match(/(\d+(?:\.\d+)?)\s*l(?:iter)?s?\b/i);
  if (liter && Number(liter[1]) < 10) return Number(liter[1]) * 33.814;
  return null;
}

/** Convert a length token + optional unit to inches. */
function toInches(value: number, unit?: string | null): number {
  const u = String(unit || "in").toLowerCase();
  if (/cm|centimet/.test(u)) return value / 2.54;
  if (/mm/.test(u)) return value / 25.4;
  if (/m\b|meter/.test(u) && !/mm|cm/.test(u)) return value * 39.3701;
  return value; // in / inch / "
}

/**
 * Pull L×W×H (or diameter) from title/size text.
 * Prefer explicit 3-number boxes; fall back to diameter / single span.
 */
export function parseProductDimensionsInches(text: string): {
  lengthIn: number;
  widthIn: number;
  depthIn: number;
  source: string;
} | null {
  const raw = String(text || "").trim();
  if (!raw) return null;

  // 12 x 8 x 4 in  |  12x8x4"  |  30 × 20 × 10 cm
  const box = raw.match(
    /(\d+(?:\.\d+)?)\s*(?:in(?:ch(?:es)?)?|"|'')?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:in(?:ch(?:es)?)?|"|'')?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(in(?:ch(?:es)?)?|"|''|cm|mm)?/i,
  );
  if (box) {
    const unit = box[4] || "in";
    const dims = [Number(box[1]), Number(box[2]), Number(box[3])]
      .map((v) => Math.max(0.5, toInches(v, unit)))
      .sort((x, y) => y - x) as [number, number, number];
    return {
      lengthIn: dims[0],
      widthIn: dims[1],
      depthIn: dims[2],
      source: "LxWxH",
    };
  }

  // Diameter: 12 in diameter / Ø12" / 12" dia
  const dia = raw.match(
    /(?:ø|diameter|dia\.?)\s*(\d+(?:\.\d+)?)\s*(in(?:ch(?:es)?)?|"|''|cm|mm)?|(\d+(?:\.\d+)?)\s*(in(?:ch(?:es)?)?|"|''|cm|mm)?\s*(?:ø|diameter|dia\.?)/i,
  );
  if (dia) {
    const n = Number(dia[1] || dia[3]);
    const u = dia[2] || dia[4] || "in";
    const d = Math.max(1, toInches(n, u));
    return {
      lengthIn: d,
      widthIn: d,
      depthIn: Math.max(2, Math.round(d * 0.35 * 2) / 2),
      source: "diameter",
    };
  }

  // Single size often used for lights/faucets: 12 inch / 12"
  const single = raw.match(/(\d+(?:\.\d+)?)\s*(?:in(?:ch(?:es)?)?|"|'')\b/i);
  if (single) {
    const d = Math.max(1, Number(single[1]));
    if (d >= 3 && d <= 48) {
      return {
        lengthIn: d,
        widthIn: Math.max(4, Math.round(d * 0.7 * 2) / 2),
        depthIn: Math.max(3, Math.round(d * 0.35 * 2) / 2),
        source: "single-span",
      };
    }
  }

  return null;
}

/** Round up to nearest 0.5" after padding; clamp to usable parcel sizes. */
function paddedBox(
  lengthIn: number,
  widthIn: number,
  depthIn: number,
  padIn = PACK_PAD_IN,
): { lengthIn: number; widthIn: number; depthIn: number } {
  const roundUpHalf = (n: number) => Math.max(1, Math.ceil((n + padIn) * 2) / 2);
  const dims = [lengthIn, widthIn, depthIn]
    .map(roundUpHalf)
    .sort((a, b) => b - a);
  // Cap absurd outliers; keep USPS Ground Advantage friendly when possible.
  return {
    lengthIn: Math.min(108, dims[0]),
    widthIn: Math.min(108, dims[1]),
    depthIn: Math.min(108, dims[2]),
  };
}

function volumeWeightOz(lengthIn: number, widthIn: number, depthIn: number): number {
  // Domestic dim weight factor ~166 → oz = (L*W*H/166)*16
  const dimLbs = (lengthIn * widthIn * depthIn) / 166;
  return Math.max(1, Math.round(dimLbs * 16));
}

function toLbsOz(totalOz: number): { lbs: number; oz: number } {
  const clamped = Math.max(1, Math.round(totalOz));
  const lbs = Math.floor(clamped / 16);
  const oz = clamped % 16;
  return { lbs, oz: oz === 0 && lbs > 0 ? 0 : oz || (lbs === 0 ? 1 : 0) };
}

function pickService(totalOz: number, longestIn: number): {
  shippingService: string;
  reason: string;
} {
  // Always cheapest: Ground Advantage. Never Priority.
  if (longestIn > 108 || totalOz > 1120) {
    return {
      shippingService: "UPSGround",
      reason: "Freight-scale parcel → UPS Ground (buyer pays flat rate)",
    };
  }
  return {
    shippingService: "USPSGroundAdvantage",
    reason:
      "Cheapest option → USPS Ground Advantage (flat rate, buyer pays full)",
  };
}

/** Approximate USPS Ground Advantage label cost — buyer pays this (never $0). */
export function estimateBuyerPaidShippingCostUsd(totalOz: number): number {
  const oz = Math.max(1, totalOz);
  if (oz <= 8) return 4.99;
  if (oz <= 16) return 5.99;
  if (oz <= 32) return 7.49;
  if (oz <= 48) return 8.99;
  if (oz <= 80) return 10.99;
  if (oz <= 160) return 14.99;
  if (oz <= 320) return 19.99;
  return 29.99;
}

type CategoryHeuristic = {
  unitOz: number;
  lengthIn: number;
  widthIn: number;
  depthIn: number;
  packageType?: string;
};

/** Compact category defaults — sized for typical retail boxes, not oversized. */
function categoryHeuristic(haystack: string): CategoryHeuristic | null {
  if (
    /\b(vacuum|robot\s*vacuum|roomba|dyson|shark)\b/.test(haystack) ||
    /\bvacuum cleaners?\b/.test(haystack)
  ) {
    return { unitOz: 160, lengthIn: 18, widthIn: 14, depthIn: 5 }; // ~10 lb, tighter than 21×16
  }
  if (/\b(comforter|duvet|bedding|blanket|quilt)\b/.test(haystack)) {
    return { unitOz: 80, lengthIn: 18, widthIn: 14, depthIn: 8 };
  }
  if (/\b(sneaker|shoe|boot)\b/.test(haystack)) {
    return { unitOz: 32, lengthIn: 13, widthIn: 9, depthIn: 5 };
  }
  if (
    /\b(phone|case|cable|charger|earbuds|small\s*electronics)\b/.test(haystack)
  ) {
    return { unitOz: 6, lengthIn: 8, widthIn: 5, depthIn: 2 };
  }
  if (/\b(laptop|monitor|tv)\b/.test(haystack)) {
    return { unitOz: 112, lengthIn: 20, widthIn: 14, depthIn: 5 };
  }
  if (/\b(faucet|tap|kitchen\s*faucet|bath(room)?\s*faucet)\b/.test(haystack)) {
    return { unitOz: 48, lengthIn: 12, widthIn: 8, depthIn: 3 };
  }
  if (
    /\b(flush\s*mount|ceiling\s*light|chandelier|pendant|light\s*fixture|vanity\s*light|sconce)\b/.test(
      haystack,
    )
  ) {
    return { unitOz: 56, lengthIn: 14, widthIn: 14, depthIn: 6 };
  }
  if (/\b(knife|cutlery|utensil)\b/.test(haystack)) {
    return { unitOz: 12, lengthIn: 14, widthIn: 4, depthIn: 2 };
  }
  if (/\b(cookware|pan|skillet|pot)\b/.test(haystack)) {
    return { unitOz: 64, lengthIn: 14, widthIn: 14, depthIn: 5 };
  }
  if (
    /\b(pump|sump|submersible|utility\s*pump|water\s*pump|transfer\s*pump)\b/.test(
      haystack,
    )
  ) {
    return {
      unitOz: 176, // ~11 lb retail boxed utility pump
      lengthIn: 14,
      widthIn: 10,
      depthIn: 10,
      packageType: "Package",
    };
  }
  if (/\b(atv|generator|appliance)\b/.test(haystack)) {
    return {
      unitOz: 480,
      lengthIn: 36,
      widthIn: 24,
      depthIn: 24,
      packageType: "USPSLargePack",
    };
  }
  return null;
}

export function estimatePackageAndShipping(input: {
  title?: string | null;
  productType?: string | null;
  size?: string | null;
  categoryName?: string | null;
  brand?: string | null;
  quantity?: number | null;
  /** Optional raw item-specifics text (e.g. Dimensions aspect). */
  dimensionsText?: string | null;
}): PackageEstimate {
  const haystack = [
    input.title,
    input.productType,
    input.size,
    input.categoryName,
    input.brand,
    input.dimensionsText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const dimSource = [
    input.dimensionsText,
    input.size,
    input.title,
    input.productType,
  ]
    .filter(Boolean)
    .join(" ");

  const qty = Math.max(1, Number(input.quantity) || 1);
  let unitOz = 10;
  let lengthIn = 9;
  let widthIn = 6;
  let depthIn = 3;
  let packageType = "PackageThickEnvelope";
  let dimNote = "default compact parcel";

  const parsed = parseProductDimensionsInches(dimSource);
  const fluidOz = parseFluidOz(
    [input.size, input.title, input.productType].filter(Boolean).join(" "),
  );
  const heuristic = categoryHeuristic(haystack);

  if (parsed) {
    const box = paddedBox(parsed.lengthIn, parsed.widthIn, parsed.depthIn);
    lengthIn = box.lengthIn;
    widthIn = box.widthIn;
    depthIn = box.depthIn;
    // Weight: prefer category typical weight; never declare heavier than dim weight.
    const volOz = volumeWeightOz(lengthIn, widthIn, depthIn);
    const baseOz = heuristic?.unitOz ?? Math.max(6, Math.round(volOz * 0.35));
    unitOz = Math.max(4, Math.min(baseOz, volOz));
    dimNote = `product ${parsed.source} ${parsed.lengthIn}×${parsed.widthIn}×${parsed.depthIn}" + ${PACK_PAD_IN}" pad`;
  } else if (fluidOz != null) {
    unitOz = Math.ceil(fluidOz + 2);
    const box = paddedBox(4.5, 4.5, Math.max(6, fluidOz / 8 + 2), 0.5);
    lengthIn = box.lengthIn;
    widthIn = box.widthIn;
    depthIn = box.depthIn;
    dimNote = `${fluidOz} fl oz bottle, tight sleeve`;
  } else if (heuristic) {
    const box = paddedBox(
      heuristic.lengthIn,
      heuristic.widthIn,
      heuristic.depthIn,
      0.5,
    );
    lengthIn = box.lengthIn;
    widthIn = box.widthIn;
    depthIn = box.depthIn;
    unitOz = heuristic.unitOz;
    if (heuristic.packageType) packageType = heuristic.packageType;
    dimNote = "category-tight box";
  } else {
    // Generic small retail item — stay under oversized flat defaults (10×8×4).
    const box = paddedBox(8, 5, 3, 0.5);
    lengthIn = box.lengthIn;
    widthIn = box.widthIn;
    depthIn = box.depthIn;
    unitOz = 10;
  }

  // Prefer Package when any edge > 0.75" (rare envelope path).
  if (Math.min(lengthIn, widthIn, depthIn) > 0.75 && packageType === "PackageThickEnvelope") {
    packageType = "PackageThickEnvelope";
  }

  const totalOz = Math.max(1, Math.round(unitOz * qty));
  const { lbs, oz } = toLbsOz(totalOz);
  const service = pickService(totalOz, lengthIn);
  const shippingCost = estimateBuyerPaidShippingCostUsd(totalOz);

  return {
    weightLbs: lbs,
    weightOz: oz === 0 && lbs === 0 ? 1 : oz,
    totalOz,
    packageType,
    lengthIn,
    widthIn,
    depthIn,
    measurementSystem: "ENGLISH",
    shippingType: "Flat",
    shippingService: service.shippingService,
    shippingCost,
    shippingPriority: 1,
    weightUnit: "lbs",
    freeShipping: false,
    reason: `${service.reason} · buyer pays $${shippingCost.toFixed(2)} · ${dimNote} → ${lengthIn}×${widthIn}×${depthIn} in`,
  };
}

/**
 * Map estimate onto File Exchange / Seller Hub Create-or-Schedule headers.
 * Prefer PostalCode over Location (official: use one, not both).
 */
export function packageEstimateToCsvValues(
  estimate: PackageEstimate,
  options?: { includeInlineShippingService?: boolean },
): Record<string, string> {
  const includeService = options?.includeInlineShippingService !== false;

  const values: Record<string, string> = {
    WeightMajor: String(estimate.weightLbs),
    WeightMinor: String(estimate.weightOz),
    WeightUnit: estimate.weightUnit,
    "Package weight (lbs)": String(estimate.weightLbs),
    "Package weight (oz)": String(estimate.weightOz),
    PackageType: estimate.packageType,
    MeasurementSystem: estimate.measurementSystem,
    PackageLength: String(estimate.lengthIn),
    PackageWidth: String(estimate.widthIn),
    PackageDepth: String(estimate.depthIn),
    "Package length": String(estimate.lengthIn),
    "Package width": String(estimate.widthIn),
    "Package depth": String(estimate.depthIn),
    ShippingType: estimate.shippingType,
    "Shipping type": estimate.shippingType,
    Duration: "GTC",
  };

  if (includeService) {
    values["Shipping service 1 option"] = estimate.shippingService;
    values["ShippingService-1:Option"] = estimate.shippingService;
    values["Shipping service 1 cost"] = estimate.shippingCost.toFixed(2);
    values["ShippingService-1:Cost"] = estimate.shippingCost.toFixed(2);
    values["Shipping service 1 priority"] = String(estimate.shippingPriority);
    values["ShippingService-1:Priority"] = String(estimate.shippingPriority);
  }

  return values;
}

/** True when seller (or seed) provided usable package weight + box size. */
export function listingHasMeasuredPackage(input: {
  packageWeightLbs?: number | null;
  packageWeightOz?: number | null;
  packageLengthIn?: number | null;
  packageWidthIn?: number | null;
  packageDepthIn?: number | null;
}): boolean {
  const lbs = Number(input.packageWeightLbs);
  const oz = Number(input.packageWeightOz);
  const totalOz =
    (Number.isFinite(lbs) ? lbs : 0) * 16 + (Number.isFinite(oz) ? oz : 0);
  const L = Number(input.packageLengthIn);
  const W = Number(input.packageWidthIn);
  const D = Number(input.packageDepthIn);
  return (
    totalOz >= 1 &&
    Number.isFinite(L) &&
    L > 0 &&
    Number.isFinite(W) &&
    W > 0 &&
    Number.isFinite(D) &&
    D > 0
  );
}

/**
 * Prefer saved listing package fields; fall back to category/title heuristics.
 * Manual/saved values are the source of truth for Calculated shipping.
 */
export function resolveListingPackage(input: {
  title?: string | null;
  productType?: string | null;
  size?: string | null;
  categoryName?: string | null;
  brand?: string | null;
  quantity?: number | null;
  dimensionsText?: string | null;
  packageWeightLbs?: number | null;
  packageWeightOz?: number | null;
  packageLengthIn?: number | null;
  packageWidthIn?: number | null;
  packageDepthIn?: number | null;
  packageSource?: "auto" | "manual" | null;
}): PackageEstimate & { fromSaved: boolean } {
  const estimate = estimatePackageAndShipping(input);
  if (!listingHasMeasuredPackage(input)) {
    return { ...estimate, fromSaved: false };
  }

  const lbs = Math.max(0, Math.floor(Number(input.packageWeightLbs) || 0));
  const ozRaw = Math.max(0, Math.floor(Number(input.packageWeightOz) || 0));
  const totalOz = Math.max(1, lbs * 16 + ozRaw);
  const { lbs: wLbs, oz: wOz } = toLbsOz(totalOz);
  const lengthIn = Math.max(0.5, Number(input.packageLengthIn) || estimate.lengthIn);
  const widthIn = Math.max(0.5, Number(input.packageWidthIn) || estimate.widthIn);
  const depthIn = Math.max(0.5, Number(input.packageDepthIn) || estimate.depthIn);
  const service = pickService(totalOz, lengthIn);
  const shippingCost = estimateBuyerPaidShippingCostUsd(totalOz);
  const measured = input.packageSource === "manual";

  return {
    weightLbs: wLbs,
    weightOz: wOz === 0 && wLbs === 0 ? 1 : wOz,
    totalOz,
    packageType:
      totalOz > 16 || Math.max(lengthIn, widthIn, depthIn) > 12
        ? "Package"
        : estimate.packageType,
    lengthIn,
    widthIn,
    depthIn,
    measurementSystem: "ENGLISH",
    shippingType: "Flat",
    shippingService: service.shippingService,
    shippingCost,
    shippingPriority: 1,
    weightUnit: "lbs",
    freeShipping: false,
    reason: measured
      ? `Measured box · buyer pays $${shippingCost.toFixed(2)} · ${lengthIn}×${widthIn}×${depthIn} in`
      : `Saved package · buyer pays $${shippingCost.toFixed(2)} · ${lengthIn}×${widthIn}×${depthIn} in`,
    fromSaved: true,
  };
}

/** Apply heuristic estimate onto a listing when package fields are empty / still auto. */
export function seedPackageOnListing<T extends {
  packageWeightLbs?: number | null;
  packageWeightOz?: number | null;
  packageLengthIn?: number | null;
  packageWidthIn?: number | null;
  packageDepthIn?: number | null;
  packageSource?: "auto" | "manual";
  shippingService?: string;
  shippingCost?: number | null;
  freeShipping?: boolean;
  title?: string | null;
  productType?: string | null;
  type?: string | null;
  size?: string | null;
  categoryName?: string | null;
  brand?: string | null;
  quantity?: number | null;
}>(listing: T, force = false): T {
  if (!force && listing.packageSource === "manual") return listing;
  if (!force && listingHasMeasuredPackage(listing)) return listing;

  const estimate = estimatePackageAndShipping({
    title: listing.title,
    productType: listing.productType || listing.type,
    size: listing.size,
    categoryName: listing.categoryName,
    brand: listing.brand,
    quantity: listing.quantity,
  });

  return {
    ...listing,
    packageWeightLbs: estimate.weightLbs,
    packageWeightOz: estimate.weightOz,
    packageLengthIn: estimate.lengthIn,
    packageWidthIn: estimate.widthIn,
    packageDepthIn: estimate.depthIn,
    packageSource: "auto",
    shippingService: estimate.shippingService,
    shippingCost: estimate.shippingCost,
    freeShipping: false,
  };
}
