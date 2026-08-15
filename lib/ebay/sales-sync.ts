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

export type StoreInsight = {
  id: string;
  kind: "send_offer" | "cut_price" | "restock" | "hot";
  title: string;
  detail: string;
  listingId: string;
  pictureUrl: string | null;
  suggestedPct?: number;
  suggestedPrice?: number | null;
};

export type DealRecommend = {
  kind: "offer" | "drop" | "keep";
  pct: number;
  price: number | null;
  afterChance: number;
};

export type DealCard = {
  listingId: string;
  title: string;
  pictureUrl: string | null;
  price: number | null;
  watchers: number;
  soldQty: number;
  inCart: boolean;
  chance: number;
  signal: "close_now" | "hot" | "stuck" | "priced_right" | "sleeping";
  why: string;
  move: string;
  vsStore: "lower" | "higher" | "even" | null;
  recommend: DealRecommend;
};

function clampScore(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function scoreDeals(
  liveRows: InventoryLine[],
  cartMoves: OfferMove[],
): DealCard[] {
  const cartIds = new Set(
    cartMoves.filter((m) => m.kind === "in_cart").map((m) => m.listingId),
  );
  const prices = liveRows
    .map((row) => row.price)
    .filter((n): n is number => n != null && n > 0)
    .sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;

  const cards: DealCard[] = [];
  const seen = new Set<string>();

  const pushCard = (card: DealCard) => {
    if (!card.listingId || seen.has(card.listingId)) return;
    seen.add(card.listingId);
    cards.push(card);
  };

  for (const row of liveRows) {
    const inCart = cartIds.has(row.listingId);
    const vsStore =
      row.price != null && median
        ? row.price < median * 0.92
          ? "lower"
          : row.price > median * 1.12
            ? "higher"
            : "even"
        : null;

    let chance = 10;
    chance += Math.min(36, row.watchers * 8);
    if (inCart) chance += 38;
    chance += Math.min(24, row.soldQty * 6);
    if (vsStore === "lower") chance += 10;
    if (vsStore === "higher" && row.soldQty === 0) chance -= 14;

    let signal: DealCard["signal"];
    let why: string;
    let move: string;

    if (inCart) {
      signal = "close_now";
      why = "Someone has this in a cart right now.";
      move = "Send the price you want — this one can close today.";
      chance = Math.max(chance, 80);
    } else if (row.watchers >= 3 && row.soldQty === 0) {
      signal = "stuck";
      why = `${row.watchers} watching, 0 sold${
        vsStore === "higher" ? " · priced above the store" : ""
      }.`;
      move = "Price is blocking the sale. Set the BIN you want.";
      chance = clampScore(chance, 22, 58);
    } else if (row.watchers >= 3 && row.soldQty > 0) {
      signal = "hot";
      why = `${row.watchers} watching · ${row.soldQty} sold${
        vsStore === "lower" ? " · priced lower than the store" : ""
      }.`;
      move =
        vsStore === "lower"
          ? "High chance to sell again — priced to move."
          : "This one is converting. Keep it, or send a small offer.";
    } else if (row.soldQty > 0) {
      signal = "priced_right";
      why = `${row.soldQty} sold. The price is working.`;
      move =
        vsStore === "lower"
          ? "Priced lower — strong chance to sell again."
          : "Leave it unless you want more volume.";
    } else {
      signal = "sleeping";
      why = "Quiet right now — no watchers, no sales.";
      move = "Drop the BIN to wake it up.";
      chance = clampScore(chance, 4, 18);
    }

    const chanceFinal = clampScore(chance, 4, 96);
    pushCard({
      listingId: row.listingId,
      title: row.title,
      pictureUrl: row.pictureUrl,
      price: row.price,
      watchers: row.watchers,
      soldQty: row.soldQty,
      inCart,
      chance: chanceFinal,
      signal,
      why,
      move,
      vsStore,
      recommend: recommendFor(signal, row.price, chanceFinal),
    });
  }

  for (const move of cartMoves.filter((m) => m.kind === "in_cart")) {
    pushCard({
      listingId: move.listingId,
      title: move.title,
      pictureUrl: move.pictureUrl,
      price: move.price,
      watchers: move.watchers,
      soldQty: 0,
      inCart: true,
      chance: 86,
      signal: "close_now",
      why: "Someone has this in a cart right now.",
      move: "Send the price you want — this one can close today.",
      vsStore: null,
      recommend: recommendFor("close_now", move.price, 86),
    });
  }

  const rank: Record<DealCard["signal"], number> = {
    close_now: 0,
    stuck: 1,
    hot: 2,
    priced_right: 3,
    sleeping: 4,
  };
  const sorted = cards.sort(
    (a, b) =>
      rank[a.signal] - rank[b.signal] ||
      b.chance - a.chance ||
      b.watchers - a.watchers,
  );
  const live = sorted.filter((row) => row.signal !== "sleeping").slice(0, 16);
  const quiet = sorted.filter((row) => row.signal === "sleeping").slice(0, 12);
  return [...live, ...quiet];
}

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
  insights: StoreInsight[];
  deals: DealCard[];
  recent: EbaySaleLine[];
  opportunities: SalesOpportunity[];
  cartError?: string;
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
    insights: [],
    deals: [],
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
  if (rest?.[1]) return rest[1];
  const digits = value.match(/(\d{9,})/);
  return digits?.[1] || value;
}

