import { describe, expect, it } from "vitest";
import {
  alibabaSearchUrl,
  aliexpressSearchUrl,
  brandDirectSearchUrl,
  googleLensUrl,
  parseAlibabaSearchHits,
  parseAliExpressSearchHits,
} from "@/lib/sourcing/cheap-sources";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("cheap source URL builders", () => {
  it("builds Alibaba, AliExpress, brand, and Lens links", () => {
    expect(alibabaSearchUrl("Milwaukee 48-73-1430")).toContain(
      "alibaba.com/trade/search",
    );
    expect(alibabaSearchUrl("Milwaukee 48-73-1430")).toContain(
      encodeURIComponent("Milwaukee 48-73-1430"),
    );
    expect(aliexpressSearchUrl("cable organizer")).toContain(
      "aliexpress.us/w/wholesale-",
    );
    expect(brandDirectSearchUrl("Acme", "Widget 887")).toContain(
      "google.com/search",
    );
    expect(googleLensUrl("https://cdn.example.com/p.jpg")).toContain(
      "lens.google.com/uploadbyurl",
    );
  });
});

describe("cheap source HTML parsers", () => {
  it("extracts Alibaba product-detail links", () => {
    const html = `
      <a href="https://www.alibaba.com/product-detail/Milwaukee-Mesh-Shield_1600123456.html">x</a>
      "price":"$12.50"
      <a href="https://www.alibaba.com/product-detail/Other-Tool_1600999.html">y</a>
    `;
    const hits = parseAlibabaSearchHits(html);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.url).toContain("alibaba.com/product-detail/");
  });

  it("extracts AliExpress item links", () => {
    const html = `
      https://www.aliexpress.us/item/3256805123456789.html?algo=
      "title":"Cable Organizer Desk Kit"
      $8.99
    `;
    const hits = parseAliExpressSearchHits(html);
    expect(hits.some((h) => /aliexpress/.test(h.url))).toBe(true);
  });
});

describe("cheap source wiring", () => {
  it("exposes API + Find Winners panel", () => {
    const board = readFileSync(
      join(process.cwd(), "components/winners/find-winners-board.tsx"),
      "utf8",
    );
    const detail = readFileSync(
      join(process.cwd(), "components/winners/winner-detail-panel.tsx"),
      "utf8",
    );
    const api = readFileSync(
      join(process.cwd(), "app/api/winners/cheap-source/route.ts"),
      "utf8",
    );
    expect(board).toMatch(/WinnerDetailPanel|CheapSourcePanel/);
    expect(detail).toMatch(/CheapSourcePanel/);
    expect(api).toMatch(/findCheaperSources/);
    expect(api).toMatch(/identifyProductFromImage|findCheaperSources/);
  });
});
