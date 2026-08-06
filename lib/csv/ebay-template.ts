import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import type { EbayTemplateMeta, EbayTemplateType } from "@/types/ebay";
import {
  EXPECTED_CREATE_LISTING_TEMPLATE_SHA256,
  EXPECTED_SEED_TEMPLATE_SHA256,
} from "@/types/ebay";
import { loadEmbeddedSeedDraftTemplateRaw } from "@/lib/csv/seed-draft-template";

function detectTemplateType(
  infoLine: string,
  headers: string[],
): EbayTemplateType {
  const lower = `${infoLine} ${headers.join(" ")}`.toLowerCase();

  // Official Create Drafts INFO wins even if Higlou appended weight columns.
  if (
    lower.includes("draft-listings-template") ||
    lower.includes("ebay-draft-listings-template")
  ) {
    return "draft_listing";
  }

  if (
    lower.includes("create-or-schedule") ||
    lower.includes("new-listings") ||
    lower.includes("create or schedule") ||
    (lower.includes("schedule") && lower.includes("listing"))
  ) {
    return "new_listing";
  }

  if (
    headers.includes("Shipping service 1 option") ||
    headers.includes("Shipping profile name") ||
    headers.includes("WeightMajor")
  ) {
    return "new_listing";
  }

  if (headers.some((h) => h.toLowerCase().startsWith("action("))) {
    return "draft_listing";
  }
  return "unknown";
}

/** True when the template can carry Seller Hub shipping/location/weight fields. */
export function templateHasPublishReadyShipping(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.toLowerCase()));
  const hasWeight =
    set.has("weightmajor") || set.has("package weight (lbs)");
  const hasShip =
    set.has("shipping service 1 option") ||
    set.has("shippingservice-1:option") ||
    set.has("shipping profile name");
  const hasLocation =
    set.has("postalcode") ||
    set.has("postal code") ||
    set.has("location") ||
    set.has("item location");
  return hasWeight && hasShip && hasLocation;
}

/** Parse official eBay CSV template bytes without rewriting metadata lines. */
export function parseEbayTemplate(raw: string): {
  metaLines: string[];
  headerLine: string;
  exampleLine: string | null;
  trailingLines: string[];
  meta: EbayTemplateMeta;
} {
  const normalized = raw.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  const metaLines: string[] = [];
  let headerIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith("#INFO") || line.startsWith('"#INFO')) {
      metaLines.push(line);
      continue;
    }
    headerIndex = i;
    break;
  }

  if (headerIndex < 0) {
    throw new Error("Official eBay template headers not found");
  }

  const headerLine = lines[headerIndex];
  const headers = splitCsvLine(headerLine);
  const exampleLine =
    lines[headerIndex + 1] && !lines[headerIndex + 1].startsWith("#")
      ? lines[headerIndex + 1]
      : null;
  const trailingLines = lines.slice(headerIndex + (exampleLine ? 2 : 1)).filter(
    (l) => l.length > 0,
  );

  const infoLine = metaLines[0] || "";
  const versionMatch = infoLine.match(/Version=([^,]*)/i);
  const templateMatch = infoLine.match(/Template=([^,]*)/i);

  const sha256 = createHash("sha256").update(raw).digest("hex").toUpperCase();

  return {
    metaLines,
    headerLine,
    exampleLine,
    trailingLines,
    meta: {
      rawInfoLine: infoLine,
      version: versionMatch?.[1] ?? "",
      templateName: templateMatch?.[1] ?? "",
      templateType: detectTemplateType(infoLine, headers),
      headers,
      actionHeader: headers[0] ?? "",
      sha256,
    },
  };
}

export function getSeedTemplateAbsolutePath() {
  return path.join(process.cwd(), "templates", "ebay-draft-listing-template.csv");
}

export function getCreateListingTemplateAbsolutePath() {
  return path.join(
    process.cwd(),
    "templates",
    "ebay-create-listing-template.csv",
  );
}

export function loadSeedTemplateRaw(): string {
  try {
    const filePath = getSeedTemplateAbsolutePath();
    const raw = readFileSync(filePath);
    const text = raw.toString("utf8");
    const sha = createHash("sha256").update(raw).digest("hex").toUpperCase();
    if (sha === EXPECTED_SEED_TEMPLATE_SHA256) return text;
  } catch {
    // Fall through to embedded seed (Vercel serverless often lacks templates/).
  }
  const embedded = loadEmbeddedSeedDraftTemplateRaw();
  const sha = createHash("sha256")
    .update(Buffer.from(embedded, "utf8"))
    .digest("hex")
    .toUpperCase();
  if (sha !== EXPECTED_SEED_TEMPLATE_SHA256) {
    throw new Error(
      `Embedded seed template hash mismatch. Expected ${EXPECTED_SEED_TEMPLATE_SHA256}, got ${sha}`,
    );
  }
  return embedded;
}

/** Publish-ready Create/Schedule template — eBay Create Drafts ignores shipping. */
export function loadCreateListingTemplateRaw(): string {
  const filePath = getCreateListingTemplateAbsolutePath();
  const raw = readFileSync(filePath);
  const text = raw.toString("utf8");
  const sha = createHash("sha256").update(raw).digest("hex").toUpperCase();
  if (sha !== EXPECTED_CREATE_LISTING_TEMPLATE_SHA256) {
    throw new Error(
      `Create listing template hash mismatch. Expected ${EXPECTED_CREATE_LISTING_TEMPLATE_SHA256}, got ${sha}`,
    );
  }
  return text;
}

