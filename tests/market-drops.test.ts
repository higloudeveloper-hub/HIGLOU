import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPlatformWinner,
  platformKeep,
  sortPlatformWinners,
} from "@/lib/opportunity/platform-winner";
import {
  mergeMarketFeed,
  opportunityToMarketDrop,
} from "@/lib/market/from-opportunity";
import type { OpportunityProduct } from "@/lib/opportunity/types";

function readRepo(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function winner(partial: Partial<OpportunityProduct> = {}): OpportunityProduct {
  return {
    asin: "B0TESTWIN1",
    title: "Cable organizer kit",
    brand: "Higlou",
    imageUrl: "https://m.media-amazon.com/images/I/01RmK+J4pJL._AC_SL1500_.jpg",
    amazonPrice: 18,
    cost: 18,
    ebayActiveLow: 42,
    ebayActiveMedian: 48,
    ebayPrice: 42,
    ebayActiveCount: 12,
    hypotheticalKeep: 16.5,
    score: 78,
    verdict: "keep",
    identityConfidence: 60,
    mode: "amazon_to_ebay",
    ...partial,
  } as OpportunityProduct;
}

describe("platform winners", () => {
  it("accepts real ask keep and rejects losers", () => {
    expect(isPlatformWinner(winner())).toBe(true);
    expect(platformKeep(winner())).toBe(16.5);
    expect(
      isPlatformWinner(winner({ hypotheticalKeep: 2, netProfit: 2 })),
    ).toBe(false);
    expect(isPlatformWinner(winner({ verdict: "reject" }))).toBe(false);
    expect(isPlatformWinner(winner({ asin: "BAD" }))).toBe(false);
  });

  it("stocks market only from verified winners", () => {
    const junk = winner({
      asin: "B0JUNK0001",
      hypotheticalKeep: 1,
      ebayActiveLow: 19,
    });
    const good = winner({ asin: "B0GOOD0001" });
    const merged = mergeMarketFeed({ ledgerHits: [junk, good], limit: 10 });
    expect(merged.curatedCount).toBe(0);
    expect(merged.ledgerCount).toBe(1);
    expect(merged.drops[0]?.asin).toBe("B0GOOD0001");
    expect(merged.drops[0]?.real).toBe(true);
    expect(opportunityToMarketDrop(junk)).toBeNull();
  });

  it("sorts by keep", () => {
    const a = winner({ asin: "B0AAAAAAA1", hypotheticalKeep: 12 });
    const b = winner({ asin: "B0BBBBBBB1", hypotheticalKeep: 28 });
    expect(sortPlatformWinners([a, b])[0]?.asin).toBe("B0BBBBBBB1");
  });
});

describe("higlou market + find winners wiring", () => {
  it("wires verified-only market and find winners board", () => {
    expect(readRepo("app/market/page.tsx")).toMatch(/DropMarketStudio/);
    expect(readRepo("app/api/market/claim/route.ts")).toMatch(/market_drop_claimed/);
    expect(readRepo("app/api/market/claim/route.ts")).not.toMatch(/getMarketDrop/);
    expect(readRepo("app/api/market/feed/route.ts")).toMatch(/limit: 40/);
    expect(readRepo("app/api/market/feed/route.ts")).toMatch(/isPlatformWinner/);
    expect(readRepo("app/api/market/feed/route.ts")).toMatch(/No demo products/);
    expect(readRepo("app/home/page.tsx")).toMatch(/MarketDropPopup/);
    expect(readRepo("components/layout/app-sidebar.tsx")).toMatch(
      /href: "\/market"/,
    );
    expect(readRepo("components/market/drop-market.tsx")).toMatch(
      /Only platform-verified/,
    );
    expect(readRepo("components/market/drop-market.tsx")).toMatch(
      /Verified floor/,
    );
    expect(readRepo("components/market/drop-market.tsx")).toMatch(
      /Market is empty/,
    );
    expect(readRepo("components/studio/find-winners-studio.tsx")).toMatch(
      /FindWinnersBoard/,
    );
    expect(readRepo("components/winners/find-winners-board.tsx")).toMatch(
      /isPlatformWinner/,
    );
    expect(readRepo("lib/market/from-opportunity.ts")).toMatch(
      /No invented catalog/,
    );
  });
});
