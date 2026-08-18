import {
  listingLooksBareTool,
  listingLooksLikeKit,
} from "@/lib/amazon/catalog-match";
import {
  amazonConditionType,
  amazonOfferAttributes,
} from "@/lib/amazon/listing-offer";
import { inferVoltageFromText } from "@/lib/ebay/infer-voltage";

export type AmazonListingDraft = {
  title: string;
  brand?: string;
  model?: string;
  mpn?: string;
  upc?: string;
  description?: string;
  features?: string[];
  images?: string[];
  color?: string;
  material?: string;
  countryOfManufacture?: string;
  categoryName?: string;
  itemSpecifics?: Array<{ label?: string; key?: string; value?: string }>;
  price: number;
  quantity: number;
  condition?: string;
  conditionId?: string;
  handlingTime?: number;
  packageLengthIn?: number | null;
  packageWidthIn?: number | null;
  packageDepthIn?: number | null;
  sku?: string;
  asin?: string;
  amazonAsin?: string;
};

export type AmazonProductTypeSchema = {
  productType: string;
  required: string[];
  properties: Record<string, Record<string, unknown>>;
};

export type AmazonCatalogSnapshot = {
  asin: string;
  title: string;
  productType: string;
  attributes: Record<string, unknown>;
  images: string[];
  browseNodeId?: string;
  brand?: string;
  manufacturer?: string;
};

const CATALOG_IDENTITY_KEYS = new Set(["brand", "manufacturer"]);

const AMAZON_OFFER_ATTRIBUTE_KEYS = [
  "merchant_suggested_asin",
  "condition_type",
  "condition_note",
  "fulfillment_availability",
  "purchasable_offer",
  "list_price",
] as const;

export function amazonIsBrandLockIssue(issue: {
  code?: string;
  message?: string;
}): boolean {
  const text = `${issue.code || ""} ${issue.message || ""}`;
  return (
    /\b5995\b/.test(text) ||
    /may not change the brand name/i.test(text) ||
    /brand name currently shown on the ASIN/i.test(text)
  );
}

export function amazonHasBrandLockIssue(
  issues: Array<{ code?: string; message?: string }> | undefined,
): boolean {
  return (issues || []).some((issue) => amazonIsBrandLockIssue(issue));
}

/** Existing ASINs already have a brand. Sending ours triggers Amazon 5995. */
export function amazonExistingAsinOfferAttributes(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of AMAZON_OFFER_ATTRIBUTE_KEYS) {
    if (attributes[key] != null) out[key] = attributes[key];
  }
  return out;
}

export function dropAmazonBrandAttributes(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...attributes };
  delete out.brand;
  delete out.manufacturer;
  return out;
}

const SKIP_CATALOG_KEYS = new Set([
  "skip_offer",
  "purchasable_offer",
  "fulfillment_availability",
  "condition_type",
  "merchant_suggested_asin",
  "list_price",
]);

const SAFETY_OBJECT_KEYS = new Set(["battery", "lithium_battery", "hazmat"]);

const COUNTRY_ISO: Record<string, string> = {
  usa: "US",
  us: "US",
  "united states": "US",
  "united states of america": "US",
  china: "CN",
  "p.r.c.": "CN",
  prc: "CN",
  mexico: "MX",
  canada: "CA",
  taiwan: "TW",
  vietnam: "VN",
  germany: "DE",
  japan: "JP",
  india: "IN",
  italy: "IT",
  korea: "KR",
  "south korea": "KR",
  thailand: "TH",
  indonesia: "ID",
  malaysia: "MY",
};

function schemaKeys(schema?: AmazonProductTypeSchema | null): Set<string> | null {
  if (!schema?.properties) return null;
  return new Set(Object.keys(schema.properties));
}

function keepKey(name: string, allowed: Set<string> | null): boolean {
  return !allowed || allowed.has(name);
}

export function stripAmazonHtml(value: string): string {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function countryOfOriginCode(value?: string): string {
  const raw = String(value || "").trim();
  if (/^[A-Z]{2}$/i.test(raw)) return raw.toUpperCase();
  return COUNTRY_ISO[raw.toLowerCase()] || "US";
}

function propertyOf(schema: AmazonProductTypeSchema | null | undefined, name: string) {
  return schema?.properties?.[name] || null;
}

function itemRequired(prop: Record<string, unknown> | null): string[] {
  const items = (prop?.items || {}) as { required?: string[] };
  return Array.isArray(items.required) ? items.required.map(String) : [];
}

function valueEnum(prop: Record<string, unknown> | null): string[] {
  const items = (prop?.items || {}) as {
    properties?: { value?: { enum?: string[] } };
  };
  return Array.isArray(items.properties?.value?.enum)
    ? items.properties.value.enum.map(String)
    : [];
}

export function amazonAttributeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return amazonAttributeText(value[0]);
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return amazonAttributeText(row.value ?? row.brand ?? row.name);
  }
  return "";
}

