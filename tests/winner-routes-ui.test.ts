import { describe, expect, it } from "vitest";
import {
  WINNER_PLAYS,
  WINNER_ROUTES,
  routesForPlay,
} from "@/lib/opportunity/winner-routes";

describe("winner routes UI", () => {
  it("keeps only real arbitrage + Amazon demand in the finder UI", () => {
    expect(routesForPlay("arbitrage").map((r) => r.id)).toEqual([
      "amazon_to_ebay",
    ]);
    expect(routesForPlay("amazon_direct").map((r) => r.id)).toEqual([
      "amazon",
    ]);
    expect(WINNER_PLAYS).toHaveLength(2);
  });

  it("still knows hidden retail routes for API compat", () => {
    expect(WINNER_ROUTES.some((r) => r.id === "walmart_to_ebay")).toBe(true);
    expect(
      WINNER_ROUTES.find((r) => r.id === "walmart_to_ebay")?.ui,
    ).toBe(false);
  });
});
