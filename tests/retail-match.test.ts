import { describe, expect, it } from "vitest";
import {
  buildRetailSearchQueries,
  pickBestRetailHit,
  retailTitleScore,
} from "@/lib/opportunity/retail-match";
import { buildEbaySearchQuery } from "@/lib/ebay/live-prices";

describe("retail match queries", () => {
  it("tries UPC then brand+model then short title — not UPC alone", () => {
    const qs = buildRetailSearchQueries({
      title: "Milwaukee BOLT Metal Mesh Face Shield with Hard Hat Adapter",
      brand: "Milwaukee",
      model: "48-73-1430",
      mpn: "48-73-1430",
      upc: "045242512345",
    });
    expect(qs[0]).toBe("045242512345");
    expect(qs.some((q) => /48-73-1430/.test(q))).toBe(true);
    expect(qs.some((q) => /Milwaukee/i.test(q) && /Mesh|Face|Shield/i.test(q))).toBe(
      true,
    );
    expect(qs.length).toBeGreaterThan(2);
  });

  it("scores the real product above a hard-hat sibling", () => {
    const hints = {
      brand: "Milwaukee",
      model: "48-73-1430",
      title: "Milwaukee Metal Mesh Face Shield with Hard Hat",
    };
    const shield = retailTitleScore(
      "Milwaukee BOLT Metal Mesh Face Shield with Hard Hat",
      hints,
    );
    const hat = retailTitleScore(
      "Milwaukee Hard Hat with Ratchet Suspension, White",
      hints,
    );
    expect(shield).toBeGreaterThan(hat);
    const picked = pickBestRetailHit(
      [
        {
          title: "Milwaukee Hard Hat with Ratchet Suspension, White",
          upc: "",
        },
        {
          title: "Milwaukee BOLT Metal Mesh Face Shield with Hard Hat",
          upc: "",
        },
      ],
      hints,
    );
    expect(picked?.hit.title).toMatch(/Mesh Face Shield/i);
  });

  it("accepts a UPC exact hit even with a weak title", () => {
    const picked = pickBestRetailHit(
      [
        { title: "Generic item", upc: "045242512345" },
        { title: "Other", upc: "999999999999" },
      ],
      { upc: "045242512345", title: "Something else entirely", brand: "Acme" },
    );
    expect(picked?.matchedBy).toBe("upc");
    expect(picked?.hit.upc).toBe("045242512345");
  });
});

describe("buildEbaySearchQuery keeps model codes", () => {
  it("keeps hyphen catalog numbers and leading brand", () => {
    const q = buildEbaySearchQuery(
      "Milwaukee BOLT Metal Mesh Face Shield 48-73-1430 Hard Hat",
      "Milwaukee",
      "48-73-1430",
    );
    expect(q.toLowerCase()).toContain("milwaukee");
    expect(q).toContain("48-73-1430");
    expect(q.toLowerCase()).toContain("mesh");
  });

  it("keeps numeric model tokens that used to be dropped", () => {
    const q = buildEbaySearchQuery("Acme Widget 887 Pack for Kitchen", "Acme");
    expect(q).toMatch(/887/);
  });
});
