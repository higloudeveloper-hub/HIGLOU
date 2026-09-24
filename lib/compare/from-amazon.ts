import { parseAmazonLink } from "@/lib/amazon/asin";
import { getEbayApplicationAccessToken } from "@/lib/ebay/oauth";
import { keepaProducts } from "@/lib/keepa/finder";
import { buildAmazonAssociatesUrl } from "@/lib/monetization/channels/affiliate";
import { getAmazonAssociateTag } from "@/lib/monetization/affiliate/amazon-associates";
import { analyzeCrossPlatform } from "@/lib/opportunity/cross-platform";
import type { PlatformPriceQuote } from "@/lib/opportunity/cross-platform";
import { isWeakFacebookPictureUrl } from "@/lib/facebook/promo-media";
import { amazonAsinImageCandidates } from "@/lib/amazon/asin-image";

export type CompareOffer = {
  platform: "amazon" | "ebay" | "walmart" | "homedepot";
  label: string;
  price: number | null;
  url: string;
  title: string;
  matchedBy: string;
  saveVsAmazon: number | null;
  isCheaper: boolean;
  affiliate: boolean;
};

export type CompareResult = {
  ok: true;
  asin: string;
  title: string;
  brand: string;
  imageUrl: string;
  amazonPrice: number | null;
  amazonUrl: string;
  offers: CompareOffer[];
  cheaperCount: number;
  bestSave: number | null;
  note: string;
};

function platformLabel(p: PlatformPriceQuote["platform"]): string {
  switch (p) {
    case "amazon":
      return "Amazon";
    case "ebay":
      return "eBay";
    case "walmart":
      return "Walmart";
    case "homedepot":
      return "Home Depot";
    default:
      return p;
  }
}

function productImage(preferred: string, asin: string): string {
  const direct = String(preferred || "").trim();
  if (/^https?:\/\//i.test(direct) && !isWeakFacebookPictureUrl(direct)) {
    return direct;
  }
  // Keepa I/ images land here usually; otherwise first non-weak ASIN candidate
  const strong = amazonAsinImageCandidates(asin).find(
    (u) => !isWeakFacebookPictureUrl(u),
  );
  return strong || direct || "";
}

async function resolveAsinFromInput(input: string): Promise<{
  asin: string;
  canonicalUrl: string;
} | null> {
  const parsed = parseAmazonLink(input);
  if (!parsed) return null;
  if (parsed.asin && /^[A-Z0-9]{10}$/i.test(parsed.asin)) {
    return { asin: parsed.asin.toUpperCase(), canonicalUrl: parsed.canonicalUrl };
  }
  // Short links — follow redirects once
  if (parsed.short) {
    try {
      const res = await fetch(parsed.canonicalUrl || parsed.original, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; HiglouCompare/1.0; +https://higlou.vercel.app)",
        },
      });
      const finalUrl = res.url || parsed.canonicalUrl;
      const again = parseAmazonLink(finalUrl);
      if (again?.asin && /^[A-Z0-9]{10}$/i.test(again.asin)) {
        return {
          asin: again.asin.toUpperCase(),
          canonicalUrl: again.canonicalUrl,
        };
      }
    } catch {
      /* fall through */
    }
  }
  return null;
}

/**
 * Paste an Amazon URL / ASIN → same product quotes on eBay / Walmart / Home Depot.
 * Amazon outbound uses Associate tag when configured (affiliate revenue).
 */
export async function compareAmazonProduct(
  rawInput: string,
  opts?: { pageOrigin?: string },
): Promise<CompareResult | { ok: false; error: string; status: number }> {
  const resolved = await resolveAsinFromInput(rawInput);
  if (!resolved) {
    return {
      ok: false,
      error: "Pegá un link de Amazon o un ASIN válido (10 caracteres).",
      status: 400,
    };
  }

  const { asin } = resolved;
  let snaps: Awaited<ReturnType<typeof keepaProducts>> = [];
  try {
    snaps = await keepaProducts([asin]);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "No pudimos leer el producto en Keepa.",
      status: 502,
    };
  }

  const snap = snaps[0];
  if (!snap) {
    return {
      ok: false,
      error: "No encontramos ese producto. Probá otro link de Amazon.",
      status: 404,
    };
  }

  const amazonPrice = snap.buyBoxPrice ?? snap.newPrice;
  const tag = getAmazonAssociateTag();
  const tagged =
    (tag &&
      buildAmazonAssociatesUrl({
        asin,
        associateTag: tag,
      })) ||
    `https://www.amazon.com/dp/${asin}`;

  const ebayToken = await getEbayApplicationAccessToken();
  const analysis = await analyzeCrossPlatform({
    title: snap.title,
    brand: snap.brand,
    mpn: snap.mpn,
    upc: snap.upc,
    asin,
    sourceMarket: "amazon",
    sourceId: asin,
    sourcePrice: amazonPrice,
    ebayToken: ebayToken || undefined,
    pageOrigin: opts?.pageOrigin,
  });

  const offers: CompareOffer[] = analysis.quotes
    .filter((q) => q.price != null && q.price > 0)
    .map((q) => {
      const save =
        amazonPrice != null && q.price != null && amazonPrice > q.price
          ? Math.round((amazonPrice - q.price) * 100) / 100
          : null;
      const isAmazon = q.platform === "amazon";
      return {
        platform: q.platform,
        label: platformLabel(q.platform),
        price: q.price,
        url: isAmazon ? tagged : q.url || "",
        title: q.title || snap.title,
        matchedBy: q.matchedBy,
        saveVsAmazon: save,
        isCheaper: Boolean(save && save > 0.5),
        affiliate: isAmazon && Boolean(tag),
      };
    })
    .filter((o) => /^https?:\/\//i.test(o.url))
    .sort((a, b) => (a.price ?? 9e9) - (b.price ?? 9e9));

  // Ensure Amazon always appears
  if (!offers.some((o) => o.platform === "amazon")) {
    offers.push({
      platform: "amazon",
      label: "Amazon",
      price: amazonPrice,
      url: tagged,
      title: snap.title,
      matchedBy: "asin",
      saveVsAmazon: null,
      isCheaper: false,
      affiliate: Boolean(tag),
    });
    offers.sort((a, b) => (a.price ?? 9e9) - (b.price ?? 9e9));
  }

  const cheaper = offers.filter((o) => o.isCheaper);
  const bestSave = cheaper.reduce<number | null>((best, o) => {
    if (o.saveVsAmazon == null) return best;
    if (best == null || o.saveVsAmazon > best) return o.saveVsAmazon;
    return best;
  }, null);

  return {
    ok: true,
    asin,
    title: snap.title,
    brand: snap.brand,
    imageUrl: productImage(snap.imageUrl, asin),
    amazonPrice,
    amazonUrl: tagged,
    offers,
    cheaperCount: cheaper.length,
    bestSave,
    note:
      cheaper.length > 0
        ? `Encontramos ${cheaper.length} opción${cheaper.length === 1 ? "" : "es"} más barata${cheaper.length === 1 ? "" : "s"} que Amazon.`
        : "Amazon parece el mejor precio ahora. Revisá de nuevo más tarde.",
  };
}
