import { describe, expect, it } from "vitest";
import { parseKeepaVariations } from "@/lib/keepa/variations";

describe("Keepa variation family for RON packs", () => {
  it("parses a full color family ready for carousel/vitrina", () => {
    const set = parseKeepaVariations({
      asin: "B0PARENT01",
      variations: [
        {
          asin: "B0COLRED01",
          image: "71RED.jpg",
          attributes: [
            { dimension: "color_name", value: "Crimson" },
            { dimension: "size_name", value: "Medium" },
          ],
        },
        {
          asin: "B0COLBLU01",
          image: "71BLUE.jpg",
          attributes: [
            { dimension: "color_name", value: "Navy" },
            { dimension: "size_name", value: "Medium" },
          ],
        },
        {
          asin: "B0COLGRN01",
          image: "71GREEN.jpg",
          attributes: [
            { dimension: "color_name", value: "Forest" },
            { dimension: "size_name", value: "Large" },
          ],
        },
      ],
    });
    expect(set).not.toBeNull();
    expect(set!.variants.length).toBe(3);
    expect(set!.axisNames).toEqual(expect.arrayContaining(["Color", "Size"]));
    expect(set!.variants.every((v) => v.imageUrls[0]?.includes("images/I/"))).toBe(
      true,
    );
  });
});
