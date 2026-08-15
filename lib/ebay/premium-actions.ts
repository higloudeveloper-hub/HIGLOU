import { getEbayConfig } from "@/lib/ebay/config";

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 10;
  return Math.min(20, Math.max(5, Math.round(n)));
}

function xmlAckError(xml: string) {
  if (!/<Ack>Failure<\/Ack>/i.test(xml) && !/<Ack>PartialFailure<\/Ack>/i.test(xml)) {
    return null;
  }
  return (
    xml.match(/<LongMessage>([^<]+)<\/LongMessage>/i)?.[1] ||
    xml.match(/<ShortMessage>([^<]+)<\/ShortMessage>/i)?.[1] ||
    "eBay rejected the change"
  );
}

async function tradingXml(accessToken: string, callName: string, body: string) {
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

export async function sendOfferToInterestedBuyers(
  accessToken: string,
  listingIds: string[],
  discountPercentage: number,
) {
  const ids = [...new Set(listingIds.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    10,
  );
  if (ids.length === 0) throw new Error("Pick a listing to send the offer.");
  const pct = clampPct(discountPercentage);
  const cfg = getEbayConfig();
  let sent = 0;
  let lastError = "";

  // eBay only accepts one listing per call, and allowCounterOffer must be false.
  for (const listingId of ids) {
    const res = await fetch(
      `${cfg.apiBase}/sell/negotiation/v1/send_offer_to_interested_buyers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Language": "en-US",
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
        body: JSON.stringify({
          allowCounterOffer: false,
          message:
            "Thanks for your interest — here's a special price from the seller.",
          offerDuration: { unit: "DAY", value: 2 },
          offeredItems: [
            {
              listingId,
              quantity: 1,
              discountPercentage: String(pct),
            },
          ],
        }),
        cache: "no-store",
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      errors?: Array<{ message?: string; longMessage?: string }>;
    };
    if (!res.ok) {
      const first = json.errors?.[0];
      lastError =
        first?.longMessage ||
        first?.message ||
        (res.status === 403
          ? "Reconnect eBay in Settings so Higlou can send offers."
          : `Could not send offer (${res.status})`);
      continue;
    }
    sent += 1;
  }

  if (sent === 0) {
    throw new Error(lastError || "Could not send offer.");
  }
  return { sent, percent: pct };
}

export async function reviseListingPrice(
  accessToken: string,
  listingId: string,
  price: number,
) {
  const id = listingId.trim();
  const next = Math.round(price * 100) / 100;
  if (!id) throw new Error("Missing listing.");
  if (!Number.isFinite(next) || next < 1) {
    throw new Error("Price must be at least $1.00.");
  }
  const xml = await tradingXml(
    accessToken,
    "ReviseItem",
    `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <ItemID>${id}</ItemID>
    <StartPrice>${next.toFixed(2)}</StartPrice>
  </Item>
</ReviseItemRequest>`,
  );
  const fail = xmlAckError(xml);
  if (fail) throw new Error(fail.replace(/&apos;/g, "'"));
  return { listingId: id, price: next };
}
