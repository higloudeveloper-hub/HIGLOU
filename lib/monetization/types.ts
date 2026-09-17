import type { EligibilityStatus } from "@/lib/opportunity/types";

/** Internal monetization recommendation — never a blind auto-action. */
export type MonetizationRecommendation =
  | "SELL"
  | "AFFILIATE"
  | "BOTH"
  | "WATCH"
  | "SKIP";

export type MonetizationChannelId =
  | "amazon_seller"
  | "ebay_seller"
  | "amazon_affiliate";

export type DataAvailability =
  | "known"
  | "estimated"
  | "unknown"
  | "insufficient"
  | "api_required";

export type MoneyValue = {
  value: number | null;
  availability: DataAvailability;
  label?: string;
};

export type SellChannelSnapshot = {
  available: boolean;
  status: EligibilityStatus | "AVAILABLE" | "NOT_CONNECTED" | "UNKNOWN";
  message: string;
  salePrice: MoneyValue;
  cost: MoneyValue;
  fees: MoneyValue;
  shipping: MoneyValue;
  packing: MoneyValue;
  netProfit: MoneyValue;
  roi: MoneyValue;
  margin: MoneyValue;
};

export type AffiliateChannelSnapshot = {
  available: boolean;
  configured: boolean;
  provider: string;
  asin: string | null;
  destinationUrl: string | null;
  /** Never invent commission — Unknown until verified by program reports. */
  estimatedCommission: MoneyValue;
  message: string;
};

export type MonetizationChannels = {
  amazonSeller: SellChannelSnapshot;
  ebaySeller: SellChannelSnapshot;
  amazonAffiliate: AffiliateChannelSnapshot;
};

export type MonetizationReason = {
  ok: boolean;
  text: string;
};

export type MoneyScoreResult = {
  score: number | null;
  availability: "known" | "insufficient";
  factors: Array<{
    id: string;
    points: number | null;
    max: number;
    note: string;
  }>;
};

export type MonetizationDecision = {
  recommendation: MonetizationRecommendation;
  confidence: number;
  moneyScore: number | null;
  moneyScoreAvailability: MoneyScoreResult["availability"];
  reasons: MonetizationReason[];
  channels: MonetizationChannels;
  warnings: string[];
  primaryAction: string;
  secondaryAction: string | null;
};

/** Inputs for decision engine — only real or explicitly unknown fields. */
export type MonetizationInput = {
  productId?: string | null;
  title?: string | null;
  brand?: string | null;
  asin?: string | null;
  upc?: string | null;
  /** Sell price on eBay / primary listing price */
  ebayPrice?: number | null;
  /** Amazon retail / buy price when used as cost or Amazon lane */
  amazonPrice?: number | null;
  /** Explicit product cost / COGS when known */
  cost?: number | null;
  amazonFees?: number | null;
  ebayFees?: number | null;
  shipping?: number | null;
  packing?: number | null;
  amazonEligibility?: EligibilityStatus | null;
  amazonEligibilityMessage?: string | null;
  ebayConnected?: boolean | null;
  amazonSellerConnected?: boolean | null;
  quantity?: number | null;
  demandScore?: number | null;
  sellerCount?: number | null;
  competitionNote?: string | null;
  opportunityScore?: number | null;
  opportunityVerdict?: string | null;
  soldVerified?: boolean | null;
  affiliateTagConfigured?: boolean | null;
  affiliateEngineEnabled?: boolean | null;
  moneyScoreEnabled?: boolean | null;
};

/** Multi-provider abstractions (Phase 2+) — defined early, not Amazon-only. */
export type AffiliateProviderId = "amazon_associates" | string;

export type AffiliateProvider = {
  id: AffiliateProviderId;
  name: string;
  marketplace: string;
};

export type AffiliateLinkRecord = {
  id: string;
  providerId: AffiliateProviderId;
  productId: string | null;
  asin: string | null;
  destinationUrl: string;
  associateTag: string;
  campaignId: string | null;
  source: string | null;
  trackingId: string;
};

export type AffiliateCampaign = {
  id: string;
  name: string;
  providerId: AffiliateProviderId;
  source: string | null;
};

export type AffiliateClick = {
  id: string;
  linkId: string;
  source: string | null;
  campaignId: string | null;
  createdAt: string;
};

export type AffiliateConversion = {
  id: string;
  linkId: string;
  revenue: number | null;
  attributed: boolean;
  note: string;
};

export type MonetizationOpportunity = {
  productId: string | null;
  asin: string | null;
  recommendation: MonetizationRecommendation;
  moneyScore: number | null;
  decision: MonetizationDecision;
};
