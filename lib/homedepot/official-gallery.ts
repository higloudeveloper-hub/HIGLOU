import { Impit } from "impit";
import {
  HOME_DEPOT_OFFICIAL_GALLERY_ENDPOINT,
  homeDepotOfficialGalleryHits,
  homeDepotOfficialGalleryPayload,
} from "@/lib/homedepot/gallery-request";

/**
 * Official Home Depot gallery JSON. Node fetch is Akamai 206;
 * Firefox TLS impersonation is the request the gateway accepts.
 */
export async function fetchHomeDepotOfficialGallery(itemId: string): Promise<string> {
  const id = String(itemId || "").trim();
  if (!/^\d{8,12}$/.test(id)) return "";

  try {
    const impit = new Impit({ browser: "firefox", timeout: 18_000 });
    const res = await impit.fetch(HOME_DEPOT_OFFICIAL_GALLERY_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
        Origin: "https://www.homedepot.com",
        Referer: `https://www.homedepot.com/p/${id}`,
        "x-experience-name": "general-merchandise",
        "x-hd-dc": "origin",
      },
      body: JSON.stringify(homeDepotOfficialGalleryPayload(id)),
    });
    const body = await res.text();
    return homeDepotOfficialGalleryHits(body) >= 1 ? body : "";
  } catch {
    return "";
  }
}
