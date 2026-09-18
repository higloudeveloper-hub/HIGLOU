import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MARKET_DROPS,
  getMarketDrop,
  marketSpread,
  pickMarketDrop,
} from "@/lib/market/catalog";

function readRepo(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("higlou market catalog", () => {
  it("stocks a dense floor of claimable drops", () => {
    expect(MARKET_DROPS.length).toBeGreaterThanOrEqual(24);
    for (const drop of MARKET_DROPS) {
      expect(drop.id).toBeTruthy();
      expect(drop.sell).toBeGreaterThan(drop.buy);
      expect(marketSpread(drop)).toBe(drop.sell - drop.buy);
      expect(getMarketDrop(drop.id)?.title).toBe(drop.title);
    }
    expect(pickMarketDrop(0).id).toBe(MARKET_DROPS[0]!.id);
  });

  it("wires market page, claim API, home popup, and nav", () => {
    expect(readRepo("app/market/page.tsx")).toMatch(/DropMarketStudio/);
    expect(readRepo("app/api/market/claim/route.ts")).toMatch(/market_drop_claimed/);
    expect(readRepo("app/api/market/feed/route.ts")).toMatch(/limit: 40/);
    expect(readRepo("app/home/page.tsx")).toMatch(/MarketDropPopup/);
    expect(readRepo("components/layout/app-sidebar.tsx")).toMatch(
      /href: "\/market"/,
    );
    expect(readRepo("components/market/drop-market.tsx")).toMatch(
      /Always/,
    );
    expect(readRepo("components/market/drop-market.tsx")).toMatch(
      /Live floor/,
    );
    expect(readRepo("components/market/price-drop.tsx")).toMatch(/vs ask/);
    expect(readRepo("lib/market/from-opportunity.ts")).toMatch(
      /Always stock the floor/,
    );
  });
});
