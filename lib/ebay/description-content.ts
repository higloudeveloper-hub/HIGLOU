export interface DescriptionSpec {
  label: string;
  value: string;
}

export interface DescriptionContent {
  productTitle: string;
  productIntroduction: string;
  features: string[];
  itemCondition: string;
  packageContents: string[];
  shippingInformation?: string;
  /** @deprecated Returns are not shown in listing HTML by default. */
  returnAndWarrantyInformation?: string;
  specs?: DescriptionSpec[];
}
