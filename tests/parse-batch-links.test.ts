import { describe, expect, it } from "vitest";
import { parseBatchCatalogLinks } from "@/lib/catalog/parse-batch-links";

describe("parseBatchCatalogLinks", () => {
  it("keeps up to 5 unique Amazon links", () => {
    const text = [
      "https://www.amazon.com/dp/B0TEST0001",
      "https://www.amazon.com/dp/B0TEST0002 extra",
      "B0TEST0003",
      "https://www.amazon.com/dp/B0TEST0001",
      "https://www.amazon.com/gp/product/B0TEST0004",
      "https://www.amazon.com/dp/B0TEST0005",
      "https://www.amazon.com/dp/B0TEST0006",
    ].join("\n");
    const { links } = parseBatchCatalogLinks(text);
    expect(links).toHaveLength(5);
    expect(links.map((row) => row.key)).toEqual([
      "B0TEST0001",
      "B0TEST0002",
      "B0TEST0003",
      "B0TEST0004",
      "B0TEST0005",
    ]);
    expect(links.every((row) => row.store === "amazon")).toBe(true);
  });

  it("accepts mixed Amazon and Home Depot links", () => {
    const { links, skipped } = parseBatchCatalogLinks(
      "https://www.homedepot.com/p/Foo/123456789\nhttps://www.amazon.com/dp/B08N5WRWNW\nhttps://www.walmart.com/ip/Great-Value-Milk/10449411\nnot-a-link",
    );
    expect(links.map((row) => row.store)).toEqual([
      "homedepot",
      "amazon",
      "walmart",
    ]);
    expect(skipped.some((row) => /not-a-link/.test(row))).toBe(true);
  });
});
