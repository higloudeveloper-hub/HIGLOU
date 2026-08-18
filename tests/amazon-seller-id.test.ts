import {
  isAmazonRefreshToken,
  sellingPartnerIdFromAccessToken,
  sellingPartnerIdFromPayload,
} from "@/lib/amazon/seller-id";
import { describe, expect, it } from "vitest";

describe("Amazon private-app seller id", () => {
  it("accepts LWA refresh tokens from self-authorize", () => {
    expect(isAmazonRefreshToken("Atzr|IwEBINexampleTokenValue_1234567890abcd")).toBe(
      true,
    );
    expect(isAmazonRefreshToken("amzn1.application-oa2-client.abc")).toBe(false);
  });

  it("pulls merchant ids out of Sellers API payloads", () => {
    expect(
      sellingPartnerIdFromPayload({
        payload: { sellingPartnerId: "A1EXAMPLESELLER" },
      }),
    ).toBe("A1EXAMPLESELLER");
  });

  it("reads sellingPartnerId from an LWA access token JWT", () => {
    const payload = Buffer.from(
      JSON.stringify({ sellingPartnerId: "A2EXAMPLESELLER" }),
    ).toString("base64url");
    expect(sellingPartnerIdFromAccessToken(`aaa.${payload}.sig`)).toBe(
      "A2EXAMPLESELLER",
    );
  });
});
