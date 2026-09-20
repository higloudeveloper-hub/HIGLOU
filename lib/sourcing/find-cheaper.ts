import {
  alibabaSearchUrl,
  aliexpressSearchUrl,
  brandDirectSearchUrl,
  googleLensUrl,
  searchAlibabaOffers,
  searchAliExpressOffers,
  type CheapSourceOffer,
  type CheapSourceResult,
} from "@/lib/sourcing/cheap-sources";
import {
  identifyProductFromImage,
  type VisionProductIdentity,
} from "@/lib/sourcing/vision-identity";

function money(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

function withSavings(
  offers: CheapSourceOffer[],
  buyPrice: number | null,
): CheapSourceOffer[] {
  return offers.map((o) => {
    const landed = o.landedEstimate ?? o.price;
    const save =
      buyPrice != null && landed != null && buyPrice > landed
        ? Math.round((buyPrice - landed) * 100) / 100
        : null;
    return { ...o, saveVsBuy: save };
  });
}

/**
 * For a Find Winners hit: Vision identity → Alibaba / AliExpress / brand /
 * Google Lens comps so the seller can source cheaper than Amazon retail.
 */
export async function findCheaperSources(opts: {
  title: string;
  brand?: string;
  mpn?: string;
  upc?: string;
  imageUrl?: string;
  /** Current buy (Amazon / Walmart / etc.). */
  buyPrice?: number | null;
  /** Current sell ask. */
  sellPrice?: number | null;
}): Promise<CheapSourceResult> {
  const title = String(opts.title || "").trim();
  const brand = String(opts.brand || "").trim();
  const mpn = String(opts.mpn || "").trim();
  const imageUrl = String(opts.imageUrl || "").trim();
  const buyPrice = money(opts.buyPrice);
  const sellPrice = money(opts.sellPrice);
  const warnings: string[] = [];

  let identity: VisionProductIdentity = {
    configured: false,
    brandHints: brand ? [brand] : [],
    modelHints: mpn ? [mpn] : [],
    ocrText: "",
    webEntities: [],
    matchingPages: [],
    similarImageUrls: [],
    searchPhrases: [],
    warnings: [],
  };

  if (imageUrl) {
    identity = await identifyProductFromImage({
      imageUrl,
      titleHint: title,
      brandHint: brand,
    });
    warnings.push(...identity.warnings);
  } else {
    warnings.push("No image — searching by title/brand only.");
    identity.searchPhrases = [
      brand && mpn ? `${brand} ${mpn}` : "",
      brand && title
        ? `${brand} ${title.split(/\s+/).slice(0, 5).join(" ")}`
        : title.split(/\s+/).slice(0, 6).join(" "),
    ].filter(Boolean);
  }

  const query =
    identity.searchPhrases[0] ||
    [brand, mpn || title.split(/\s+/).slice(0, 5).join(" ")]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    title;

  const [alibaba, aliexpress] = await Promise.all([
    searchAlibabaOffers(query).catch(() => [] as CheapSourceOffer[]),
    searchAliExpressOffers(query).catch(() => [] as CheapSourceOffer[]),
  ]);

  const webMatches: CheapSourceOffer[] = identity.matchingPages
    .filter((p) => {
      const u = p.url.toLowerCase();
      return (
        /alibaba|aliexpress|1688|made-in-china|globalsources|dhgate/i.test(u) ||
        (brand && u.includes(brand.toLowerCase().replace(/\s+/g, "")))
      );
    })
    .slice(0, 4)
    .map((p) => ({
      platform: /alibaba|1688/i.test(p.url)
        ? ("alibaba" as const)
        : /aliexpress/i.test(p.url)
          ? ("aliexpress" as const)
          : ("web_match" as const),
      title: p.title || "Vision web match",
      url: p.url,
      price: null,
      currency: "USD",
      moq: null,
      imageUrl: null,
      matchedBy: "web_match" as const,
      landedEstimate: null,
      saveVsBuy: null,
    }));

  const brandLabel = identity.brandHints[0] || brand || "brand";
  const brandOffer: CheapSourceOffer = {
    platform: "brand",
    title: `Ask ${brandLabel} / authorized distributor`,
    url: brandDirectSearchUrl(brandLabel, query),
    price: null,
    currency: "USD",
    moq: null,
    imageUrl: null,
    matchedBy: "link",
    landedEstimate: null,
    saveVsBuy: null,
  };

  const lensOffer: CheapSourceOffer | null = imageUrl
    ? {
        platform: "google_lens",
        title: "Google Lens — same product, other sellers",
        url: googleLensUrl(imageUrl),
        price: null,
        currency: "USD",
        moq: null,
        imageUrl,
        matchedBy: "vision",
        landedEstimate: null,
        saveVsBuy: null,
      }
    : null;

  let offers = withSavings(
    [...alibaba, ...aliexpress, ...webMatches, brandOffer, ...(lensOffer ? [lensOffer] : [])],
    buyPrice,
  );

  // Prefer priced factory hits with real savings first.
  offers = offers.sort((a, b) => {
    const as = a.saveVsBuy ?? -1;
    const bs = b.saveVsBuy ?? -1;
    if (bs !== as) return bs - as;
    const ap = a.price ?? Number.POSITIVE_INFINITY;
    const bp = b.price ?? Number.POSITIVE_INFINITY;
    return ap - bp;
  });

  const bestSave =
    offers.map((o) => o.saveVsBuy).find((n) => n != null && n > 0) ?? null;

  const searchLinks = [
    {
      platform: "alibaba" as const,
      label: "Ver en Alibaba",
      url: alibabaSearchUrl(query),
    },
    {
      platform: "aliexpress" as const,
      label: "Ver en AliExpress",
      url: aliexpressSearchUrl(query),
    },
    {
      platform: "brand" as const,
      label: `Buscar ${brandLabel} directo`,
      url: brandDirectSearchUrl(brandLabel, query),
    },
    ...(imageUrl
      ? [
          {
            platform: "google_lens" as const,
            label: "Google Lens",
            url: googleLensUrl(imageUrl),
          },
        ]
      : []),
  ];

  return {
    query,
    identity,
    buyPrice,
    sellPrice,
    offers: offers.slice(0, 14),
    bestSave,
    searchLinks,
    warnings,
  };
}
