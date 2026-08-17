import { parseHomeDepotLink } from "@/lib/homedepot/item-id";

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

export function homeDepotCapturePath(productUrl: string): string {
  const parsed = parseHomeDepotLink(productUrl);
  if (!parsed) return "";
  return `/hd-capture?url=${encodeURIComponent(parsed.canonicalUrl)}`;
}

/**
 * Bookmarklet for the Home Depot tab. Home Depot severs window.opener (COOP),
 * so this posts the iPhone gallery JSON to Higlou over CORS instead.
 */
export function homeDepotCaptureBookmarklet(opts: {
  origin: string;
  token: string;
}): string {
  const origin = JSON.stringify(String(opts.origin || "").replace(/\/$/, ""));
  const token = JSON.stringify(String(opts.token || ""));
  const source = `var O=${origin},T=${token};void (async function(){
    try {
      if (!/homedepot\\./i.test(location.hostname)) {
        alert("Drop this button on the Home Depot tab, then click it there.");
        return;
      }
      var itemId = (location.pathname.match(/\\/(\\d{8,12})\\/?$/) || [])[1] || "";
      var query = "query productClientOnlyProduct($itemId: String!) { product(itemId: $itemId) { itemId identifiers { brandName modelNumber productLabel upc } details { description highlights } media { images { url type subType sizes } } } }";
      var payload = JSON.stringify({
        operationName: "productClientOnlyProduct",
        variables: { itemId: itemId, storeId: "121", zipCode: "30339" },
        query: query
      });
      var headers = {
        "content-type": "application/json",
        accept: "*/*",
        "x-experience-name": "general-merchandise",
        "x-hd-dc": "origin"
      };
      var endpoints = [
        "/federation-gateway/graphql?opname=productClientOnlyProduct",
        "https://apionline.homedepot.com/federation-gateway/graphql?opname=productClientOnlyProduct"
      ];
      var api = "";
      for (var i = 0; i < endpoints.length; i++) {
        try {
          var res = await fetch(endpoints[i], {
            method: "POST",
            headers: headers,
            credentials: "include",
            body: payload
          });
          var text = await res.text();
          if (/productImages|thdstatic/i.test(text)) {
            api = text;
            break;
          }
        } catch (e) {}
      }
      var html = api + "\\n" + document.documentElement.outerHTML;
      var sent = false;
      try {
        var ingest = await fetch(O + "/api/homedepot/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: T, url: location.href, html: html })
        });
        sent = ingest.ok;
      } catch (e) {}
      if (window.opener) {
        try {
          window.opener.postMessage(
            { type: "higlou-hd-gallery", url: location.href, html: html },
            "*"
          );
          window.opener.focus();
        } catch (e) {}
      }
      var bar = document.createElement("div");
      bar.setAttribute("style", "position:fixed;z-index:2147483647;left:0;right:0;top:0;padding:16px 20px;background:#fff;color:#141414;font:15px/1.4 system-ui;border-bottom:1px solid #e5e5e5");
      bar.textContent = sent
        ? "Gallery sent to Higlou. Go back to that tab."
        : "Could not reach Higlou. Keep this tab open and try Bring all photos again.";
      document.documentElement.appendChild(bar);
    } catch (error) {
      alert(String(error));
    }
  })();`;
  return `javascript:void(function(){${source}}());`;
}

export const HOME_DEPOT_CAPTURE_BOOKMARKLET = homeDepotCaptureBookmarklet({
  origin: "https://higlou.vercel.app",
  token: "preview",
});
