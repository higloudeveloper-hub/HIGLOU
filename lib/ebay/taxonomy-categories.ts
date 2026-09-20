import { getEbayConfig } from "@/lib/ebay/config";
import {
  isListableEbayCategoryId,
  resolveEbayCategory,
} from "@/config/ebay-categories";
import { isCategoryProductMismatch } from "@/lib/ebay/category-guard";
import { isAdultSexualWellnessText } from "@/lib/ebay/listing-helpers";

const US_CATEGORY_TREE_ID = "0";

type TaxonomySuggestion = {
  categoryId: string;
  categoryName: string;
};

async function taxonomyFetch(
  accessToken: string,
  path: string,
): Promise<unknown> {
  const cfg = getEbayConfig();
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Accept-Language": "en-US",
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = json as {
      errors?: Array<{ message?: string; longMessage?: string }>;
      message?: string;
    } | null;
    const first = err?.errors?.[0];
    throw new Error(
      first?.longMessage ||
        first?.message ||
        err?.message ||
        `Taxonomy API ${res.status}`,
    );
  }
  return json;
}

/** Ask eBay Taxonomy for leaf category suggestions from a product query. */
export async function suggestEbayLeafCategories(
  accessToken: string,
  query: string,
): Promise<TaxonomySuggestion[]> {
  const q = encodeURIComponent(query.trim().slice(0, 200));
  if (!q) return [];
  const json = (await taxonomyFetch(
    accessToken,
    `/commerce/taxonomy/v1/category_tree/${US_CATEGORY_TREE_ID}/get_category_suggestions?q=${q}`,
  )) as {
    categorySuggestions?: Array<{
      category?: { categoryId?: string; categoryName?: string };
    }>;
  };

  return (json.categorySuggestions || [])
    .map((row) => ({
      categoryId: String(row.category?.categoryId || "").trim(),
      categoryName: String(row.category?.categoryName || "").trim(),
    }))
    .filter((row) => isListableEbayCategoryId(row.categoryId));
}

export async function isEbayLeafCategory(
  accessToken: string,
  categoryId: string,
): Promise<boolean> {
  const id = encodeURIComponent(categoryId.trim());
  if (!id) return false;
  try {
    const json = (await taxonomyFetch(
      accessToken,
      `/commerce/taxonomy/v1/category_tree/${US_CATEGORY_TREE_ID}/get_category_subtree?category_id=${id}`,
    )) as {
      categorySubtreeNode?: {
        leafCategoryTreeNode?: boolean;
        category?: { categoryName?: string };
      };
    };
    return Boolean(json.categorySubtreeNode?.leafCategoryTreeNode);
  } catch {
    return false;
  }
}

/**
 * Ensure a listable US leaf category for Inventory offers (avoids eBay 25005).
 * Prefers Taxonomy suggestions when the current ID is missing/non-leaf/wrong.
 */
export async function ensureListableEbayCategory(
  accessToken: string,
  input: {
    categoryId?: string | null;
    categoryName?: string | null;
    title?: string | null;
    productType?: string | null;
    brand?: string | null;
  },
): Promise<{ categoryId: string; categoryName: string; source: string }> {
  const currentId = String(input.categoryId || "").trim();
  const query = [input.title, input.brand, input.productType, input.categoryName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const adult = isAdultSexualWellnessText(query);
  const adultLeafName = /sex dolls|masturbat|sexual wellness|adult toys/i.test(
    String(input.categoryName || ""),
  );

  if (adult && !adultLeafName) {
    try {
      const suggestions = await suggestEbayLeafCategories(
        accessToken,
        "Sex Dolls Masturbators Adult Toys Sexual Wellness",
      );
      const hit =
        suggestions.find((row) =>
          /sex doll|masturbat|adult toy|sexual wellness/i.test(row.categoryName),
        ) || suggestions[0];
      if (hit) {
        return {
          categoryId: hit.categoryId,
          categoryName: hit.categoryName,
          source: "taxonomy-adult",
        };
      }
    } catch {
      // Fall through to the current ID / catalog resolver.
    }
  }

  if (isListableEbayCategoryId(currentId) && (!adult || adultLeafName)) {
    const mismatch = isCategoryProductMismatch({
      categoryId: currentId,
      categoryName: input.categoryName,
      productType: input.productType,
      title: input.title,
      brand: input.brand,
    });
    if (!mismatch) {
      const leaf = await isEbayLeafCategory(accessToken, currentId);
      if (leaf) {
        return {
          categoryId: currentId,
          categoryName: String(input.categoryName || "").trim(),
          source: "listing",
        };
      }
    }
  }

  const resolved = resolveEbayCategory({
    categoryId: isListableEbayCategoryId(currentId) ? currentId : "",
    categoryName: input.categoryName,
    productType: input.productType,
    title: input.title,
    brand: input.brand,
  });

  // Empty category (batch Amazon import / price PATCH): use the catalog leaf
  // before Taxonomy. Taxonomy often returns nothing for long Amazon titles.
  if (
    !isListableEbayCategoryId(currentId) &&
    isListableEbayCategoryId(resolved.categoryId)
  ) {
    return {
      categoryId: resolved.categoryId,
      categoryName: resolved.categoryName,
      source: "catalog",
    };
  }

  // Catalog already resolved a pool chemical (etc.) — prefer it over Taxonomy
  // when Taxonomy tends to mis-route (e.g. "Green Aid" → ammo).
  if (
    isListableEbayCategoryId(resolved.categoryId) &&
    resolved.inferred &&
    (resolved.confidence || 0) >= 0.45
  ) {
    return {
      categoryId: resolved.categoryId,
      categoryName: resolved.categoryName,
      source: "catalog-strong",
    };
  }

  if (query) {
    try {
      const suggestions = await suggestEbayLeafCategories(accessToken, query);
      const safe = suggestions.find(
        (row) =>
          !isCategoryProductMismatch({
            categoryId: row.categoryId,
            categoryName: row.categoryName,
            productType: input.productType,
            title: input.title,
            brand: input.brand,
          }),
      );
      if (safe) {
        return {
          categoryId: safe.categoryId,
          categoryName: safe.categoryName,
          source: "taxonomy",
        };
      }
    } catch {
      // Fall through to curated resolver.
    }
  }

  if (isListableEbayCategoryId(resolved.categoryId)) {
    return {
      categoryId: resolved.categoryId,
      categoryName: resolved.categoryName,
      source: "catalog",
    };
  }

  // Last resort for lighting-ish titles — flush/ceiling fixtures leaf.
  if (/flush|ceiling|chandelier|pendant|light\s*fixture|lamp/i.test(query)) {
    return {
      categoryId: "117503",
      categoryName: "Chandeliers & Ceiling Fixtures",
      source: "fallback-lighting",
    };
  }

  // Pool chemicals fallback when Taxonomy failed / only returned ammo.
  if (
    /\b(pool\s*(chemical|shock|clarifier|algaecide|chlorine)|algaecide|green\s*aid|coral\s*seas)\b/i.test(
      query,
    )
  ) {
    return {
      categoryId: "262996",
      categoryName: "Pool Chlorine, Bromine & Algaecide",
      source: "fallback-pool-chemical",
    };
  }

  throw new Error(
    `Invalid eBay category ID "${currentId || "(empty)"}". Pick a leaf category in Review (not a parent like Lighting or Laundry).`,
  );
}
