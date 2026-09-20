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
  buildExactSourcingQuery,
  filterSameProductOffers,
  isSameProductOffer,
} from "@/lib/sourcing/same-product";
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

function isGenericSearchLink(offer: CheapSourceOffer): boolean {
  return (
    offer.matchedBy === "link" ||
    /^Search (Alibaba|AliExpress):/i.test(offer.title) ||
    /trade\/search|wholesale-/i.test(offer.url)
  );
}

/**
 * Vision identity → factory/direct comps for the SAME SKU only.
 * Broad category junk is filtered out; search links stay separate.
 */
export async function findCheaperSources(opts: {
  title: string;
  brand?: string;
  mpn?: string;
  upc?: string;
  imageUrl?: string;
  buyPrice?: number | null;
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
    warnings.push("Sin foto — búsqueda solo por marca/modelo.");
  }

  const brandLabel = brand || identity.brandHints[0] || "";
  const hints = {
    title,
    brand: brandLabel,
    model: mpn,
    mpn,
    upc: opts.upc,
    visionModels: identity.modelHints,
  };

  const { primary, alternates } = buildExactSourcingQuery(hints);
  const query = primary;
  if (!mpn && !identity.modelHints.length) {
    warnings.push(
      "Sin MPN/modelo claro — solo se muestran coincidencias muy fuertes de título.",
    );
  }

  // Try primary then alternate queries until we have same-SKU hits.
  let rawFactory: CheapSourceOffer[] = [];
  const queriesTried = [query, ...alternates].filter(Boolean).slice(0, 3);
  for (const q of queriesTried) {
    const [alibaba, aliexpress] = await Promise.all([
      searchAlibabaOffers(q).catch(() => [] as CheapSourceOffer[]),
      searchAliExpressOffers(q).catch(() => [] as CheapSourceOffer[]),
    ]);
    rawFactory = [...rawFactory, ...alibaba, ...aliexpress];
    const sameCheck = filterSameProductOffers(
      rawFactory.filter((o) => !isGenericSearchLink(o)),
      hints,
    );
    if (sameCheck.length >= 2) break;
  }

  const exactFactory = filterSameProductOffers(
    rawFactory.filter((o) => !isGenericSearchLink(o)),
    hints,
  ).map((o) => ({
    platform: o.platform,
    title: o.title,
    url: o.url,
    price: o.price,
    currency: o.currency,
    moq: o.moq,
    imageUrl: o.imageUrl,
    matchedBy: o.matchedBy,
    landedEstimate: o.landedEstimate,
    saveVsBuy: o.saveVsBuy,
  }));

  // Vision pages — only if page title also looks like the same SKU.
  const webMatches: CheapSourceOffer[] = identity.matchingPages
    .filter((p) => {
      const u = p.url.toLowerCase();
      if (
        !/alibaba|aliexpress|1688|made-in-china|globalsources|dhgate/i.test(u)
      ) {
        return false;
      }
      return isSameProductOffer(p.title || p.url, hints).ok;
    })
    .slice(0, 3)
    .map((p) => ({
      platform: /alibaba|1688/i.test(p.url)
        ? ("alibaba" as const)
        : ("aliexpress" as const),
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

  // Tool links (not products) — always available for manual verify.
  const toolLinks: CheapSourceOffer[] = [
    {
      platform: "alibaba",
      title: `Buscar en Alibaba: ${query}`,
      url: alibabaSearchUrl(query),
      price: null,
      currency: "USD",
      moq: null,
      imageUrl: null,
      matchedBy: "link",
      landedEstimate: null,
      saveVsBuy: null,
    },
    {
      platform: "aliexpress",
      title: `Buscar en AliExpress: ${query}`,
      url: aliexpressSearchUrl(query),
      price: null,
      currency: "USD",
      moq: null,
      imageUrl: null,
      matchedBy: "link",
      landedEstimate: null,
      saveVsBuy: null,
    },
    {
      platform: "brand",
      title: brandLabel
        ? `Contactar ${brandLabel} / distribuidor oficial`
        : "Buscar marca / distribuidor oficial",
      url: brandDirectSearchUrl(brandLabel || query, query),
      price: null,
      currency: "USD",
      moq: null,
      imageUrl: null,
      matchedBy: "link",
      landedEstimate: null,
      saveVsBuy: null,
    },
  ];
  if (imageUrl) {
    toolLinks.push({
      platform: "google_lens",
      title: "Google Lens — misma foto",
      url: googleLensUrl(imageUrl),
      price: null,
      currency: "USD",
      moq: null,
      imageUrl,
      matchedBy: "vision",
      landedEstimate: null,
      saveVsBuy: null,
    });
  }

  let offers = withSavings([...exactFactory, ...webMatches], buyPrice);
  offers = offers.sort((a, b) => {
    const as = a.saveVsBuy ?? -1;
    const bs = b.saveVsBuy ?? -1;
    if (bs !== as) return bs - as;
    return (a.price ?? 9e9) - (b.price ?? 9e9);
  });

  if (!offers.length) {
    warnings.push(
      "No hay coincidencia exacta de SKU en los resultados scrapeados. Usa los links de búsqueda con marca+modelo.",
    );
  }

  const bestSave =
    offers.map((o) => o.saveVsBuy).find((n) => n != null && n > 0) ?? null;

  const searchLinks = toolLinks.map((t) => ({
    platform: t.platform,
    label:
      t.platform === "alibaba"
        ? "Buscar en Alibaba"
        : t.platform === "aliexpress"
          ? "Buscar en AliExpress"
          : t.platform === "brand"
            ? brandLabel
              ? `Marca ${brandLabel}`
              : "Marca / distribuidor"
            : "Google Lens",
    url: t.url,
  }));

  return {
    query,
    identity: {
      ...identity,
      brandHints: brandLabel
        ? [brandLabel, ...identity.brandHints]
        : identity.brandHints,
      modelHints: mpn
        ? [mpn, ...identity.modelHints]
        : identity.modelHints,
      searchPhrases: [query, ...alternates],
    },
    buyPrice,
    sellPrice,
    // Exact SKU hits first; tool/search links appended for manual check.
    offers: [...offers.slice(0, 8), ...toolLinks],
    bestSave,
    searchLinks,
    warnings,
  };
}