export function amazonCatalogBrand(
  catalog?: AmazonCatalogSnapshot | null,
): string {
  if (!catalog) return "";
  return (
    amazonAttributeText(catalog.attributes?.brand) ||
    String(catalog.brand || "").trim() ||
    amazonAttributeText(catalog.attributes?.manufacturer) ||
    String(catalog.manufacturer || "").trim()
  );
}

export function amazonCatalogManufacturer(
  catalog?: AmazonCatalogSnapshot | null,
): string {
  if (!catalog) return "";
  return (
    amazonAttributeText(catalog.attributes?.manufacturer) ||
    String(catalog.manufacturer || "").trim() ||
    amazonCatalogBrand(catalog)
  );
}

export function applyAmazonCatalogIdentity(opts: {
  attributes: Record<string, unknown>;
  catalog?: AmazonCatalogSnapshot | null;
  marketplaceId: string;
  schema?: AmazonProductTypeSchema | null;
}): { attributes: Record<string, unknown>; filled: string[] } {
  const attributes = { ...opts.attributes };
  const filled: string[] = [];
  const catalog = opts.catalog;
  if (!catalog) return { attributes, filled };

  const setIdentity = (name: "brand" | "manufacturer", value: string) => {
    if (!value) return;
    const catalogValue = catalog.attributes?.[name];
    attributes[name] =
      catalogValue != null && amazonAttributeText(catalogValue)
        ? catalogValue
        : amazonTextAttribute(
            value,
            opts.marketplaceId,
            propertyOf(opts.schema, name),
          );
    filled.push(name);
  };

  setIdentity("brand", amazonCatalogBrand(catalog));
  setIdentity("manufacturer", amazonCatalogManufacturer(catalog));
  return { attributes, filled };
}

export function amazonTextAttribute(
  value: string,
  marketplaceId: string,
  schemaProp?: Record<string, unknown> | null,
) {
  const row: Record<string, unknown> = {
    value,
    language_tag: "en_US",
    marketplace_id: marketplaceId,
  };
  if (!schemaProp || !Object.keys(schemaProp).length) return [row];
  const required = itemRequired(schemaProp);
  const props = ((schemaProp.items as { properties?: Record<string, unknown> }) || {})
    .properties || {};
  if (!required.includes("language_tag") && !props.language_tag) {
    delete row.language_tag;
  }
  if (!required.includes("marketplace_id") && !props.marketplace_id) {
    delete row.marketplace_id;
  }
  if (!row.marketplace_id && !row.language_tag) {
    row.marketplace_id = marketplaceId;
  }
  return [row];
}

export function copyAmazonCatalogAttributes(
  catalog: Record<string, unknown>,
  schema?: AmazonProductTypeSchema | null,
): Record<string, unknown> {
  const allowed = schemaKeys(schema);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(catalog || {})) {
    if (SKIP_CATALOG_KEYS.has(key) || !keepKey(key, allowed)) continue;
    if (value == null) continue;
    if (SAFETY_OBJECT_KEYS.has(key) && amazonSafetyObjectIncomplete(value)) continue;
    out[key] = value;
  }
  return out;
}

function listingBlob(listing: AmazonListingDraft): string {
  return [
    listing.title,
    listing.description,
    listing.brand,
    listing.model,
    listing.categoryName,
    ...(listing.features || []),
    ...(listing.itemSpecifics || []).map(
      (row) => `${row.label || row.key || ""} ${row.value || ""}`,
    ),
  ]
    .filter(Boolean)
    .join(" ");
}

export function amazonListingIsCordless(listing: AmazonListingDraft): boolean {
  const text = listingBlob(listing);
  if (
    /\b(cordless|one\+|one\s*plus|m18|m12|20v\s*max|bare tool|tool only)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  return Boolean(inferVoltageFromText(text));
}

export function amazonBatteryIntent(listing: AmazonListingDraft): {
  cordless: boolean;
  bare: boolean;
  kit: boolean;
  containsCell: boolean;
  batteriesIncluded: boolean;
  batteriesRequired: boolean;
} {
  const text = listingBlob(listing);
  const cordless = amazonListingIsCordless(listing);
  const bare = listingLooksBareTool(text);
  const kit = !bare && listingLooksLikeKit(text);
  const containsCell = Boolean(cordless && kit && !bare);
  return {
    cordless,
    bare,
    kit,
    containsCell,
    batteriesIncluded: containsCell,
    batteriesRequired: cordless,
  };
}

function nestedEnum(prop: Record<string, unknown> | null, field: string): string[] {
  const items = (prop?.items || {}) as {
    properties?: Record<string, { enum?: string[] }>;
  };
  const options = items.properties?.[field]?.enum;
  return Array.isArray(options) ? options.map(String) : [];
}

function objectFieldEnum(
  shape: Record<string, unknown> | undefined,
  field: string,
): string[] {
  if (!shape) return [];
  const direct = (
    shape.properties as Record<string, { enum?: string[] }> | undefined
  )?.[field]?.enum;
  if (Array.isArray(direct)) return direct.map(String);
  return nestedEnum({ items: shape } as Record<string, unknown>, field);
}

function pickFromEnums(options: string[], preferred: string[]): string {
  if (!options.length) return preferred[0] || "";
  for (const want of preferred) {
    const hit = options.find((option) => option.toLowerCase() === want.toLowerCase());
    if (hit) return hit;
  }
  return options[0] || preferred[0] || "";
}

function maxUniqueItems(prop: Record<string, unknown> | null): number | null {
  const n = Number(prop?.maxUniqueItems);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function amazonSafetyObjectIncomplete(value: unknown): boolean {
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== "object") return false;
    if (Array.isArray(node)) return node.some(visit);
    const row = node as Record<string, unknown>;
    for (const [key, child] of Object.entries(row)) {
      if (/weight|energy/i.test(key)) {
        const parts = Array.isArray(child) ? child : child ? [child] : [];
        for (const part of parts) {
          if (!part || typeof part !== "object") continue;
          const item = part as Record<string, unknown>;
          const hasValue = item.value != null && item.value !== "";
          const hasUnit = Boolean(item.unit);
          if ((hasValue || "value" in item) && !hasUnit) return true;
        }
      }
      if (visit(child)) return true;
    }
    return false;
  };
  return visit(value);
}

