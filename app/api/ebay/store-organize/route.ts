import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import {
  getEbayConnectionPublic,
  getValidAccessToken,
} from "@/lib/ebay/oauth";
import { isEbayOAuthConfigured, ebayOAuthMissingReason } from "@/lib/ebay/config";
import {
  applyStoreOrganizeSuggestions,
  autoOrganizeStore,
  classifyOffersForStore,
  ensureStorePaths,
  listSellerOffers,
  listSellerStoreCategories,
} from "@/lib/ebay/store-organize";

/**
 * GET — load Store categories + offers + dry-run classification (Higlou only).
 * POST — apply selected items, or { mode: "auto" } for full auto organize.
 */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  if (!isEbayOAuthConfigured()) {
    return NextResponse.json(
      { error: ebayOAuthMissingReason() },
      { status: 503 },
    );
  }

  const connection = await getEbayConnectionPublic(
    auth.supabase,
    auth.user.id,
  );
  if (!connection.connected) {
    return NextResponse.json(
      {
        error: "Connect your eBay store in Settings first.",
        code: "EBAY_NOT_CONNECTED",
      },
      { status: 400 },
    );
  }

  try {
    const accessToken = await getValidAccessToken(
      auth.supabase,
      auth.user.id,
    );
    const store = await listSellerStoreCategories(accessToken);
    const offers = await listSellerOffers(accessToken, {
      limit: 50,
      maxPages: 10,
    });
    const suggestions = classifyOffersForStore(offers, store.categories);

    return NextResponse.json({
      ok: true,
      connection,
      store,
      summary: {
        offerCount: offers.length,
        needsReview: suggestions.filter((s) => s.needsReview).length,
        unchanged: suggestions.filter((s) => s.unchanged).length,
        ready: suggestions.filter((s) => !s.needsReview && !s.unchanged)
          .length,
        willCreate: suggestions.filter(
          (s) => !s.unchanged && /will create folder/i.test(s.reason),
        ).length,
      },
      suggestions,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to analyze eBay store inventory",
      },
      { status: 502 },
    );
  }
}

const applySchema = z.union([
  z.object({
    mode: z.literal("auto"),
    minConfidence: z.number().min(0).max(1).optional(),
  }),
  z.object({
    items: z
      .array(
        z.object({
          offerId: z.string().min(1),
          suggestedPath: z.string().min(1),
          listingId: z.string().nullable().optional(),
          skip: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(200),
    includeNeedsReview: z.boolean().optional().default(false),
  }),
]);

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  if (!isEbayOAuthConfigured()) {
    return NextResponse.json(
      { error: ebayOAuthMissingReason() },
      { status: 503 },
    );
  }

  const connection = await getEbayConnectionPublic(
    auth.supabase,
    auth.user.id,
  );
  if (!connection.connected) {
    return NextResponse.json(
      {
        error: "Connect your eBay store in Settings first.",
        code: "EBAY_NOT_CONNECTED",
      },
      { status: 400 },
    );
  }

  let body: z.infer<typeof applySchema>;
  try {
    body = applySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid apply payload",
      },
      { status: 400 },
    );
  }

  try {
    const accessToken = await getValidAccessToken(
      auth.supabase,
      auth.user.id,
    );

    if ("mode" in body && body.mode === "auto") {
      const result = await autoOrganizeStore(accessToken, {
        minConfidence: body.minConfidence,
      });
      return NextResponse.json({
        ok: true,
        mode: "auto",
        applied: result.applied,
        failed: result.failed,
        createdFolders: result.createdFolders,
        scanned: result.scanned,
        skipped: result.skipped,
      });
    }

    if (!("items" in body)) {
      return NextResponse.json(
        { error: "Invalid apply payload" },
        { status: 400 },
      );
    }

    const store = await listSellerStoreCategories(accessToken);
    const paths = body.items.map((item) => item.suggestedPath);
    const ensured = await ensureStorePaths(
      accessToken,
      paths,
      store.categories,
    );
    const result = await applyStoreOrganizeSuggestions(
      accessToken,
      body.items,
      ensured.categories,
    );
    return NextResponse.json({
      ok: true,
      applied: result.applied,
      failed: result.failed,
      createdFolders: ensured.created,
      storeSource: store.source,
      storeWarning: store.warning || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to apply store categories",
      },
      { status: 502 },
    );
  }
}
