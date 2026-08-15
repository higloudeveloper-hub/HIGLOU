/**
 * Infer / ensure required electrical item specifics
 * (Voltage, Battery Technology → eBay 25002).
 */

import { inferItemDimensionAspect } from "@/lib/ebay/infer-item-dimensions";

export function formatEbayVoltage(value: string | number): string {
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  // eBay aspect values commonly look like "120 V"
  return `${n} V`;
}

/**
 * Cordless platform names that omit "18V" (Milwaukee M18, Ryobi ONE+, etc.).
 */
export function inferPlatformVoltageFromText(text: string): string | null {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  const hay = raw.toLowerCase();

  if (/\bm18\b/i.test(raw) && (/\bmilwaukee\b/i.test(raw) || /\bfuel\b/i.test(raw))) {
    return formatEbayVoltage(18);
  }
  if (/\bm12\b/i.test(raw) && /\bmilwaukee\b/i.test(raw)) {
    return formatEbayVoltage(12);
  }
  if (/\bryobi\b/.test(hay) && /\bone\s*\+/.test(hay)) {
    return formatEbayVoltage(18);
  }
  if (/\bcraftsman\b/.test(hay) && /\bv20\b/.test(hay)) {
    return formatEbayVoltage(20);
  }
  if (/\bmakita\b/.test(hay) && /\blxt\b/.test(hay)) {
    return formatEbayVoltage(18);
  }
  if (/\bmakita\b/.test(hay) && /\bcxt\b/.test(hay)) {
    return formatEbayVoltage(12);
  }
  if (/\bmakita\b/.test(hay) && /\bxgt\b/.test(hay)) {
    return formatEbayVoltage(40);
  }
  return null;
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
    const platform = inferPlatformVoltageFromText(raw);
    if (platform) return platform;

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

  const preferred = [
    "1000",
    "480",
    "277",
    "240",
    "230",
    "208",
    "120",
    "48",
    "24",
    "18",
    "12",
  ];
  for (const p of preferred) {
    const hit = matches.find((m) => String(Number(m)) === p);
    if (hit) return formatEbayVoltage(hit);
  }
  return formatEbayVoltage(matches[0]!);
}

/**
 * Infer eBay "Battery Technology" for power-tool battery / charger categories.
 * Values match common Taxonomy allowed strings.
 */
export function inferBatteryTechnologyFromText(text: string): string | null {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  const hay = raw.toLowerCase();

  const batteryContext =
    /\b(battery|batteries|bater[ií]a|charger|cargador|power\s*tool\s*batter|li[- ]?ion|lithium|nicd|nimh|lipo)\b/i.test(
      hay,
    );
  if (!batteryContext) return null;

  if (/\bli[- ]?po\b|lithium\s*polymer|polymer\s*battery/.test(hay)) {
    return "Lithium Polymer (LiPo)";
  }
  if (
    /\bli[- ]?ion\b|lithium[- ]?ion|\blithium\b|liion|lith\.?\s*ion/.test(hay)
  ) {
    return "Lithium-Ion (Li-Ion)";
  }
  if (/\bni[- ]?mh\b|nickel[- ]metal|nimh/.test(hay)) {
    return "Nickel-Metal Hydride (NiMH)";
  }
  if (/\bni[- ]?cd\b|nickel[- ]cadmium|nicd/.test(hay)) {
    return "Nickel-Cadmium (NiCd)";
  }
  if (/\blead[- ]?acid\b|\bagm\b/.test(hay)) {
    return "Lead Acid";
  }
  if (/\balkaline\b/.test(hay)) {
    return "Alkaline";
  }

  // Cordless tool packs (Ryobi/DeWalt 18V battery+charger) are almost always Li-Ion
  // when chemistry is omitted from the title.
  if (
    /\b(ryobi|dewalt|milwaukee|makita|bosch|craftsman|kobalt|ridgid|hart|porter[- ]?cable|black\s*&\s*decker|b&d)\b/i.test(
      hay,
    ) &&
    /\b(battery|batteries|charger)\b/i.test(hay) &&
    /\b\d{1,2}\s*v(?:olts?)?\b/i.test(hay)
  ) {
    return "Lithium-Ion (Li-Ion)";
  }

  return null;
}

/** Infer a value for a missing required aspect name (eBay 25002 retry). */
export function inferAspectValueFromText(
  aspectName: string,
  text: string,
  extras?: {
    brand?: string;
    model?: string;
    mpn?: string;
    productType?: string;
  },
): string | null {
  const name = String(aspectName || "").trim().toLowerCase();
  if (!name) return null;
  if (name === "voltage") return inferVoltageFromText(text);
  if (
    name === "battery technology" ||
    name === "battery type" ||
    name === "battery chemistry"
  ) {
    return inferBatteryTechnologyFromText(text);
  }
  if (name === "model") {
    return inferModelAspect({
      model: extras?.model,
      mpn: extras?.mpn,
      brand: extras?.brand,
      title: text,
    });
  }
  const compatible = inferCompatibleAspect(aspectName, {
    title: text,
    brand: extras?.brand,
    model: extras?.model,
    productType: extras?.productType,
  });
  if (compatible) return compatible;
  return inferItemDimensionAspect(aspectName, text);
}

const EMPTY_ASPECT = /^(n\/?a|none|null|unknown|-|does\s*not\s*apply)$/i;

/**
 * eBay 25002 Model — kitchen/appliance categories require Model even when
 * Compatible Model does not apply. Prefer the real model, else MPN, else DNA.
 */
