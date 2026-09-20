import { describe, expect, it } from "vitest";
import { facebookSharerUrl } from "@/lib/facebook/config";

describe("facebook sharer url", () => {
  it("builds a Meta sharer dialog for an absolute affiliate link", () => {
    const url = facebookSharerUrl(
      "https://higlou.example/go/abcd1234",
    );
    expect(url).toMatch(/^https:\/\/www\.facebook\.com\/sharer\/sharer\.php/);
    expect(url).toContain(
      encodeURIComponent("https://higlou.example/go/abcd1234"),
    );
  });
});
