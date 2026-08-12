import { ACCEPTED_UPLOAD_MIME_TYPES } from "@/config/supported-image-formats";
import { HIGLOU_WAREHOUSE } from "@/config/warehouse";

export const DEFAULT_VALUES = {
  quantity: 1,
  listingFormat: "FixedPrice" as const,
  currency: "USD",
  condition: "New",
  conditionId: "NEW",
  /** Higlou warehouse — 2525 Market St, Logansport, IN */
  itemLocation: HIGLOU_WAREHOUSE.itemLocation,
  postalCode: HIGLOU_WAREHOUSE.postalCode,
  country: HIGLOU_WAREHOUSE.country,
  handlingTime: 1,
  returnPolicyId: "",
  shippingPolicyId: "",
  paymentPolicyId: "",
  maxImages: 12,
  /** Keep room for listing-quality originals (no client downscale). */
  maxImageSizeMb: 20,
  /** Single source of truth: config/supported-image-formats.ts */
  acceptedImageTypes: ACCEPTED_UPLOAD_MIME_TYPES,
  titleMaxLength: 80,
} as const;