export function inferModelAspect(opts: {
  model?: string;
  mpn?: string;
  brand?: string;
  title?: string;
}): string {
  const model = String(opts.model || "").trim();
  if (model.length >= 1 && !EMPTY_ASPECT.test(model)) {
    return model.slice(0, 65);
  }

  const mpn = String(opts.mpn || "").trim();
  if (mpn.length >= 2 && !EMPTY_ASPECT.test(mpn)) {
    return mpn.replace(/\s+/g, "").slice(0, 65);
  }

  const title = String(opts.title || "").trim();
  const brand = String(opts.brand || "").trim();
  let rest = title;
  if (brand && rest.toLowerCase().startsWith(brand.toLowerCase())) {
    rest = rest.slice(brand.length).replace(/^[\s,:\-|–]+/, "").trim();
  }
  const coded = rest.match(
    /\b([A-Z]{1,5}[-/]?\d{2,}[A-Z0-9-]{0,12}|\d{2,}[A-Z]{1,6}\d*)\b/,
  );
  if (coded?.[1]) return coded[1].slice(0, 65);

  const line = rest.match(/^([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)/);
  if (
    line?.[1] &&
    !/^(electric|ceramic|stainless|portable|digital|automatic|gooseneck|kitchen|tea|coffee|white|black|blue|pink)/i.test(
      line[1],
    )
  ) {
    return line[1].slice(0, 65);
  }

  return "Does Not Apply";
}

/**
 * Compatibility aspects (Compatible Model / Brand / Product) are required in
 * some kitchen/parts categories. A finished product uses "Does Not Apply".
 */
export function inferCompatibleAspect(
  aspectName: string,
  opts: {
    title?: string;
    brand?: string;
    model?: string;
    productType?: string;
  },
): string | null {
  const name = String(aspectName || "").trim().toLowerCase();
  if (!name.startsWith("compatible")) return null;

  const model = String(opts.model || "").trim();
  const brand = String(opts.brand || "").trim();
  const type = String(opts.productType || "").trim();
  const hay = [opts.title, brand, model, type].filter(Boolean).join(" ");
  const isPart = /\b(part|parts|filter|fits|compatible with|replacement)\b/i.test(
    hay,
  );

  if (name === "compatible model" || name === "compatible models") {
    if (isPart && model.length >= 2 && !/^n\/?a$/i.test(model)) return model;
    return "Does Not Apply";
  }
  if (name === "compatible brand" || name === "compatible brands") {
    if (
      isPart &&
      brand.length >= 2 &&
      !/^(unbranded|generic|does\s*not\s*apply|n\/?a)$/i.test(brand)
    ) {
      return brand;
    }
    return "Does Not Apply";
  }
  if (
    name === "compatible product" ||
    name === "compatible products" ||
    name === "compatible with"
  ) {
    if (isPart && type.length >= 2) return type;
    return "Does Not Apply";
  }
  return "Does Not Apply";
}

export function ensureCompatibleAspects(
  aspects: Record<string, string[]>,
  requiredNames: string[],
  extras: {
    title?: string;
    brand?: string;
    model?: string;
    productType?: string;
  },
): string[] {
  const added: string[] = [];
  for (const name of requiredNames) {
    const trimmed = String(name || "").trim();
    if (!trimmed || !/^compatible/i.test(trimmed)) continue;
    if (listingHasAspect(aspects, trimmed)) continue;
    const value = inferCompatibleAspect(trimmed, extras);
    if (!value) continue;
    aspects[trimmed] = [value];
    added.push(trimmed);
  }
  return added;
}

const DNA_REQUIRED = new Set(
  [
    "Model",
    "MPN",
    "Compatible Model",
    "Compatible Brand",
    "Compatible Product",
    "Unit Type",
    "Custom Bundle",
    "Modified Item",
  ].map((n) => n.toLowerCase()),
);

/**
 * Fill taxonomy-required aspects before Inventory PUT so 25002 never ships
 * an empty Model / Compatible Model / MPN.
 */
export function ensureRequiredCategoryAspects(
  aspects: Record<string, string[]>,
  requiredNames: string[],
  extras: {
    title?: string;
    brand?: string;
    model?: string;
    mpn?: string;
    productType?: string;
  },
): string[] {
  const added: string[] = [];
  const hay = [
    extras.title,
    extras.brand,
    extras.model,
    extras.mpn,
    extras.productType,
  ]
    .filter(Boolean)
    .join(" ");

  for (const name of requiredNames) {
    const trimmed = String(name || "").trim();
    if (!trimmed || listingHasAspect(aspects, trimmed)) continue;
    const value =
      inferAspectValueFromText(trimmed, hay, extras) ||
      (DNA_REQUIRED.has(trimmed.toLowerCase()) ? "Does Not Apply" : "");
    if (!value) continue;
    aspects[trimmed] = [value];
    added.push(trimmed);
  }

  if (!listingHasAspect(aspects, "Model")) {
    aspects.Model = [
      inferModelAspect({
        model: extras.model,
        mpn: extras.mpn,
        brand: extras.brand,
        title: extras.title,
      }),
    ];
    added.push("Model");
  }

  return added;
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
 * Ensure Voltage / Battery Technology exist on Inventory aspects when inferable.
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
  if (!listingHasAspect(aspects, "Battery Technology")) {
    const tech = inferBatteryTechnologyFromText(haystack);
    if (tech) {
      aspects["Battery Technology"] = [tech];
      added.push("Battery Technology");
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

export function humanizeEbayPublishError(raw: string): {
  headline: string;
  detail: string;
} {
  const aspect = parseMissingAspectFromEbayError(raw);
  if (aspect) {
    return {
      headline: `eBay needs “${aspect}”`,
      detail: `This category requires ${aspect} before the listing can go live. Try again — Higlou fills it from the product (or Does Not Apply).`,
    };
  }
  return {
    headline: "Couldn’t finish publish",
    detail: String(raw || "eBay rejected the listing.").trim(),
  };
}
