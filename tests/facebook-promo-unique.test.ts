import { describe, expect, it } from "vitest";
import { uniquePromoCardsForPublish } from "@/lib/facebook/promo";
import { productTitleKey } from "@/lib/facebook/promo-groups";

describe("uniquePromoCardsForPublish", () => {
  it("keeps variation titles that differ by color", () => {
    const cards = [
      {
        id: "1",
        title: "Sima Washcloth · Black",
        asin: "B0SIMA0001",
        imageUrl: "https://cdn.example.com/black.jpg",
        linkUrl: "https://shop.example.com/go/a",
      },
      {
        id: "2",
        title: "Sima Washcloth · White",
        asin: "B0SIMA0002",
        imageUrl: "https://cdn.example.com/white.jpg",
        linkUrl: "https://shop.example.com/go/b",
      },
    ];
    expect(uniquePromoCardsForPublish(cards)).toHaveLength(2);
  });

  it("drops the twin card when ASIN, image, title, or link repeats", () => {
    const base = {
      title: "Sima Brand Exfoliating Washcloth",
      asin: "B0SIMA0001",
      imageUrl: "https://cdn.example.com/sima.jpg",
      linkUrl: "https://shop.example.com/go/sima",
      priceLabel: "Amazon · $21.45",
    };
    const twins = [
      { ...base, id: "a" },
      { ...base, id: "b" }, // identical product — must drop
      {
        ...base,
        id: "c",
        asin: "B0SIMA0002",
        imageUrl: "https://cdn.example.com/other.jpg",
        linkUrl: "https://shop.example.com/go/other",
        title: "Sima Brand Exfoliating · Navy",
      },
    ];
    const unique = uniquePromoCardsForPublish(twins);
    expect(unique.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("normalizes titles so whitespace clones collapse", () => {
    expect(productTitleKey("Sima  Brand   Soft")).toBe(
      productTitleKey("Sima Brand Soft"),
    );
  });
});
