import { KEEPA_US_DOMAIN, keepaApiKey } from "@/lib/keepa/config";

type KeepaResponse = Record<string, unknown> & {
  asinList?: string[];
  products?: Array<Record<string, unknown>>;
  tokensLeft?: number;
  tokensConsumed?: number;
  refillIn?: number;
  refillRate?: number;
  totalResults?: number;
  error?: unknown;
};

function keepaErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function assertKeepaOk(path: string, res: Response, json: KeepaResponse): void {
  if (!res.ok || json.error) {
    throw new Error(
      keepaErrorMessage(json.error, `Keepa ${path} failed (${res.status})`),
    );
  }
}

export async function keepaGet(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<KeepaResponse> {
  const key = keepaApiKey();
  if (!key) throw new Error("Set KEEPA_API_KEY to search Keepa history.");
  const query = new URLSearchParams({
    key,
    domain: String(KEEPA_US_DOMAIN),
  });
  for (const [name, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    query.set(name, String(value));
  }
  const res = await fetch(`https://api.keepa.com/${path}?${query.toString()}`, {
    headers: { Accept: "application/json", "Accept-Encoding": "gzip" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as KeepaResponse;
  assertKeepaOk(path, res, json);
  return json;
}

/** Product Finder — selection goes in the POST body (Keepa queryJSON). */
export async function keepaQuery(
  selection: Record<string, unknown>,
): Promise<KeepaResponse> {
  const key = keepaApiKey();
  if (!key) throw new Error("Set KEEPA_API_KEY to search Keepa history.");
  const query = new URLSearchParams({
    key,
    domain: String(KEEPA_US_DOMAIN),
  });
  const res = await fetch(`https://api.keepa.com/query?${query.toString()}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip",
    },
    body: JSON.stringify(selection),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as KeepaResponse;
  assertKeepaOk("query", res, json);
  return json;
}

export async function keepaPost(
  path: string,
  params: Record<string, string | number | undefined>,
  body: unknown,
): Promise<KeepaResponse> {
  const key = keepaApiKey();
  if (!key) throw new Error("Set KEEPA_API_KEY to search Keepa history.");
  const query = new URLSearchParams({
    key,
    domain: String(KEEPA_US_DOMAIN),
  });
  for (const [name, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    query.set(name, String(value));
  }
  const res = await fetch(`https://api.keepa.com/${path}?${query.toString()}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as KeepaResponse;
  assertKeepaOk(path, res, json);
  return json;
}

/** Lightweight token check — 0 tokens consumed. */
export async function keepaTokenStatus(): Promise<{
  tokensLeft: number;
  refillIn: number | null;
  refillRate: number | null;
}> {
  const json = await keepaGet("token");
  return {
    tokensLeft: Number(json.tokensLeft ?? 0),
    refillIn:
      typeof json.refillIn === "number" ? json.refillIn : null,
    refillRate:
      typeof json.refillRate === "number" ? json.refillRate : null,
  };
}
