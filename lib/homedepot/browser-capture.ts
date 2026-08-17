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
 * Runs inside the Home Depot tab as a real browser client (same path as iPhone).
 * Asks the product GraphQL for media.images, then posts JSON + HTML back to Higlou.
 */
function homeDepotCaptureScript(): void {
  void (async () => {
    try {
      if (!/homedepot\./i.test(location.hostname)) {
        alert(
          "Wait until Home Depot finishes loading, then click Bring all photos again.",
        );
        return;
      }
      const itemId = (location.pathname.match(/\/(\d{8,12})\/?$/) || [])[1] || "";
      const query =
        "query productClientOnlyProduct($itemId: String!) { product(itemId: $itemId) { itemId identifiers { brandName modelNumber productLabel upc } details { description highlights } media { images { url type subType sizes } } } }";
      const payload = JSON.stringify({
        operationName: "productClientOnlyProduct",
        variables: { itemId: itemId, storeId: "121", zipCode: "30339" },
        query: query,
      });
      const headers = {
        "content-type": "application/json",
        accept: "*/*",
        "x-experience-name": "general-merchandise",
        "x-hd-dc": "origin",
      };
      const endpoints = [
        "/federation-gateway/graphql?opname=productClientOnlyProduct",
        "https://apionline.homedepot.com/federation-gateway/graphql?opname=productClientOnlyProduct",
      ];
      let api = "";
      for (let i = 0; i < endpoints.length; i++) {
        try {
          const res = await fetch(endpoints[i], {
            method: "POST",
            headers: headers,
            credentials: "include",
            body: payload,
          });
          const text = await res.text();
          if (/productImages|thdstatic/i.test(text)) {
            api = text;
            break;
          }
        } catch {
          /* try next */
        }
      }
      if (!api) {
        await new Promise((resolve) => {
          let n = 0;
          const wait = () => {
            const hits =
              document.documentElement.outerHTML.match(/productImages/g) || [];
            if (hits.length >= 6 || n >= 15) {
              resolve(undefined);
              return;
            }
            n += 1;
            window.setTimeout(wait, 350);
          };
          wait();
        });
      }
      const html = `${api}\n${document.documentElement.outerHTML}`;
      if (!window.opener) {
        alert("Come back to Higlou and import this product first.");
        return;
      }
      window.opener.postMessage(
        { type: "higlou-hd-gallery", url: location.href, html: html },
        "*",
      );
      try {
        window.opener.focus();
      } catch {
        /* ignore */
      }
    } catch (error) {
      alert(String(error));
    }
  })();
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
