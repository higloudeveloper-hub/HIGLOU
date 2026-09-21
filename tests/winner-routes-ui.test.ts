import { describe, expect, it } from "vitest";
import {
  WINNER_PLAYS,
  WINNER_ROUTES,
  finderUiRoutes,
  routesForPlay,
} from "@/lib/opportunity/winner-routes";

describe("winner routes UI", () => {
  it("shows only verified Amazon demand winners in the finder UI", () => {
    expect(finderUiRoutes().map((r) => r.id)).toEqual(["amazon"]);
    expect(routesForPlay("amazon_direct").map((r) => r.id)).toEqual(["amazon"]);
    expect(WINNER_PLAYS).toHaveLength(1);
    expect(WINNER_PLAYS[0]?.id).toBe("amazon_direct");
  });

  it("hides arbitrage from the finder but keeps it for API / Market", () => {
    expect(
      WINNER_ROUTES.find((r) => r.id === "amazon_to_ebay")?.ui,
    ).toBe(false);
    expect(WINNER_ROUTES.some((r) => r.id === "walmart_to_ebay")).toBe(true);
    expect(
      WINNER_ROUTES.find((r) => r.id === "walmart_to_ebay")?.ui,
    ).toBe(false);
  });
});
