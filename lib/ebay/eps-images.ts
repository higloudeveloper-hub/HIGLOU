import { getEbayConfig } from "@/lib/ebay/config";

function mediaApiBases(): string[] {
  const cfg = getEbayConfig();
  // Image Media API is served on both hosts depending on product; try both.
  if (cfg.env === "production") {
    return [
      "https://apim.ebay.com",
      "https://api.ebay.com",
    ];
  }
  return [
    "https://apim.sandbox.ebay.com",
    cfg.apiBase,
  ];
}

async function getEpsUrlFromImageId(
  accessToken: string,
  apiBase: string,
  imageId: string,
): Promise<string> {
  const getRes = await fetch(
    `${apiBase}/commerce/media/v1_beta/image/${encodeURIComponent(imageId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Accept-Language": "en-US",
      },
    },
  );
  if (!getRes.ok) {
    const text = await getRes.text().catch(() => "");
    throw new Error(
      `eBay EPS getImage failed (${getRes.status}): ${text.slice(0, 240)}`,
    );
  }
  const json = (await getRes.json()) as {
    imageUrl?: string;
    maxDimensionImageUrl?: string;
  };
  const epsUrl = String(
    json.imageUrl || json.maxDimensionImageUrl || "",
  ).trim();
  if (!/^https:\/\/i\.ebayimg\.com\//i.test(epsUrl)) {
    throw new Error(`eBay EPS getImage returned non-EPS URL: ${epsUrl || "(empty)"}`);
  }
  return epsUrl;
}

function extractImageId(location: string, body: unknown): string {
  const fromLoc = location.match(/\/image\/([^/?#]+)/i)?.[1] || "";
  if (fromLoc) return fromLoc;
  const json = body as { imageId?: string; image_id?: string } | null;
  return String(json?.imageId || json?.image_id || "").trim();
}

/**
 * Upload JPEG bytes to eBay Picture Services via Media API.
 * Returns an i.ebayimg.com URL for Inventory product.imageUrls.
 */
export async function uploadJpegToEbayEps(
  accessToken: string,
  jpeg: Buffer,
  fileName = "listing.jpg",
): Promise<string> {
  const errors: string[] = [];
  const safeName = fileName.endsWith(".jpg") ? fileName : `${fileName}.jpg`;

  for (const apiBase of mediaApiBases()) {
    try {
      const form = new FormData();
      form.append(
        "image",
        new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
        safeName,
      );

      const createRes = await fetch(
        `${apiBase}/commerce/media/v1_beta/image/create_image_from_file`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "Accept-Language": "en-US",
          },
          body: form,
        },
      );

      const location =
        createRes.headers.get("location") ||
        createRes.headers.get("Location") ||
        "";
      const text = await createRes.text().catch(() => "");
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }

      if (!createRes.ok) {
        errors.push(`${apiBase} file ${createRes.status}: ${text.slice(0, 160)}`);
        continue;
      }

      if (/^https:\/\/i\.ebayimg\.com\//i.test(location)) {
        return location;
      }

      const imageId = extractImageId(location, body);
      if (!imageId) {
        errors.push(`${apiBase} file: missing image id (location=${location})`);
        continue;
      }
      return await getEpsUrlFromImageId(accessToken, apiBase, imageId);
    } catch (error) {
      errors.push(
        `${apiBase} file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Trading API UploadSiteHostedPictures — reliable OAuth path for EPS.
  try {
    return await uploadJpegViaTradingApi(accessToken, jpeg);
  } catch (error) {
    errors.push(
      `Trading UploadSiteHostedPictures: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  throw new Error(
    `eBay EPS upload failed. ${errors[0] || "Unknown error"}. Reconnect eBay in Settings if Media scope is missing.`,
  );
}

/** Upload via Trading API UploadSiteHostedPictures (OAuth IAF token). */
export async function uploadJpegViaTradingApi(
  accessToken: string,
  jpeg: Buffer,
): Promise<string> {
  const cfg = getEbayConfig();
  const boundary = `----HiglouEPS${Date.now()}`;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <PictureName>Higlou</PictureName>
  <PictureSet>Standard</PictureSet>
  <ExtensionInDays>30</ExtensionInDays>
</UploadSiteHostedPicturesRequest>`;

  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="XML Payload"\r\n` +
      `Content-Type: text/xml; charset=utf-8\r\n\r\n` +
      `${xml}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="photo.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`,
    "utf8",
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([preamble, jpeg, closing]);

  const tradingUrl =
    cfg.env === "production"
      ? "https://api.ebay.com/ws/api.dll"
      : "https://api.sandbox.ebay.com/ws/api.dll";

  const res = await fetch(tradingUrl, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
      "X-EBAY-API-IAF-TOKEN": accessToken,
      "X-EBAY-API-CALL-NAME": "UploadSiteHostedPictures",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1155",
      "X-EBAY-API-APP-NAME": cfg.clientId,
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Trading upload HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (/<Ack>Failure<\/Ack>|<Ack>PartialFailure<\/Ack>/i.test(text)) {
    const msg =
      text.match(/<ShortMessage>([^<]+)<\/ShortMessage>/i)?.[1] ||
      text.match(/<LongMessage>([^<]+)<\/LongMessage>/i)?.[1] ||
      "UploadSiteHostedPictures failed";
    throw new Error(msg);
  }
  const full =
    text.match(/<FullURL>([^<]+)<\/FullURL>/i)?.[1] ||
    text.match(/<MemberURL>([^<]+)<\/MemberURL>/i)?.[1] ||
    "";
  const decoded = full
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
  if (!/^https:\/\/i\.ebayimg\.com\//i.test(decoded)) {
    throw new Error(
      `Trading upload returned no EPS FullURL: ${decoded || text.slice(0, 180)}`,
    );
  }
  return decoded;
}

export async function createEbayEpsFromUrl(
  accessToken: string,
  imageUrl: string,
): Promise<string> {
  const errors: string[] = [];
  for (const apiBase of mediaApiBases()) {
    try {
      const createRes = await fetch(
        `${apiBase}/commerce/media/v1_beta/image/create_image_from_url`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            "Accept-Language": "en-US",
          },
          body: JSON.stringify({ imageUrl }),
        },
      );
      const location =
        createRes.headers.get("location") ||
        createRes.headers.get("Location") ||
        "";
      const text = await createRes.text().catch(() => "");
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      if (!createRes.ok) {
        errors.push(`${apiBase} url ${createRes.status}: ${text.slice(0, 160)}`);
        continue;
      }
      if (/^https:\/\/i\.ebayimg\.com\//i.test(location)) return location;
      const imageId = extractImageId(location, body);
      if (!imageId) {
        errors.push(`${apiBase} url: missing image id`);
        continue;
      }
      return await getEpsUrlFromImageId(accessToken, apiBase, imageId);
    } catch (error) {
      errors.push(
        `${apiBase} url: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(errors[0] || "createImageFromUrl failed");
}

export function isEbayEpsUrl(url: string): boolean {
  return /^https:\/\/i\.ebayimg\.com\//i.test(String(url || "").trim());
}
