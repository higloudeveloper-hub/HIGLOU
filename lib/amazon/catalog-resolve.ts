import {
  amazonCatalogQueries,
  pickExactAmazonCatalog,
  pickSoleBarcodeCatalogHit,
  type AmazonCatalogHit,
  type AmazonMatchHints,
} from "@/lib/amazon/catalog-match";
import type { AmazonCatalogSnapshot } from "@/lib/amazon/listing-attributes";
import {
  getAmazonCatalogItem,
  searchAmazonCatalogByIdentifier,
  searchAmazonCatalogForListing,
} from "@/lib/amazon/sp-api";

export type AmazonResolveInput = AmazonMatchHints & {
  upc?: string;
  asin?: string;
};

export type AmazonResolveResult = {
  mode: "existing" | "create";
  asin: string;
  productType: string;
  title: string;
  catalog: AmazonCatalogSnapshot | null;
};

const ATTR_KEYS = [
  "brand",
  "manufacturer",
  "model_number",
  "model_name",
  "part_number",
];

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

function hintsFromListing(listing: AmazonResolveInput): AmazonMatchHints {
  return {
    title: listing.title,
    brand: listing.brand,
    model: listing.model,
    mpn: listing.mpn,
  };
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
  for (const hit of opts.hits.slice(0, 8)) {
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

export async function resolveAmazonCatalogMatch(opts: {
  accessToken: string;
  marketplaceId: string;
  listing: AmazonResolveInput;
}): Promise<AmazonResolveResult> {
  const hints = hintsFromListing(opts.listing);
  const directAsin = String(opts.listing.asin || "")
    .trim()
    .toUpperCase();
  const collected: AmazonCatalogHit[] = [];
  const seen = new Set<string>();
  const addHits = (batch: AmazonCatalogHit[]) => {
    for (const hit of batch) {
      if (!hit.asin || seen.has(hit.asin)) continue;
      seen.add(hit.asin);
      collected.push(hit);
    }
  };

  if (/^[A-Z0-9]{10}$/.test(directAsin)) {
    addHits([
      {
        asin: directAsin,
        title: String(opts.listing.title || ""),
        productType: "PRODUCT",
      },
    ]);
  }

  const barcodeHits = await searchByBarcodes({
    accessToken: opts.accessToken,
    marketplaceId: opts.marketplaceId,
    upc: opts.listing.upc,
  });
  addHits(barcodeHits);

  const queries = amazonCatalogQueries(hints);
  if (queries.length) {
    addHits(
      await searchAmazonCatalogForListing({
        accessToken: opts.accessToken,
        marketplaceId: opts.marketplaceId,
        queries,
      }),
    );
  }

  const createResult = (): AmazonResolveResult => ({
    mode: "create",
    asin: "",
    productType: "PRODUCT",
    title: String(opts.listing.title || ""),
    catalog: null,
  });

  if (!collected.length) return createResult();

  const hydrated = await hydrateHits({
    accessToken: opts.accessToken,
    marketplaceId: opts.marketplaceId,
    hits: collected,
  });
  const barcodeAsins = new Set(barcodeHits.map((hit) => hit.asin));
  const hydratedBarcode = hydrated.hits.filter((hit) => barcodeAsins.has(hit.asin));
  const barcodeMatch =
    pickExactAmazonCatalog(hydratedBarcode, hints) ||
    pickSoleBarcodeCatalogHit(hydratedBarcode, hints);
  const match =
    barcodeMatch || pickExactAmazonCatalog(hydrated.hits, hints);
  if (!match) return createResult();

  const catalog = hydrated.catalogs.get(match.asin) || null;
  return {
    mode: "existing",
    asin: match.asin,
    productType: catalog?.productType || match.productType || "PRODUCT",
    title: catalog?.title || match.title,
    catalog,
  };
}
