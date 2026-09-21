/**
 * Candidate image URLs for an Amazon ASIN.
 * The classic images-na …/P/{ASIN}.01.LZZZZZZZ.jpg pattern often returns
 * empty 200 responses for many ASINs — we try several variants and let the
 * UI fall through with onError.
 */
export function amazonAsinImageCandidates(asin: string): string[] {
  const id = String(asin || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(id)) return [];
  return [
    `https://m.media-amazon.com/images/P/${id}.01._SCLZZZZZZZ_SX500_.jpg`,
    `https://m.media-amazon.com/images/P/${id}.01._SCLZZZZZZZ_.jpg`,
    `https://images-na.ssl-images-amazon.com/images/P/${id}.01._SCLZZZZZZZ_.jpg`,
    `https://images-na.ssl-images-amazon.com/images/P/${id}.01.LZZZZZZZ.jpg`,
  ];
}

export function amazonAsinPrimaryImage(asin: string): string {
  return amazonAsinImageCandidates(asin)[0] || "";
}
