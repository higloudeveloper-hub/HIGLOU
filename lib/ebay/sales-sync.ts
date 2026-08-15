import { getEbayConfig } from "@/lib/ebay/config";
import { fetchEbayStoreName } from "@/lib/ebay/fetch-store-name";
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

export type InventoryLine = {
  sku: string;
  title: string;
  qty: number;
  listingId: string;
  status: string;
  price: number | null;
  higlouProductId: string | null;
  watchers: number;
  soldQty: number;
  pictureUrl: string | null;
};

export type SalesSnapshot = {
  syncedAt: string;
  connected: boolean;
  storeName: string | null;
  orders30d: number;
  units30d: number;
  revenue30d: number;
  ordersToday: number;
  revenueToday: number;
  avgOrder: number;
  matchedToHiglou: number;
  unmatchedEbaySales: number;
  reflectedThisSync: number;
  inventoryLive: number;
  inventoryUnits: number;
  inventoryValue: number;
  inventoryLow: number;
  inventoryOut: number;
  watchers: number;
  inventory: InventoryLine[];
  recent: EbaySaleLine[];
  opportunities: SalesOpportunity[];
  error?: string;
};

export function emptySalesSnapshot(
  partial?: Partial<SalesSnapshot>,
): SalesSnapshot {
  return {
    syncedAt: new Date().toISOString(),
    connected: false,
    storeName: null,
    orders30d: 0,
    units30d: 0,
    revenue30d: 0,
    ordersToday: 0,
    revenueToday: 0,
    avgOrder: 0,
    matchedToHiglou: 0,
    unmatchedEbaySales: 0,
    reflectedThisSync: 0,
    inventoryLive: 0,
    inventoryUnits: 0,
    inventoryValue: 0,
    inventoryLow: 0,
    inventoryOut: 0,
    watchers: 0,
    inventory: [],
    recent: [],
    opportunities: [],
    ...partial,
  };
}

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
  const path = `/sell/fulfillment/v1/order?limit=200&filter=${encodeURIComponent(filter)}`;

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

async function tradingXml(
  accessToken: string,
  callName: string,
  body: string,
): Promise<string> {
  const cfg = getEbayConfig();
  const res = await fetch(`${cfg.apiBase}/ws/api.dll`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-IAF-TOKEN": accessToken,
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
    },
    body,
    cache: "no-store",
  });
  return res.text();
}

function xmlTag(block: string, tag: string) {
  return block.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"))?.[1]?.trim() || "";
}

async function fetchTradingActiveInventory(accessToken: string): Promise<{
  total: number;
  rows: Array<{
    sku: string;
    status: string;
    qty: number;
    listingId: string;
    title: string;
    price: number | null;
    watchers: number;
    soldQty: number;
    pictureUrl: string | null;
  }>;
}> {
  const rows: Array<{
    sku: string;
    status: string;
    qty: number;
    listingId: string;
    title: string;
    price: number | null;
    watchers: number;
    soldQty: number;
    pictureUrl: string | null;
  }> = [];
  let total = 0;

  for (let page = 1; page <= 1; page++) {
    const xml = await tradingXml(
      accessToken,
      "GetMyeBaySelling",
      `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeWatchCount>true</IncludeWatchCount>
  <ActiveList>
    <Include>true</Include>
    <IncludeNotes>false</IncludeNotes>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>${page}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`,
    );
    if (/<Ack>Failure<\/Ack>/i.test(xml)) break;

    total = Number(
      xml.match(
        /<ActiveList>[\s\S]*?<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/i,
      )?.[1] || total,
    );

    const itemBlocks = xml.match(/<Item>([\s\S]*?)<\/Item>/gi) || [];
    for (const block of itemBlocks) {
      const listingId = xmlTag(block, "ItemID");
      if (!listingId) continue;
      const quantity = Number(xmlTag(block, "Quantity") || "0");
      const soldQty = Number(xmlTag(block, "QuantitySold") || "0");
      const availableRaw = xmlTag(block, "QuantityAvailable");
      const qty = Math.max(
        0,
        availableRaw
          ? Number(availableRaw)
          : quantity - soldQty,
      );
      const priceRaw =
        block.match(
          /<SellingStatus>[\s\S]*?<CurrentPrice[^>]*>([^<]+)<\/CurrentPrice>/i,
        )?.[1] || xmlTag(block, "BuyItNowPrice");
      const pictureUrl =
        xmlTag(block, "GalleryURL") || xmlTag(block, "PictureURL") || null;
      rows.push({
        sku: xmlTag(block, "SKU") || xmlTag(block, "CustomLabel") || listingId,
        status: "PUBLISHED",
        qty: Number.isFinite(qty) ? qty : 0,
        listingId,
        title: xmlTag(block, "Title") || listingId,
        price: Number(priceRaw) || null,
        watchers: Number(xmlTag(block, "WatchCount") || "0") || 0,
        soldQty: Number.isFinite(soldQty) ? soldQty : 0,
        pictureUrl,
      });
    }

    const pages = Number(
      xml.match(
        /<ActiveList>[\s\S]*?<TotalNumberOfPages>(\d+)<\/TotalNumberOfPages>/i,
      )?.[1] || "1",
    );
    if (page >= pages || itemBlocks.length === 0) break;
  }

  return { total: total || rows.length, rows };
}

