import { describe, expect, it } from "vitest";
import {
  HOME_DEPOT_CAPTURE_BOOKMARKLET,
  HOME_DEPOT_GALLERY_MESSAGE,
  isHomeDepotBrowserOrigin,
  isHomeDepotGalleryMessage,
} from "@/lib/homedepot/browser-capture";
import { homeDepotSearchQueries } from "@/lib/homedepot/fetch-product";

describe("Home Depot browser capture", () => {
  it("accepts a gallery postMessage from Home Depot", () => {
    expect(isHomeDepotBrowserOrigin("https://www.homedepot.com")).toBe(true);
    expect(isHomeDepotBrowserOrigin("https://amazon.com")).toBe(false);
    expect(
      isHomeDepotGalleryMessage({
        type: HOME_DEPOT_GALLERY_MESSAGE,
        url: "https://www.homedepot.com/p/319137828",
        html: `<html>${"x".repeat(900)}</html>`,
      }),
    ).toBe(true);
    expect(HOME_DEPOT_CAPTURE_BOOKMARKLET.startsWith("javascript:")).toBe(true);
  });
});

describe("homeDepotSearchQueries", () => {
  it("searches extra gallery angles once the media stem is known", () => {
    const queries = homeDepotSearchQueries({
      brand: "BEYOND",
      model: "BEBRNOV-PD27",
      itemId: "319137828",
      stem: "beyond-bright-led-light-bulbs-bebrnov-pd27",
    });
    expect(queries.some((q) => q.includes("bebrnov-pd27") && q.includes("thdstatic"))).toBe(
      true,
    );
    expect(queries.some((q) => q.includes("-e1") && q.includes("-e4"))).toBe(true);
  });
});
