import { describe, expect, it } from "vitest";
import {
  parseProductPatch,
  productBodySchema,
} from "@/lib/products/persistence";

describe("parseProductPatch", () => {
  it("price-only PATCH does not blank category or title", () => {
    const { columns, requested } = parseProductPatch({ price: 15 });
    expect(requested.has("price")).toBe(true);
    expect(columns).toEqual({ price: 15 });
    expect(columns).not.toHaveProperty("category_id");
    expect(columns).not.toHaveProperty("title");
    expect(columns).not.toHaveProperty("status");
  });

  it("full parse defaults would have wiped those fields", () => {
    const full = productBodySchema.partial().parse({ price: 15 });
    expect(full.categoryId).toBe("");
    expect(full.title).toBe("");
  });
});
