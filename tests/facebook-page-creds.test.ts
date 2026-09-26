import { afterEach, describe, expect, it, vi } from "vitest";

describe("ensureFacebookPageCredentialsForPublish", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("exports the RON publish gate used by cycle + promo", async () => {
    const mod = await import("@/lib/facebook/connection");
    expect(typeof mod.ensureFacebookPageCredentialsForPublish).toBe("function");
    expect(typeof mod.loadFacebookPageCredentials).toBe("function");
  });

  it("fails with encryption message when no cipher key is configured", async () => {
    vi.stubEnv("FACEBOOK_TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("EBAY_TOKEN_ENCRYPTION_KEY", "");
    vi.resetModules();
    const { ensureFacebookPageCredentialsForPublish } = await import(
      "@/lib/facebook/connection"
    );
    const fake = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
      storage: {
        listBuckets: async () => ({ data: [] }),
        createBucket: async () => ({ error: null }),
        from: () => ({
          download: async () => ({ data: null, error: { message: "missing" } }),
        }),
      },
    } as never;

    const result = await ensureFacebookPageCredentialsForPublish(
      fake,
      "user-1",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/cifrado|ENCRYPTION_KEY/i);
    }
  });
});
