import { getEbayConfig } from "@/lib/ebay/config";

/**
 * Upload a JPEG buffer to eBay Picture Services (Media API).
 * Returns a public i.ebayimg.com URL that Inventory imageUrls can use.
 *
 * Docs: POST /commerce/media/v1_beta/image/create_image_from_file
 * then GET /commerce/media/v1_beta/image/{imageId}
 */
export async function uploadJpegToEbayEps(
  accessToken: string,
  jpeg: Buffer,
  fileName = "listing.jpg",
): Promise<string> {
  const cfg = getEbayConfig();
  const form = new FormData();
  form.append(
    "image",
    new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
    fileName.endsWith(".jpg") ? fileName : `${fileName}.jpg`,
  );

  const createRes = await fetch(
    `${cfg.apiBase}/commerce/media/v1_beta/image/create_image_from_file`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Accept-Language": "en-US",
        // Content-Type set automatically with multipart boundary
      },
      body: form,
    },
  );

  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    throw new Error(
      `eBay EPS upload failed (${createRes.status}): ${text.slice(0, 240)}`,
    );
  }

  const location =
    createRes.headers.get("location") ||
    createRes.headers.get("Location") ||
    "";
  const imageId =
    location.match(/\/image\/([^/?#]+)/i)?.[1] ||
    (await createRes.json().catch(() => null) as { imageId?: string } | null)
      ?.imageId ||
    "";

  if (!imageId) {
    // Some environments return the EPS URL directly in Location.
    if (/^https:\/\/i\.ebayimg\.com\//i.test(location)) {
      return location;
    }
    throw new Error("eBay EPS upload did not return an image id");
  }

  const getRes = await fetch(
    `${cfg.apiBase}/commerce/media/v1_beta/image/${encodeURIComponent(imageId)}`,
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
    expirationDate?: string;
  };
  const epsUrl = String(
    json.imageUrl || json.maxDimensionImageUrl || "",
  ).trim();
  if (!/^https:\/\//i.test(epsUrl)) {
    throw new Error("eBay EPS getImage returned no imageUrl");
  }
  return epsUrl;
}

/** Try createImageFromUrl when the source is already publicly reachable by eBay. */
export async function createEbayEpsFromUrl(
  accessToken: string,
  imageUrl: string,
): Promise<string> {
  const cfg = getEbayConfig();
  const createRes = await fetch(
    `${cfg.apiBase}/commerce/media/v1_beta/image/create_image_from_url`,
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
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    throw new Error(
      `eBay createImageFromUrl failed (${createRes.status}): ${text.slice(0, 240)}`,
    );
  }
  const location =
    createRes.headers.get("location") ||
    createRes.headers.get("Location") ||
    "";
  const imageId = location.match(/\/image\/([^/?#]+)/i)?.[1] || "";
  if (!imageId) {
    if (/^https:\/\/i\.ebayimg\.com\//i.test(location)) return location;
    throw new Error("eBay createImageFromUrl did not return an image id");
  }
  const getRes = await fetch(
    `${cfg.apiBase}/commerce/media/v1_beta/image/${encodeURIComponent(imageId)}`,
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
    throw new Error(`eBay EPS getImage failed (${getRes.status})`);
  }
  const json = (await getRes.json()) as {
    imageUrl?: string;
    maxDimensionImageUrl?: string;
  };
  const epsUrl = String(
    json.imageUrl || json.maxDimensionImageUrl || "",
  ).trim();
  if (!/^https:\/\//i.test(epsUrl)) {
    throw new Error("eBay EPS getImage returned no imageUrl");
  }
  return epsUrl;
}
