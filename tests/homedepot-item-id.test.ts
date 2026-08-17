import { describe, expect, it } from "vitest";
import { identityFromHomeDepotLink, parseHomeDepotLink } from "@/lib/homedepot/item-id";
import { detectCatalogStore } from "@/lib/catalog/detect-store";

describe("parseHomeDepotLink", () => {
  it("reads /p/slug/itemId", () => {
    const parsed = parseHomeDepotLink(
      "https://www.homedepot.com/p/DEWALT-20V-MAX-Drill-DCD791P1/312119566",
    );
    expect(parsed?.itemId).toBe("312119566");
    expect(parsed?.canonicalUrl).toBe(
      "https://www.homedepot.com/p/DEWALT-20V-MAX-Drill-DCD791P1/312119566",
    );
  });

  it("reads a bare item id", () => {
    expect(parseHomeDepotLink("312119566")?.canonicalUrl).toBe(
      "https://www.homedepot.com/p/312119566",
    );
  });

  it("reads homedepot.ca /product/", () => {
    expect(
      parseHomeDepotLink("https://www.homedepot.ca/product/dewalt-drill/1001234567")
        ?.itemId,
    ).toBe("1001234567");
  });

  it("rejects non-Home Depot links", () => {
    expect(parseHomeDepotLink("https://www.amazon.com/dp/B0D123ABCD")).toBeNull();
  });

  it("reads title, brand, and model from the SEO slug", () => {
    const parsed = parseHomeDepotLink(
      "https://www.homedepot.com/p/Defiant-MaxDetect-240-Black-MotionSensing-Wired-Outdoor-3-Head-LED-Security-Flood-Light-3000-Lumens-17000148/324294069",
    );
    expect(parsed?.itemId).toBe("324294069");
    const identity = identityFromHomeDepotLink(parsed!);
    expect(identity.brand).toBe("Defiant");
    expect(identity.model).toBe("17000148");
    expect(identity.title).toMatch(/Max Detect/i);
    expect(identity.title).toMatch(/Flood Light/i);
  });

  it("reads a Milwaukee combo model, not the trailing 2010 glasses SKU", () => {
    const parsed = parseHomeDepotLink(
      "https://www.homedepot.com/p/Milwaukee-M12-FUEL-12-Volt-Lithium-Ion-Brushless-Cordless-18-Gauge-1-1-2-in-Compact-Brad-Nailer-Tool-Only-with-Safety-Glasses-2541-20-48-73-2010/330557271",
    );
    expect(parsed?.itemId).toBe("330557271");
    const identity = identityFromHomeDepotLink(parsed!);
    expect(identity.brand).toBe("Milwaukee");
    expect(identity.model).toBe("2541-20-48-73-2010");
    expect(identity.model).not.toBe("2010");
    expect(identity.title).toMatch(/Brad Nailer/i);
  });
});

describe("detectCatalogStore", () => {
  it("routes Home Depot and Amazon separately", () => {
    expect(
      detectCatalogStore(
        "https://www.homedepot.com/p/DEWALT-Drill/312119566",
      ),
    ).toBe("homedepot");
    expect(detectCatalogStore("https://www.amazon.com/dp/B0D123ABCD")).toBe(
      "amazon",
    );
    expect(detectCatalogStore("312119566")).toBe("homedepot");
  });
});
