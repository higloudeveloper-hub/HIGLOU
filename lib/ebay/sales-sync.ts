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
  listedQty: number;
  listingId: string;
  status: string;
  price: number | null;
  higlouProductId: string | null;
  watchers: number;
  soldQty: number;
  pictureUrl: string | null;
};

export type StockAlert = {
  listingId: string;
  title: string;
  pictureUrl: string | null;
  qty: number;
  kind: "out" | "low";
  why: string;
  fix: string;
  href: string;
};

export type OfferMove = {
  listingId: string;
  title: string;
  pictureUrl: string | null;
  price: number | null;
  watchers: number;
  suggestedPrice: number | null;
  suggestedOffPct: number;
  why: string;
  href: string;
  kind: "in_cart" | "best_offer";
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
  inCart: number;
  inventory: InventoryLine[];
  stockAlerts: StockAlert[];
  offerMoves: OfferMove[];
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
    inCart: 0,
    inventory: [],
    stockAlerts: [],
    offerMoves: [],
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
  return (
    block
      .match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"))?.[1]
      ?.trim() || ""
  );
}

function decodeXmlText(raw: string) {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function xmlSection(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "i"))?.[0] || "";
}

function pictureFromItemXml(block: string) {
  const raw =
    xmlTag(block, "GalleryURL") ||
    xmlTag(block, "PictureURL") ||
    xmlTag(block, "GalleryPlusPictureURL");
  if (!raw) return null;
  const url = decodeXmlText(raw).replace(/^http:\/\//i, "https://");
  return url.startsWith("https://") ? url : null;
}

function parseItemBlocks(sectionXml: string) {
  return sectionXml.match(/<Item>([\s\S]*?)<\/Item>/gi) || [];
}

function legacyListingId(raw: string) {
  const value = raw.trim();
  const rest = value.match(/^v1\|(\d+)/i);
  return rest?.[1] || value;
}

function suggestOffer(price: number | null) {
  if (!price || price < 2) return { pct: 0, amount: null as number | null };
  const pct = price >= 50 ? 10 : 5;
  return {
    pct,
    amount: Math.round(price * (1 - pct / 100) * 100) / 100,
  };
}

function ebayItemHref(listingId: string) {
  return listingId ? `https://www.ebay.com/itm/${listingId}` : "";
}

function ebayBestOfferHref(listingId: string) {
  return `https://www.ebay.com/vod/FetchBestOffers?itemid=${listingId}`;
}

type TradingRow = {
  sku: string;
  status: string;
  qty: number;
  listedQty: number;
  listingId: string;
  title: string;
  price: number | null;
  watchers: number;
  soldQty: number;
  pictureUrl: string | null;
};

function parseTradingItem(block: string): TradingRow | null {
  const listingId = xmlTag(block, "ItemID");
  if (!listingId) return null;
  const listedQty = Number(xmlTag(block, "Quantity") || "0");
  const soldQty = Number(xmlTag(block, "QuantitySold") || "0");
  const availableRaw = xmlTag(block, "QuantityAvailable");
  const qty = Math.max(
    0,
    availableRaw ? Number(availableRaw) : listedQty - soldQty,
  );
  const priceRaw =
    block.match(
      /<SellingStatus>[\s\S]*?<CurrentPrice[^>]*>([^<]+)<\/CurrentPrice>/i,
    )?.[1] || xmlTag(block, "BuyItNowPrice");
  return {
    sku: xmlTag(block, "SKU") || xmlTag(block, "CustomLabel") || listingId,
    status: "PUBLISHED",
    qty: Number.isFinite(qty) ? qty : 0,
    listedQty: Number.isFinite(listedQty) ? listedQty : 0,
    listingId,
    title: decodeXmlText(xmlTag(block, "Title") || listingId),
    price: Number(priceRaw) || null,
    watchers: Number(xmlTag(block, "WatchCount") || "0") || 0,
    soldQty: Number.isFinite(soldQty) ? soldQty : 0,
    pictureUrl: pictureFromItemXml(block),
  };
}

async function fetchTradingActiveInventory(accessToken: string): Promise<{
  total: number;
  rows: TradingRow[];
  bestOffers: TradingRow[];
}> {
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
      <PageNumber>1</PageNumber>
    </Pagination>
  </ActiveList>
  <BestOfferList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>50</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </BestOfferList>
</GetMyeBaySellingRequest>`,
  );
  if (/<Ack>Failure<\/Ack>/i.test(xml)) {
    return { total: 0, rows: [], bestOffers: [] };
  }

  const activeXml = xmlSection(xml, "ActiveList");
  const offerXml = xmlSection(xml, "BestOfferList");
  const rows = parseItemBlocks(activeXml)
    .map(parseTradingItem)
    .filter((row): row is TradingRow => Boolean(row));
  const bestOffers = parseItemBlocks(offerXml)
    .map(parseTradingItem)
    .filter((row): row is TradingRow => Boolean(row));
  const total = Number(
    activeXml.match(
      /<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/i,
    )?.[1] || rows.length,
  );
  return { total: total || rows.length, rows, bestOffers };
}

async function fetchEligibleOfferListings(
  accessToken: string,
): Promise<string[]> {
  const cfg = getEbayConfig();
  const res = await fetch(
    `${cfg.apiBase}/sell/negotiation/v1/find_eligible_items?limit=50`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    eligibleItems?: Array<{ listingId?: string }>;
  };
  if (!res.ok) return [];
  return (json.eligibleItems ?? [])
    .map((row) => legacyListingId(String(row.listingId || "")))
    .filter(Boolean);
}

async function fillMissingPictures(
  accessToken: string,
  rows: Array<{ listingId: string; pictureUrl: string | null }>,
) {
  const missing = rows.filter((row) => row.listingId && !row.pictureUrl);
  if (missing.length === 0) return;
  const cfg = getEbayConfig();
  const host =
    cfg.env === "production"
      ? "https://open.api.ebay.com/shopping"
      : "https://open.api.sandbox.ebay.com/shopping";
  const chunk = missing.slice(0, 20);
  const ids = chunk.map((row) => row.listingId).join(",");
  const res = await fetch(
    `${host}?callname=GetMultipleItems&responseencoding=JSON&siteid=0&version=1157&IncludeSelector=Details&ItemID=${ids}`,
    {
      headers: {
        "X-EBAY-API-IAF-TOKEN": accessToken,
        "X-EBAY-API-APP-ID": cfg.clientId,
      },
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    Item?: Array<{
      ItemID?: string;
      GalleryURL?: string;
      PictureURL?: string | string[];
    }>;
  };
  const items = Array.isArray(json.Item)
    ? json.Item
    : json.Item
      ? [json.Item]
      : [];
  const byId = new Map<string, string>();
  for (const item of items) {
    const id = String(item.ItemID || "");
    const pic = Array.isArray(item.PictureURL)
      ? item.PictureURL[0]
      : item.GalleryURL || item.PictureURL;
    if (id && pic) byId.set(id, String(pic).replace(/^http:\/\//i, "https://"));
  }
  for (const row of rows) {
    if (!row.pictureUrl) row.pictureUrl = byId.get(row.listingId) || null;
  }
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
  const [ordersResult, offers, trading, storeName, eligibleIds] =
    await Promise.all([
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
        rows: [] as TradingRow[],
        bestOffers: [] as TradingRow[],
      })),
      fetchEbayStoreName(accessToken).catch(() => null),
      fetchEligibleOfferListings(accessToken).catch(() => [] as string[]),
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
  const productIds = products.map((p) => p.id);
  const coverByProduct = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: images } = await supabase
      .from("product_images")
      .select("product_id, public_url, is_primary, sort_order")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true });
    const sorted = [...(images ?? [])].sort((a, b) => {
      const primary = (a.is_primary ? 0 : 1) - (b.is_primary ? 0 : 1);
      if (primary !== 0) return primary;
      return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    });
    for (const img of sorted) {
      const id = String(img.product_id);
      const url = String(img.public_url ?? "");
      if (url && !coverByProduct.has(id)) coverByProduct.set(id, url);
    }
  }

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
  for (const o of trading.rows) {
    const match =
      (o.sku ? bySku.get(o.sku.toLowerCase()) : undefined) ||
      (o.listingId ? byListing.get(o.listingId) : undefined);
    byListingId.set(o.listingId, {
      sku: o.sku,
      title: o.title || match?.title || o.listingId,
      qty: o.qty,
      listedQty: o.listedQty || o.qty,
      listingId: o.listingId,
      status: "PUBLISHED",
      price: o.price,
      higlouProductId: match?.id || null,
      watchers: o.watchers,
      soldQty: o.soldQty,
      pictureUrl: o.pictureUrl || (match ? coverByProduct.get(match.id) || null : null),
    });
  }
  for (const o of offers.filter(
    (row) => row.status === "PUBLISHED" && row.listingId && row.qty > 0,
  )) {
    if (byListingId.has(o.listingId)) continue;
    const match =
      (o.sku ? bySku.get(o.sku.toLowerCase()) : undefined) ||
      byListing.get(o.listingId);
    byListingId.set(o.listingId, {
      sku: o.sku,
      title: o.title || match?.title || o.sku || o.listingId || "Listing",
      qty: o.qty,
      listedQty: o.qty,
      listingId: o.listingId,
      status: "PUBLISHED",
      price: o.price,
      higlouProductId: match?.id || null,
      watchers: 0,
      soldQty: 0,
      pictureUrl: match ? coverByProduct.get(match.id) || null : null,
    });
  }

  const inventory = [...byListingId.values()].sort(
    (a, b) => b.watchers - a.watchers || a.title.localeCompare(b.title),
  );
  const liveRows = inventory.filter((r) => r.status === "PUBLISHED");
  await fillMissingPictures(accessToken, liveRows).catch(() => undefined);

  const inventoryLive = Math.max(trading.total, liveRows.length);
  const inventoryUnits = liveRows.reduce((sum, r) => sum + r.qty, 0);
  const inventoryValue = liveRows.reduce(
    (sum, r) => sum + (r.price || 0) * r.qty,
    0,
  );
  const outRows = liveRows.filter((r) => r.qty <= 0);
  const lowRows = liveRows.filter((r) => r.listedQty > 1 && r.qty === 1);
  const inventoryLow = lowRows.length;
  const inventoryOut = outRows.length;
  const watchers = liveRows.reduce((sum, r) => sum + r.watchers, 0);
  const avgOrder = orders.length ? revenue30d / orders.length : 0;

  const stockAlerts: StockAlert[] = [
    ...outRows.map((row) => ({
      listingId: row.listingId,
      title: row.title,
      pictureUrl: row.pictureUrl,
      qty: row.qty,
      kind: "out" as const,
      why: "Sold out — 0 left on eBay.",
      fix: "Revise the listing and add quantity, or relist it.",
      href: ebayItemHref(row.listingId),
    })),
    ...lowRows.map((row) => ({
      listingId: row.listingId,
      title: row.title,
      pictureUrl: row.pictureUrl,
      qty: row.qty,
      kind: "low" as const,
      why: `Only 1 left of ${row.listedQty} listed.`,
      fix: "Add stock on eBay so the listing does not go dark.",
      href: ebayItemHref(row.listingId),
    })),
  ];

  const offerMoves: OfferMove[] = [];
  const seenMoves = new Set<string>();
  for (const listingId of eligibleIds) {
    const row = byListingId.get(listingId);
    if (!row || seenMoves.has(listingId)) continue;
    seenMoves.add(listingId);
    const offer = suggestOffer(row.price);
    offerMoves.push({
      listingId,
      title: row.title,
      pictureUrl: row.pictureUrl,
      price: row.price,
      watchers: row.watchers,
      suggestedPrice: offer.amount,
      suggestedOffPct: offer.pct,
      why:
        row.watchers > 0
          ? `${row.watchers} watching — in a cart or watching. Send a discount.`
          : "A buyer has this in a cart or is watching. Send a discount.",
      href: ebayItemHref(listingId),
      kind: "in_cart",
    });
  }
  for (const row of trading.bestOffers) {
    const live = byListingId.get(row.listingId);
    if (seenMoves.has(row.listingId) && offerMoves.some((m) => m.kind === "best_offer" && m.listingId === row.listingId)) {
      continue;
    }
    offerMoves.push({
      listingId: row.listingId,
      title: live?.title || row.title,
      pictureUrl: live?.pictureUrl || row.pictureUrl,
      price: live?.price ?? row.price,
      watchers: live?.watchers || 0,
      suggestedPrice: null,
      suggestedOffPct: 0,
      why: "A buyer sent a Best Offer. Accept, decline, or counter on eBay.",
      href: ebayBestOfferHref(row.listingId),
      kind: "best_offer",
    });
  }

  const inCart = offerMoves.filter((m) => m.kind === "in_cart").length;
  if (inCart === 0) {
    for (const row of liveRows.filter((r) => r.watchers > 0).slice(0, 8)) {
      if (seenMoves.has(row.listingId)) continue;
      seenMoves.add(row.listingId);
      const offer = suggestOffer(row.price);
      offerMoves.push({
        listingId: row.listingId,
        title: row.title,
        pictureUrl: row.pictureUrl,
        price: row.price,
        watchers: row.watchers,
        suggestedPrice: offer.amount,
        suggestedOffPct: offer.pct,
        why: `${row.watchers} watching. Send a discount on eBay to close it.`,
        href: ebayItemHref(row.listingId),
        kind: "in_cart",
      });
    }
  }

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
    inCart,
    inventory: inventory.slice(0, 24),
    stockAlerts: stockAlerts.slice(0, 16),
    offerMoves: offerMoves.slice(0, 16),
    recent: recent
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 12),
    opportunities: opportunities.slice(0, 8),
    error:
      orders.length === 0 && inventory.length === 0 ? orderError : undefined,
  };
}
