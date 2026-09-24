/**
 * Human platform labels for Facebook captions.
 * RON / ads text = product name + where we found it.
 */

export type SourcePlatformId =
  | "amazon"
  | "ebay"
  | "walmart"
  | "homedepot"
  | "supplier"
  | "unknown";

const LABELS: Record<SourcePlatformId, string> = {
  amazon: "Amazon",
  ebay: "eBay",
  walmart: "Walmart",
  homedepot: "Home Depot",
  supplier: "Supplier",
  unknown: "Amazon",
};

/** Normalize Keepa / opportunity source → stable id. */
export function resolveSourcePlatform(opts: {
  sourceMarket?: string | null;
  mode?: string | null;
  meta?: string | null;
}): SourcePlatformId {
  const blob = [
    opts.sourceMarket,
    opts.mode,
    opts.meta,
  ]
    .map((x) => String(x || "").toLowerCase())
    .join(" ");

  if (/walmart/.test(blob)) return "walmart";
  if (/home\s*depot|homedepot/.test(blob)) return "homedepot";
  if (/\bebay\b/.test(blob)) return "ebay";
  if (/supplier/.test(blob)) return "supplier";
  if (/amazon/.test(blob)) return "amazon";
  // Default Keepa / affiliate pool is Amazon
  return "amazon";
}

export function platformDisplayName(
  id: SourcePlatformId | string | null | undefined,
): string {
  const raw = String(id || "amazon")
    .toLowerCase()
    .replace(/[\s_]+/g, "");
  if (raw === "homedepot") return LABELS.homedepot;
  if (raw === "ebay") return LABELS.ebay;
  if (raw === "walmart") return LABELS.walmart;
  if (raw === "supplier") return LABELS.supplier;
  if (raw === "amazon") return LABELS.amazon;
  return LABELS.amazon;
}

/** Majority platform across a pack (ties → first card). */
export function majorityPlatform(
  platforms: Array<string | null | undefined>,
): string {
  const counts = new Map<string, number>();
  for (const p of platforms) {
    const label = platformDisplayName(p);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  let best = "Amazon";
  let n = 0;
  for (const [label, c] of counts) {
    if (c > n) {
      best = label;
      n = c;
    }
  }
  return best;
}
