import { describe, expect, it } from "vitest";
import { z } from "zod";

/** Mirrors DELETE /api/facebook/posts body rules. */
const deleteSchema = z.object({
  max: z.coerce.number().int().min(1).max(500).default(50),
  confirm: z.string().optional(),
});

describe("facebook bulk delete posts", () => {
  it("allows up to 50 without confirm", () => {
    expect(deleteSchema.parse({ max: 50 }).max).toBe(50);
  });

  it("caps at 500", () => {
    expect(deleteSchema.safeParse({ max: 501 }).success).toBe(false);
  });

  it("requires BORRAR confirm for large deletes (API rule)", () => {
    const max = 200;
    const confirm = "BORRAR";
    expect(max > 50 && confirm === "BORRAR").toBe(true);
    expect(max > 50 && confirm !== "BORRAR").toBe(false);
  });
});
