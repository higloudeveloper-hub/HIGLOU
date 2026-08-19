import {
  amazonCatalogQueries,
  extractModelCode,
  pickExactAmazonCatalog,
  pickSoleBarcodeCatalogHit,
  pickTitleAmazonCatalog,
  type AmazonCatalogHit,
  type AmazonMatchHints,
} from "@/lib/amazon/catalog-match";
import type { AmazonCatalogSnapshot } from "@/lib/amazon/listing-attributes";
import { amazonAsinFromListing } from "@/lib/amazon/asin";
import { searchAmazonWinnersPage } from "@/lib/amazon/fetch-search";
import {
  getAmazonCatalogItem,
  searchAmazonCatalogByIdentifier,
  searchAmazonCatalogForListing,
} from "@/lib/amazon/sp-api";

export type AmazonResolveInput = AmazonMatchHints & {
  upc?: string;
  asin?: string;
  amazonAsin?: string;
  sku?: string;
  description?: string;
  itemSpecifics?: Array<{ label?: string; key?: string; value?: string }>;
  imageLabels?: string[];
};

export type AmazonResolveResult = {
  mode: "existing" | "none";
  asin: string;
  productType: string;
  title: string;
  catalog: AmazonCatalogSnapshot | null;
  imageUrl?: string;
  query?: string;
};

const ATTR_KEYS = [
  "brand",
  "manufacturer",
  "model_number",
  "model_name",
  "part_number",
];

const MPN_SPECIFIC_RE =
  /^(mpn|model|part\s*number|manufacturer\s*part|catalog\s*number|item\s*model)/i;

export function barcodeSearchKeys(
  upc: string,
): Array<{ identifier: string; identifierType: "UPC" | "EAN" | "GTIN" }> {
  const digits = String(upc || "").replace(/\D/g, "");
  const keys: Array<{ identifier: string; identifierType: "UPC" | "EAN" | "GTIN" }> =
    [];
  const add = (
    identifier: string,
    identifierType: "UPC" | "EAN" | "GTIN",
  ) => {
    if (!identifier) return;
    if (keys.some((row) => row.identifier === identifier && row.identifierType === identifierType)) {
      return;
    }
    keys.push({ identifier, identifierType });
  };
  if (digits.length === 12) {
    add(digits, "UPC");
    add(`0${digits}`, "EAN");
  } else if (digits.length === 13) {
    add(digits, "EAN");
    if (digits.startsWith("0")) add(digits.slice(1), "UPC");
  } else if (digits.length === 14) {
    add(digits, "GTIN");
  }
  return keys;
}

export function amazonCatalogFactTexts(
  attributes: Record<string, unknown> | undefined,
): string[] {
  const texts: string[] = [];
  const walk = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === "object") {
      const row = value as Record<string, unknown>;
      if (typeof row.value === "string" && row.value.length <= 40) {
        texts.push(row.value);
      }
      Object.values(row).forEach(walk);
    }
  };
  const attrs = attributes || {};
  for (const key of ATTR_KEYS) walk(attrs[key]);
  return [...new Set(texts)];
}

export function enrichHitWithCatalog(
  hit: AmazonCatalogHit,
  catalog: AmazonCatalogSnapshot,
): AmazonCatalogHit {
  return {
    asin: catalog.asin || hit.asin,
    title: catalog.title || hit.title,
    productType: catalog.productType || hit.productType,
    identifiers: [
      ...new Set([
        ...(hit.identifiers || []),
        ...amazonCatalogFactTexts(catalog.attributes),
      ]),
    ],
  };
}

export function mpnFromItemSpecifics(
  specifics?: Array<{ label?: string; key?: string; value?: string }>,
): string {
  for (const row of specifics || []) {
    const label = String(row.label || row.key || "").replace(/^C:/, "").trim();
    if (!MPN_SPECIFIC_RE.test(label)) continue;
    const value = String(row.value || "").trim();
    if (value) return value;
  }
  return "";
}

