/**
 * Infer / ensure required electrical item specifics (esp. Voltage → eBay 25002).
 */

export function formatEbayVoltage(value: string | number): string {
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  // eBay aspect values commonly look like "120 V"
  return `${n} V`;
}

/**
 * Pull a Voltage aspect value from title, features, OCR, or item specifics text.
 */
export function inferVoltageFromText(text: string): string | null {
  const raw = String(text || "");
  if (!raw.trim()) return null;

  const labeled = raw.match(
    /(?:voltage|voltaje|input\s*voltage|output\s*voltage|rated\s*voltage)\s*[:=]?\s*(\d{1,4}(?:\.\d+)?)\s*v(?:olts?)?\b/i,
  );
  if (labeled?.[1]) return formatEbayVoltage(labeled[1]);

  const matches = Array.from(
    raw.matchAll(/\b(\d{1,4}(?:\.\d+)?)\s*v(?:olts?)?\b/gi),
  ).map((m) => m[1]);

  if (!matches.length) {
    // NACS/CCS EV charge adapters are typically rated to 1000V DC max when
    // packaging does not spell a lower mains voltage. Prefer this over failing publish.
    if (
      /\b(nacs|ccs1|ccs\s*2|ccs\s*1|ev\s*charger|ev\s*adapter|fast\s*charge\s*adapter)\b/i.test(
        raw,
      )
    ) {
      return "1000 V";
    }
    return null;
  }

  const preferred = ["1000", "480", "277", "240", "230", "208", "120", "48", "24", "12"];
  for (const p of preferred) {
    const hit = matches.find((m) => String(Number(m)) === p);
    if (hit) return formatEbayVoltage(hit);
  }
  return formatEbayVoltage(matches[0]!);
}

export function listingHasAspect(
  aspects: Record<string, string[] | undefined> | null | undefined,
  name: string,
): boolean {
  const want = name.trim().toLowerCase();
  for (const [key, values] of Object.entries(aspects || {})) {
    if (key.trim().toLowerCase() !== want) continue;
    if ((values || []).some((v) => String(v || "").trim())) return true;
  }
  return false;
}

/**
 * Ensure Voltage (and similar) exist on Inventory aspects when we can infer them.
 * Mutates aspects in place; returns which keys were added.
 */
export function ensureInferredElectricalAspects(
  aspects: Record<string, string[]>,
  haystack: string,
): string[] {
  const added: string[] = [];
  if (!listingHasAspect(aspects, "Voltage")) {
    const voltage = inferVoltageFromText(haystack);
    if (voltage) {
      aspects.Voltage = [voltage];
      added.push("Voltage");
    }
  }
  return added;
}

/** Parse eBay 25002 "The item specific X is missing" → aspect name. */
export function parseMissingAspectFromEbayError(message: string): string | null {
  const m = String(message || "").match(
    /item specific\s+([A-Za-z0-9 /_-]+)\s+is missing/i,
  );
  return m?.[1]?.trim() || null;
}
