/**
 * Candidate image URLs for an Amazon ASIN.
 *
 * The classic images-na …/P/{ASIN}.01.LZZZZZZZ.jpg pattern often returns
 * a 1×1 transparent GIF (HTTP 200) — the UI must treat tiny images as
 * broken and walk this list. Prefer the ads-system widget first; it is
 * the most reliable public ASIN thumbnail.
 */
export function amazonAsinImageCandidates(asin: string): string[] {
  const id = String(asin || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(id)) return [];
  return [
    // Most reliable public thumbnail for an ASIN
    `https://ws-na.amazon-adsystem.com/widgets/q?_encoding=UTF8&MarketPlace=US&ASIN=${id}&ServiceVersion=20070822&ID=AsinImage&WS=1&Format=_SL500_`,
    `https://ws-na.amazon-adsystem.com/widgets/q?_encoding=UTF8&MarketPlace=US&ASIN=${id}&ServiceVersion=20070822&ID=AsinImage&WS=1&Format=_SL250_`,
    `https://m.media-amazon.com/images/P/${id}.01._SCLZZZZZZZ_SX500_.jpg`,
    `https://m.media-amazon.com/images/P/${id}.01._SCLZZZZZZZ_.jpg`,
    `https://images-na.ssl-images-amazon.com/images/P/${id}.01._SCLZZZZZZZ_.jpg`,
    `https://images-na.ssl-images-amazon.com/images/P/${id}.01.MAIN._AC_SX500_.jpg`,
    `https://images-na.ssl-images-amazon.com/images/P/${id}.01.LZZZZZZZ.jpg`,
  ];
}

export function amazonAsinPrimaryImage(asin: string): string {
  return amazonAsinImageCandidates(asin)[0] || "";
}
