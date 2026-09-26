import { describe, expect, it } from "vitest";
import {
  facebookSharerUrl,
  humanizeFacebookGraphError,
} from "@/lib/facebook/config";

describe("facebook sharer url", () => {
  it("builds a Meta sharer dialog for an absolute affiliate link", () => {
    const url = facebookSharerUrl(
      "https://higlou.example/go/abcd1234",
    );
    expect(url).toMatch(/^https:\/\/www\.facebook\.com\/sharer\/sharer\.php/);
    expect(url).toContain(
      encodeURIComponent("https://higlou.example/go/abcd1234"),
    );
  });
});

describe("humanizeFacebookGraphError", () => {
  it("explains #200 missing page publish permissions", () => {
    const msg = humanizeFacebookGraphError(
      "(#200) If posting to a page, requires both pages_read_engagement and pages_manage_posts",
    );
    expect(msg).toMatch(/pages_manage_posts/);
    expect(msg).toMatch(/pages_read_engagement/);
    expect(msg).toMatch(/Graph Explorer|Settings/i);
  });
});

describe("resolvePageAccessToken contract", () => {
  it("is exported from connection module", async () => {
    const mod = await import("@/lib/facebook/connection");
    expect(typeof mod.resolvePageAccessToken).toBe("function");
    expect(typeof mod.maybeBootstrapFacebookConnection).toBe("function");
    expect(typeof mod.ensureFacebookPageCredentialsForPublish).toBe(
      "function",
    );
  });
});
