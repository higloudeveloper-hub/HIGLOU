import { getEbayConfig } from "@/lib/ebay/config";
import type { SupabaseClient } from "@supabase/supabase-js";

export type EbaySaleLine = {
  orderId: string;
  createdAt: string;
  title: string;
  sku: string;
  listingId: string;
  qty: number;
  amount: number;
  currency: string;
  buyer: string;
  fulfillment: string;
  higlouProductId: string | null;
};

export type SalesOpportunity = {
  id: string;
  kind: "draft" | "live_no_sales" | "ebay_only";
  title: string;
  detail: string;
  href?: string;
};

export type SalesSnapshot = {
  syncedAt: string;
  connected: boolean;
  orders30d: number;
  units30d: number;
  revenue30d: number;
  ordersToday: number;
  revenueToday: number;
  matchedToHiglou: number;
  unmatchedEbaySales: number;
  reflectedThisSync: number;
  recent: EbaySaleLine[];
  opportunities: SalesOpportunity[];
  error?: string;
};

type FulfillmentOrder = {
  orderId?: string;
  creationDate?: string;
  orderFulfillmentStatus?: string;
  buyer?: { username?: string };
  pricingSummary?: { total?: { value?: string; currency?: string } };
  lineItems?: Array<{
    title?: string;
    sku?: string;
    quantity?: number;
    lineItemCost?: { value?: string; currency?: string };
    legacyItemId?: string;
    listing?: { listingId?: string };
  }>;
};