export function trimAmazonAttributesToSchema(
  attributes: Record<string, unknown>,
  schema?: AmazonProductTypeSchema | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (!Array.isArray(value)) {
      out[key] = value;
      continue;
    }
    const max =
      maxUniqueItems(propertyOf(schema, key)) ?? (key === "color" ? 1 : null);
    out[key] = max != null ? value.slice(0, max) : value;
  }
  return out;
}

export function dropIncompleteAmazonSafetyAttributes(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...attributes };
  for (const key of SAFETY_OBJECT_KEYS) {
    if (out[key] == null) continue;
    if (amazonSafetyObjectIncomplete(out[key])) delete out[key];
  }
  return out;
}

function booleanAttribute(value: boolean, marketplaceId: string) {
  return [{ value, marketplace_id: marketplaceId }];
}

function schemaFlagAttribute(
  prop: Record<string, unknown> | null,
  flag: boolean,
  marketplaceId: string,
): unknown | null {
  const enums = valueEnum(prop);
  if (enums.length) {
    const preferred = flag
      ? ["yes", "true", "y"]
      : ["no", "false", "n", "does_not_contain", "not_applicable"];
    const picked = pickFromEnums(enums, preferred);
    if (!picked) return null;
    return [{ value: picked, marketplace_id: marketplaceId }];
  }
  if (!prop || valueType(prop) === "boolean") {
    return booleanAttribute(flag, marketplaceId);
  }
  return null;
}

export function applyAmazonBatteryPack(
  attributes: Record<string, unknown>,
  listing: AmazonListingDraft,
  marketplaceId: string,
  schema?: AmazonProductTypeSchema | null,
): Record<string, unknown> {
  const intent = amazonBatteryIntent(listing);
  const out = dropIncompleteAmazonSafetyAttributes({ ...attributes });
  const setIfKnown = (name: string, value: boolean) => {
    if (!keepKey(name, schemaKeys(schema))) return;
    const packed = schemaFlagAttribute(
      propertyOf(schema, name),
      value,
      marketplaceId,
    );
    if (packed) out[name] = packed;
    else delete out[name];
  };
  setIfKnown("contains_battery_or_cell", intent.containsCell);
  setIfKnown("batteries_included", intent.batteriesIncluded);
  setIfKnown("batteries_required", intent.batteriesRequired);
  if (!intent.containsCell) {
    delete out.battery;
    delete out.lithium_battery;
  }
  return out;
}

