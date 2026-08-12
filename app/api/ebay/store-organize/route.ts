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
  classifyOffersForStore,
  listSellerOffers,
  listSellerStoreCategories,
} from "@/lib/ebay/store-organize";

/**
 * GET — load Store categories + offers + dry-run classification (Higlou only).
 * POST — apply suggested storeCategoryNames to selected offers.
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

const applySchema = z.object({
  items: z
    .array(
      z.object({
        offerId: z.string().min(1),
        suggestedPath: z.string().min(1),
        skip: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(200),
  /** When true, also apply low-confidence rows (needsReview). */
  includeNeedsReview: z.boolean().optional().default(false),
});

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
    const result = await applyStoreOrganizeSuggestions(
      accessToken,
      body.items,
    );
    return NextResponse.json({
      ok: true,
      applied: result.applied,
      failed: result.failed,
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
