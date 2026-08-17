import { describe, expect, it } from "vitest";
import { fetchHomeDepotProduct } from "@/lib/homedepot/fetch-product";
import { fetchHomeDepotOfficialGallery } from "@/lib/homedepot/official-gallery";
import {
  collectHomeDepotImageUrlsFromHtml,
  selectHomeDepotSearchPhotos,
} from "@/lib/homedepot/parse-product";

describe("Home Depot official GraphQL gallery", () => {
  it("reads every official Vissani dehumidifier angle, not one hero", async () => {
    const json = await fetchHomeDepotOfficialGallery("319166850");
    const photos = selectHomeDepotSearchPhotos(collectHomeDepotImageUrlsFromHtml(json), {
      model: "VDH35",
      itemId: "319166850",
      maxImages: 24,
    });
    expect(photos.length).toBeGreaterThanOrEqual(8);
    expect(photos.every((u) => /vdh35/i.test(u))).toBe(true);
    expect(photos.every((u) => u.includes("_1000."))).toBe(true);
  }, 30_000);

  it("imports the official Tectite gallery from the product link", async () => {
    const product = await fetchHomeDepotProduct(
      "https://www.homedepot.com/p/Tectite-1-2-in-Brass-Push-to-Connect-Ice-Maker-Outlet-Box-with-Water-Hammer-Arrestor-FSBBOXIMWH/301460651",
    );
    expect(product.imageUrls.length).toBeGreaterThanOrEqual(4);
    expect(product.imageUrls.every((u) => /fsbboximwh/i.test(u))).toBe(true);
    expect(product.brand).toMatch(/Tectite/i);
    expect(product.model).toMatch(/FSBBOXIMWH/i);
  }, 45_000);
});
