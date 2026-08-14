import { getDonBaratonConfig } from "@/lib/don-baraton/config";

type DonBaratonImportResponse = {
  ok?: boolean;
  error?: string;
  batchId?: string;
  summary?: Record<string, number>;
  message?: string;
  facebookQueued?: Array<{ productId?: string; productSlug?: string }>;
};

export type DonBaratonImportResult =
  | {
      status: "ok";
      batchId?: string;
      summary?: Record<string, number>;
      message?: string;
    }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string; httpStatus?: number };

/**
 * Push the exact eBay Create Drafts CSV to Don Baratón.
 * Never throws — callers must not block eBay export on failure.
 */
export async function pushEbayCsvToDonBaraton(
  csv: string,
  fileName: string,
): Promise<DonBaratonImportResult> {
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

  const endpoint = `${config.apiUrl}/api/admin/import/ebay-csv`;
  const form = new FormData();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  form.append("file", blob, fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
  form.append("autoApply", "true");
  form.append("source", "higlou_csv");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.importToken}`,
        Accept: "application/json",
      },
      body: form,
    });

    const contentType = res.headers.get("content-type") || "";
    const rawText = await res.text();
    let body: DonBaratonImportResponse | null = null;
    if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(rawText) as DonBaratonImportResponse;
      } catch {
        body = null;
      }
    }

    if (!res.ok || body?.ok === false) {
      const message =
        body?.error ||
        body?.message ||
        (contentType.includes("text/html")
          ? `Don Baratón returned HTML ${res.status} — endpoint not deployed on that URL?`
          : `Don Baratón HTTP ${res.status}`);
      console.error("[don-baraton import]", message, body?.summary);
      return { status: "error", message, httpStatus: res.status };
    }

    const summary = body?.summary;
    const created = Number(summary?.created || 0);
    const updated = Number(summary?.updated || 0);
    const errors = Number(summary?.errors || 0);
    if (summary && created + updated === 0 && errors > 0) {
      const message =
        "Don Baratón imported 0 products (check Category ID / taxonomy seed)";
      console.error("[don-baraton import]", message, summary);
      return { status: "error", message, httpStatus: 422 };
    }

    const productId = body?.facebookQueued?.[0]?.productId?.trim();
    if (productId) {
      void fetch(`${config.apiUrl}/api/facebook/process-higlou`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.importToken}`,
          Accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ productId }),
      }).catch(() => undefined);
    }

    return {
      status: "ok",
      batchId: body?.batchId,
      summary: body?.summary,
      message: body?.message,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Don Baratón unreachable";
    console.error("[don-baraton import]", message);
    return { status: "error", message };
  }
}
