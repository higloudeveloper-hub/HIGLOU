import { parseHomeDepotLink } from "@/lib/homedepot/item-id";

export const HOME_DEPOT_GALLERY_MESSAGE = "higlou-hd-gallery";
export const HOME_DEPOT_CAPTURE_WINDOW = "higlou-hd";

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

export function homeDepotCapturePath(productUrl: string): string {
  const parsed = parseHomeDepotLink(productUrl);
  if (!parsed) return "";
  return `/hd-capture?url=${encodeURIComponent(parsed.canonicalUrl)}`;
}

/**
 * Runs inside the Home Depot tab. void() keeps the product page from going blank.
 * Waits briefly so lazy gallery JSON can land, then posts HTML back to Higlou.
 */
function homeDepotCaptureScript(): void {
  try {
    if (!/homedepot\./i.test(location.hostname)) {
      alert(
        "Wait until Home Depot finishes loading, then click Bring all photos again.",
      );
      return;
    }
    const send = () => {
      const payload = {
        type: "higlou-hd-gallery",
        url: location.href,
        html: document.documentElement.outerHTML,
      };
      if (window.opener) {
        window.opener.postMessage(payload, "*");
        try {
          window.opener.focus();
        } catch {
          /* ignore */
        }
      } else {
        alert("Come back to Higlou and import this product first.");
      }
    };
    let n = 0;
    const wait = () => {
      const html = document.documentElement.outerHTML;
      const hits = html.match(/productImages/g) || [];
      if (hits.length >= 6 || n >= 15) {
        send();
        return;
      }
      n += 1;
      window.setTimeout(wait, 350);
    };
    wait();
  } catch (error) {
    alert(String(error));
  }
}

export const HOME_DEPOT_CAPTURE_BOOKMARKLET = `javascript:void(${homeDepotCaptureScript.toString()}());`;

export function captureHomeDepotGalleryFromTab(): "ok" | "blocked" {
  if (typeof window === "undefined") return "blocked";
  const tab = window.open("", HOME_DEPOT_CAPTURE_WINDOW);
  if (!tab) return "blocked";
  try {
    tab.location.href = HOME_DEPOT_CAPTURE_BOOKMARKLET;
    return "ok";
  } catch {
    return "blocked";
  }
}
