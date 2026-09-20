import { describe, expect, it } from "vitest";
import {
  buildExactSourcingQuery,
  filterSameProductOffers,
  isSameProductOffer,
} from "@/lib/sourcing/same-product";

describe("same-product sourcing filter", () => {
  it("builds brand + MPN as the primary factory query", () => {
    const q = buildExactSourcingQuery({
      brand: "Milwaukee",
      mpn: "48-73-1430",
      title: "Milwaukee BOLT Metal Mesh Face Shield with Hard Hat Adapter",
    });
    expect(q.primary).toBe("Milwaukee 48-73-1430");
    expect(q.primary.toLowerCase()).not.toContain("adapter");
  });

  it("accepts offers that contain the catalog model", () => {
    const hints = {
      brand: "Milwaukee",
      mpn: "48-73-1430",
      title: "Milwaukee Metal Mesh Face Shield",
    };
    expect(
      isSameProductOffer(
        "Milwaukee 48-73-1430 BOLT Mesh Face Shield OEM",
        hints,
      ).ok,
    ).toBe(true);
    expect(
      isSameProductOffer("Generic Face Shield for Hard Hats Wholesale", hints)
        .ok,
    ).toBe(false);
    expect(
      isSameProductOffer("Dewalt Mesh Face Shield 48-73-1430", hints).ok,
    ).toBe(false);
  });

  it("drops Alibaba category junk without the model code", () => {
    const kept = filterSameProductOffers(
      [
        { title: "Safety Face Shield Wholesale Bulk" },
        { title: "Milwaukee 48-73-1430 Mesh Face Shield" },
        { title: "Hard Hat Accessories Assorted" },
      ],
      {
        brand: "Milwaukee",
        mpn: "48-73-1430",
        title: "Milwaukee Metal Mesh Face Shield",
      },
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]?.title).toMatch(/48-73-1430/);
  });
});
