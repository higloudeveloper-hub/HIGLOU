import {
  HOME_DEPOT_OFFICIAL_GALLERY_ENDPOINT,
  homeDepotOfficialGalleryHits,
  homeDepotOfficialGalleryPayload,
} from "@/lib/homedepot/gallery-request";
import { parseHomeDepotLink } from "@/lib/homedepot/item-id";

/**
 * Ask Home Depot for the official gallery from the shopper's browser.
 * No new tab. If CORS preflight blocks it, the server Impit path still runs.
 */
export async function fetchHomeDepotOfficialGalleryInBrowser(
  input: string,
): Promise<string> {
  const parsed = parseHomeDepotLink(input);
  if (!parsed) return "";
  try {
    const res = await fetch(HOME_DEPOT_OFFICIAL_GALLERY_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
        "x-experience-name": "general-merchandise",
        "x-hd-dc": "origin",
      },
      body: JSON.stringify(homeDepotOfficialGalleryPayload(parsed.itemId)),
    });
    const text = await res.text();
    return homeDepotOfficialGalleryHits(text) >= 1 ? text : "";
  } catch {
    return "";
  }
}
