export interface CategorySpecificConfig {
  id: string;
  name: string;
  categoryIds: string[];
  fields: Array<{
    key: string;
    label: string;
    csvColumn: string;
    required?: boolean;
  }>;
}

export const CATEGORY_SPECIFICS: CategorySpecificConfig[] = [
  {
    id: "bedding",
    name: "Bedding",
    categoryIds: ["47140", "20440", "177019", "131583"],
    fields: [
      { key: "brand", label: "Brand", csvColumn: "C:Brand", required: true },
      { key: "size", label: "Size", csvColumn: "C:Size", required: true },
      { key: "type", label: "Type", csvColumn: "C:Type", required: true },
      { key: "color", label: "Color", csvColumn: "C:Color", required: true },
      { key: "department", label: "Department", csvColumn: "C:Department" },
      { key: "pattern", label: "Pattern", csvColumn: "C:Pattern" },
      { key: "style", label: "Style", csvColumn: "C:Style" },
      { key: "room", label: "Room", csvColumn: "C:Room" },
      { key: "setIncludes", label: "Set Includes", csvColumn: "C:Set Includes" },
      {
        key: "numberOfItems",
        label: "Number of Items in Set",
        csvColumn: "C:Number of Items in Set",
      },
      { key: "model", label: "Model", csvColumn: "C:Model" },
      { key: "mpn", label: "MPN", csvColumn: "C:MPN" },
      { key: "material", label: "Material", csvColumn: "C:Material" },
      { key: "features", label: "Features", csvColumn: "C:Features" },
    ],
  },
  {
    id: "apparel",
    name: "Apparel & Footwear",
    categoryIds: [
      "11483",
      "57988",
      "15709",
      "95672",
      "24087",
      "3034",
      "11554",
      "15687",
      "57990",
      "2996",
      "45258",
      "11507",
      "45238",
      "53159",
      "63862",
      "63863",
      "1059",
      "155183",
      "53557",
      "11632",
      "45220",
    ],
    fields: [
      { key: "brand", label: "Brand", csvColumn: "C:Brand", required: true },
      { key: "size", label: "Size", csvColumn: "C:Size", required: true },
      { key: "sizeType", label: "Size Type", csvColumn: "C:Size Type" },
      { key: "department", label: "Department", csvColumn: "C:Department", required: true },
      { key: "color", label: "Color", csvColumn: "C:Color", required: true },
      { key: "material", label: "Material", csvColumn: "C:Material" },
      { key: "style", label: "Style", csvColumn: "C:Style" },
      { key: "type", label: "Type", csvColumn: "C:Type" },
      { key: "pattern", label: "Pattern", csvColumn: "C:Pattern" },
      { key: "model", label: "Model", csvColumn: "C:Model" },
      { key: "mpn", label: "MPN", csvColumn: "C:MPN" },
    ],
  },
  {
    id: "electronics",
    name: "Electronics",
    categoryIds: [
      "9355",
      "112529",
      "171485",
      "175672",
      "139971",
      "178893",
      "123422",
      "14971",
      "32852",
    ],
    fields: [
      { key: "brand", label: "Brand", csvColumn: "C:Brand", required: true },
      { key: "model", label: "Model", csvColumn: "C:Model", required: true },
      { key: "mpn", label: "MPN", csvColumn: "C:MPN" },
      { key: "type", label: "Type", csvColumn: "C:Type" },
      { key: "color", label: "Color", csvColumn: "C:Color" },
      { key: "features", label: "Features", csvColumn: "C:Features" },
    ],
  },
  {
    id: "vehicles",
    name: "Powersports / Vehicles",
    categoryIds: ["43962", "6721", "10063", "66466"],
    fields: [
      { key: "brand", label: "Make", csvColumn: "C:Make", required: true },
      { key: "model", label: "Model", csvColumn: "C:Model", required: true },
      { key: "type", label: "Type", csvColumn: "C:Type", required: true },
      { key: "color", label: "Exterior Color", csvColumn: "C:Exterior Color" },
      { key: "features", label: "Features", csvColumn: "C:Features" },
    ],
  },
  {
    id: "appliances",
    name: "Home Appliances",
    categoryIds: ["20697", "20658", "71250", "32852"],
    fields: [
      { key: "brand", label: "Brand", csvColumn: "C:Brand", required: true },
      { key: "model", label: "Model", csvColumn: "C:Model" },
      { key: "type", label: "Type", csvColumn: "C:Type", required: true },
      { key: "color", label: "Color", csvColumn: "C:Color" },
      { key: "material", label: "Material", csvColumn: "C:Material" },
      { key: "features", label: "Features", csvColumn: "C:Features" },
      { key: "mpn", label: "MPN", csvColumn: "C:MPN" },
    ],
  },
  {
    id: "faucets",
    name: "Faucets & Plumbing",
    // 63897 = Faucets (US). Older kitchen/bath leaf IDs kept for legacy drafts.
    categoryIds: ["63897", "20589", "20595", "177033", "260882"],
    fields: [
      { key: "brand", label: "Brand", csvColumn: "C:Brand", required: true },
      { key: "type", label: "Type", csvColumn: "C:Type", required: true },
      { key: "material", label: "Material", csvColumn: "C:Material" },
      { key: "finish", label: "Finish", csvColumn: "C:Finish" },
      { key: "color", label: "Color", csvColumn: "C:Color" },
      { key: "model", label: "Model", csvColumn: "C:Model" },
      { key: "mpn", label: "MPN", csvColumn: "C:MPN" },
      { key: "features", label: "Features", csvColumn: "C:Features" },
    ],
  },
  {
    id: "generic",
    name: "Generic Product",
    categoryIds: [],
    fields: [
      { key: "brand", label: "Brand", csvColumn: "C:Brand", required: true },
      { key: "type", label: "Type", csvColumn: "C:Type", required: true },
      { key: "model", label: "Model", csvColumn: "C:Model" },
      { key: "mpn", label: "MPN", csvColumn: "C:MPN" },
      { key: "color", label: "Color", csvColumn: "C:Color" },
      { key: "material", label: "Material", csvColumn: "C:Material" },
      { key: "features", label: "Features", csvColumn: "C:Features" },
      { key: "finish", label: "Finish", csvColumn: "C:Finish" },
    ],
  },
];