function listingKeys(raw: string) {
  const value = raw.trim();
  if (!value) return [];
  const keys = new Set<string>([value, legacyListingId(value)]);
  for (const match of value.match(/\d{9,}/g) || []) keys.add(match);
  return [...keys].filter(Boolean);
}

function findByListingId<T extends { listingId: string }>(
  map: Map<string, T>,
  raw: string,
) {
  for (const key of listingKeys(raw)) {
    const row = map.get(key);
    if (row) return row;
  }
  return undefined;
}

function suggestOffer(price: number | null) {
  if (!price || price < 2) return { pct: 0, amount: null as number | null };
  const pct = price >= 50 ? 10 : 5;
  return {
    pct,
    amount: Math.round(price * (1 - pct / 100) * 100) / 100,
  };
}

function dropBy(price: number | null, pct: number) {
  if (!price || price < 2) return { pct: 0, amount: null as number | null };
  const cut = Math.min(20, Math.max(5, pct));
  return {
    pct: cut,
    amount: Math.round(price * (1 - cut / 100) * 100) / 100,
  };
}

function recommendFor(
  signal: DealCard["signal"],
  price: number | null,
  chance: number,
): DealRecommend {
  if (signal === "close_now") {
    const offer = dropBy(price, 10);
    return {
      kind: "offer",
      pct: offer.pct || 10,
      price: offer.amount,
      afterChance: clampScore(chance + 12, chance, 96),
    };
  }
  if (signal === "priced_right") {
    return { kind: "keep", pct: 0, price: null, afterChance: chance };
  }
  const pct = signal === "hot" ? 5 : 10;
  const drop = dropBy(price, pct);
  return {
    kind: "drop",
    pct: drop.pct,
    price: drop.amount,
    afterChance: clampScore(chance + (signal === "sleeping" ? 16 : 22), 8, 88),
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

export async function fetchEligibleOfferListings(
  accessToken: string,
): Promise<{ ids: string[]; error?: string }> {
  const cfg = getEbayConfig();
  const ids: string[] = [];
  let error: string | undefined;

  for (let offset = 0; offset < 200; offset += 50) {
    const res = await fetch(
      `${cfg.apiBase}/sell/negotiation/v1/find_eligible_items?limit=50&offset=${offset}`,
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
    if (res.status === 204) break;
    const json = (await res.json().catch(() => ({}))) as {
      eligibleItems?: Array<{
        listingId?: string;
        legacyItemId?: string;
        itemId?: string;
      }>;
      total?: number;
      errors?: Array<{ message?: string; longMessage?: string }>;
    };
    if (!res.ok) {
      const first = json.errors?.[0];
      error =
        first?.longMessage ||
        first?.message ||
        (res.status === 401 || res.status === 403
          ? "Reconnect eBay in Settings so Higlou can read items in carts."
          : `Could not read eBay carts (${res.status})`);
      break;
    }
    const batch = json.eligibleItems ?? [];
    for (const row of batch) {
      const id = legacyListingId(
        String(row.listingId || row.legacyItemId || row.itemId || ""),
      );
      if (id) ids.push(id);
    }
    if (batch.length < 50) break;
    if (typeof json.total === "number" && offset + 50 >= json.total) break;
  }

  return { ids: [...new Set(ids)], error };
}

type HydratedItem = {
  listingId: string;
  title: string;
  price: number | null;
  pictureUrl: string | null;
};

async function hydrateEbayItems(
  accessToken: string,
  listingIds: string[],
): Promise<Map<string, HydratedItem>> {
  const map = new Map<string, HydratedItem>();
  const ids = [...new Set(listingIds.map(legacyListingId))].filter(Boolean).slice(0, 20);
  if (ids.length === 0) return map;
  const cfg = getEbayConfig();
  const host =
    cfg.env === "production"
      ? "https://open.api.ebay.com/shopping"
      : "https://open.api.sandbox.ebay.com/shopping";
  const res = await fetch(
    `${host}?callname=GetMultipleItems&appid=${encodeURIComponent(cfg.clientId)}&responseencoding=JSON&siteid=0&version=1157&IncludeSelector=Details&ItemID=${ids.join(",")}`,
    {
      headers: {
        "X-EBAY-API-IAF-TOKEN": accessToken,
        "X-EBAY-API-APP-ID": cfg.clientId,
      },
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    Item?:
      | Array<{
          ItemID?: string;
          Title?: string;
          GalleryURL?: string;
          PictureURL?: string | string[];
          CurrentPrice?: { Value?: number | string } | string | number;
        }>
      | {
          ItemID?: string;
          Title?: string;
          GalleryURL?: string;
          PictureURL?: string | string[];
          CurrentPrice?: { Value?: number | string } | string | number;
        };
  };
  const items = Array.isArray(json.Item)
    ? json.Item
    : json.Item
      ? [json.Item]
      : [];
  for (const item of items) {
    const listingId = legacyListingId(String(item.ItemID || ""));
    if (!listingId) continue;
    const pic = Array.isArray(item.PictureURL)
      ? item.PictureURL[0]
      : item.GalleryURL || item.PictureURL;
    const priceRaw =
      typeof item.CurrentPrice === "object"
        ? item.CurrentPrice?.Value
        : item.CurrentPrice;
    map.set(listingId, {
      listingId,
      title: String(item.Title || listingId),
      price: Number(priceRaw) || null,
      pictureUrl: pic
        ? String(pic).replace(/^http:\/\//i, "https://")
        : null,
    });
  }
  return map;
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
  const [ordersResult, offers, trading, storeName, eligibleResult] =
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
      fetchEligibleOfferListings(accessToken).catch(() => ({
        ids: [] as string[],
        error: "Could not read eBay carts",
      })),
    ]);
  const orders = ordersResult.rows;
  const orderError = ordersResult.error;
  const eligibleIds = eligibleResult.ids;
  const cartError = eligibleResult.error;

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
  const indexRow = (row: InventoryLine) => {
    for (const key of listingKeys(row.listingId)) byListingId.set(key, row);
  };
  for (const o of trading.rows) {
    const match =
      (o.sku ? bySku.get(o.sku.toLowerCase()) : undefined) ||
      (o.listingId ? byListing.get(o.listingId) : undefined);
    indexRow({
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
    if (findByListingId(byListingId, o.listingId)) continue;
    const match =
      (o.sku ? bySku.get(o.sku.toLowerCase()) : undefined) ||
      byListing.get(o.listingId);
    indexRow({
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

  const inventory = [
    ...new Map(
      [...byListingId.values()].map((row) => [row.listingId, row]),
    ).values(),
  ].sort(
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
  const unmatchedEligible = eligibleIds.filter(
    (id) => !findByListingId(byListingId, id),
  );
  const hydrated = await hydrateEbayItems(accessToken, unmatchedEligible).catch(
    () => new Map<string, HydratedItem>(),
  );

  for (const listingId of eligibleIds) {
    const canonical = legacyListingId(listingId);
    if (!canonical || seenMoves.has(canonical)) continue;
    seenMoves.add(canonical);
    const row = findByListingId(byListingId, canonical);
    const extra = hydrated.get(canonical);
    const price = row?.price ?? extra?.price ?? null;
    const offer = suggestOffer(price);
    offerMoves.push({
      listingId: row?.listingId || canonical,
      title: row?.title || extra?.title || `eBay item ${canonical}`,
      pictureUrl: row?.pictureUrl || extra?.pictureUrl || null,
      price,
      watchers: row?.watchers || 0,
      suggestedPrice: offer.amount,
      suggestedOffPct: offer.pct,
      why:
        row?.watchers
          ? `${row.watchers} watching — a buyer has this in a cart. Send a discount.`
          : "A buyer has this in a cart (or is watching). Send a discount.",
      href: ebayItemHref(row?.listingId || canonical),
      kind: "in_cart",
    });
  }
  for (const row of trading.bestOffers) {
    const live = findByListingId(byListingId, row.listingId);
    if (seenMoves.has(row.listingId)) continue;
    seenMoves.add(row.listingId);
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

  const insights: StoreInsight[] = [];
  const seenInsight = new Set<string>();
  for (const move of offerMoves.filter((m) => m.kind === "in_cart")) {
    if (insights.length >= 6) break;
    if (seenInsight.has(move.listingId)) continue;
    seenInsight.add(move.listingId);
    insights.push({
      id: `offer-${move.listingId}`,
      kind: "send_offer",
      title: move.title,
      detail: "Buyers in cart or watching — send a private discount now.",
      listingId: move.listingId,
      pictureUrl: move.pictureUrl,
      suggestedPct: move.suggestedOffPct || 10,
      suggestedPrice: move.suggestedPrice,
    });
  }
  const hottest = [...liveRows].sort((a, b) => b.watchers - a.watchers)[0];
  if (hottest && hottest.watchers >= 3 && !seenInsight.has(hottest.listingId)) {
    seenInsight.add(hottest.listingId);
    const offer = suggestOffer(hottest.price);
    insights.push({
      id: `hot-${hottest.listingId}`,
      kind: "hot",
      title: hottest.title,
      detail: `${hottest.watchers} people watching — hottest listing in the store.`,
      listingId: hottest.listingId,
      pictureUrl: hottest.pictureUrl,
      suggestedPct: offer.pct,
      suggestedPrice: offer.amount,
    });
  }
  for (const row of liveRows.filter(
    (r) => r.watchers >= 3 && r.soldQty === 0 && (r.price || 0) >= 2,
  )) {
    if (seenInsight.has(row.listingId) || insights.length >= 6) continue;
    seenInsight.add(row.listingId);
    const offer = suggestOffer(row.price);
    insights.push({
      id: `cut-${row.listingId}`,
      kind: "cut_price",
      title: row.title,
      detail: `${row.watchers} watching, 0 sold. Drop the BIN price to close it.`,
      listingId: row.listingId,
      pictureUrl: row.pictureUrl,
      suggestedPct: offer.pct,
      suggestedPrice: offer.amount,
    });
  }
  for (const row of stockAlerts) {
    if (seenInsight.has(row.listingId) || insights.length >= 6) continue;
    seenInsight.add(row.listingId);
    insights.push({
      id: `stock-${row.listingId}`,
      kind: "restock",
      title: row.title,
      detail: `${row.why} ${row.fix}`,
      listingId: row.listingId,
      pictureUrl: row.pictureUrl,
    });
  }

  const deals = scoreDeals(liveRows, offerMoves);
  const dealIds = new Set(deals.map((row) => row.listingId));
  const rankedInventory = [
    ...inventory.filter((row) => dealIds.has(row.listingId)),
    ...inventory.filter((row) => !dealIds.has(row.listingId)),
  ];

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
    inventory: rankedInventory.slice(0, 40),
    stockAlerts: stockAlerts.slice(0, 16),
    offerMoves: offerMoves.slice(0, 16),
    insights: insights.slice(0, 6),
    deals,
    recent: recent
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 12),
    opportunities: opportunities.slice(0, 8),
    cartError,
    error:
      orders.length === 0 && inventory.length === 0 ? orderError : undefined,
  };
}
