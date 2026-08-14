/** Human store name from an eBay seller username. */
export function displayNameFromEbayUsername(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) return "";
  if (/[._\-\s]/.test(trimmed)) {
    return trimmed
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (trimmed === trimmed.toUpperCase() || trimmed === trimmed.toLowerCase()) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }
  return trimmed;
}

export function brandingFromEbayStoreName<
  T extends {
    storeName: string;
    storeNameDisplay: string;
    thankYouMessage: string;
    footerText: string;
  },
>(prev: T, storeName: string): T {
  const name = storeName.trim();
  if (!name) return prev;
  return {
    ...prev,
    storeName: name,
    storeNameDisplay: name.toUpperCase(),
    thankYouMessage: `Thank You for Shopping With ${name}`,
    footerText: `Shop with confidence at ${name}.`,
  };
}
