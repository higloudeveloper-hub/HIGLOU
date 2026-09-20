import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { marketSpread, type MarketDrop } from "@/lib/market/catalog";
import {
  asinFromWinnerDropId,
  opportunityToMarketDrop,
} from "@/lib/market/from-opportunity";
import { isPlatformWinner } from "@/lib/opportunity/platform-winner";
import { logMonetizationEvent } from "@/lib/monetization/observability";
import {
  productBodySchema,
  syncRelated,
  toDbColumns,
} from "@/lib/products/persistence";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { OpportunityProduct } from "@/lib/opportunity/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  dropId: z.string().min(2).max(64),
});

async function resolveDrop(
  userId: string,
  dropId: string,
): Promise<MarketDrop | null> {
  // Curated / invented catalog drops are no longer claimable.
  const asin = asinFromWinnerDropId(dropId);
  if (!asin || !isSupabaseConfigured()) return null;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("opportunity_ledger")
      .select("payload, net_profit, amazon_price, ebay_price, title, brand, image_url, mode")
      .eq("user_id", userId)
      .eq("asin", asin)
      .order("net_profit", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const payload = {
      ...(data.payload as OpportunityProduct),
      asin,
      mode:
        (data.payload as OpportunityProduct)?.mode ||
        (data.mode as OpportunityProduct["mode"]) ||
        "amazon_to_ebay",
      title: (data.payload as OpportunityProduct)?.title || data.title || "",
      brand: (data.payload as OpportunityProduct)?.brand || data.brand || "",
      imageUrl:
        (data.payload as OpportunityProduct)?.imageUrl || data.image_url || "",
      amazonPrice:
        (data.payload as OpportunityProduct)?.amazonPrice ??
        (data.amazon_price != null ? Number(data.amazon_price) : null),
      ebayPrice:
        (data.payload as OpportunityProduct)?.ebayPrice ??
        (data.ebay_price != null ? Number(data.ebay_price) : null),
      netProfit:
        (data.payload as OpportunityProduct)?.netProfit ??
        (data.net_profit != null ? Number(data.net_profit) : null),
    } as OpportunityProduct;
    if (!isPlatformWinner(payload, payload.mode || "amazon_to_ebay")) return null;
    const mapped = opportunityToMarketDrop(payload);
    return mapped;
  } catch {
    return null;
  }
}

/** One-click: clone a market / winners drop into the user's listing library. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let dropId: string;
  try {
    dropId = bodySchema.parse(await request.json()).dropId;
  } catch {
    return NextResponse.json({ error: "Send { dropId }" }, { status: 400 });
  }

  const drop = await resolveDrop(auth.user.id, dropId);
  if (!drop) {
    return NextResponse.json(
      { error: "Winner not found — run Find Winners to verify a real ask spread" },
      { status: 404 },
    );
  }

  const images = [drop.photo, ...drop.photos]
    .filter(Boolean)
    .filter((url, i, arr) => arr.indexOf(url) === i)
    .slice(0, 8)
    .map((publicUrl, index) => ({
      publicUrl,
      storagePath: `market/${drop.id}/${index}`,
      fileName: `${drop.id}-${index}.jpg`,
      sortOrder: index,
      isPrimary: index === 0,
      mimeType: "image/jpeg",
      sizeBytes: 0,
    }));

  const brand = drop.asin ? drop.name : "Higlou Market";
  const payload = productBodySchema.parse({
    title: drop.title,
    brand,
    sku: drop.asin
      ? `WIN-${drop.asin}`
      : `MKT-${drop.id.toUpperCase().slice(0, 20)}`,
    amazonAsin: drop.asin || "",
    condition: "New",
    conditionId: "NEW",
    price: drop.sell,
    quantity: 1,
    listingFormat: "FixedPrice",
    descriptionSummary: drop.blurb,
    descriptionHtml: `<p>${drop.blurb}</p><p>Supplier: ${drop.supplier}. ${drop.ships}.</p><p><em>Est. cost $${drop.buy} · suggested list $${drop.sell}. Spread is an estimate — verify before publish.</em></p>${drop.asin ? `<p>ASIN: ${drop.asin}</p>` : ""}`,
    productType: drop.name,
    status: "Uploaded",
    itemLocation: "United States",
    handlingTime: 2,
    country: "US",
    features: [
      `${drop.ships}`,
      `Est. supplier cost $${drop.buy}`,
      drop.asin ? `ASIN ${drop.asin}` : "Ready draft from Higlou Market",
    ],
    images,
    itemSpecifics: [
      { key: "Brand", label: "Brand", value: brand },
      { key: "Type", label: "Type", value: drop.name },
      {
        key: "C:MarketDrop",
        label: "Market drop",
        value: drop.id,
        isCustom: true,
      },
      ...(drop.asin
        ? [
            {
              key: "C:ASIN",
              label: "ASIN",
              value: drop.asin,
              isCustom: true,
            },
          ]
        : []),
    ],
  });

  const columns = toDbColumns(payload);
  const { data: inserted, error } = await auth.supabase
    .from("products")
    .insert({
      ...columns,
      user_id: auth.user.id,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message || "Could not add drop to your store" },
      { status: 500 },
    );
  }

  try {
    await syncRelated(auth.supabase, auth.user.id, inserted.id, payload);
  } catch (relatedError) {
    console.error("market claim image sync failed", relatedError);
  }

  logMonetizationEvent({
    level: "info",
    event: "market_drop_claimed",
    detail: {
      userId: auth.user.id,
      dropId: drop.id,
      asin: drop.asin || null,
      productId: inserted.id,
      spread: marketSpread(drop),
    },
  });

  return NextResponse.json(
    {
      ok: true,
      productId: inserted.id,
      href: `/listings/${inserted.id}`,
      dropId: drop.id,
      asin: drop.asin || null,
      spread: marketSpread(drop),
      note: "Verified winner draft — confirm cost and comps before publish",
    },
    { status: 201 },
  );
}