/** Minimal RFC4180-ish splitter that respects quotes. */
export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current);
  return result;
}

export function escapeCsvCell(value: string): string {
  const flattened = value.replace(/\r\n/g, " ").replace(/[\r\n]+/g, " ").trim();
  if (/[",]/.test(flattened)) {
    return `"${flattened.replaceAll('"', '""')}"`;
  }
  return flattened;
}

/** Extra columns Higlou may append so Seller Hub drafts are publish-ready. */
export const PUBLISH_READY_APPEND_HEADERS = [
  "Duration",
  "Location",
  "PostalCode",
  "Country",
  "CountryCode",
  "DispatchTimeMax",
  "WeightMajor",
  "WeightMinor",
  "WeightUnit",
  "PackageType",
  "MeasurementSystem",
  "PackageLength",
  "PackageWidth",
  "PackageDepth",
  "ShippingType",
  "Shipping service 1 option",
  "Shipping service 1 cost",
  "Shipping service 1 priority",
  "ReturnsAcceptedOption",
  "Shipping profile name",
  "Return profile name",
  "Payment profile name",
] as const;

const PUBLISH_READY_APPEND_SET = new Set<string>(PUBLISH_READY_APPEND_HEADERS);

export interface GenerateCsvOptions {
  templateRaw: string;
  valuesByHeader: Record<string, string>;
  /** Only Item Specifics C:* columns that should be appended if missing. */
  dynamicCColumns?: Record<string, string>;
  /**
   * When true, also append missing publish-ready location/weight/shipping
   * headers that have values (minimal draft templates lack them).
   */
  appendPublishReadyColumns?: boolean;
}

/**
 * Generate CSV from the official template.
 * Preserves #INFO / metadata / original headers exactly.
 * Appends C:* Item Specifics, and optionally publish-ready shipping columns.
 */
export function generateEbayCsvFromTemplate(options: GenerateCsvOptions): string {
  const parsed = parseEbayTemplate(options.templateRaw);
  if (parsed.meta.templateType === "unknown") {
    throw new Error(
      "Active template type is unknown. Map and validate headers before generating CSV.",
    );
  }

  const headers = [...parsed.meta.headers];
  const dynamic = options.dynamicCColumns ?? {};

  for (const column of Object.keys(dynamic)) {
    if (!column.startsWith("C:")) {
      throw new Error(`Refusing non-C column append: ${column}`);
    }
    if (!headers.includes(column)) {
      headers.push(column);
    }
  }

  // Always emit Category ID / Name when provided — Don Baratón import depends on them.
  // Custom seller templates sometimes omit these columns.
  const ensureCoreHeader = (
    canonical: string,
    aliases: string[],
  ): string | null => {
    const existing = findHeader(headers, [canonical, ...aliases]);
    if (existing) return existing;
    const value =
      options.valuesByHeader[canonical] ||
      aliases
        .map((alias) => options.valuesByHeader[alias])
        .find((v) => v?.trim());
    if (!value?.trim()) return null;
    headers.push(canonical);
    options.valuesByHeader[canonical] = value;
    return canonical;
  };
  ensureCoreHeader("Category ID", [
    "eBay category 1 number",
    "CategoryID",
  ]);
  ensureCoreHeader("Category Name", [
    "eBay category 1 name",
    "Category",
  ]);

  if (options.appendPublishReadyColumns) {
    for (const column of PUBLISH_READY_APPEND_HEADERS) {
      const value = options.valuesByHeader[column];
      if (!value?.trim()) continue;
      if (!headers.includes(column)) {
        headers.push(column);
      }
    }
    // Refuse inventing arbitrary non-allowlisted policy columns.
    for (const column of Object.keys(options.valuesByHeader)) {
      if (headers.includes(column)) continue;
      if (column.startsWith("C:")) continue;
      if (!PUBLISH_READY_APPEND_SET.has(column)) continue;
    }
  }

  const row = headers.map((header) => {
    if (Object.prototype.hasOwnProperty.call(options.valuesByHeader, header)) {
      return escapeCsvCell(options.valuesByHeader[header] ?? "");
    }
    if (Object.prototype.hasOwnProperty.call(dynamic, header)) {
      return escapeCsvCell(dynamic[header] ?? "");
    }
    return "";
  });

  if (headers.length !== row.length) {
    throw new Error("Header count does not match value count");
  }

  const headerLine =
    headers.length === parsed.meta.headers.length
      ? parsed.headerLine
      : headers.map(escapeCsvCell).join(",");

  const body = [
    ...parsed.metaLines,
    headerLine,
    row.join(","),
  ].join("\r\n");

  // UTF-8 BOM for Excel / Seller Hub compatibility
  return `\uFEFF${body}\r\n`;
}

export function findHeader(
  headers: string[],
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    const exact = headers.find((h) => h === candidate);
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    const fuzzy = headers.find(
      (h) => h.toLowerCase() === candidate.toLowerCase(),
    );
    if (fuzzy) return fuzzy;
  }
  return null;
}
