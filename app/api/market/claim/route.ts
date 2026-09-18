import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { getMarketDrop, marketSpread } from "@/lib/market/catalog";
import { logMonetizationEvent } from "@/lib/monetization/observability";
import {
  productBodySchema,
  syncRelated,
  toDbColumns,
} from "@/lib/products/persistence";

export const runtime = "nodejs";

const bodySchema = z.object({
  dropId: z.string().min(2).max(64),
});

/** One-click: clone a market drop into the user's listing library. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let dropId: string;
  try {
    dropId = bodySchema.parse(await request.json()).dropId;
  } catch {
    return NextResponse.json({ error: "Send { dropId }" }, { status: 400 });
  }

  const drop = getMarketDrop(dropId);
  if (!drop) {
    return NextResponse.json({ error: "Drop not found" }, { status: 404 });
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

  const payload = productBodySchema.parse({
    title: drop.title,
    brand: "Higlou Market",
    sku: `MKT-${drop.id.toUpperCase()}`,
    amazonAsin: drop.asin || "",
    condition: "New",
    conditionId: "NEW",
    price: drop.sell,
    quantity: 1,
    listingFormat: "FixedPrice",
    descriptionSummary: drop.blurb,
    descriptionHtml: `<p>${drop.blurb}</p><p>Supplier: ${drop.supplier}. ${drop.ships}.</p><p><em>Est. cost $${drop.buy} · suggested list $${drop.sell}. Spread is an estimate — verify before publish.</em></p>`,
    productType: drop.name,
    status: "Uploaded",
    itemLocation: "United States",
    handlingTime: 2,
    country: "US",
    features: [
      `${drop.ships}`,
      `Est. supplier cost $${drop.buy}`,
      "Ready draft from Higlou Market",
    ],
    images,
    itemSpecifics: [
      { key: "Brand", label: "Brand", value: "Higlou Market" },
      { key: "Type", label: "Type", value: drop.name },
      {
        key: "C:MarketDrop",
        label: "Market drop",
        value: drop.id,
        isCustom: true,
      },
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
      spread: marketSpread(drop),
      note: "Draft created — verify cost and comps before publish",
    },
    { status: 201 },
  );
}
