import { describe, expect, it } from "vitest";
import {
  canExtendFacebookTokens,
  facebookAppId,
} from "@/lib/facebook/token-exchange";

describe("facebook token exchange config", () => {
  it("reports extend capability from env", () => {
    const prevId = process.env.FACEBOOK_APP_ID;
    const prevSecret = process.env.FACEBOOK_APP_SECRET;
    delete process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_SECRET;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    expect(canExtendFacebookTokens()).toBe(false);
    expect(facebookAppId()).toBe("");

    process.env.FACEBOOK_APP_ID = "123";
    process.env.FACEBOOK_APP_SECRET = "secret";
    expect(canExtendFacebookTokens()).toBe(true);
    expect(facebookAppId()).toBe("123");

    if (prevId == null) delete process.env.FACEBOOK_APP_ID;
    else process.env.FACEBOOK_APP_ID = prevId;
    if (prevSecret == null) delete process.env.FACEBOOK_APP_SECRET;
    else process.env.FACEBOOK_APP_SECRET = prevSecret;
  });
});
