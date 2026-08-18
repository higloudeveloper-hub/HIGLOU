import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepo(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("Amazon seller publish stays on Higlou", () => {
  it("connects Amazon from Settings without a popup helper", () => {
    const settings = readRepo("components/settings/settings-studio.tsx");
    const form = readRepo("components/settings/amazon-connect-form.tsx");
    expect(settings).toMatch(/AmazonConnectForm/);
    expect(form).toMatch(/\/api\/amazon\/self-authorize/);
    expect(form).toMatch(/Merchant token/);
    expect(form).not.toMatch(/window\.open/);
  });

  it("exposes Publish to Amazon on Export", () => {
    const exportScreen = readRepo("components/listing/wizard/export-screen.tsx");
    expect(exportScreen).toMatch(/Publish to Amazon/);
    expect(exportScreen).toMatch(/onPublishToAmazon/);
  });
});
