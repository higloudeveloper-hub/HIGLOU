export type ProductStatus =
  | "Uploaded"
  | "Analyzing"
  | "Needs Review"
  | "Ready"
  | "CSV Generated"
  | "Published";

export type ListingFormat = "FixedPrice" | "Auction";

export interface ProductImage {
  id: string;
  url: string;
  storagePath?: string;
  fileName: string;
  sortOrder: number;
  isPrimary: boolean;
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string;
  uploadProgress?: number;
}

export interface ItemSpecificField {
  key: string;
  label: string;
  value: string;
  required?: boolean;
  confidence?: number;
  isCustom?: boolean;
}

export interface ProductListing {
  id: string;
  status: ProductStatus;
  title: string;
  subtitle: string;
  brand: string;
  collection: string;
  model: string;
  mpn: string;
  upc: string;
  sku: string;
  amazonAsin?: string;
  productType: string;
  categoryId: string;
  categoryName: string;
  condition: string;
  conditionId: string;
  conditionDescription: string;
  price: number | null;
  quantity: number;
  listingFormat: ListingFormat;
  bestOffer: boolean;
  minimumOffer: number | null;
  autoAcceptOffer: number | null;
  size: string;
  type: string;
  colors: string[];
  materials: string[];
  pattern: string;
  style: string;
  department: string;
  room: string;
  features: string[];
  setIncludes: string[];
  missingItems: string[];
  numberOfItems: number | null;
  careInstructions: string[];
  countryOfManufacture: string;
  descriptionSummary: string;
  descriptionHtml: string;
  itemSpecifics: ItemSpecificField[];
  images: ProductImage[];
  shippingPolicyId: string;
  returnPolicyId: string;
  paymentPolicyId: string;
  handlingTime: number;
  itemLocation: string;
  postalCode: string;
  country: string;
  freeShipping: boolean;
  shippingCost: number | null;
  shippingService: string;
  /** Package ready to ship (source of truth when packageSource is manual). */
  packageWeightLbs: number | null;
  packageWeightOz: number | null;
  packageLengthIn: number | null;
  packageWidthIn: number | null;
  packageDepthIn: number | null;
  /** auto = heuristic; manual = seller measured the real box. */
  packageSource: "auto" | "manual";
  createdAt: string;
  updatedAt: string;
}