export function resolveCategorySpecifics(
  categoryId: string,
  hints?: { categoryName?: string; productType?: string; title?: string },
) {
  const byId = CATEGORY_SPECIFICS.find((cfg) =>
    cfg.categoryIds.includes(categoryId),
  );
  if (byId) return byId;

  const hay = [hints?.categoryName, hints?.productType, hints?.title]
    .join(" ")
    .toLowerCase();
  if (/faucet|grifo|plumbing|tap\b/.test(hay)) {
    return (
      CATEGORY_SPECIFICS.find((cfg) => cfg.id === "faucets") ??
      CATEGORY_SPECIFICS.find((cfg) => cfg.id === "generic")!
    );
  }
  if (
    /\b(shirt|blouse|dress|jean|hoodie|jacket|coat|tube\s*top|bandeau|crop\s*top|tank\s*top|sneaker|shoe|boot|sandal|wallet|underwear|panty|thong|sock|sweater|fashion)\b/i.test(
      hay,
    )
  ) {
    return (
      CATEGORY_SPECIFICS.find((cfg) => cfg.id === "apparel") ??
      CATEGORY_SPECIFICS.find((cfg) => cfg.id === "generic")!
    );
  }

  return (
    CATEGORY_SPECIFICS.find((cfg) => cfg.id === "generic") ??
    CATEGORY_SPECIFICS[CATEGORY_SPECIFICS.length - 1]
  );
}