async function fetchEbayOffers(accessToken: string): Promise<
  Array<{
    sku: string;
    status: string;
    qty: number;
    listingId: string;
    title: string;
    price: number | null;
  }>
> {
  const cfg = getEbayConfig();
  const rows: Array<{
    sku: string;
    status: string;
    qty: number;
    listingId: string;
    title: string;
    price: number | null;
  }> = [];

  for (let offset = 0; offset < 200; offset += 100) {
    const res = await fetch(
      `${cfg.apiBase}/sell/inventory/v1/offer?limit=100&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Accept-Language": "en-US",
          "Content-Language": "en-US",
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
        cache: "no-store",
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      total?: number;
      offers?: Array<{
        sku?: string;
        status?: string;
        availableQuantity?: number;
        listing?: { listingId?: string; title?: string };
        pricingSummary?: { price?: { value?: string } };
      }>;
    };
    if (!res.ok) break;
    const batch = json.offers ?? [];
    for (const offer of batch) {
      rows.push({
        sku: String(offer.sku || "").trim(),
        status: String(offer.status || "").toUpperCase(),
        qty: Math.max(0, Number(offer.availableQuantity) || 0),
        listingId: String(offer.listing?.listingId || "").trim(),
        title: String(offer.listing?.title || "").trim(),
        price: Number(offer.pricingSummary?.price?.value) || null,
      });
    }
    if (batch.length < 100) break;
    if (typeof json.total === "number" && offset + 100 >= json.total) break;
  }
  return rows;
}

export async function syncEbaySalesForUser(
  supabase: SupabaseClient,
  userId: string,
  accessToken: string,
): Promise<SalesSnapshot> {
  const syncedAt = new Date().toISOString();
  const [ordersResult, offers, trading, storeName] = await Promise.all([
    fetchEbayOrders(accessToken)
      .then((rows) => ({ rows, error: undefined as string | undefined }))
      .catch((error) => ({
        rows: [] as FulfillmentOrder[],
        error:
          error instanceof Error ? error.message : "Could not read eBay orders",
      })),
    fetchEbayOffers(accessToken).catch(() => []),
    fetchTradingActiveInventory(accessToken).catch(() => ({
      total: 0,
      rows: [] as Awaited<ReturnType<typeof fetchTradingActiveInventory>>["rows"],
    })),
    fetchEbayStoreName(accessToken).catch(() => null),
  ]);
  const orders = ordersResult.rows;
  const orderError = ordersResult.error;

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

  const byListingId = new Map<string, InventoryLine>();
  for (const o of offers.filter((row) => row.status === "PUBLISHED" || row.listingId)) {
    const match =
      (o.sku ? bySku.get(o.sku.toLowerCase()) : undefined) ||
      (o.listingId ? byListing.get(o.listingId) : undefined);
    const key = o.listingId || o.sku;
    if (!key) continue;
    byListingId.set(key, {
      sku: o.sku,
      title: o.title || match?.title || o.sku || o.listingId || "Listing",
      qty: o.qty,
      listingId: o.listingId,
      status: o.status || "PUBLISHED",
      price: o.price,
      higlouProductId: match?.id || null,
      watchers: 0,
      soldQty: 0,
      pictureUrl: null,
    });
  }
  for (const o of trading.rows) {
    const match =
      (o.sku ? bySku.get(o.sku.toLowerCase()) : undefined) ||
      (o.listingId ? byListing.get(o.listingId) : undefined);
    const prev = byListingId.get(o.listingId);
    byListingId.set(o.listingId, {
      sku: o.sku || prev?.sku || "",
      title: o.title || prev?.title || match?.title || o.listingId,
      qty: o.qty,
      listingId: o.listingId,
      status: "PUBLISHED",
      price: o.price ?? prev?.price ?? null,
      higlouProductId: match?.id || prev?.higlouProductId || null,
      watchers: o.watchers,
      soldQty: o.soldQty,
      pictureUrl: o.pictureUrl || prev?.pictureUrl || null,
    });
  }

  const inventory = [...byListingId.values()].sort((a, b) => a.qty - b.qty);
  const liveRows = inventory.filter((r) => r.status === "PUBLISHED");
  const inventoryLive = Math.max(trading.total, liveRows.length);
  const inventoryUnits = liveRows.reduce((sum, r) => sum + r.qty, 0);
  const inventoryValue = liveRows.reduce(
    (sum, r) => sum + (r.price || 0) * r.qty,
    0,
  );
  const inventoryLow = liveRows.filter((r) => r.qty > 0 && r.qty <= 1).length;
  const inventoryOut = liveRows.filter((r) => r.qty <= 0).length;
  const watchers = liveRows.reduce((sum, r) => sum + r.watchers, 0);
  const avgOrder = orders.length ? revenue30d / orders.length : 0;

  return {
    syncedAt,
    connected: true,
    storeName,
    orders30d: orders.length,
    units30d,
    revenue30d,
    ordersToday,
    revenueToday,
    avgOrder,
    matchedToHiglou,
    unmatchedEbaySales,
    reflectedThisSync,
    inventoryLive,
    inventoryUnits,
    inventoryValue,
    inventoryLow,
    inventoryOut,
    watchers,
    inventory: inventory.slice(0, 12),
    recent: recent
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 8),
    opportunities: opportunities.slice(0, 8),
    error:
      orders.length === 0 && inventory.length === 0 ? orderError : undefined,
  };
}
