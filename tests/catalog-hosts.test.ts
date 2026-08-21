import { describe, expect, it } from "vitest";
import {
  catalogImageFetchHeaders,
  isCatalogCdnImageUrl,
} from "@/lib/images/catalog-hosts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("catalog image hosts", () => {
  it("lets Walmart CDN photos through AI draft like Amazon", () => {
    expect(
      isCatalogCdnImageUrl(
        "https://i5.walmartimages.com/asr/abcd.jpeg?odnHeight=2000",
      ),
    ).toBe(true);
    expect(
      isCatalogCdnImageUrl("https://m.media-amazon.com/images/I/71abc.jpg"),
    ).toBe(true);
    expect(isCatalogCdnImageUrl("https://evil.example/photo.jpg")).toBe(false);
  });

  it("fetches Walmart photos with a walmart.com referer", () => {
    const headers = catalogImageFetchHeaders(
      "https://i5.walmartimages.com/asr/abcd.jpeg",
    );
    expect(headers?.Referer).toBe("https://www.walmart.com/");
  });

  it("is wired into analyze-product", () => {
    const route = readFileSync(
      resolve(process.cwd(), "app/api/analyze-product/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/isCatalogCdnImageUrl/);
  });
});
