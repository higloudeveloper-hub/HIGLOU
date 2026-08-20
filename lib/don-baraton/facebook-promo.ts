import { getDonBaratonConfig } from "@/lib/don-baraton/config";

export type DonBaratonPromoProduct = {
  id: string;
  slug: string;
  sku: string | null;
  name: string;
  price: number;
  categoryName: string | null;
  imageUrl: string | null;
  productUrl: string;
  pictureUrl: string;
};

export type DonBaratonPromoCatalogResult =
  | { status: "ok"; products: DonBaratonPromoProduct[] }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string; httpStatus?: number };

export type DonBaratonPromoPublishResult =
  | {
      status: "ok";
      postId?: string;
      postUrl?: string | null;
      cardCount?: number;
      visibilityNote?: string | null;
    }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string; httpStatus?: number };

async function donBaratonJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: T | null; raw: string }> {
  const config = getDonBaratonConfig();
  const endpoint = `${config.apiUrl}${path}`;
  const res = await fetch(endpoint, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.importToken}`,
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const raw = await res.text();
  let body: T | null = null;
  try {
    body = raw ? (JSON.parse(raw) as T) : null;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body, raw };
}

export async function fetchDonBaratonPromoCatalog(input?: {
  query?: string;
  skus?: string[];
}): Promise<DonBaratonPromoCatalogResult> {
  const config = getDonBaratonConfig();
  if (!config.enabled) {
    return {
      status: "skipped",
      reason: !config.apiUrl
        ? "DON_BARATON_API_URL not set"
        : !config.importToken
          ? "DON_BARATON_IMPORT_TOKEN not set"
          : "DON_BARATON_SYNC_ENABLED is off",
    };
  }

  const params = new URLSearchParams();
  if (input?.query?.trim()) params.set("q", input.query.trim());
  if (input?.skus?.length) params.set("skus", input.skus.join(","));
  const qs = params.toString();

  try {
    const result = await donBaratonJson<{
      ok?: boolean;
      error?: string;
      products?: DonBaratonPromoProduct[];
    }>(`/api/admin/facebook/promo-catalog${qs ? `?${qs}` : ""}`);

    if (!result.ok || result.body?.ok === false) {
      return {
        status: "error",
        message:
          result.body?.error ||
          (result.raw.includes("<html")
            ? `Don Baratón returned HTML ${result.status}`
            : `Don Baratón HTTP ${result.status}`),
        httpStatus: result.status,
      };
    }

    return { status: "ok", products: result.body?.products ?? [] };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Don Baratón unreachable",
    };
  }
}

export async function publishDonBaratonPromoCarousel(input: {
  productIds: string[];
  message?: string;
  format?: "carousel" | "collection";
  coverProductId?: string;
  collectionTitle?: string;
}): Promise<DonBaratonPromoPublishResult> {
  const config = getDonBaratonConfig();
  if (!config.enabled) {
    return {
      status: "skipped",
      reason: "Don Baratón sync is not configured.",
    };
  }

  try {
    const result = await donBaratonJson<{
      ok?: boolean;
      error?: string;
      postId?: string;
      postUrl?: string | null;
      cardCount?: number;
      visibilityNote?: string | null;
    }>("/api/admin/facebook/promo-carousel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productIds: input.productIds,
        message: input.message,
        format: input.format,
        coverProductId: input.coverProductId,
        collectionTitle: input.collectionTitle,
      }),
    });

    if (!result.ok || result.body?.ok === false) {
      return {
        status: "error",
        message: result.body?.error || `Don Baratón HTTP ${result.status}`,
        httpStatus: result.status,
      };
    }

    return {
      status: "ok",
      postId: result.body?.postId,
      postUrl: result.body?.postUrl,
      cardCount: result.body?.cardCount,
      visibilityNote: result.body?.visibilityNote,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Don Baratón unreachable",
    };
  }
}
