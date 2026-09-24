import { describe, expect, it } from "vitest";
import { amazonAsinPrimaryImage } from "@/lib/amazon/asin-image";

/**
 * Light check that crawler OG path helpers stay wired.
 * Full /go route needs Supabase — covered by integration on deploy.
 */
describe("smart link OG helpers", () => {
  it("builds amazon image urls for OG fallback", () => {
    const url = amazonAsinPrimaryImage("B0CHS1BVBC");
    expect(url).toMatch(/^https?:\/\//);
    expect(url).toMatch(/B0CHS1BVBC/i);
  });
});
