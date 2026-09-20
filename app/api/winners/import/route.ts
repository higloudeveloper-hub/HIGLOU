import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { loadWinnerMarketTokens } from "@/lib/amazon/winner-tokens";
import {
  analyzeCrossPlatform,
  crossPlatformToListingFields,
} from "@/lib/opportunity/cross-platform";
import { isPlatformWinner } from "@/lib/opportunity/platform-winner";
import type { OpportunityMode, OpportunityProduct } from "@/lib/opportunity/types";
import {
  productBodySchema,
  syncRelated,
  toDbColumns,
} from "@/lib/products/persistence";
import { isRetailToMarketplaceMode } from "@/lib/opportunity/markets";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 90;

const cardSchema = z.object({
  asin: z.string().optional().default(""),
  title: z.string(),
  brand: z.string().optional().default(""),
  imageUrl: z.string().optional().default(""),
  amazonPrice: z.number().nullable().optional(),
  ebayPrice: z.number().nullable().optional(),
  sourceId: z.string().optional(),
  sourceMarket: z.string().optional(),
  upc: z.string().optional().default(""),
  cost: z.number().nullable().optional(),
});

const bodySchema = z.object({
  mode: z.enum([
    "amazon",
    "amazon_to_ebay",
    "supplier",
    "ebay_to_amazon",
    "homedepot_to_ebay",
    "homedepot_to_amazon",
    "walmart_to_ebay",
    "walmart_to_amazon",
  ]),
  cards: z.array(cardSchema).min(1).max(5),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send { mode, cards }" }, { status: 400 });
  }

  const tokens = await loadWinnerMarketTokens(auth.supabase, auth.user.id);
  const card = body.cards[0]!;
  const mode = body.mode as OpportunityMode;
  const retail = isRetailToMarketplaceMode(mode);

  // 1) Cross-platform analysis first — real prices everywhere.
  const analysis = await analyzeCrossPlatform({
    title: card.title,
    brand: card.brand,
    model: card.mpn || undefined,
    mpn: card.mpn || undefined,
    upc: card.upc,
    asin: card.asin,
    sourceMarket: card.sourceMarket,
    sourceId: card.sourceId,
    sourcePrice:
      card.cost ??
      (card.sourceMarket === "amazon" ? card.amazonPrice : null) ??
      null,
    amazonToken: tokens.amazonToken,
    marketplaceId: tokens.marketplaceId,
    ebayToken: tokens.ebayToken,
    pageOrigin: new URL(request.url).origin,
  });

  if (!analysis.realOpportunity && !analysis.quotes.some((q) => q.price)) {
    return NextResponse.json(
      {
        error:
          "No real cross-platform prices found. Need UPC / ASIN match on at least two markets.",
      },
      { status: 422 },
    );
  }

  const fields = crossPlatformToListingFields(analysis);
  const buyQuote =
    analysis.quotes.find((q) =>
      mode.startsWith("walmart")
        ? q.platform === "walmart"
        : mode.startsWith("homedepot")
          ? q.platform === "homedepot"
          : mode.startsWith("ebay")
            ? q.platform === "ebay"
            : q.platform === "amazon",
    ) || analysis.quotes.find((q) => q.price != null);

  const listPrice =
    fields.listPrice ??
    card.ebayPrice ??
    analysis.quotes.find((q) => q.platform === "ebay")?.price ??
    analysis.quotes.find((q) => q.platform === "amazon")?.price ??
    buyQuote?.price ??
    0;

  const images = card.imageUrl
    ? [
        {
          publicUrl: card.imageUrl,
          storagePath: `winners/${Date.now()}/0`,
          fileName: "winner-0.jpg",
          sortOrder: 0,
          isPrimary: true,
          mimeType: "image/jpeg",
          sizeBytes: 0,
        },
      ]
    : [];

  // Retail: import via WM/HD endpoints for real gallery when possible.
  if (retail && card.sourceId) {
    const isHd = mode.startsWith("homedepot");
    const url = isHd
      ? `https://www.homedepot.com/p/${card.sourceId}`
      : `https://www.walmart.com/ip/${card.sourceId}`;
    const endpoint = isHd ? "/api/homedepot/import" : "/api/walmart/import";
    try {
      const retailRes = await fetch(
        new URL(endpoint, request.url).toString(),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: request.headers.get("cookie") || "",
          },
          body: JSON.stringify({ url }),
        },
      );
      const retailBody = (await retailRes.json().catch(() => null)) as {
        ok?: boolean;
        title?: string;
        brand?: string;
        upc?: string;
        images?: Array<{
          url: string;
          storagePath?: string;
          fileName?: string;
          sortOrder?: number;
          isPrimary?: boolean;
        }>;
        price?: number | null;
      } | null;
      if (retailRes.ok && retailBody?.images?.length) {
        // Create product with cross-platform fields
        const payload = productBodySchema.parse({
          title: retailBody.title || card.title,
          brand: retailBody.brand || card.brand,
          upc: retailBody.upc || card.upc || analysis.upc || "",
          amazonAsin: analysis.asin || card.asin || "",
          price: listPrice,
          quantity: 1,
          condition: "New",
          conditionId: "NEW",
          listingFormat: "FixedPrice",
          descriptionSummary: fields.summary.slice(0, 400),
          descriptionHtml: `<pre>${fields.summary}</pre>`,
          status: "Uploaded",
          features: [
            analysis.bestRoute
              ? `Best route: ${analysis.bestRoute}`
              : "Cross-platform import",
            analysis.bestKeep != null
              ? `Est. keep $${analysis.bestKeep.toFixed(2)}`
              : "Verify keep before publish",
          ],
          images: retailBody.images.map((img, index) => ({
            url: img.url,
            storagePath: img.storagePath || "",
            fileName: img.fileName || `retail-${index}.jpg`,
            sortOrder: img.sortOrder ?? index,
            isPrimary: img.isPrimary ?? index === 0,
          })),
          itemSpecifics: fields.specifics,
        });

        const columns = toDbColumns(payload);
        const { data: inserted, error } = await auth.supabase
          .from("products")
          .insert({ ...columns, user_id: auth.user.id })
          .select("*")
          .single();
        if (error || !inserted) {
          return NextResponse.json(
            { error: error?.message || "Could not save listing" },
            { status: 500 },
          );
        }
        try {
          await syncRelated(auth.supabase, auth.user.id, inserted.id, payload);
        } catch {
          /* images best-effort */
        }

        // Stock Market only if real opportunity
        if (analysis.realOpportunity) {
          await stashWinnerLedger(auth.user.id, mode, {
            ...card,
            asin: analysis.asin || card.asin,
            upc: analysis.upc || card.upc,
            amazonPrice:
              analysis.quotes.find((q) => q.platform === "amazon")?.price ??
              null,
            ebayPrice:
              analysis.quotes.find((q) => q.platform === "ebay")?.price ?? null,
            cost: buyQuote?.price ?? card.cost ?? null,
            keep: analysis.bestKeep,
          });
        }

        return NextResponse.json({
          ok: true,
          id: inserted.id,
          href: `/listings/${inserted.id}`,
          analysis,
          marketReady: analysis.realOpportunity,
          note: analysis.realOpportunity
            ? "Real opportunity — stocked on Market"
            : "Imported with prices — not Market-ready (keep too thin)",
        });
      }
    } catch {
      /* fall through to generic create */
    }
  }

  // Amazon / generic create
  if (/^[A-Z0-9]{10}$/.test((analysis.asin || card.asin || "").toUpperCase())) {
    const asins = [(analysis.asin || card.asin).toUpperCase()];
    const importMode =
      mode === "amazon" || mode === "supplier" || mode === "amazon_to_ebay"
        ? mode
        : "amazon_to_ebay";
    const response = await fetch(
      new URL("/api/amazon/auto-import", request.url).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: request.headers.get("cookie") || "",
        },
        body: JSON.stringify({
          asins,
          mode: importMode,
          cards: [
            {
              ...card,
              asin: asins[0],
              ebayPrice: listPrice,
            },
          ],
        }),
      },
    );
    const imported = (await response.json().catch(() => null)) as {
      ok?: boolean;
      id?: string;
      error?: string;
    } | null;
    if (!response.ok || !imported?.ok || !imported.id) {
      return NextResponse.json(
        { error: imported?.error || "Amazon import failed" },
        { status: response.status || 422 },
      );
    }

    // Patch listing with cross-platform specifics
    try {
      const { data: product } = await auth.supabase
        .from("products")
        .select("item_specifics, description_html, description_summary")
        .eq("id", imported.id)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      const existing = Array.isArray(product?.item_specifics)
        ? product.item_specifics
        : [];
      await auth.supabase
        .from("products")
        .update({
          item_specifics: [...existing, ...fields.specifics],
          description_summary: fields.summary.slice(0, 400),
          description_html: `${product?.description_html || ""}<hr/><pre>${fields.summary}</pre>`,
          price: listPrice || undefined,
          amazon_asin: analysis.asin || card.asin || undefined,
        })
        .eq("id", imported.id)
        .eq("user_id", auth.user.id);
    } catch {
      /* non-fatal */
    }

    if (analysis.realOpportunity) {
      await stashWinnerLedger(auth.user.id, mode, {
        ...card,
        asin: analysis.asin || card.asin,
        upc: analysis.upc || card.upc,
        amazonPrice:
          analysis.quotes.find((q) => q.platform === "amazon")?.price ?? null,
        ebayPrice:
          analysis.quotes.find((q) => q.platform === "ebay")?.price ?? null,
        cost: buyQuote?.price ?? card.cost ?? null,
        keep: analysis.bestKeep,
      });
    }

    return NextResponse.json({
      ok: true,
      id: imported.id,
      href: `/listings/${imported.id}`,
      analysis,
      marketReady: analysis.realOpportunity,
      note: analysis.realOpportunity
        ? "Real opportunity — stocked on Market"
        : "Imported with cross-platform prices",
    });
  }

  // Last resort: create bare draft with quotes
  const payload = productBodySchema.parse({
    title: card.title,
    brand: card.brand,
    upc: card.upc || analysis.upc || "",
    amazonAsin: analysis.asin || "",
    price: listPrice,
    quantity: 1,
    condition: "New",
    conditionId: "NEW",
    listingFormat: "FixedPrice",
    descriptionSummary: fields.summary.slice(0, 400),
    descriptionHtml: `<pre>${fields.summary}</pre>`,
    status: "Uploaded",
    features: ["Cross-platform import"],
    images: images.map((img) => ({
      url: img.publicUrl,
      storagePath: img.storagePath,
      fileName: img.fileName,
      sortOrder: img.sortOrder,
      isPrimary: img.isPrimary,
    })),
    itemSpecifics: fields.specifics,
  });
  const columns = toDbColumns(payload);
  const { data: inserted, error } = await auth.supabase
    .from("products")
    .insert({ ...columns, user_id: auth.user.id })
    .select("*")
    .single();
  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message || "Could not save listing" },
      { status: 500 },
    );
  }
  try {
    await syncRelated(auth.supabase, auth.user.id, inserted.id, payload);
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    ok: true,
    id: inserted.id,
    href: `/listings/${inserted.id}`,
    analysis,
    marketReady: analysis.realOpportunity,
  });
}

