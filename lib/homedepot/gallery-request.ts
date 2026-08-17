export const HOME_DEPOT_PRODUCT_GALLERY_QUERY = `query productClientOnlyProduct($itemId: String!) {
  product(itemId: $itemId) {
    itemId
    identifiers { brandName modelNumber productLabel upc }
    details { description highlights }
    media { images { url type subType sizes } }
  }
}`;

export const HOME_DEPOT_OFFICIAL_MAX_IMAGES = 24;

export const HOME_DEPOT_OFFICIAL_GALLERY_ENDPOINT =
  "https://apionline.homedepot.com/federation-gateway/graphql?opname=productClientOnlyProduct";

export function homeDepotOfficialGalleryPayload(itemId: string) {
  return {
    operationName: "productClientOnlyProduct",
    variables: { itemId, storeId: "121", zipCode: "30339" },
    query: HOME_DEPOT_PRODUCT_GALLERY_QUERY,
  };
}

export function homeDepotOfficialGalleryHits(body: string): number {
  return (String(body || "").match(/productImages/g) || []).length;
}
