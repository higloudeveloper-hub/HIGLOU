export type OpportunityMode = "amazon" | "amazon_to_ebay" | "supplier";

export type EligibilityStatus =
  | "SELLABLE"
  | "APPROVAL_REQUIRED"
  | "RESTRICTED"
  | "CONDITION_RESTRICTED"
  | "UNKNOWN"
  | "API_ERROR";

export type OpportunityGrade =
  | "excellent"
  | "good"
  | "review"
  | "discard";

export type OpportunityReason = {
  ok: boolean;
  text: string;
};

export type OpportunityProduct = {
  asin: string;
  title: string;
  brand: string;
  imageUrl: string;
  upc: string;
  salesRank: number | null;
  salesRankLabel: string;
  browseNodeId: string;
  browseNodeName: string;
  rating: number | null;
  reviewCount: number | null;
  amazonPrice: number | null;
  ebayPrice: number | null;
  ebayCount: number | null;
  opportunity: "now" | "watch" | "thin";
  mode: OpportunityMode;
  eligibility: EligibilityStatus;
  eligibilityMessage: string;
  score: number;
  grade: OpportunityGrade;
  reasons: OpportunityReason[];
  demandScore: number;
  sellerCount: number | null;
  amazonRetail: boolean;
  buyBoxPrice: number | null;
  avgSalesRank90: number | null;
  bsrDrops90: number | null;
  priceVariation90: number | null;
  cost: number | null;
  salePrice: number | null;
  amazonFees: number | null;
  ebayFees: number | null;
  shipping: number | null;
  packing: number | null;
  returnsReserve: number | null;
  netProfit: number | null;
  roi: number | null;
  margin: number | null;
  ebayActiveMedian: number | null;
  ebayActiveLow: number | null;
  ebayActiveCount: number | null;
  ebayListingsAreSold: false;
  keepa: boolean;
};

export type OpportunitySources = {
  keepa: boolean;
  amazonCatalog: boolean;
  amazonFees: boolean;
  ebayLive: boolean;
};

export const OPPORTUNITY_RULES = {
  minNetProfit: 10,
  minRoi: 0.3,
  minMargin: 0.15,
  maxSellers: 12,
  minSellers: 2,
  maxPriceVariation: 0.25,
  minBsr: 1_000,
  maxBsr: 150_000,
  minPrice: 15,
  maxPrice: 150,
} as const;
