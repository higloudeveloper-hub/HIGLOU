/**
 * Keep Facebook captions clean: marketing text only.
 * Product URLs live on the tappable link card — never in the title/body text.
 */

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const ARROW_LINK_LINE = /^\s*(?:👉|➡️|→|»|link|compra|shop)\s*:?\s*https?:\/\/\S+\s*$/gim;

export function stripUrlsFromFacebookCaption(message: string): string {
  const raw = String(message || "");
  const withoutLinkLines = raw.replace(ARROW_LINK_LINE, "");
  const withoutUrls = withoutLinkLines.replace(URL_RE, "");
  return withoutUrls
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
