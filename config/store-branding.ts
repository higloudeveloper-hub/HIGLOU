import type { DescriptionTemplateId } from "@/config/description-templates";

export const STORE_BRANDING_DEFAULTS = {
  storeName: "Higlou Store",
  storeNameDisplay: "HIGLOU STORE",
  slogan: "Quality Products • Reliable Service • Shop With Confidence",
  thankYouMessage: "Thank You for Shopping With Higlou Store",
  thankYouSubtext:
    "We carefully inspect and describe every item to provide a reliable purchasing experience.",
  shippingInformation:
    "Orders are packed carefully and typically ship within the configured handling time. Tracking is provided when available.",
  /** Empty — Higlou Store does not advertise returns in listing descriptions. */
  returnPolicyText: "",
  warrantyInformation: "",
  /** When false, description HTML never includes a Returns section. */
  includeReturnsSection: false,
  footerText: "Shop with confidence at Higlou Store.",
  logoUrl: "",
  /** HTML description layout template */
  templateId: "classic" as DescriptionTemplateId,
  colors: {
    headerBackground: "#111111",
    headerText: "#ffffff",
    bodyText: "#1d1d1f",
    accent: "#f4c928",
    panelBackground: "#f7f7f7",
    border: "#e5e5e5",
  },
} as const;

export type StoreBranding = {
  storeName: string;
  storeNameDisplay: string;
  slogan: string;
  thankYouMessage: string;
  thankYouSubtext: string;
  shippingInformation: string;
  returnPolicyText: string;
  warrantyInformation: string;
  includeReturnsSection?: boolean;
  footerText: string;
  logoUrl: string;
  templateId: DescriptionTemplateId;
  colors: {
    headerBackground: string;
    headerText: string;
    accent: string;
    bodyText: string;
    panelBackground: string;
    border: string;
  };
};

export function cloneStoreBranding(
  branding: StoreBranding = STORE_BRANDING_DEFAULTS,
): StoreBranding {
  return {
    ...branding,
    colors: { ...branding.colors },
  };
}