export function catalogHintsFromListing(
  listing: AmazonResolveInput,
): AmazonMatchHints {
  const specificMpn = mpnFromItemSpecifics(listing.itemSpecifics);
  const blob = [
    listing.model,
    listing.mpn,
    specificMpn,
    listing.title,
    listing.description,
    listing.sku,
    ...(listing.imageLabels || []),
  ]
    .filter(Boolean)
    .join(" ");
  const extracted = extractModelCode(blob);
  const modelField = String(listing.model || "").trim();
  const modelLooksLikePhrase = /\s/.test(modelField);
  return {
    title: listing.title,
    brand: listing.brand,
    model: modelLooksLikePhrase ? extracted || modelField : modelField,
    mpn: String(listing.mpn || "").trim() || specificMpn || extracted,
  };
}

export function pickResolvedAmazonCatalog(
  hits: AmazonCatalogHit[],
  hints: AmazonMatchHints,
  barcodeHits: AmazonCatalogHit[] = [],
): AmazonCatalogHit | null {
  const barcodeMatch =
    pickExactAmazonCatalog(barcodeHits, hints) ||
    pickSoleBarcodeCatalogHit(barcodeHits, hints);
  return (
    barcodeMatch ||
    pickExactAmazonCatalog(hits, hints) ||
    pickTitleAmazonCatalog(hits, hints)
  );
}

function winnerHitsToCatalog(
  rows: Array<{ asin?: string; title?: string }>,
): AmazonCatalogHit[] {
  return rows
    .map((row) => ({
      asin: String(row.asin || "").toUpperCase(),
      title: String(row.title || ""),
      productType: "PRODUCT",
    }))
    .filter((row) => /^[A-Z0-9]{10}$/.test(row.asin));
}

async function searchByBarcodes(opts: {
  accessToken: string;
  marketplaceId: string;
  upc?: string;
}): Promise<AmazonCatalogHit[]> {
  const keys = barcodeSearchKeys(opts.upc || "");
  const hits: AmazonCatalogHit[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    try {
      const batch = await searchAmazonCatalogByIdentifier({
        accessToken: opts.accessToken,
        marketplaceId: opts.marketplaceId,
        identifier: key.identifier,
        identifierType: key.identifierType,
      });
      for (const hit of batch) {
        if (seen.has(hit.asin)) continue;
        seen.add(hit.asin);
        hits.push(hit);
      }
    } catch {
      /* a bad barcode variant should not stop brand/model search */
    }
  }
  return hits;
}

async function searchRetailCatalogHits(queries: string[]): Promise<AmazonCatalogHit[]> {
  const seen = new Set<string>();
  const hits: AmazonCatalogHit[] = [];
  for (const query of queries.slice(0, 3)) {
    try {
      const page = await searchAmazonWinnersPage({
        keywords: query,
        sort: "featured",
      });
      for (const hit of winnerHitsToCatalog(page)) {
        if (seen.has(hit.asin)) continue;
        seen.add(hit.asin);
        hits.push(hit);
      }
    } catch {
      /* retail HTML search is a fallback; Catalog Items remains the source of truth */
    }
    if (hits.length >= 8) break;
  }
  return hits;
}

async function hydrateHits(opts: {
  accessToken: string;
  marketplaceId: string;
  hits: AmazonCatalogHit[];
}): Promise<{
  hits: AmazonCatalogHit[];
  catalogs: Map<string, AmazonCatalogSnapshot>;
}> {
  const catalogs = new Map<string, AmazonCatalogSnapshot>();
  const hits: AmazonCatalogHit[] = [];
  for (const hit of opts.hits.slice(0, 12)) {
    const catalog = await getAmazonCatalogItem({
      accessToken: opts.accessToken,
      marketplaceId: opts.marketplaceId,
      asin: hit.asin,
    });
    if (!catalog) {
      hits.push(hit);
      continue;
    }
    catalogs.set(catalog.asin, catalog);
    hits.push(enrichHitWithCatalog(hit, catalog));
  }
  return { hits, catalogs };
}

