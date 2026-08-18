import { describe, expect, it } from "vitest";
import {
  buildAttachmentContentDisposition,
  buildExportFileName,
  toAsciiFileName,
  toAsciiHttpHeaderValue,
  toEbayListingTitle,
} from "../lib/ebay/listing-helpers";

describe("HTTP header ASCII safety", () => {
  it("replaces em/en dashes and arrows so values stay ByteString-safe", () => {
    const note =
      "templates are often minimal — Seller Hub may still ask. Settings → eBay Policies";
    const safe = toAsciiHttpHeaderValue(note);

    expect(safe).toBe(
      "templates are often minimal - Seller Hub may still ask. Settings -> eBay Policies",
    );
    expect([...safe].every((ch) => ch.charCodeAt(0) <= 255)).toBe(true);
    expect(safe.includes("\u2014")).toBe(false);
    expect(safe.includes("\u2192")).toBe(false);
  });

  it("sanitizes the generate-csv prefill note that previously crashed at index 208", () => {
    const prefillNote = [
      "Category, title, photos, description, item specifics (C:*), and any matching",
      "policy/location/handling headers from the active official template were filled.",
      "Seed Create-New-Drafts templates are often minimal — Seller Hub may still ask for",
      "shipping service, package weight, or business policies if those columns are absent.",
      "Configure defaults under Settings → eBay Policies and use a fuller official template when possible.",
    ].join(" ");

    expect(prefillNote.charCodeAt(208)).toBe(8212);

    const safe = toAsciiHttpHeaderValue(prefillNote);
    expect([...safe].every((ch) => ch.charCodeAt(0) <= 127)).toBe(true);

    // Headers constructor rejects code points > 255 (same as Fetch/undici ByteString).
    expect(() => new Headers({ "X-Higlou-Draft-Prefill-Note": prefillNote })).toThrow(
      /ByteString/,
    );
    expect(() => new Headers({ "X-Higlou-Draft-Prefill-Note": safe })).not.toThrow();
  });

  it("builds Content-Disposition with ASCII filename and UTF-8 filename*", () => {
    const disposition = buildAttachmentContentDisposition("Higlou_Brand_Model_S.csv");
    expect(disposition).toContain('filename="Higlou_Brand_Model_S.csv"');
    expect(disposition).toContain("filename*=UTF-8''Higlou_Brand_Model_S.csv");
  });

  it("strips unsafe characters from download filenames", () => {
    expect(toAsciiFileName('Brand — "Model"/Size.csv')).toBe("Brand_-_Model_Size.csv");
  });

  it("keeps buildExportFileName ASCII-only even with smart punctuation brand/model", () => {
    const name = buildExportFileName({
      brand: "GE—Profile",
      model: "JS760→SLSS",
      size: "30\"",
      date: new Date("2026-07-14T12:00:00.000Z"),
    });
    expect(name).toBe("Higlou_Draft_GEProfile_JS760SLSS_30_2026-07-14.csv");
    expect([...name].every((ch) => ch.charCodeAt(0) <= 127)).toBe(true);
  });
});

describe("toEbayListingTitle", () => {
  it("strips Amazon.com page chrome so the listing can use the 80 characters", () => {
    expect(
      toEbayListingTitle(
        "Amazon.com - Pipishell Bamboo Expandable Silverware Drawer Organizer, Adjustable",
      ),
    ).toBe(
      "Pipishell Bamboo Expandable Silverware Drawer Organizer, Adjustable",
    );
    expect(
      toEbayListingTitle(
        "Amazon.com: RIDGID 18V Nailer : Amazon.com: Tools & Home Improvement",
      ),
    ).toBe("RIDGID 18V Nailer");
    expect(toEbayListingTitle("Amazon Basics 8-Sheet Shredder")).toBe(
      "Amazon Basics 8-Sheet Shredder",
    );
    expect(toEbayListingTitle("Amazon.com")).toBe("");
  });
});
