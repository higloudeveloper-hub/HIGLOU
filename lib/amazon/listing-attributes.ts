import {
  amazonConditionType,
  amazonOfferAttributes,
} from "@/lib/amazon/listing-offer";

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
};

const SKIP_CATALOG_KEYS = new Set([
  "skip_offer",
  "purchasable_offer",
  "fulfillment_availability",
  "condition_type",
  "merchant_suggested_asin",
  "list_price",
]);

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
    out[key] = value;
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
}): unknown | null {
  const { name, listing, marketplaceId, schema } = opts;
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
    if (!listing.brand) return null;
    return amazonTextAttribute(listing.brand, marketplaceId, prop);
  }
  if (name === "model_name" || name === "model_number") {
    const model = listing.model || listing.mpn || "";
    if (!model) return null;
    return amazonTextAttribute(model, marketplaceId, prop);
  }
  if (name === "color") {
    const color = listingColor(listing);
    if (!color) return null;
    return amazonTextAttribute(color, marketplaceId, prop);
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
  if (/batteries_(required|included)/.test(name) || valueType(prop) === "boolean") {
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
    for (const name of issue.attributeNames || []) {
      if (name) names.add(String(name));
    }
    const quoted = String(issue.message || "").match(/'([a-z][a-z0-9_]{2,})'/i);
    if (quoted?.[1]) names.add(quoted[1]);
  }
  for (const name of names) {
    if (!before[name] && attributes[name]) filled.push(name);
    if (attributes[name]) continue;
    const catalogValue = opts.catalog?.attributes?.[name];
    if (catalogValue != null) {
      attributes[name] = catalogValue;
      filled.push(name);
      continue;
    }
    const fallback = defaultAmazonAttribute({
      name,
      listing: opts.listing,
      marketplaceId: opts.marketplaceId,
      schema: opts.schema,
    });
    if (fallback) {
      attributes[name] = fallback;
      filled.push(name);
    }
  }
  const allowed = schemaKeys(opts.schema);
  if (!allowed) return { attributes, filled };
  const trimmed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (allowed.has(key)) trimmed[key] = value;
  }
  return { attributes: trimmed, filled };
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

  setText("item_name", listing.title || opts.catalog?.title || "");
  setText("brand", listing.brand || "");
  setText("manufacturer", listing.brand || "");
  setText("model_name", listing.model || listing.mpn || "");
  setText("model_number", listing.model || listing.mpn || "");
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

  return attributes;
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
  asin: string;
  listing: AmazonListingDraft;
  catalog?: AmazonCatalogSnapshot | null;
  schema?: AmazonProductTypeSchema | null;
}): Record<string, unknown> {
  const offer = amazonOfferAttributes({
    marketplaceId: opts.marketplaceId,
    asin: opts.asin,
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

  if (opts.listing.title?.trim()) {
    attributes.item_name = amazonTextAttribute(
      opts.listing.title.trim(),
      opts.marketplaceId,
      propertyOf(opts.schema, "item_name"),
    );
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

  const allowed = schemaKeys(opts.schema);
  if (!allowed) return filled;
  const trimmed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filled)) {
    if (allowed.has(key)) trimmed[key] = value;
  }
  return trimmed;
}