function voltageNumber(listing: AmazonListingDraft): number | null {
  const formatted = inferVoltageFromText(listingBlob(listing));
  if (!formatted) return null;
  const n = Number(String(formatted).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function includedComponentsValue(listing: AmazonListingDraft): string {
  const specific = listing.itemSpecifics?.find((row) =>
    /included\s*component/i.test(String(row.label || row.key || "")),
  );
  const fromSpecific = String(specific?.value || "").trim();
  if (fromSpecific) return fromSpecific.slice(0, 500);
  const intent = amazonBatteryIntent(listing);
  if (intent.bare) return "Tool only";
  if (intent.kit) return "Tool, battery, and charger";
  return listing.title.slice(0, 120);
}

function packageInches(listing: AmazonListingDraft): {
  length: number;
  width: number;
  height: number;
} | null {
  const length = Number(listing.packageLengthIn);
  const width = Number(listing.packageWidthIn);
  const height = Number(listing.packageDepthIn);
  if (![length, width, height].every((n) => Number.isFinite(n) && n > 0)) {
    return null;
  }
  return { length, width, height };
}

function dimensionPart(
  shape: Record<string, unknown> | undefined,
  value: number,
  unit: string,
) {
  if (shape?.type === "array" || shape?.items) {
    return [{ value, unit }];
  }
  return { value, unit };
}

function specificValue(
  listing: AmazonListingDraft,
  matcher: RegExp,
): string {
  const specific = listing.itemSpecifics?.find((row) =>
    matcher.test(String(row.label || row.key || "").replace(/^C:/, "")),
  );
  return String(specific?.value || "").trim();
}

export function listingPartNumber(listing: AmazonListingDraft): string {
  return (
    specificValue(listing, /^(part\s*number|mpn|manufacturer\s*part)/i) ||
    String(listing.mpn || "").trim() ||
    String(listing.model || "").trim() ||
    String(listing.sku || "")
      .replace(/^(AMZ|HD)-/i, "")
      .trim()
  );
}

export function listingMaterial(listing: AmazonListingDraft): string {
  const fromField = String(listing.material || "").trim();
  if (fromField) return fromField;
  const fromSpecific = specificValue(
    listing,
    /^(material|base\s*material|frame\s*material|tabletop\s*material)$/i,
  );
  if (fromSpecific) return fromSpecific;
  const blob = listingBlob(listing);
  const hit = blob.match(
    /\b(hdpe|high[\s-]*density[\s-]*polyethylene|polyethylene|resin|rattan|wicker|acacia|teak|aluminum|aluminium|steel|iron|wood|plastic|glass|fabric|rattan)\b/i,
  );
  return hit?.[1] || "";
}

function materialNeedles(raw: string): string[] {
  const text = String(raw || "").toLowerCase().replace(/[_-]+/g, " ").trim();
  if (!text) return [];
  const needles = [text, text.replace(/\s+/g, "_")];
  if (/\bhdpe\b|high\s*density\s*polyethylene/.test(text)) {
    needles.push(
      "hdpe",
      "high_density_polyethylene",
      "high-density polyethylene",
      "polyethylene",
      "plastic",
    );
  }
  if (/\bplastic\b|\bresin\b|\bpolyethylene\b/.test(text)) {
    needles.push("plastic", "resin", "polyethylene");
  }
  return [...new Set(needles)];
}

function pickMaterial(options: string[], raw: string): string {
  const needles = materialNeedles(raw);
  if (!options.length) return needles[0] || raw;
  for (const needle of needles) {
    const hit = options.find(
      (option) =>
        option.toLowerCase() === needle.toLowerCase() ||
        option.toLowerCase().replace(/[_-]+/g, " ") ===
          needle.toLowerCase().replace(/[_-]+/g, " "),
    );
    if (hit) return hit;
  }
  return "";
}

function materialValuesMissing(value: unknown): boolean {
  if (value == null) return true;
  if (!Array.isArray(value) || !value.length) return true;
  const first = value[0] as Record<string, unknown>;
  if (Array.isArray(first.material)) {
    const row = first.material[0] as { value?: unknown } | undefined;
    return row?.value == null || row.value === "";
  }
  return first.value == null || first.value === "";
}

function fillMaterialAttributes(
  attributes: Record<string, unknown>,
  listing: AmazonListingDraft,
  marketplaceId: string,
  schema?: AmazonProductTypeSchema | null,
) {
  const raw = listingMaterial(listing);
  if (!raw) return;
  const allowed = schemaKeys(schema);
  for (const name of [
    "material",
    "base_material",
    "frame_material",
    "tabletop_material",
    "base",
  ]) {
    if (!keepKey(name, allowed)) continue;
    if (!materialValuesMissing(attributes[name])) continue;
    const prop = propertyOf(schema, name);
    const items = (prop?.items || {}) as {
      properties?: Record<string, Record<string, unknown>>;
    };
    const nestedMaterial = items.properties?.material || null;
    if (nestedMaterial) {
      const value = pickMaterial(valueEnum(nestedMaterial), raw) || raw;
      attributes[name] = [
        {
          material: [{ value }],
          marketplace_id: marketplaceId,
        },
      ];
      continue;
    }
    const value = pickMaterial(valueEnum(prop), raw) || raw;
    attributes[name] = [{ value, marketplace_id: marketplaceId }];
  }
}

function fillSchemaDrivenDefaults(
  attributes: Record<string, unknown>,
  listing: AmazonListingDraft,
  marketplaceId: string,
  schema?: AmazonProductTypeSchema | null,
) {
  const allowed = schemaKeys(schema);
  const set = (name: string, value: unknown) => {
    if (attributes[name] || !keepKey(name, allowed)) return;
    attributes[name] = value;
  };

  const volts = voltageNumber(listing);
  if (volts != null) {
    const prop = propertyOf(schema, "voltage");
    const unit = pickFromEnums(nestedEnum(prop, "unit"), ["volts", "v"]);
    set("voltage", [
      {
        value: volts,
        ...(unit ? { unit } : {}),
        marketplace_id: marketplaceId,
      },
    ]);
  }

  const powerProp = propertyOf(schema, "power_source_type");
  const cordless = amazonListingIsCordless(listing);
  const power = pickEnum(
    powerProp,
    cordless
      ? ["battery", "battery_powered", "dc"]
      : ["corded_electric", "ac", "not_applicable"],
  );
  if (power) set("power_source_type", [{ value: power, marketplace_id: marketplaceId }]);

  const included = includedComponentsValue(listing);
  if (included) {
    set(
      "included_components",
      amazonTextAttribute(
        included,
        marketplaceId,
        propertyOf(schema, "included_components"),
      ),
    );
  }

  const unitCountProp = propertyOf(schema, "unit_count");
  const unitType = pickFromEnums(nestedEnum(unitCountProp, "type"), [
    "count",
    "each",
  ]);
  set("unit_count", [
    {
      value: 1,
      ...(unitType ? { type: unitType } : {}),
      marketplace_id: marketplaceId,
    },
  ]);

  const dims = packageInches(listing);
  if (dims) {
    const dimProp = propertyOf(schema, "item_length_width_height");
    const dimItems = (dimProp?.items || {}) as {
      properties?: Record<string, Record<string, unknown>>;
    };
    const unit =
      pickFromEnums(objectFieldEnum(dimItems.properties?.length, "unit"), [
        "inches",
        "in",
      ]) || "inches";
    set("item_length_width_height", [
      {
        length: dimensionPart(dimItems.properties?.length, dims.length, unit),
        width: dimensionPart(dimItems.properties?.width, dims.width, unit),
        height: dimensionPart(dimItems.properties?.height, dims.height, unit),
        marketplace_id: marketplaceId,
      },
    ]);
  }

  const part = listingPartNumber(listing);
  if (part) {
    set(
      "part_number",
      amazonTextAttribute(part, marketplaceId, propertyOf(schema, "part_number")),
    );
  }
  fillMaterialAttributes(attributes, listing, marketplaceId, schema);
}

export function issueAttributeKeys(issue: {
  message?: string;
  attributeNames?: string[];
}): string[] {
  const names = new Set<string>();
  for (const name of issue.attributeNames || []) {
    if (name) names.add(String(name));
  }
  const message = String(issue.message || "");
  for (const match of message.matchAll(/'([^']+)'/g)) {
    const raw = String(match[1] || "").trim();
    if (!raw) continue;
    names.add(raw);
    names.add(
      raw
        .toLowerCase()
        .replace(/#\d+/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, ""),
    );
  }
  if (/part\s*number/i.test(message)) names.add("part_number");
  if (
    /5995/.test(message) ||
    /may not change the brand name/i.test(message) ||
    /brand name currently shown on the ASIN/i.test(message)
  ) {
    names.add("brand");
    names.add("manufacturer");
  }
  if (/base\s*material/i.test(message)) {
    names.add("base");
    names.add("base_material");
    names.add("material");
  }
  if (/contains\s*battery/i.test(message)) names.add("contains_battery_or_cell");
  return [...names];
}

export function finalizeAmazonListingAttributes(opts: {
  attributes: Record<string, unknown>;
  listing: AmazonListingDraft;
  marketplaceId: string;
  schema?: AmazonProductTypeSchema | null;
}): Record<string, unknown> {
  const withSafety = applyAmazonBatteryPack(
    opts.attributes,
    opts.listing,
    opts.marketplaceId,
    opts.schema,
  );
  const trimmed = trimAmazonAttributesToSchema(withSafety, opts.schema);
  const allowed = schemaKeys(opts.schema);
  if (!allowed) return trimmed;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(trimmed)) {
    if (allowed.has(key)) out[key] = value;
  }
  return out;
}

function pickEnum(prop: Record<string, unknown> | null, preferred: string[]): string {
  const options = valueEnum(prop);
  if (!options.length) return "";
  for (const want of preferred) {
    const hit = options.find((option) => option.toLowerCase() === want.toLowerCase());
    if (hit) return hit;
  }
  const notApplicable = options.find((option) => /not\s*applicable/i.test(option));
  return notApplicable || "";
}

function listingBullets(listing: AmazonListingDraft): string[] {
  const fromFeatures = (listing.features || [])
    .map((row) => stripAmazonHtml(row))
    .filter((row) => row.length >= 8);
  if (fromFeatures.length) return fromFeatures.slice(0, 10);
  const fromSpecifics = (listing.itemSpecifics || [])
    .map((row) => {
      const label = String(row.label || row.key || "").replace(/^C:/, "").trim();
      const value = String(row.value || "").trim();
      if (!label || !value) return "";
      return `${label}: ${value}`;
    })
    .filter((row) => row.length >= 8);
  return fromSpecifics.slice(0, 10);
}

function listingColor(listing: AmazonListingDraft): string {
  if (listing.color?.trim()) return listing.color.trim();
  const specific = listing.itemSpecifics?.find((row) =>
    /^(color|colour)$/i.test(String(row.label || row.key || "")),
  );
  return String(specific?.value || "").trim();
}

function listingDescription(listing: AmazonListingDraft): string {
  const text = stripAmazonHtml(listing.description || "");
  if (text) return text.slice(0, 2000);
  return listing.title.slice(0, 2000);
}

function httpsImages(urls: string[] | undefined): string[] {
  return [...new Set((urls || []).filter((url) => /^https:\/\//i.test(url)))];
}

function applyImages(
  attributes: Record<string, unknown>,
  urls: string[],
  marketplaceId: string,
  schema?: AmazonProductTypeSchema | null,
) {
  const allowed = schemaKeys(schema);
  if (!urls.length) return;
  if (keepKey("main_product_image_locator", allowed)) {
    attributes.main_product_image_locator = [
      { media_location: urls[0], marketplace_id: marketplaceId },
    ];
  }
  urls.slice(1, 9).forEach((url, index) => {
    const key = `other_product_image_locator_${index + 1}`;
    if (!keepKey(key, allowed)) return;
    attributes[key] = [{ media_location: url, marketplace_id: marketplaceId }];
  });
}

function valueType(prop: Record<string, unknown> | null): string {
  const items = (prop?.items || {}) as {
    properties?: { value?: { type?: string } };
  };
  return String(items.properties?.value?.type || "");
}

export function defaultAmazonAttribute(opts: {
  name: string;
  listing: AmazonListingDraft;
  marketplaceId: string;
  schema?: AmazonProductTypeSchema | null;
  catalog?: AmazonCatalogSnapshot | null;
}): unknown | null {
  const { name, listing, marketplaceId, schema, catalog } = opts;
  const prop = propertyOf(schema, name);
  if (name === "country_of_origin") {
    return [
      {
        value: countryOfOriginCode(listing.countryOfManufacture),
        marketplace_id: marketplaceId,
      },
    ];
  }
  if (name === "generic_keyword") {
    return amazonTextAttribute(
      [listing.title, listing.brand, listing.model, listing.categoryName]
        .filter(Boolean)
        .join(" ")
        .slice(0, 250),
      marketplaceId,
      prop,
    );
  }
  if (name === "product_description") {
    return amazonTextAttribute(listingDescription(listing), marketplaceId, prop);
  }
  if (name === "item_name") {
    return amazonTextAttribute(listing.title, marketplaceId, prop);
  }
  if (name === "brand" || name === "manufacturer") {
    const value =
      name === "manufacturer"
        ? amazonCatalogManufacturer(catalog) || listing.brand
        : amazonCatalogBrand(catalog) || listing.brand;
    if (!value) return null;
    return amazonTextAttribute(value, marketplaceId, prop);
  }
  if (name === "model_name" || name === "model_number" || name === "part_number") {
    const model = listingPartNumber(listing);
    if (!model) return null;
    return amazonTextAttribute(model, marketplaceId, prop);
  }
  if (name === "color") {
    const color = listingColor(listing);
    if (!color) return null;
    return amazonTextAttribute(color, marketplaceId, prop);
  }
  if (name === "material" || name === "base_material" || name === "base") {
    const scratch: Record<string, unknown> = {};
    fillMaterialAttributes(scratch, listing, marketplaceId, schema);
    return scratch[name] || null;
  }
  if (name === "required_product_compliance_certificate") {
    return [
      {
        value: pickEnum(prop, ["Not Applicable"]) || "Not Applicable",
        marketplace_id: marketplaceId,
      },
    ];
  }
  if (name === "supplier_declared_dg_hz_regulation") {
    return [
      {
        value: pickEnum(prop, ["not_applicable"]) || "not_applicable",
        marketplace_id: marketplaceId,
      },
    ];
  }
  if (name === "contains_battery_or_cell") {
    return schemaFlagAttribute(
      prop,
      amazonBatteryIntent(listing).containsCell,
      marketplaceId,
    );
  }
  if (name === "batteries_included") {
    return schemaFlagAttribute(
      prop,
      amazonBatteryIntent(listing).batteriesIncluded,
      marketplaceId,
    );
  }
  if (name === "batteries_required") {
    return schemaFlagAttribute(
      prop,
      amazonBatteryIntent(listing).batteriesRequired,
      marketplaceId,
    );
  }
  if (valueType(prop) === "boolean") {
    return [{ value: false, marketplace_id: marketplaceId }];
  }
  const enumerated = pickEnum(prop, ["Not Applicable", "not_applicable"]);
  if (enumerated) {
    return [{ value: enumerated, marketplace_id: marketplaceId }];
  }
  return null;
}

export function fillAmazonAttributesFromIssues(opts: {
  attributes: Record<string, unknown>;
  issues: Array<{ message?: string; attributeNames?: string[] }>;
  listing: AmazonListingDraft;
  marketplaceId: string;
  schema?: AmazonProductTypeSchema | null;
  catalog?: AmazonCatalogSnapshot | null;
}): { attributes: Record<string, unknown>; filled: string[] } {
  if (amazonHasBrandLockIssue(opts.issues)) {
    return {
      attributes: dropAmazonBrandAttributes(opts.attributes),
      filled: ["brand", "manufacturer"],
    };
  }
  const before = { ...opts.attributes };
  let attributes = fillAmazonRequiredAttributes({
    attributes: opts.attributes,
    listing: opts.listing,
    marketplaceId: opts.marketplaceId,
    schema: opts.schema,
    catalog: opts.catalog,
  });
  const filled: string[] = [];
  const names = new Set<string>();
  for (const issue of opts.issues || []) {
    for (const name of issueAttributeKeys(issue)) names.add(name);
  }
  for (const name of names) {
    const identity = CATALOG_IDENTITY_KEYS.has(name);
    if (!identity && !before[name] && attributes[name]) filled.push(name);
    if (!identity && attributes[name]) continue;
    const catalogValue = opts.catalog?.attributes?.[name];
    if (
      catalogValue != null &&
      amazonAttributeText(catalogValue) &&
      !(SAFETY_OBJECT_KEYS.has(name) && amazonSafetyObjectIncomplete(catalogValue))
    ) {
      attributes[name] = catalogValue;
      filled.push(name);
      continue;
    }
    if (name === "brand" && amazonCatalogBrand(opts.catalog)) {
      attributes.brand = amazonTextAttribute(
        amazonCatalogBrand(opts.catalog),
        opts.marketplaceId,
        propertyOf(opts.schema, "brand"),
      );
      filled.push(name);
      continue;
    }
    if (name === "manufacturer" && amazonCatalogManufacturer(opts.catalog)) {
      attributes.manufacturer = amazonTextAttribute(
        amazonCatalogManufacturer(opts.catalog),
        opts.marketplaceId,
        propertyOf(opts.schema, "manufacturer"),
      );
      filled.push(name);
      continue;
    }
    if (identity && attributes[name]) continue;
    const fallback = defaultAmazonAttribute({
      name,
      listing: opts.listing,
      marketplaceId: opts.marketplaceId,
      schema: opts.schema,
      catalog: opts.catalog,
    });
    if (fallback) {
      attributes[name] = fallback;
      filled.push(name);
    }
  }
  const withIdentity = applyAmazonCatalogIdentity({
    attributes,
    catalog: opts.catalog,
    marketplaceId: opts.marketplaceId,
    schema: opts.schema,
  });
  filled.push(
    ...withIdentity.filled.filter((name) => !filled.includes(name)),
  );
  const finalized = finalizeAmazonListingAttributes({
    attributes: withIdentity.attributes,
    listing: opts.listing,
    marketplaceId: opts.marketplaceId,
    schema: opts.schema,
  });
  return { attributes: finalized, filled };
}

export function fillAmazonRequiredAttributes(opts: {
  attributes: Record<string, unknown>;
  listing: AmazonListingDraft;
  marketplaceId: string;
  schema?: AmazonProductTypeSchema | null;
  catalog?: AmazonCatalogSnapshot | null;
}) {
  const { listing, marketplaceId, schema } = opts;
  const attributes = { ...opts.attributes };
  const required = schema?.required?.length
    ? schema.required
    : [
        "brand",
        "bullet_point",
        "color",
        "country_of_origin",
        "generic_keyword",
        "item_name",
        "manufacturer",
        "model_name",
        "model_number",
        "product_description",
        "required_product_compliance_certificate",
        "supplier_declared_dg_hz_regulation",
      ];

  const setText = (name: string, value: string) => {
    if (!value || attributes[name]) return;
    attributes[name] = amazonTextAttribute(
      value,
      marketplaceId,
      propertyOf(schema, name),
    );
  };

  setText("item_name", opts.catalog?.title || listing.title || "");
  setText(
    "brand",
    amazonCatalogBrand(opts.catalog) || listing.brand || "",
  );
  setText(
    "manufacturer",
    amazonCatalogManufacturer(opts.catalog) ||
      amazonCatalogBrand(opts.catalog) ||
      listing.brand ||
      "",
  );
  setText("model_name", listing.model || listing.mpn || "");
  setText("model_number", listing.model || listing.mpn || "");
  setText("part_number", listingPartNumber(listing));
  setText("product_description", listingDescription(listing));
  setText(
    "generic_keyword",
    [listing.title, listing.brand, listing.model, listing.categoryName]
      .filter(Boolean)
      .join(" ")
      .slice(0, 250),
  );
  setText("color", listingColor(listing));
  setText("material", String(listing.material || "").trim());

  if (!attributes.country_of_origin) {
    attributes.country_of_origin = [
      {
        value: countryOfOriginCode(listing.countryOfManufacture),
        marketplace_id: marketplaceId,
      },
    ];
  }

  if (!attributes.bullet_point) {
    const bullets = listingBullets(listing);
    if (bullets.length) {
      attributes.bullet_point = bullets.map((value) => ({
        language_tag: "en_US",
        marketplace_id: marketplaceId,
        value: value.slice(0, 500),
      }));
    }
  }

  if (!attributes.required_product_compliance_certificate) {
    const value = pickEnum(propertyOf(schema, "required_product_compliance_certificate"), [
      "Not Applicable",
    ]);
    if (value) {
      attributes.required_product_compliance_certificate = [
        { value, marketplace_id: marketplaceId },
      ];
    }
  }

  if (!attributes.supplier_declared_dg_hz_regulation) {
    const value = pickEnum(propertyOf(schema, "supplier_declared_dg_hz_regulation"), [
      "not_applicable",
    ]);
    if (value) {
      attributes.supplier_declared_dg_hz_regulation = [
        { value, marketplace_id: marketplaceId },
      ];
    }
  }

  if (opts.catalog?.browseNodeId && !attributes.recommended_browse_nodes) {
    attributes.recommended_browse_nodes = [
      { value: opts.catalog.browseNodeId, marketplace_id: marketplaceId },
    ];
  }

  fillSchemaDrivenDefaults(attributes, listing, marketplaceId, schema);

  for (const name of required) {
    if (attributes[name]) continue;
    const fallback = defaultAmazonAttribute({
      name,
      listing,
      marketplaceId,
      schema,
    });
    if (fallback) attributes[name] = fallback;
  }

  return finalizeAmazonListingAttributes({
    attributes,
    listing,
    marketplaceId,
    schema,
  });
}

export function amazonListingHasPrice(attributes: Record<string, unknown>): boolean {
  const offer = attributes.purchasable_offer as
    | Array<{ our_price?: Array<{ schedule?: Array<{ value_with_tax?: number }> }> }>
    | undefined;
  const price = offer?.[0]?.our_price?.[0]?.schedule?.[0]?.value_with_tax;
  if (Number(price) > 0) return true;
  const list = attributes.list_price as Array<{ value?: number }> | undefined;
  return Number(list?.[0]?.value) > 0;
}

export function buildAmazonListingAttributes(opts: {
  marketplaceId: string;
  asin?: string;
  listing: AmazonListingDraft;
  catalog?: AmazonCatalogSnapshot | null;
  schema?: AmazonProductTypeSchema | null;
}): Record<string, unknown> {
  const offer = amazonOfferAttributes({
    marketplaceId: opts.marketplaceId,
    asin: opts.asin,
    upc: opts.listing.upc,
    conditionType: amazonConditionType(
      opts.listing.condition,
      opts.listing.conditionId,
    ),
    price: opts.listing.price,
    quantity: Math.max(1, Math.floor(opts.listing.quantity || 1)),
    handlingDays: Math.max(1, Math.floor(opts.listing.handlingTime || 2)),
  });

  const attributes = {
    ...copyAmazonCatalogAttributes(opts.catalog?.attributes || {}, opts.schema),
    ...offer,
    list_price: [
      {
        value: Number(opts.listing.price.toFixed(2)),
        currency: "USD",
        marketplace_id: opts.marketplaceId,
      },
    ],
  } as Record<string, unknown>;

  const attaching = /^[A-Z0-9]{10}$/i.test(String(opts.asin || ""));
  if (!attaching && opts.listing.title?.trim()) {
    attributes.item_name = amazonTextAttribute(
      opts.listing.title.trim(),
      opts.marketplaceId,
      propertyOf(opts.schema, "item_name"),
    );
  } else if (attaching && opts.catalog?.title?.trim()) {
    if (!amazonAttributeText(attributes.item_name)) {
      attributes.item_name = amazonTextAttribute(
        opts.catalog.title.trim(),
        opts.marketplaceId,
        propertyOf(opts.schema, "item_name"),
      );
    }
  }
  const higlouDescription = stripAmazonHtml(opts.listing.description || "");
  if (higlouDescription.length >= 20) {
    attributes.product_description = amazonTextAttribute(
      higlouDescription,
      opts.marketplaceId,
      propertyOf(opts.schema, "product_description"),
    );
  }
  const featureBullets = (opts.listing.features || [])
    .map((row) => stripAmazonHtml(row))
    .filter((row) => row.length >= 8);
  if (featureBullets.length) {
    attributes.bullet_point = featureBullets.slice(0, 10).map((value) => ({
      language_tag: "en_US",
      marketplace_id: opts.marketplaceId,
      value: value.slice(0, 500),
    }));
  }

  applyImages(
    attributes,
    httpsImages([...(opts.listing.images || []), ...(opts.catalog?.images || [])]),
    opts.marketplaceId,
    opts.schema,
  );

  const filled = fillAmazonRequiredAttributes({
    attributes,
    listing: opts.listing,
    marketplaceId: opts.marketplaceId,
    schema: opts.schema,
    catalog: opts.catalog,
  });

  const withIdentity = applyAmazonCatalogIdentity({
    attributes: filled,
    catalog: opts.catalog,
    marketplaceId: opts.marketplaceId,
    schema: opts.schema,
  });

  const finalized = finalizeAmazonListingAttributes({
    attributes: withIdentity.attributes,
    listing: opts.listing,
    marketplaceId: opts.marketplaceId,
    schema: opts.schema,
  });
  if ("merchant_suggested_asin" in offer) {
    finalized.merchant_suggested_asin = offer.merchant_suggested_asin;
    delete finalized.externally_assigned_product_identifier;
  } else if ("externally_assigned_product_identifier" in offer) {
    finalized.externally_assigned_product_identifier =
      offer.externally_assigned_product_identifier;
    delete finalized.merchant_suggested_asin;
  }
  return finalized;
}