async function stashWinnerLedger(
  userId: string,
  mode: OpportunityMode,
  card: {
    asin?: string;
    title: string;
    brand?: string;
    imageUrl?: string;
    upc?: string;
    amazonPrice?: number | null;
    ebayPrice?: number | null;
    cost?: number | null;
    keep?: number | null;
    sourceId?: string;
    sourceMarket?: string;
  },
) {
  const asin = String(card.asin || "").toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin) && !card.sourceId) return;

  const hit = {
    asin: asin || String(card.sourceId || "").slice(0, 10).padEnd(10, "0"),
    title: card.title,
    brand: card.brand || "",
    imageUrl: card.imageUrl || "",
    upc: card.upc || "",
    amazonPrice: card.amazonPrice ?? null,
    ebayPrice: card.ebayPrice ?? null,
    ebayActiveLow: card.ebayPrice ?? null,
    cost: card.cost ?? null,
    buyBoxPrice: card.amazonPrice ?? null,
    hypotheticalKeep: card.keep ?? null,
    netProfit: null,
    score: 80,
    verdict: "good",
    identityConfidence: 90,
    mode,
    sourceId: card.sourceId || asin,
    sourceMarket: card.sourceMarket || "amazon",
  } as OpportunityProduct;

  if ((card.keep ?? 0) < 12 && !isPlatformWinner(hit, mode)) return;

  try {
    if (!isSupabaseConfigured()) return;
    const admin = createAdminClient();
    await admin.from("opportunity_ledger").upsert(
      {
        user_id: userId,
        mode,
        asin: hit.asin,
        title: hit.title,
        brand: hit.brand,
        image_url: hit.imageUrl,
        amazon_price: hit.amazonPrice,
        ebay_price: hit.ebayPrice,
        net_profit: card.keep,
        score: hit.score,
        payload: hit,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,mode,asin" },
    );
  } catch {
    /* ledger optional */
  }
}
