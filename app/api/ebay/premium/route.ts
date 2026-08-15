import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import {
  getEbayConnectionPublic,
  getValidAccessToken,
} from "@/lib/ebay/oauth";
import {
  reviseListingPrice,
  sendOfferToInterestedBuyers,
} from "@/lib/ebay/premium-actions";
import { fetchEligibleOfferListings } from "@/lib/ebay/sales-sync";

const bodySchema = z.object({
  action: z.enum(["offer", "offer_all", "price"]),
  listingId: z.string().optional(),
  listingIds: z.array(z.string()).optional(),
  discountPercentage: z.number().optional(),
  price: z.number().optional(),
});

/** Send cart/watcher offers or drop a live listing price. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const connection = await getEbayConnectionPublic(
      auth.supabase,
      auth.user.id,
    );
    if (!connection.connected) {
      return NextResponse.json(
        { error: "Connect eBay in Settings first." },
        { status: 400 },
      );
    }
    const token = await getValidAccessToken(auth.supabase, auth.user.id);
    const pct = parsed.data.discountPercentage ?? 10;

    if (parsed.data.action === "offer") {
      const id = parsed.data.listingId?.trim();
      if (!id) {
        return NextResponse.json({ error: "Missing listing." }, { status: 400 });
      }
      const result = await sendOfferToInterestedBuyers(token, [id], pct);
      return NextResponse.json({ ok: true, ...result });
    }

    if (parsed.data.action === "offer_all") {
      const eligible = await fetchEligibleOfferListings(token).catch(() => ({
        ids: [] as string[],
      }));
      const requested = parsed.data.listingIds?.filter(Boolean) ?? [];
      const ids = (requested.length > 0 ? requested : eligible.ids).slice(0, 10);
      if (ids.length === 0) {
        return NextResponse.json(
          {
            error:
              "eBay has no cart/watcher listings eligible for a seller offer right now.",
          },
          { status: 400 },
        );
      }
      const result = await sendOfferToInterestedBuyers(token, ids, pct);
      return NextResponse.json({ ok: true, ...result });
    }

    const listingId = parsed.data.listingId?.trim();
    const price = parsed.data.price;
    if (!listingId || price == null) {
      return NextResponse.json(
        { error: "Missing listing or price." },
        { status: 400 },
      );
    }
    const result = await reviseListingPrice(token, listingId, price);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not run that eBay action";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
