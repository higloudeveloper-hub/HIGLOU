import { describe, expect, it } from "vitest";
import {
  HOME_DEPOT_CAPTURE_BOOKMARKLET,
  HOME_DEPOT_GALLERY_MESSAGE,
  homeDepotCaptureBookmarklet,
  homeDepotCapturePath,
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
    expect(HOME_DEPOT_CAPTURE_BOOKMARKLET).toContain("federation-gateway");
    expect(HOME_DEPOT_CAPTURE_BOOKMARKLET).toContain("productClientOnlyProduct");
    expect(HOME_DEPOT_CAPTURE_BOOKMARKLET).toContain("/api/homedepot/ingest");
    const live = homeDepotCaptureBookmarklet({
      origin: "https://higlou.vercel.app",
      token: "user.nonce.1.sig",
    });
    expect(live).toContain("user.nonce.1.sig");
  });

  it("opens a Higlou splash that then loads the Home Depot product", () => {
    expect(
      homeDepotCapturePath(
        "https://www.homedepot.com/p/Commercial-Electric-19-Watt-Black-Outdoor-Integrated-LED-Classic-Wall-Pack-Light-with-Dusk-to-Dawn-Control-DW9582BK-C/307505277",
      ),
    ).toBe(
      "/hd-capture?url=https%3A%2F%2Fwww.homedepot.com%2Fp%2FCommercial-Electric-19-Watt-Black-Outdoor-Integrated-LED-Classic-Wall-Pack-Light-with-Dusk-to-Dawn-Control-DW9582BK-C%2F307505277",
    );
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

  it("also searches DW9582BK when the slug model is DW9582BK-C", () => {
    const queries = homeDepotSearchQueries({
      brand: "Commercial",
      model: "DW9582BK-C",
      itemId: "307505277",
    });
    expect(queries.some((q) => q.includes("DW9582BK-C") && q.includes("thdstatic"))).toBe(
      true,
    );
    expect(queries.some((q) => /\bDW9582BK\b/.test(q) && q.includes("thdstatic"))).toBe(
      true,
    );
    expect(queries.some((q) => q.includes("307505277"))).toBe(true);
    expect(queries.some((q) => q.includes('"DW9582BK-C-e1"'))).toBe(true);
    expect(queries.some((q) => q.includes('"DW9582BK-C-64"'))).toBe(true);
  });
});
