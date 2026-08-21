const CATALOG_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/** Catalog CDNs the AI draft may fetch without a Supabase owner path. */
export function isCatalogCdnImageUrl(url: string): boolean {
  return /amazon|media-amazon|ssl-images-amazon|ebayimg\.com|ebaystatic\.com|walmartimages|thdstatic|homedepot-static/i.test(
    url,
  );
}

export function catalogImageFetchHeaders(
  url: string,
): Record<string, string> | undefined {
  if (/walmartimages|walmart\.com/i.test(url)) {
    return {
      Accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8",
      Referer: "https://www.walmart.com/",
      Origin: "https://www.walmart.com",
      "User-Agent": CATALOG_UA,
    };
  }
  if (/amazon|media-amazon|ssl-images-amazon/i.test(url)) {
    return {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      Referer: "https://www.amazon.com/",
      "User-Agent": CATALOG_UA,
    };
  }
  if (/thdstatic|homedepot-static|homedepot\.com/i.test(url)) {
    return {
      Accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8",
      Referer: "https://www.homedepot.com/",
      "User-Agent": CATALOG_UA,
    };
  }
  return undefined;
}
