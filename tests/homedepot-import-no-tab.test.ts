import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { searchHomeDepotCatalogPhotos, homeDepotSearchQueries } from "@/lib/homedepot/fetch-product";
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
    expect(workspace).toMatch(/fetchHomeDepotOfficialGalleryInBrowser/);
    expect(workspace).toMatch(/\/api\/amazon\/publish/);
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
  it("searches compact SKUs like VDH35 by brand and model", () => {
    const queries = homeDepotSearchQueries({
      brand: "Vissani",
      model: "VDH35",
      itemId: "319166850",
      stem: "white-vissani-dehumidifiers-vdh35",
      title: "Vissani 35 pt Dehumidifier for Basement Garage or Wet Rooms",
    });
    expect(queries.some((q) => /Vissani VDH35 homedepot/i.test(q))).toBe(true);
    expect(queries.some((q) => /"VDH35-e4"/i.test(q))).toBe(true);
    expect(queries.some((q) => /"VDH35-4f"/i.test(q))).toBe(true);
    expect(queries.findIndex((q) => /"VDH35-e4"/i.test(q))).toBeLessThan(
      queries.findIndex((q) => /site:homedepot\.com/i.test(q)),
    );
    expect(queries.some((q) => /whites-vissani-dehumidifiers-vdh35/i.test(q))).toBe(
      true,
    );
  });

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

  it(
    "keeps VDH35 dehumidifier photos, not a related Vissani SKU",
    async () => {
      const urls = await searchHomeDepotCatalogPhotos({
        brand: "Vissani",
        model: "VDH35",
        itemId: "319166850",
        stem: "white-vissani-dehumidifiers-vdh35",
        title: "Vissani 35 pt Dehumidifier",
      });
      expect(urls.length).toBeGreaterThanOrEqual(1);
      expect(urls.every((u) => /vdh35/i.test(u))).toBe(true);
      expect(urls.some((u) => /vad35s1awt/i.test(u))).toBe(false);
    },
    45_000,
  );

  it(
    "finds Tectite ice-maker box photos from public search",
    async () => {
      const urls = await searchHomeDepotCatalogPhotos({
        brand: "Tectite",
        model: "FSBBOXIMWH",
        itemId: "301460651",
        title: "Tectite Ice Maker Outlet Box",
      });
      expect(urls.length).toBeGreaterThanOrEqual(1);
      expect(urls.every((u) => /fsbboximwh/i.test(u))).toBe(true);
    },
    45_000,
  );

  it(
    "finds more than the hero shot for a Klein pliers gallery",
    async () => {
      const urls = await searchHomeDepotCatalogPhotos({
        brand: "Klein",
        model: "J2000-9NE",
        itemId: "100400407",
        title: "Klein Tools Journeyman High Leverage Side Cutting Pliers",
      });
      expect(urls.length).toBeGreaterThanOrEqual(2);
      expect(urls.every((u) => /j2000-9ne-/i.test(u))).toBe(true);
      expect(urls.some((u) => /j2000-9netp/i.test(u))).toBe(false);
    },
    45_000,
  );
});
