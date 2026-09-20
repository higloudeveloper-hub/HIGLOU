import { creditCost, type CreditActionId } from "@/lib/credits/costs";

/** Soft Pro locks — free users can browse; wow moments ask for unlock. */
export type ProFeatureId =
  | "facebook_carousel"
  | "cheap_source"
  | "batch_import"
  | "ai_analyze";

export type ProFeature = {
  id: ProFeatureId;
  title: string;
  tease: string;
  benefits: string[];
  /** One-feature unlock in credits (quick). */
  unlockCredits: number;
};

export const PRO_FEATURES: Record<ProFeatureId, ProFeature> = {
  facebook_carousel: {
    id: "facebook_carousel",
    title: "Carrusel & Vitrina",
    tease: "Estás a un paso de publicar packs que venden. Esto es Pro.",
    benefits: [
      "Publicá 2–10 productos en un solo post",
      "Vitrina con portada lista para boost",
      "Preview y links afiliados en tu Page",
    ],
    unlockCredits: 25,
  },
  cheap_source: {
    id: "cheap_source",
    title: "Suministro barato",
    tease: "Encontraste el winner. Ahora bajá el costo — función Pro.",
    benefits: [
      "Buscá el mismo SKU más barato",
      "Alibaba / AliExpress / marca",
      "Más keep en cada listing",
    ],
    unlockCredits: 20,
  },
  batch_import: {
    id: "batch_import",
    title: "Import masivo",
    tease: "Varios winners listos. Importarlos juntos es Pro.",
    benefits: [
      "Importá varios de una vez",
      "Drafts listos en tu tienda",
      "Ahorrá clicks en cada ronda",
    ],
    unlockCredits: 20,
  },
  ai_analyze: {
    id: "ai_analyze",
    title: "Análisis AI",
    tease: "El listing se escribe solo. Análisis AI es Pro.",
    benefits: [
      "Título, specs y descripción",
      "Categoría eBay sugerida",
      "Listings listos más rápido",
    ],
    unlockCredits: 30,
  },
};

/** Full Pro plan — unlocks every feature + credits pack path. */
export const PRO_PLAN = {
  id: "pro" as const,
  title: "Plan Pro",
  unlockCredits: 80,
  packId: "pro" as const,
  benefits: [
    "Carrusel & Vitrina en Facebook",
    "Suministro barato ilimitado",
    "Import masivo de winners",
    "Análisis AI de listings",
    "+400 créditos al activar el pack",
  ],
};

export function actionLabel(action: CreditActionId): string {
  const labels: Record<CreditActionId, string> = {
    winners_scan: "Escanear winners",
    market_claim: "Agregar a tu tienda",
    analyze_product: "Análisis AI",
    affiliate_link: "Crear link afiliado",
    facebook_share: "Publicar en Facebook",
  };
  return labels[action] || action;
}

export function actionCostCopy(action: CreditActionId): string {
  const n = creditCost(action);
  return `${n} crédito${n === 1 ? "" : "s"}`;
}

export function hasProAccess(
  entitlements: { plan: string; unlockedFeatures: string[] },
  feature: ProFeatureId,
): boolean {
  if (entitlements.plan === "pro") return true;
  return entitlements.unlockedFeatures.includes(feature);
}