function money(raw: string | undefined) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function dayKey(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-CA", {
      timeZone: "America/Indiana/Indianapolis",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

async function fetchEbayOrders(accessToken: string): Promise<FulfillmentOrder[]> {
  const cfg = getEbayConfig();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date().toISOString();
  const filter = `creationdate:[${from}..${to}]`;
  const path = `/sell/fulfillment/v1/order?limit=50&filter=${encodeURIComponent(filter)}`;

  const res = await fetch(`${cfg.apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Accept-Language": "en-US",
      "Content-Language": "en-US",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    orders?: FulfillmentOrder[];
    errors?: Array<{ message?: string; longMessage?: string }>;
    message?: string;
  };
  if (!res.ok) {
    const first = json.errors?.[0];
    throw new Error(
      first?.longMessage ||
        first?.message ||
        json.message ||
        `eBay orders ${res.status}`,
    );
  }
  return json.orders ?? [];
}

export async function syncEbaySalesForUser(
  supabase: SupabaseClient,
  userId: string,
  accessToken: string,
): Promise<SalesSnapshot> {
  const syncedAt = new Date().toISOString();
  const orders = await fetchEbayOrders(accessToken);

  const { data: productRows } = await supabase
    .from("products")
    .select("id, title, sku, status, ebay_listing_id, ebay_status, quantity")
    .eq("user_id", userId);

  const products = (productRows ?? []) as Array<{
    id: string;
    title: string;
    sku: string;
    status: string;
    ebay_listing_id: string | null;
    ebay_status: string | null;
    quantity: number | null;
  }>;

  const bySku = new Map(
    products
      .filter((p) => p.sku?.trim())
      .map((p) => [p.sku.trim().toLowerCase(), p]),
  );
  const byListing = new Map(
    products
      .filter((p) => p.ebay_listing_id?.trim())
      .map((p) => [p.ebay_listing_id!.trim(), p]),
  );

  const recent: EbaySaleLine[] = [];
  const soldQtyByProduct = new Map<string, { qty: number; lastSoldAt: string }>();
  let revenue30d = 0;
  let units30d = 0;
  let revenueToday = 0;
  let ordersToday = 0;
  const today = dayKey(syncedAt);
  const seenOrdersToday = new Set<string>();

  for (const order of orders) {
    const createdAt = order.creationDate || syncedAt;
    const isToday = dayKey(createdAt) === today;
    if (isToday) seenOrdersToday.add(String(order.orderId || createdAt));
    const orderTotal = money(order.pricingSummary?.total?.value);
    revenue30d += orderTotal;
    if (isToday) revenueToday += orderTotal;

    for (const line of order.lineItems || []) {
      const listingId = String(
        line.listing?.listingId || line.legacyItemId || "",
      );
      const sku = String(line.sku || "").trim();
      const qty = Math.max(1, Number(line.quantity) || 1);
      units30d += qty;
      const match =
        (sku ? bySku.get(sku.toLowerCase()) : undefined) ||
        (listingId ? byListing.get(listingId) : undefined);

      recent.push({
        orderId: String(order.orderId || ""),
        createdAt,
        title: String(line.title || "eBay order"),
        sku,
        listingId,
        qty,
        amount: money(line.lineItemCost?.value) || orderTotal,
        currency: line.lineItemCost?.currency || "USD",
        buyer: String(order.buyer?.username || ""),
        fulfillment: String(order.orderFulfillmentStatus || ""),
        higlouProductId: match?.id || null,
      });

      if (match) {
        const prev = soldQtyByProduct.get(match.id);
        soldQtyByProduct.set(match.id, {
          qty: (prev?.qty || 0) + qty,
          lastSoldAt:
            !prev || createdAt > prev.lastSoldAt ? createdAt : prev.lastSoldAt,
        });
      }
    }
  }

  ordersToday = seenOrdersToday.size;
  const matchedToHiglou = recent.filter((r) => r.higlouProductId).length;
  const unmatchedEbaySales = recent.filter((r) => !r.higlouProductId).length;

  let reflectedThisSync = 0;
  for (const [productId, sold] of soldQtyByProduct) {
    const { error } = await supabase
      .from("products")
      .update({
        ebay_status: "SOLD",
        status: "Published",
        ebay_sold_qty: sold.qty,
        ebay_last_sold_at: sold.lastSoldAt,
        updated_at: syncedAt,
      })
      .eq("id", productId)
      .eq("user_id", userId);
    if (!error) {
      reflectedThisSync += 1;
      continue;
    }
    const fallback = await supabase
      .from("products")
      .update({
        ebay_status: "SOLD",
        status: "Published",
        updated_at: syncedAt,
      })
      .eq("id", productId)
      .eq("user_id", userId);
    if (!fallback.error) reflectedThisSync += 1;
  }

  const soldIds = new Set(soldQtyByProduct.keys());
  const opportunities: SalesOpportunity[] = [];

  for (const p of products) {
    const st = (p.ebay_status || "").toUpperCase();
    const local = (p.status || "").toLowerCase();
    if (st !== "PUBLISHED" && st !== "SOLD" && !local.includes("publish")) {
      if (
        local.includes("ready") ||
        local.includes("csv") ||
        local.includes("review")
      ) {
        opportunities.push({
          id: `draft-${p.id}`,
          kind: "draft",
          title: p.title || "Untitled draft",
          detail: "In Higlou, not live on eBay yet",
          href: `/listings/${p.id}`,
        });
      }
    } else if (st === "PUBLISHED" && !soldIds.has(p.id)) {
      opportunities.push({
        id: `live-${p.id}`,
        kind: "live_no_sales",
        title: p.title || "Live listing",
        detail: "Live on eBay · no sale in the last 30 days",
        href: `/listings/${p.id}`,
      });
    }
  }

  for (const line of recent.filter((r) => !r.higlouProductId).slice(0, 6)) {
    opportunities.push({
      id: `ebay-${line.orderId}-${line.listingId || line.sku}`,
      kind: "ebay_only",
      title: line.title,
      detail: "Sold on eBay · not matched to a Higlou listing",
      href: line.listingId
        ? `https://www.ebay.com/itm/${line.listingId}`
        : undefined,
    });
  }

  return {
    syncedAt,
    connected: true,
    orders30d: orders.length,
    units30d,
    revenue30d,
    ordersToday,
    revenueToday,
    matchedToHiglou,
    unmatchedEbaySales,
    reflectedThisSync,
    recent: recent
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 8),
    opportunities: opportunities.slice(0, 8),
  };
}
