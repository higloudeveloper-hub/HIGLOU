import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepo(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("Walmart import stays on Higlou", () => {
  it("exposes a Walmart import API and dock card", () => {
    const dock = readRepo("components/listing/wizard/catalog-import-dock.tsx");
    const workspace = readRepo("components/listing/new-listing-workspace.tsx");
    const detect = readRepo("lib/catalog/detect-store.ts");
    const route = readRepo("app/api/walmart/import/route.ts");
    expect(dock).toMatch(/WalmartMark/);
    expect(dock).toMatch(/walmart\.com/);
    expect(workspace).toMatch(/\/api\/walmart\/import/);
    expect(workspace).toMatch(/store === "walmart"/);
    expect(detect).toMatch(/parseWalmartLink/);
    expect(detect).toMatch(/"walmart"/);
    expect(route).toMatch(/fetchWalmartProduct/);
    expect(route).toMatch(/WM-\$\{product\.itemId\}/);
  });

  it("does not treat a bare Home Depot id as Walmart", () => {
    const detect = readRepo("lib/catalog/detect-store.ts");
    expect(detect).toMatch(/\/\^\\d\{8,12\}\$\/\.test\(trimmed\)\) return "homedepot"/);
  });
});
