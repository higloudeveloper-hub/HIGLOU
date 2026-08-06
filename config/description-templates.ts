import type { StoreBranding } from "@/config/store-branding";

export type DescriptionTemplateId =
  | "classic"
  | "modern"
  | "editorial"
  | "luxury"
  | "fresh";

export interface DescriptionTemplateMeta {
  id: DescriptionTemplateId;
  name: string;
  tagline: string;
  /** Suggested palette when picking this template */
  suggestedColors: StoreBranding["colors"];
}

export const DESCRIPTION_TEMPLATES: DescriptionTemplateMeta[] = [
  {
    id: "classic",
    name: "Classic Commerce",
    tagline: "Dark header · gold accent — trusted marketplace look",
    suggestedColors: {
      headerBackground: "#111111",
      headerText: "#ffffff",
      bodyText: "#1d1d1f",
      accent: "#f4c928",
      panelBackground: "#f7f7f7",
      border: "#e5e5e5",
    },
  },
  {
    id: "modern",
    name: "Modern Clean",
    tagline: "White space · bold accent bar — sharp & minimal",
    suggestedColors: {
      headerBackground: "#0f172a",
      headerText: "#f8fafc",
      bodyText: "#0f172a",
      accent: "#2563eb",
      panelBackground: "#f1f5f9",
      border: "#e2e8f0",
    },
  },
  {
    id: "editorial",
    name: "Editorial",
    tagline: "Magazine layout · refined typography",
    suggestedColors: {
      headerBackground: "#1c1917",
      headerText: "#fafaf9",
      bodyText: "#292524",
      accent: "#b45309",
      panelBackground: "#fafaf9",
      border: "#e7e5e4",
    },
  },
  {
    id: "luxury",
    name: "Luxury",
    tagline: "Navy & champagne — premium boutique feel",
    suggestedColors: {
      headerBackground: "#0b1c2c",
      headerText: "#f5f0e8",
      bodyText: "#142033",
      accent: "#c6a667",
      panelBackground: "#f7f3ec",
      border: "#e6dcc8",
    },
  },
  {
    id: "fresh",
    name: "Fresh Market",
    tagline: "Bright & friendly — home / everyday goods",
    suggestedColors: {
      headerBackground: "#14532d",
      headerText: "#ffffff",
      bodyText: "#14532d",
      accent: "#84cc16",
      panelBackground: "#f0fdf4",
      border: "#dcfce7",
    },
  },
];

export function resolveTemplateId(
  value: string | null | undefined,
): DescriptionTemplateId {
  const id = String(value || "classic").toLowerCase().trim();
  if (DESCRIPTION_TEMPLATES.some((t) => t.id === id)) {
    return id as DescriptionTemplateId;
  }
  return "classic";
}

export function getTemplateMeta(
  id: string | null | undefined,
): DescriptionTemplateMeta {
  const resolved = resolveTemplateId(id);
  return (
    DESCRIPTION_TEMPLATES.find((t) => t.id === resolved) ||
    DESCRIPTION_TEMPLATES[0]
  );
}

/** Named store presets — one-click branding for different shops. */
export interface StorePreset {
  id: string;
  label: string;
  branding: Pick<
    StoreBranding,
    | "storeName"
    | "storeNameDisplay"
    | "slogan"
    | "thankYouMessage"
    | "thankYouSubtext"
    | "shippingInformation"
    | "footerText"
    | "colors"
    | "templateId"
  >;
}

export const STORE_PRESETS: StorePreset[] = [
  {
    id: "higlou",
    label: "Higlou Store",
    branding: {
      storeName: "Higlou Store",
      storeNameDisplay: "HIGLOU STORE",
      slogan: "Quality Products • Reliable Service • Shop With Confidence",
      thankYouMessage: "Thank You for Shopping With Higlou Store",
      thankYouSubtext:
        "We carefully inspect and describe every item to provide a reliable purchasing experience.",
      shippingInformation:
        "Orders are packed carefully and typically ship within the configured handling time. Tracking is provided when available.",
      footerText: "Shop with confidence at Higlou Store.",
      templateId: "classic",
      colors: getTemplateMeta("classic").suggestedColors,
    },
  },
  {
    id: "boutique",
    label: "Boutique Premium",
    branding: {
      storeName: "Boutique Premium",
      storeNameDisplay: "BOUTIQUE PREMIUM",
      slogan: "Curated pieces · Thoughtful details · Elevated everyday",
      thankYouMessage: "Thank you for choosing Boutique Premium",
      thankYouSubtext:
        "Each item is reviewed for quality so you can shop with peace of mind.",
      shippingInformation:
        "Packed with care and shipped promptly. Tracking included when available.",
      footerText: "Elevated finds from Boutique Premium.",
      templateId: "luxury",
      colors: getTemplateMeta("luxury").suggestedColors,
    },
  },
  {
    id: "homehub",
    label: "Home Hub",
    branding: {
      storeName: "Home Hub",
      storeNameDisplay: "HOME HUB",
      slogan: "Better living starts at home",
      thankYouMessage: "Thanks for shopping Home Hub",
      thankYouSubtext:
        "Practical home goods, clearly described from real photos.",
      shippingInformation:
        "We pack securely and ship on schedule. Tracking provided when available.",
      footerText: "Make yourself at home with Home Hub.",
      templateId: "fresh",
      colors: getTemplateMeta("fresh").suggestedColors,
    },
  },
  {
    id: "techclear",
    label: "Tech Clear",
    branding: {
      storeName: "Tech Clear",
      storeNameDisplay: "TECH CLEAR",
      slogan: "Clear specs · Honest condition · Fast shipping",
      thankYouMessage: "Thank you for shopping Tech Clear",
      thankYouSubtext:
        "We focus on accurate details so you know exactly what you’re buying.",
      shippingInformation:
        "Items ship quickly in protective packaging. Tracking when available.",
      footerText: "Clarity you can trust — Tech Clear.",
      templateId: "modern",
      colors: getTemplateMeta("modern").suggestedColors,
    },
  },
  {
    id: "atelier",
    label: "Atelier Market",
    branding: {
      storeName: "Atelier Market",
      storeNameDisplay: "ATELIER MARKET",
      slogan: "Stories in every piece",
      thankYouMessage: "Thank you for visiting Atelier Market",
      thankYouSubtext:
        "Selected inventory with careful presentation and honest notes.",
      shippingInformation:
        "Carefully packed and shipped with tracking when available.",
      footerText: "Discover more at Atelier Market.",
      templateId: "editorial",
      colors: getTemplateMeta("editorial").suggestedColors,
    },
  },
];
