import { describe, expect, it } from "vitest";
import { sanitizeEbayUpc } from "@/lib/ebay/inventory-api";

describe("sanitizeEbayUpc", () => {
  it("keeps a valid UPC-A", () => {
    expect(sanitizeEbayUpc("036000291452")).toBe("036000291452");
  });

  it("drops Glacier Bay-style bad checksum UPC that triggers eBay 25002", () => {
    expect(sanitizeEbayUpc("032878014386")).toBeUndefined();
  });

  it("drops empty and Does Not Apply", () => {
    expect(sanitizeEbayUpc("")).toBeUndefined();
    expect(sanitizeEbayUpc("Does Not Apply")).toBeUndefined();
  });
});
