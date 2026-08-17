import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { searchHomeDepotCatalogPhotos } from "@/lib/homedepot/fetch-product";
import { selectHomeDepotSearchPhotos } from "@/lib/homedepot/parse-product";

function readRepo(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("Home Depot import stays on Higlou", () => {
  it("does not open a Home Depot tab or popup", () => {
    const workspace = readRepo("components/listing/new-listing-workspace.tsx");
    const photos = readRepo("components/listing/wizard/photos-screen.tsx");
    expect(workspace).not.toMatch(/window\.open/);
    expect(workspace).not.toMatch(/Bring all photos/);
    expect(workspace).not.toMatch(/hdCapturePending/);
    expect(photos).not.toMatch(/window\.open/);
    expect(photos).not.toMatch(/Bring all photos/);
    expect(photos).not.toMatch(/hdCapturePending/);
  });

  it("keeps every owned gallery angle instead of capping at the first Bing thumb", () => {
    const html = [
      "64",
      "e1",
      "e2",
      "e4",
      "40",
      "1d",
    ]
      .map(
        (type, i) =>
          `https://images.thdstatic.com/productImages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa${String(i).padStart(2, "0")}/svn/black-commercial-electric-wall-pack-lights-dw9582bk-c-${type}_600.jpg`,
      )
      .join("\n");
    const photos = selectHomeDepotSearchPhotos(html.split("\n"), {
      model: "DW9582BK-C",
      itemId: "307505277",
    });
    expect(photos).toHaveLength(6);
    expect(photos.every((u) => u.includes("dw9582bk-c") && u.includes("_1000."))).toBe(
      true,
    );
  });
});

describe("Home Depot catalog photo search", () => {
  it(
    "finds wall-pack photos from public search without opening Home Depot",
    async () => {
      const urls = await searchHomeDepotCatalogPhotos({
        brand: "Commercial Electric",
        model: "DW9582BK-C",
        itemId: "307505277",
        stem: "black-commercial-electric-wall-pack-lights-dw9582bk-c",
      });
      expect(urls.length).toBeGreaterThanOrEqual(2);
      expect(urls.every((u) => /dw9582bk-c/i.test(u))).toBe(true);
      expect(urls.every((u) => /thdstatic|homedepot-static/i.test(u))).toBe(true);
    },
    45_000,
  );
});
