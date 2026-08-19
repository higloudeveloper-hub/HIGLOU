import { parseAmazonLink } from "@/lib/amazon/asin";
import { nanoid } from "nanoid";
import { toEbayListingTitle } from "@/lib/ebay/listing-helpers";
import { upgradeAmazonImage } from "@/lib/amazon/parse-product";

export type AmazonImportImage = {
  publicUrl: string;
  storagePath: string;
  fileName: string;
  sortOrder: number;
  isPrimary: boolean;
  mimeType: string;
  sizeBytes: number;
};

export type AmazonImportDraft = {
  asin: string;
  amazonUrl: string;
  title: string;
  brand: string;
  price: number | null;
  upc: string;
  features: string[];
  sku: string;
  images: AmazonImportImage[];
};

function remotePhoto(url: string, asin: string, index: number): AmazonImportImage {
  return {
    publicUrl: url,
    storagePath: "",
    fileName: `${asin}-${index + 1}.jpg`,
    sortOrder: index,
    isPrimary: index === 0,
    mimeType: "image/jpeg",
    sizeBytes: 0,
  };
}

function httpsPhoto(raw: string): string {
  let value = String(raw || "").trim().replace(/&amp;/g, "&");
  if (value.startsWith("//")) value = `https:${value}`;
  if (!value) return "";
  return upgradeAmazonImage(value) || (/^https:\/\//i.test(value) ? value : "");
}

/**
 * Scrape the Amazon product, host photos in Higlou when possible, and
 * fall back to Amazon CDN URLs so import never dies on a photo mirror miss.
 */
export async function importAmazonCatalogProduct(opts: {
  url: string;
  userId: string;
  pageOrigin: string;
  fallbackTitle?: string;
  fallbackBrand?: string;
  fallbackImageUrl?: string;
  fallbackPrice?: number | null;
}): Promise<AmazonImportDraft> {
  const { fetchAmazonProduct } = await import("@/lib/amazon/fetch-product");
  const { mirrorAmazonImages } = await import("@/lib/amazon/mirror-images");

  let product: Awaited<ReturnType<typeof fetchAmazonProduct>> | null = null;
  try {
    product = await fetchAmazonProduct(opts.url, {
      pageOrigin: opts.pageOrigin,
    });
  } catch (error) {
    const fallbackImage = httpsPhoto(opts.fallbackImageUrl || "");
    const title =
      toEbayListingTitle(opts.fallbackTitle || "") ||
      opts.fallbackBrand ||
      "";
    if (!title && !fallbackImage) throw error;
    const parsed = parseAmazonLink(opts.url);
    const asin = parsed?.asin || "UNKNOWN";
    return {
      asin,
      amazonUrl: parsed?.canonicalUrl || `https://www.amazon.com/dp/${asin}`,
      title: title || asin,
      brand: opts.fallbackBrand || "",
      price: opts.fallbackPrice ?? null,
      upc: "",
      features: [],
      sku: `AMZ-${asin}`,
      images: fallbackImage ? [remotePhoto(fallbackImage, asin, 0)] : [],
    };
  }

  let mirrored: Array<{
    publicUrl: string;
    storagePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }> = [];
  try {
    mirrored = await mirrorAmazonImages({
      imageUrls: product.imageUrls,
      userId: opts.userId,
      asin: product.asin,
    });
  } catch {
    mirrored = [];
  }

  const images = mirrored.length
    ? mirrored.map((img, index) => ({
        publicUrl: img.publicUrl,
        storagePath: img.storagePath,
        fileName: img.fileName,
        sortOrder: index,
        isPrimary: index === 0,
        mimeType: img.mimeType,
        sizeBytes: img.sizeBytes,
      }))
    : [
        ...product.imageUrls.map(httpsPhoto).filter(Boolean),
        httpsPhoto(opts.fallbackImageUrl || ""),
      ]
        .filter((url, index, all) => url && all.indexOf(url) === index)
        .slice(0, 12)
        .map((url, index) => remotePhoto(url, product.asin, index));

  if (!images.length) {
    throw new Error(
      "Amazon photos could not be saved. Drop the photos instead, or try the link again.",
    );
  }

  return {
    asin: product.asin,
    amazonUrl: product.url,
    title:
      toEbayListingTitle(product.title) ||
      toEbayListingTitle(opts.fallbackTitle || "") ||
      product.brand ||
      product.asin,
    brand: product.brand || opts.fallbackBrand || "",
    price: product.price ?? opts.fallbackPrice ?? null,
    upc: product.upc,
    features: product.features,
    sku: `AMZ-${product.asin}`,
    images,
  };
}

export function toWizardImages(images: AmazonImportImage[]) {
  return images.map((img, index) => ({
    id: nanoid(),
    url: img.publicUrl,
    storagePath: img.storagePath,
    fileName: img.fileName,
    sortOrder: img.sortOrder ?? index,
    isPrimary: img.isPrimary ?? index === 0,
    mimeType: img.mimeType,
    sizeBytes: img.sizeBytes,
  }));
}
