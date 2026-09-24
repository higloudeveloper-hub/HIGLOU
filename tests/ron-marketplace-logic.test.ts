import { describe, expect, it } from "vitest";
import {
  isShoppingPeakWindow,
  scoreCardMoneyOpportunity,
  scorePackMoneyOpportunity,
  shouldHoldForPeak,
  usEasternHour,
} from "@/lib/ron/marketplace-logic";
import { RON_DEFAULT_LEARNING } from "@/lib/ron/types";

describe("RON marketplace logic", () => {
  it("scores deeper discounts and mid-ticket higher", () => {
    const weak = scoreCardMoneyOpportunity(
      {
        asin: "B0WEAK0001",
        title: "Thing",
        priceLabel: "$4.99",
        discountPercent: 5,
        imageUrl: "https://cdn.example.com/a.jpg",
        linkUrl: "https://higlou.vercel.app/go/a",
        sourcePlatform: "Amazon",
      },
      RON_DEFAULT_LEARNING,
    );
    const strong = scoreCardMoneyOpportunity(
      {
        asin: "B0STRONG01",
        title: "Anker Power Bank 20000mAh Portable",
        priceLabel: "$29.99",
        discountPercent: 40,
        imageUrl: "https://cdn.example.com/b.jpg",
        linkUrl: "https://higlou.vercel.app/go/b",
        sourcePlatform: "Amazon",
      },
      RON_DEFAULT_LEARNING,
    );
    expect(strong).toBeGreaterThan(weak);
  });

  it("packs get a depth bonus", () => {
    const cards = [
      {
        asin: "B0A0000001",
        title: "Anker Power Bank 20K",
        priceLabel: "$29.99",
        discountPercent: 30,
        imageUrl: "https://cdn.example.com/1.jpg",
        linkUrl: "https://higlou.vercel.app/go/1",
        sourcePlatform: "Amazon",
      },
      {
        asin: "B0A0000002",
        title: "Anker Power Bank Mini",
        priceLabel: "$24.99",
        discountPercent: 25,
        imageUrl: "https://cdn.example.com/2.jpg",
        linkUrl: "https://higlou.vercel.app/go/2",
        sourcePlatform: "Amazon",
      },
      {
        asin: "B0A0000003",
        title: "Anker Wall Charger",
        priceLabel: "$19.99",
        discountPercent: 20,
        imageUrl: "https://cdn.example.com/3.jpg",
        linkUrl: "https://higlou.vercel.app/go/3",
        sourcePlatform: "Amazon",
      },
    ];
    const one = scorePackMoneyOpportunity(cards.slice(0, 1), RON_DEFAULT_LEARNING);
    const three = scorePackMoneyOpportunity(cards, RON_DEFAULT_LEARNING);
    expect(three).toBeGreaterThan(one);
  });

  it("holds weak solos off-peak unless forced", () => {
    // 4am ET-ish via fixed UTC that maps off-peak for most of year
    const offPeak = new Date("2026-01-15T09:00:00Z"); // 4am ET
    expect(isShoppingPeakWindow(offPeak)).toBe(false);
    expect(
      shouldHoldForPeak({
        force: false,
        format: "ads",
        moneyScore: 30,
        now: offPeak,
      }),
    ).toBe(true);
    expect(
      shouldHoldForPeak({
        force: true,
        format: "ads",
        moneyScore: 30,
        now: offPeak,
      }),
    ).toBe(false);
    expect(
      shouldHoldForPeak({
        force: false,
        format: "vitrina",
        moneyScore: 50,
        now: offPeak,
      }),
    ).toBe(false);
  });

  it("returns a valid eastern hour", () => {
    const h = usEasternHour(new Date("2026-06-15T16:00:00Z"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(24);
  });
});
