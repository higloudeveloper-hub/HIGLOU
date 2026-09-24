import { describe, expect, it } from "vitest";
import { stripUrlsFromFacebookCaption } from "@/lib/facebook/caption";

describe("stripUrlsFromFacebookCaption", () => {
  it("removes raw https URLs from the caption", () => {
    const out = stripUrlsFromFacebookCaption(
      "TODAY'S DEAL\nhttps://www.amazon.com/dp/B0TEST1234?tag=x\nSHOP NOW",
    );
    expect(out).not.toMatch(/https?:\/\//i);
    expect(out).toContain("TODAY");
    expect(out).toContain("SHOP NOW");
  });

  it("removes 👉 link lines", () => {
    const out = stripUrlsFromFacebookCaption(
      "Oferta verificada\n\n👉 https://higlou.vercel.app/go/abc123",
    );
    expect(out).toBe("Oferta verificada");
    expect(out).not.toMatch(/👉/);
    expect(out).not.toMatch(/https?:\/\//i);
  });

  it("keeps clean marketing copy intact", () => {
    const clean = "𝗧𝗢𝗗𝗔𝗬'𝗦 𝗗𝗘𝗔𝗟\n━━━━━━━━━━━━\n𝗦𝗛𝗢𝗣 𝗡𝗢𝗪 →";
    expect(stripUrlsFromFacebookCaption(clean)).toBe(clean);
  });
});
