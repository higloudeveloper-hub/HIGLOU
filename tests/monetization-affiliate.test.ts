import { describe, expect, it } from "vitest";
import { buildAmazonAssociatesUrl } from "@/lib/monetization/channels/affiliate";
import { buildQrSvg } from "@/lib/monetization/qr";
import { getMonetizationFlags } from "@/lib/monetization/flags";

describe("affiliate associates url policy", () => {
  it("never cloaks the amazon destination host", () => {
    const url = buildAmazonAssociatesUrl({
      asin: "B012345678",
      associateTag: "higlou-20",
    });
    expect(url).toMatch(/^https:\/\/www\.amazon\.com\/dp\/B012345678/);
    expect(url).toContain("tag=higlou-20");
  });
});

describe("qr generator", () => {
  it("builds an svg for a short smart link", () => {
    const qr = buildQrSvg("https://higlou.vercel.app/go/abcd1234");
    expect(qr.ok).toBe(true);
    if (qr.ok) {
      expect(qr.svg).toContain("<svg");
      expect(qr.svg).toContain("rect");
    }
  });
});

describe("feature flags default off", () => {
  it("keeps money engine disabled without env", () => {
    const prev = process.env.MONEY_ENGINE_ENABLED;
    delete process.env.MONEY_ENGINE_ENABLED;
    const flags = getMonetizationFlags();
    expect(flags.moneyEngine).toBe(false);
    expect(flags.affiliateEngine).toBe(false);
    expect(flags.smartLinks).toBe(false);
    if (prev != null) process.env.MONEY_ENGINE_ENABLED = prev;
  });
});