function resultFromMatch(
  match: AmazonCatalogHit,
  catalogs: Map<string, AmazonCatalogSnapshot>,
  query: string,
): AmazonResolveResult {
  const catalog = catalogs.get(match.asin) || null;
  return {
    mode: "existing",
    asin: match.asin,
    productType: catalog?.productType || match.productType || "PRODUCT",
    title: catalog?.title || match.title,
    catalog,
    imageUrl: catalog?.images?.[0] || "",
    query,
  };
}

export async function resolveAmazonCatalogMatch(opts: {
  accessToken: string;
  marketplaceId: string;
  listing: AmazonResolveInput;
}): Promise<AmazonResolveResult> {
  const hints = catalogHintsFromListing(opts.listing);
  const queries = amazonCatalogQueries(hints);
  const primaryQuery = queries[0] || String(opts.listing.title || "");
  const importedAsin = amazonAsinFromListing(opts.listing);
  if (importedAsin) {
    const catalog = await getAmazonCatalogItem({
      accessToken: opts.accessToken,
      marketplaceId: opts.marketplaceId,
      asin: importedAsin,
    });
    if (!catalog) {
      return {
        mode: "none",
        asin: importedAsin,
        productType: "PRODUCT",
        title: String(opts.listing.title || ""),
        catalog: null,
        query: primaryQuery,
      };
    }
    return {
      mode: "existing",
      asin: catalog.asin || importedAsin,
      productType: catalog.productType || "PRODUCT",
      title: catalog.title || String(opts.listing.title || ""),
      catalog,
      imageUrl: catalog.images?.[0] || "",
      query: primaryQuery,
    };
  }

  const collected: AmazonCatalogHit[] = [];
  const seen = new Set<string>();
  const addHits = (batch: AmazonCatalogHit[]) => {
    for (const hit of batch) {
      if (!hit.asin || seen.has(hit.asin)) continue;
      seen.add(hit.asin);
      collected.push(hit);
    }
  };

  const barcodeHits = await searchByBarcodes({
    accessToken: opts.accessToken,
    marketplaceId: opts.marketplaceId,
    upc: opts.listing.upc,
  });
  addHits(barcodeHits);

  if (queries.length) {
    addHits(
      await searchAmazonCatalogForListing({
        accessToken: opts.accessToken,
        marketplaceId: opts.marketplaceId,
        queries,
      }),
    );
  }

  const noneResult = (): AmazonResolveResult => ({
    mode: "none",
    asin: "",
    productType: "PRODUCT",
    title: String(opts.listing.title || ""),
    catalog: null,
    query: primaryQuery,
  });

  const catalogs = new Map<string, AmazonCatalogSnapshot>();
  const mergeHydrated = async (hits: AmazonCatalogHit[]) => {
    const extra = await hydrateHits({
      accessToken: opts.accessToken,
      marketplaceId: opts.marketplaceId,
      hits,
    });
    for (const [asin, catalog] of extra.catalogs) catalogs.set(asin, catalog);
    return extra.hits;
  };

  let hydratedHits = collected.length
    ? await mergeHydrated(collected)
    : [];
  const barcodeAsins = new Set(barcodeHits.map((hit) => hit.asin));
  const pickFrom = (hits: AmazonCatalogHit[]) =>
    pickResolvedAmazonCatalog(
      hits,
      hints,
      hits.filter((hit) => barcodeAsins.has(hit.asin)),
    );

  let match = pickFrom(hydratedHits);
  if (!match) {
    const retail = await searchRetailCatalogHits(queries);
    const fresh = retail.filter((hit) => !seen.has(hit.asin));
    addHits(fresh);
    if (fresh.length) {
      hydratedHits = [...hydratedHits, ...(await mergeHydrated(fresh))];
      match = pickFrom(hydratedHits);
    }
  }

  if (!match) return noneResult();
  return resultFromMatch(match, catalogs, primaryQuery);
}
