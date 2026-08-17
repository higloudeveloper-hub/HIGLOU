export const HOME_DEPOT_GALLERY_MESSAGE = "higlou-hd-gallery";

export type HomeDepotGalleryMessage = {
  type: typeof HOME_DEPOT_GALLERY_MESSAGE;
  url: string;
  html: string;
};

export function isHomeDepotBrowserOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.replace(/^www\./i, "").toLowerCase();
    return /(^|\.)homedepot\.(com|ca|com\.mx)$/i.test(host);
  } catch {
    return false;
  }
}

export function isHomeDepotGalleryMessage(
  data: unknown,
): data is HomeDepotGalleryMessage {
  if (!data || typeof data !== "object") return false;
  const rec = data as Record<string, unknown>;
  return (
    rec.type === HOME_DEPOT_GALLERY_MESSAGE &&
    typeof rec.url === "string" &&
    rec.url.length > 8 &&
    typeof rec.html === "string" &&
    rec.html.length > 800
  );
}

/** Runs on the Home Depot tab (bookmark or location assign) and posts the gallery HTML back. */
export const HOME_DEPOT_CAPTURE_BOOKMARKLET =
  "javascript:(function(){try{var p={type:'higlou-hd-gallery',url:location.href,html:document.documentElement.outerHTML};if(window.opener){window.opener.postMessage(p,'*');}else{alert('Import this product from Higlou first, then click again.');}}catch(e){alert(String(e));}})();";
