import { describe, expect, it } from "vitest";
import { scoreProductIdentity } from "@/lib/opportunity/identity";
import { OPPORTUNITY_MODES, onlySellableForMode } from "@/lib/opportunity/mode-copy";
import {
  destMarketFor,
  requiresExactGtin,
  sourceMarketFor,
} from "@/lib/opportunity/markets";
import { parseHomeDepotSearchHits } from "@/lib/homedepot/search-products";
import { parseWalmartSearchHits } from "@/lib/walmart/search-products";
import { finishRouteProduct, emptyRouteProduct } from "@/lib/opportunity/routes/finish-route";
import { isConfirmedOpportunity } from "@/lib/opportunity/score";

describe("multi-route opportunity modes", () => {
  it("exposes amazon↔ebay, HD, and Walmart routes", () => {
    const ids = OPPORTUNITY_MODES.map((row) => row.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "amazon_to_ebay",
        "ebay_to_amazon",
        "homedepot_to_ebay",
        "homedepot_to_amazon",
        "walmart_to_ebay",
        "walmart_to_amazon",
      ]),
    );
  });

  it("maps source and dest markets", () => {
    expect(sourceMarketFor("walmart_to_ebay")).toBe("walmart");
    expect(destMarketFor("walmart_to_ebay")).toBe("ebay");
    expect(sourceMarketFor("ebay_to_amazon")).toBe("ebay");
    expect(destMarketFor("homedepot_to_amazon")).toBe("amazon");
    expect(requiresExactGtin("homedepot_to_ebay")).toBe(true);
    expect(onlySellableForMode("amazon_to_ebay")).toBe(false);
  });
});

describe("scoreProductIdentity cross-market", () => {
  it("treats matching UPC as exact (97+)", () => {
    const score = scoreProductIdentity({
      sourceTitle: "DEWALT Drill 1 Pack",
      destTitle: "DEWALT Drill 1-Pack",
      sourceUpc: "885911123456",
      destUpc: "885911123456",
      sourceBrand: "DEWALT",
      destBrand: "DEWALT",
    });
    expect(score.gtinExact).toBe(true);
    expect(score.confidence).toBeGreaterThanOrEqual(97);
    expect(score.reject).toBe(false);
  });

  it("rejects pack mismatches", () => {
    const score = scoreProductIdentity({
      sourceTitle: "Glue 2 Pack",
      destTitle: "Glue 4 Pack",
      sourceUpc: "123456789012",
    });
    expect(score.reject).toBe(true);
    expect(score.confidence).toBe(0);
  });
});

describe("retail search parsers", () => {
  it("parses Home Depot searchModel JSON", () => {
    const body = JSON.stringify({
      data: {
        searchModel: {
          products: [
            {
              itemId: "312119566",
              identifiers: {
                brandName: "DEWALT",
                modelNumber: "DCD771C2",
                productLabel: "DEWALT 20V Drill",
                upc: "885911349999",
              },
              media: { images: [{ url: "https://images.thdstatic.com/x.jpg" }] },
            },
          ],
        },
      },
    });
    const hits = parseHomeDepotSearchHits(body);
    expect(hits[0]?.itemId).toBe("312119566");
    expect(hits[0]?.brand).toBe("DEWALT");
    expect(hits[0]?.upc).toBe("885911349999");
  });

  it("parses Walmart /ip links from search HTML", () => {
    const html = `
      <a href="https://www.walmart.com/ip/Some-Product/10449411">x</a>
      <a href="https://www.walmart.com/ip/10449412">y</a>
    `;
    const hits = parseWalmartSearchHits(html);
    expect(hits.map((h) => h.itemId)).toEqual(
      expect.arrayContaining(["10449411", "10449412"]),
    );
  });
});

describe("finishRouteProduct exactness", () => {
  it("keeps weak identity as candidate with null netProfit", () => {
    let hit = emptyRouteProduct("walmart_to_ebay", "10449411");
    hit = {
      ...hit,
      title: "Mystery Item",
      cost: 20,
      ebayPrice: 45,
      ebayActiveMedian: 45,
      ebayFees: 6,
      upc: "",
    };
    const finished = finishRouteProduct(hit);
    expect(finished.soldVerified).toBe(false);
    expect(finished.netProfit).toBeNull();
    expect(["candidate", "watch", "reject"]).toContain(finished.verdict);
    expect(finished.verdict === "good" || finished.verdict === "winner").toBe(
      false,
    );
  });

  it("marks exact GTIN retail→ebay as good/watch with hypothetical keep", () => {
    let hit = emptyRouteProduct("homedepot_to_ebay", "312119566");
    hit = {
      ...hit,
      title: "DEWALT Drill 1 Pack",
      brand: "DEWALT",
      upc: "885911349999",
      cost: 79,
      ebayPrice: 129,
      ebayActiveMedian: 129,
      ebayFees: 18,
      ebayTitle: "DEWALT Drill 1-Pack",
      ebayMatchedByGtin: true,
    };
    const finished = finishRouteProduct(hit);
    expect(finished.identityConfidence).toBeGreaterThanOrEqual(97);
    expect(finished.ebayMatchedByGtin).toBe(true);
    expect(finished.hypotheticalKeep).not.toBeNull();
    expect(finished.netProfit).toBeNull();
    expect(["good", "watch", "candidate"]).toContain(finished.verdict);
    expect(isConfirmedOpportunity(finished, "homedepot_to_ebay")).toBe(true);
  });
});
