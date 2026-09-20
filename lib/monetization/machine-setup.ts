/**
 * Catalog of integrations the Money Machine needs.
 * Status is computed server-side; secrets stay in env / OAuth — never in client bundles.
 */

export type MachineServiceId =
  | "money_engine"
  | "ebay_seller"
  | "amazon_seller"
  | "openai"
  | "google_vision"
  | "keepa"
  | "amazon_associates"
  | "smart_links"
  | "autopilot"
  | "monetization_db"
  | "supabase";

export type MachineServiceStatus =
  | "ready"
  | "connected"
  | "missing"
  | "optional"
  | "warn";

export type MachineHowToStep = {
  title: string;
  detail: string;
};

export type MachineServiceDef = {
  id: MachineServiceId;
  title: string;
  subtitle: string;
  requiredFor: string;
  /** Can the user toggle this module preference in Settings? */
  toggleable: boolean;
  /** Can the user paste a value in Settings (not a full secret key)? */
  configField?: "associate_tag" | null;
  howTo: MachineHowToStep[];
  docsUrl?: string;
};

export const MONEY_MACHINE_SERVICES: MachineServiceDef[] = [
  {
    id: "supabase",
    title: "Supabase",
    subtitle: "Auth, products, and storage",
    requiredFor: "Login, listings, images",
    toggleable: false,
    howTo: [
      { title: "Open your Supabase project", detail: "Use the Higlou Magic Studio project." },
      { title: "Copy URL + anon + service role", detail: "Project Settings → API." },
      { title: "Paste into Vercel env", detail: "NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY." },
    ],
  },
  {
    id: "monetization_db",
    title: "Money tables",
    subtitle: "SQL migration for links & learning",
    requiredFor: "Affiliate links, clicks, autopilot memory, watchlist",
    toggleable: false,
    howTo: [
      { title: "Open SQL Editor", detail: "In Supabase → SQL." },
      { title: "Paste migration", detail: "File: supabase/migrations/20260916_monetization.sql" },
      { title: "Run", detail: "Creates affiliate_*, smart_links, monetization_opportunities." },
    ],
  },
  {
    id: "ebay_seller",
    title: "eBay store",
    subtitle: "OAuth Sell API",
    requiredFor: "Publish listings + sales pulse",
    toggleable: false,
    howTo: [
      { title: "Create eBay developer app", detail: "developer.ebay.com — start sandbox then production." },
      { title: "Set RuName + secrets in Vercel", detail: "EBAY_CLIENT_ID, SECRET, RU_NAME, TOKEN_ENCRYPTION_KEY." },
      { title: "Connect in Settings → Stores", detail: "One click OAuth — Higlou stores refresh token encrypted." },
    ],
    docsUrl: "/settings#ebay-store",
  },
  {
    id: "amazon_seller",
    title: "Amazon Seller",
    subtitle: "SP-API / LWA",
    requiredFor: "Eligibility, fees, Amazon publish, Find Winners depth",
    toggleable: false,
    howTo: [
      { title: "Create SP-API app", detail: "Seller Central → Develop Apps." },
      { title: "Put LWA keys in Vercel", detail: "AMAZON_LWA_CLIENT_ID, CLIENT_SECRET, APP_ID, MARKETPLACE_ID." },
      { title: "Connect in Settings → Stores", detail: "Authorize your selling partner account." },
    ],
    docsUrl: "/settings#amazon-store",
  },
  {
    id: "openai",
    title: "OpenAI",
    subtitle: "Vision + listing brain",
    requiredFor: "AI Draft, titles, descriptions, analysis",
    toggleable: true,
    howTo: [
      { title: "Create an OpenAI key", detail: "platform.openai.com → API keys." },
      { title: "Add to Vercel", detail: "OPENAI_API_KEY (server only — never NEXT_PUBLIC)." },
      { title: "Redeploy", detail: "Env changes need a new production deploy." },
    ],
  },
  {
    id: "google_vision",
    title: "Google Vision OCR",
    subtitle: "Label / packaging text",
    requiredFor: "Better UPC/brand from photos (optional but strong)",
    toggleable: true,
    howTo: [
      { title: "Enable Vision API", detail: "GCP project + billing + Vision API." },
      { title: "Service Account JSON", detail: "Map PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY into Vercel." },
      { title: "Set mode", detail: "GOOGLE_VISION_MODE=fallback (recommended)." },
    ],
  },
  {
    id: "keepa",
    title: "Keepa",
    subtitle: "Amazon demand & price history",
    requiredFor: "Find Winners quality (BSR, drops, sellers)",
    toggleable: true,
    howTo: [
      { title: "Get a Keepa API key", detail: "keepa.com → API." },
      { title: "Add KEEPA_API_KEY to Vercel", detail: "Production + Preview." },
      {
        title: "Keep live scan off Keepa",
        detail:
          "KEEPA_LIVE_ENABLED=false (default). Manual Find uses Keepa; live loop stays free.",
      },
      { title: "Redeploy & manual Find", detail: "Open Find Winners → Manual → Find." },
    ],
    docsUrl: "https://keepa.com/#!api",
  },
  {
    id: "amazon_associates",
    title: "Amazon Associates",
    subtitle: "Affiliate tracking ID",
    requiredFor: "Affiliate links & smart-link destinations",
    toggleable: true,
    configField: "associate_tag",
    howTo: [
      { title: "Join Associates", detail: "affiliate-program.amazon.com (or your country site)." },
      { title: "Copy Tracking ID", detail: "Looks like yourstore-20 — not your Seller ID." },
      { title: "Paste below", detail: "Higlou saves it for tagged Amazon URLs. No self-purchase commissions." },
    ],
    docsUrl: "https://affiliate-program.amazon.com",
  },
  {
    id: "smart_links",
    title: "Smart Links /go",
    subtitle: "Tracked redirects + QR",
    requiredFor: "TikTok / FB / box QR traffic",
    toggleable: true,
    howTo: [
      { title: "Turn on Smart Links", detail: "Toggle below + SMART_LINKS_ENABLED on Vercel." },
      { title: "Create from Money Card", detail: "After Associate tag is set." },
      { title: "Share /go/id or QR", detail: "Clicks are logged; destination stays Amazon with your tag." },
    ],
  },
  {
    id: "money_engine",
    title: "Money Engine",
    subtitle: "Master switch",
    requiredFor: "Money Center, scores, recommendations",
    toggleable: true,
    howTo: [
      { title: "Enable on Vercel", detail: "MONEY_ENGINE_ENABLED=true (already on if you activated flags)." },
      { title: "Open Money Center", detail: "Sidebar → Money Center." },
      { title: "Feed with Find Winners", detail: "Scan markets, then Autopilot ranks them." },
    ],
    docsUrl: "/money",
  },
  {
    id: "autopilot",
    title: "Autopilot",
    subtitle: "One-button money queue",
    requiredFor: "Rank & learn without blind publish",
    toggleable: true,
    howTo: [
      { title: "Fill the ledger", detail: "Find Winners live scan first." },
      { title: "Arm Autopilot", detail: "Money Center → ENCENDIDO → Run cycle." },
      { title: "Act on the queue", detail: "Import / publish yourself — pilot does not buy alone (v1)." },
    ],
    docsUrl: "/money",
  },
];

export type MoneyMachinePrefs = {
  moneyEngine: boolean;
  affiliateEngine: boolean;
  smartLinks: boolean;
  moneyScore: boolean;
  autopilot: boolean;
  openaiPref: boolean;
  visionPref: boolean;
  keepaPref: boolean;
  associateTag: string;
  associateMarketplace: string;
};

export const DEFAULT_MONEY_MACHINE_PREFS: MoneyMachinePrefs = {
  moneyEngine: true,
  affiliateEngine: true,
  smartLinks: true,
  moneyScore: true,
  autopilot: true,
  openaiPref: true,
  visionPref: true,
  keepaPref: true,
  associateTag: "",
  associateMarketplace: "US",
};
