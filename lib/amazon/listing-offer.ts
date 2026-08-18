import { amazonAsinFromListing, parseAmazonLink } from "@/lib/amazon/asin";
import { sanitizeEbayUpc } from "@/lib/ebay/inventory-api";

export function amazonSkuFromListing(sku: string, fallbackId?: string): string {
  const raw = String(sku || "").trim() || String(fallbackId || "").trim();
  const cleaned = raw
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return cleaned || `HIGLOU-${Date.now().toString(36).toUpperCase()}`;
}

export function asinFromHiglouSku(sku: string): string {
  const raw = String(sku || "").trim();
  const amz = raw.match(/^AMZ-([A-Z0-9]{10})$/i);
  if (amz?.[1]) return amz[1].toUpperCase();
  const parsed = parseAmazonLink(raw);
  return parsed?.asin || "";
}

export { amazonAsinFromListing };

export function amazonConditionType(condition?: string, conditionId?: string): string {
  const id = String(conditionId || "").trim();
  const label = String(condition || "").trim().toLowerCase();
  if (id === "1000" || /^new\b/i.test(label)) return "new_new";
  if (id === "1500" || /new other|open box/i.test(label)) return "new_open_box";
  if (id === "1750" || /new with defects/i.test(label)) return "new_open_box";
  if (id === "2000" || /manufacturer refurbished/i.test(label)) {
    return "refurbished_refurbished";
  }
  if (id === "2500" || /seller refurbished/i.test(label)) {
    return "refurbished_refurbished";
  }
  if (id === "3000" || /used\s*excellent|like new/i.test(label)) {
    return "used_like_new";
  }
  if (id === "4000" || /used\s*very good/i.test(label)) return "used_very_good";
  if (id === "5000" || /used\s*good/i.test(label)) return "used_good";
  if (id === "6000" || /used\s*acceptable/i.test(label)) return "used_acceptable";
  if (/used/i.test(label)) return "used_good";
  return "new_new";
}

export function catalogIdentifierType(upc: string): "UPC" | "EAN" | "GTIN" | null {
  const value = sanitizeEbayUpc(upc) || String(upc || "").replace(/\D/g, "");
  if (!value) return null;
  if (value.length === 12) return "UPC";
  if (value.length === 13) return "EAN";
  if (value.length === 14) return "GTIN";
  return null;
}

export function amazonOfferAttributes(opts: {
  marketplaceId: string;
  asin?: string;
  upc?: string;
  conditionType: string;
  price: number;
  quantity: number;
  handlingDays: number;
}) {
  const marketplace_id = opts.marketplaceId;
  const offer = {
    condition_type: [{ value: opts.conditionType, marketplace_id }],
    fulfillment_availability: [
      {
        fulfillment_channel_code: "DEFAULT",
        quantity: opts.quantity,
        lead_time_to_ship_max_days: Math.min(30, Math.max(1, opts.handlingDays)),
      },
    ],
    purchasable_offer: [
      {
        audience: "ALL",
        currency: "USD",
        marketplace_id,
        our_price: [
          {
            schedule: [{ value_with_tax: Number(opts.price.toFixed(2)) }],
          },
        ],
      },
    ],
  };
  const asin = String(opts.asin || "").trim().toUpperCase();
  if (/^[A-Z0-9]{10}$/.test(asin)) {
    return {
      ...offer,
      merchant_suggested_asin: [{ value: asin, marketplace_id }],
    };
  }
  const upc = sanitizeEbayUpc(opts.upc || "") || String(opts.upc || "").replace(/\D/g, "");
  const idType = catalogIdentifierType(upc);
  if (upc && idType) {
    return {
      ...offer,
      externally_assigned_product_identifier: [
        {
          type: idType.toLowerCase(),
          value: upc,
          marketplace_id,
        },
      ],
    };
  }
  return offer;
}
