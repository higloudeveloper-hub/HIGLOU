import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { amazonAsinFromListing } from "@/lib/amazon/asin";
import {
  getMonetizationFlags,
  isMoneyEngineEnabled,
} from "@/lib/monetization/flags";
import { getMonetizationRecommendation } from "@/lib/monetization/decision-engine";
import { logMonetizationEvent } from "@/lib/monetization/observability";
import type { MonetizationInput } from "@/lib/monetization/types";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { EligibilityStatus } from "@/lib/opportunity/types";

export const runtime = "nodejs";

const eligibilitySchema = z.enum([
  "SELLABLE",
  "APPROVAL_REQUIRED",
  "RESTRICTED",
  "CONDITION_RESTRICTED",
  "UNKNOWN",
  "API_ERROR",
]);

const bodySchema = z.object({
  productId: z.string().uuid().optional(),
  title: z.string().max(500).optional(),
  brand: z.string().max(200).optional(),
  asin: z.string().max(20).optional(),
  upc: z.string().max(32).optional(),
  ebayPrice: z.number().nonnegative().nullable().optional(),
  amazonPrice: z.number().nonnegative().nullable().optional(),
  cost: z.number().nonnegative().nullable().optional(),
  amazonFees: z.number().nonnegative().nullable().optional(),
  ebayFees: z.number().nonnegative().nullable().optional(),
  shipping: z.number().nonnegative().nullable().optional(),
  packing: z.number().nonnegative().nullable().optional(),
  amazonEligibility: eligibilitySchema.optional().nullable(),
  amazonEligibilityMessage: z.string().max(500).optional().nullable(),
  ebayConnected: z.boolean().optional().nullable(),
  amazonSellerConnected: z.boolean().optional().nullable(),
  quantity: z.number().int().optional().nullable(),
  demandScore: z.number().optional().nullable(),
  sellerCount: z.number().int().optional().nullable(),
  opportunityScore: z.number().optional().nullable(),
  opportunityVerdict: z.string().max(40).optional().nullable(),
  soldVerified: z.boolean().optional().nullable(),
});

async function loadProductInput(
  userId: string,
  productId: string,
): Promise<Partial<MonetizationInput>> {
  if (!isSupabaseConfigured()) return {};
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("products")
      .select(
        "id, title, brand, sku, upc, price, quantity, amazon_asin, status",
      )
      .eq("id", productId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return {};

    const asin =
      amazonAsinFromListing({
        amazonAsin: data.amazon_asin,
        sku: data.sku,
      }) || null;

    let ledger: Partial<MonetizationInput> = {};
    if (asin) {
      const { data: hit } = await admin
        .from("opportunity_ledger")
        .select("payload, net_profit, amazon_price, ebay_price")
        .eq("user_id", userId)
        .eq("asin", asin)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const payload = (hit?.payload || {}) as Record<string, unknown>;
      ledger = {
        amazonPrice:
          typeof payload.amazonPrice === "number"
            ? payload.amazonPrice
            : hit?.amazon_price != null
              ? Number(hit.amazon_price)
              : null,
        ebayPrice:
          typeof payload.ebayPrice === "number"
            ? payload.ebayPrice
            : hit?.ebay_price != null
              ? Number(hit.ebay_price)
              : null,
        cost:
          typeof payload.cost === "number"
            ? payload.cost
            : typeof payload.amazonPrice === "number"
              ? payload.amazonPrice
              : null,
        amazonFees:
          typeof payload.amazonFees === "number" ? payload.amazonFees : null,
        ebayFees:
          typeof payload.ebayFees === "number" ? payload.ebayFees : null,
        shipping:
          typeof payload.shipping === "number" ? payload.shipping : null,
        packing:
          typeof payload.packing === "number" ? payload.packing : null,
        amazonEligibility:
          typeof payload.eligibility === "string"
            ? (payload.eligibility as EligibilityStatus)
            : null,
        amazonEligibilityMessage:
          typeof payload.eligibilityMessage === "string"
            ? payload.eligibilityMessage
            : null,
        demandScore:
          typeof payload.demandScore === "number" ? payload.demandScore : null,
        sellerCount:
          typeof payload.sellerCount === "number" ? payload.sellerCount : null,
        opportunityScore:
          typeof payload.score === "number" ? payload.score : null,
        opportunityVerdict:
          typeof payload.verdict === "string" ? payload.verdict : null,
        soldVerified:
          typeof payload.soldVerified === "boolean"
            ? payload.soldVerified
            : null,
      };
    }

    return {
      productId: data.id,
      title: data.title || "",
      brand: data.brand || "",
      asin,
      upc: data.upc || "",
      quantity: data.quantity ?? null,
      ...ledger,
      ebayPrice:
        data.price != null ? Number(data.price) : (ledger.ebayPrice ?? null),
    };
  } catch (error) {
    logMonetizationEvent({
      level: "warn",
      event: "product_load_failed",
      detail: {
        productId,
        message: error instanceof Error ? error.message : "unknown",
      },
    });
    return {};
  }
}

export async function GET(request: Request) {
  if (!isMoneyEngineEnabled()) {
    return NextResponse.json(
      { enabled: false, error: "Money Engine is disabled" },
      { status: 404 },
    );
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const productId = new URL(request.url).searchParams.get("productId");
  if (!productId) {
    return NextResponse.json(
      { enabled: true, error: "productId required" },
      { status: 400 },
    );
  }

  const fromDb = await loadProductInput(auth.user.id, productId);
  const decision = getMonetizationRecommendation(fromDb);
  return NextResponse.json({
    enabled: true,
    flags: getMonetizationFlags(),
    input: {
      productId: fromDb.productId ?? productId,
      asin: fromDb.asin ?? null,
      hasCost: fromDb.cost != null,
    },
    decision,
  });
}

export async function POST(request: Request) {
  if (!isMoneyEngineEnabled()) {
    return NextResponse.json(
      { enabled: false, error: "Money Engine is disabled" },
      { status: 404 },
    );
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid monetization payload" },
      { status: 400 },
    );
  }

  const fromDb = parsed.productId
    ? await loadProductInput(auth.user.id, parsed.productId)
    : {};

  const merged: MonetizationInput = {
    ...fromDb,
    ...Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v !== undefined),
    ),
  };

  const decision = getMonetizationRecommendation(merged);
  return NextResponse.json({
    enabled: true,
    flags: getMonetizationFlags(),
    decision,
  });
}
