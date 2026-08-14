import { resolveCategorySpecifics } from "@/config/category-specifics";
import { inferVoltageFromText, inferBatteryTechnologyFromText } from "@/lib/ebay/infer-voltage";
import {
  formatEbayInches,
  inferItemDimsFromText,
} from "@/lib/ebay/infer-item-dimensions";

function normalizeCKey(key: string): string {
  const raw = String(key || "").trim();
  if (!raw) return "";
  if (raw.startsWith("C:")) return raw;
  // "Brand" / "C: Brand" / "brand"
  const cleaned = raw.replace(/^C:\s*/i, "").trim();
  return cleaned ? `C:${cleaned}` : "";
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** eBay rejects Brand without a paired MPN (error 25002 BrandMPN). */
export function resolveBrandMpn(input: {
  brand?: string;
  mpn?: string;
  model?: string;
}): string {
  const mpn = String(input.mpn || "").trim();
  if (mpn && !/^(n\/?a|none|null|unknown|-)$/i.test(mpn)) {
    // Compact spaced catalog numbers (e.g. Home Depot "1008 481 828").
    const compact = mpn.replace(/\s+/g, "").slice(0, 65);
    return compact || mpn.slice(0, 65);
  }
  const brand = String(input.brand || "").trim();
  if (!brand || /^(unbranded|generic|does\s*not\s*apply|n\/?a)$/i.test(brand)) {
    return "Does Not Apply";
  }
  const model = String(input.model || "").trim();
  if (model && model.length >= 2 && !/^n\/?a$/i.test(model)) {
    return model.replace(/\s+/g, "").slice(0, 65) || model.slice(0, 65);
  }
  return "Does Not Apply";
}

function joinAspect(values: string[] | undefined): string {
  return (values || [])
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

function inferFinish(input: {
  title?: string;
  colors?: string[];
  materials?: string[];
  features?: string[];
}): string {
  const hay = [
    input.title,
    ...(input.colors || []),
    ...(input.materials || []),
    ...(input.features || []),
  ]
    .join(" ")
    .toLowerCase();

  const finishes: Array<[RegExp, string]> = [
    [/brushed nickel|satin nickel/, "Brushed Nickel"],
    [/polished chrome|chrome(?!\s*vanadium)/, "Chrome"],
    [/matte black|matte-black|black stainless/, "Matte Black"],
    [/brushed gold|champagne bronze/, "Brushed Gold"],
    [/oil[- ]rubbed bronze|orb\b/, "Oil Rubbed Bronze"],
    [/stainless steel/, "Stainless Steel"],
    [/brushed brass|antique brass/, "Brushed Brass"],
    [/polished nickel/, "Polished Nickel"],
  ];
  for (const [re, label] of finishes) {
    if (re.test(hay)) return label;
  }
  return joinAspect(input.colors);
}

function inferFaucetMount(input: {
  title?: string;
  features?: string[];
}): string {
  const hay = [input.title, ...(input.features || [])].join(" ").toLowerCase();
  if (/centerset|4\s*in|4"|4-inch/.test(hay)) return "Centerset";
  if (/widespread|8\s*in|8"|8-inch/.test(hay)) return "Widespread";
  if (/single[- ]hole|1[- ]hole/.test(hay)) return "Single Hole";
  if (/wall[- ]mount/.test(hay)) return "Wall Mount";
  if (/deck[- ]mount/.test(hay)) return "Deck Mount";
  // Pull-down/out bathroom/kitchen faucets are typically deck-mounted
  if (/pull[- ]?down|pull[- ]?out/.test(hay)) return "Deck Mount";
  return "";
}

function inferFaucetHoles(input: {
  title?: string;
  features?: string[];
}): string {
  const hay = [input.title, ...(input.features || [])].join(" ").toLowerCase();
  if (/3[- ]hole|three hole|widespread|centerset|4\s*in/.test(hay)) return "3";
  if (/2[- ]hole|two hole|two-handle|2 handle/.test(hay)) return "2";
  if (/1[- ]hole|single[- ]hole|single hole/.test(hay)) return "1";
  if (/two handle|2-handle|dual handle/.test(hay)) return "3";
  return "";
}

function isFaucetLike(input: {
  categoryId?: string;
  categoryName?: string;
  productType?: string;
  title?: string;
}): boolean {
  const hay = [
    input.categoryId,
    input.categoryName,
    input.productType,
    input.title,
  ]
    .join(" ")
    .toLowerCase();
  return /faucet|grifo|llave|tap\b|mixer tap|63897/.test(hay);
}

/** Pull brand from titles like "Glacier Bay Dorind Collection …". */
function inferBrandFromTitle(title?: string): string {
  const raw = String(title || "").trim();
  if (!raw) return "";

  // "Brand Name Line Collection …" → Brand Name (drop the collection code)
  const withCollection = raw.match(
    /^((?:[A-Z][A-Za-z0-9&.\-']+\s+){1,3})[A-Z][A-Za-z0-9&.\-']+\s+Collection\b/,
  );
  if (withCollection) return withCollection[1].trim();

  const stop =
    /\b(Collection|Series|Set|Two|2|Single|Double|Pull[- ]?Down|Bathroom|Kitchen|Faucet|Handle|Piece)\b/i;
  const stopMatch = raw.match(stop);
  const head = stopMatch?.index != null ? raw.slice(0, stopMatch.index) : raw;
  const tokens = head
    .trim()
    .split(/\s+/)
    .filter((t) => /^[A-Z][A-Za-z0-9&.\-']*$/.test(t))
    .slice(0, 2);
  if (tokens.length >= 1) return tokens.join(" ");
  return "";
}

export type EnrichedExportSpecifics = {
  /** C:Brand style columns for File Exchange / Seller Hub. */
  columns: Record<string, string>;
  /** Attribute1Name / Attribute1Value pairs — often accepted by Create Drafts. */
  attributePairs: Array<{ name: string; value: string }>;
};

/** Merge listing fields into C:* (+ Attribute Name/Value) so drafts fill on eBay. */
export function enrichItemSpecificsForExport(input: {
  categoryId: string;
  categoryName?: string;
  itemSpecifics: Array<{ key: string; value: string; label?: string }>;
  brand?: string;
  size?: string;
  model?: string;
  mpn?: string;
  productType?: string;
  title?: string;
  colors?: string[];
  materials?: string[];
  features?: string[];
}): EnrichedExportSpecifics {
  const columns: Record<string, string> = {};

  for (const specific of input.itemSpecifics) {
    const key = normalizeCKey(specific.key || specific.label || "");
    const value = String(specific.value || "").trim();
    if (!key || !value) continue;
    // eBay aspect values: prefer commas over pipes
    columns[key] = value.replace(/\s*\|\s*/g, ", ");
  }

  const family = resolveCategorySpecifics(input.categoryId, {
    categoryName: input.categoryName,
    productType: input.productType,
    title: input.title,
  });
  const color = joinAspect(input.colors);
  const material = joinAspect(input.materials);
  const type = firstNonEmpty(
    columns["C:Type"],
    input.productType,
    input.categoryName,
  );
  const finish = firstNonEmpty(
    columns["C:Finish"],
    inferFinish(input),
  );

  const derived: Record<string, string> = {
    brand: firstNonEmpty(
      columns["C:Brand"],
      input.brand,
      inferBrandFromTitle(input.title),
    ),
    size: firstNonEmpty(columns["C:Size"], input.size),
    model: firstNonEmpty(columns["C:Model"], input.model),
    mpn: firstNonEmpty(columns["C:MPN"], input.mpn),
    type,
    color: firstNonEmpty(columns["C:Color"], color),
    material: firstNonEmpty(columns["C:Material"], material),
    features: firstNonEmpty(
      columns["C:Features"],
      joinAspect(input.features),
    ),
    finish,
  };

  // eBay BrandMPN (25002): Brand without a valid MPN is rejected.
  const brandOrUnbranded = derived.brand || "Unbranded";
  derived.brand = brandOrUnbranded;
  derived.mpn = resolveBrandMpn({
    brand: brandOrUnbranded,
    mpn: derived.mpn,
    model: derived.model,
  });


  for (const field of family.fields) {
    const column = field.csvColumn.startsWith("C:")
      ? field.csvColumn
      : `C:${field.csvColumn}`;
    if (columns[column]?.trim()) continue;

    const fromListing = derived[field.key]?.trim();
    if (fromListing) {
      columns[column] = fromListing;
      continue;
    }

    if (field.required && field.key === "brand") {
      columns[column] = "Unbranded";
    }
  }

  // Always push core commerce aspects even if category family omitted them.
  // Brand + MPN must both be present (eBay error 25002 BrandMPN).
  const coreAlways: Array<[string, string]> = [
    ["C:Brand", derived.brand],
    ["C:Type", derived.type],
    ["C:Model", derived.model],
    ["C:MPN", derived.mpn],
    ["C:Color", derived.color],
    ["C:Material", derived.material],
    ["C:Finish", derived.finish],
    ["C:Features", derived.features],
  ];
  for (const [key, value] of coreAlways) {
    if (!value?.trim()) continue;
    if (!columns[key]?.trim()) columns[key] = value.trim();
  }
  // Force MPN whenever Brand is present (overwrite empty / whitespace).
  if (columns["C:Brand"]?.trim() && !columns["C:MPN"]?.trim()) {
    columns["C:MPN"] = derived.mpn;
  }

  // Voltage required in many electrical / EV categories (eBay 25002).
  if (!columns["C:Voltage"]?.trim()) {
    const voltage = inferVoltageFromText(
      [
        input.title,
        input.productType,
        input.categoryName,
        derived.features,
        ...Object.values(columns),
      ]
        .filter(Boolean)
        .join(" "),
    );
    if (voltage) columns["C:Voltage"] = voltage;
  }

  // Battery Technology required for Power Tool Batteries & Chargers (eBay 25002).
  const batteryHay = [
    input.title,
    input.productType,
    input.categoryName,
    derived.features,
    ...Object.values(columns),
  ]
    .filter(Boolean)
    .join(" ");
  if (!columns["C:Battery Technology"]?.trim()) {
    const tech = inferBatteryTechnologyFromText(batteryHay);
    if (tech) columns["C:Battery Technology"] = tech;
  }

  // Furniture 25002: Item Length / Width / Height (never 1" mini-package).
  const dims = inferItemDimsFromText(batteryHay);
  if (dims) {
    if (!columns["C:Item Length"]?.trim() && dims.lengthIn) {
      columns["C:Item Length"] = formatEbayInches(dims.lengthIn);
    }
    if (!columns["C:Item Width"]?.trim() && dims.widthIn) {
      columns["C:Item Width"] = formatEbayInches(dims.widthIn);
    }
    if (!columns["C:Item Height"]?.trim() && dims.heightIn) {
      columns["C:Item Height"] = formatEbayInches(dims.heightIn);
    }
  }

  if (isFaucetLike(input)) {
    const mount = firstNonEmpty(
      columns["C:Faucet Mounting Type"],
      columns["C:Mounting Type"],
      inferFaucetMount(input),
    );
    const holes = firstNonEmpty(
      columns["C:Number of Faucet Holes"],
      columns["C:Number of Holes"],
      inferFaucetHoles(input),
    );
    if (mount) {
      columns["C:Faucet Mounting Type"] = mount;
      columns["C:Mounting Type"] = mount;
    }
    if (holes) {
      columns["C:Number of Faucet Holes"] = holes;
      columns["C:Number of Holes"] = holes;
    }
    if (derived.finish && !columns["C:Finish"]?.trim()) {
      columns["C:Finish"] = derived.finish;
    }
    if (!columns["C:Material"]?.trim()) {
      columns["C:Material"] = "Metal";
    }
    // Prefer bathroom/kitchen faucet type wording
    if (!columns["C:Type"]?.trim() || /^faucet$/i.test(columns["C:Type"])) {
      const hay = `${input.title || ""} ${input.productType || ""}`.toLowerCase();
      columns["C:Type"] = /kitchen/.test(hay)
        ? "Kitchen Faucet"
        : /bath|lavatory|basin/.test(hay)
          ? "Bathroom Faucet"
          : columns["C:Type"] || "Faucet";
    }
  }

  const attributePairs = Object.entries(columns)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => ({
      name: key.replace(/^C:/, ""),
      value: value.trim(),
    }));

  return { columns, attributePairs };
}
