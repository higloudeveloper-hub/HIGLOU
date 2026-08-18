import { KEEPA_US_DOMAIN, keepaApiKey } from "@/lib/keepa/config";

type KeepaResponse = Record<string, unknown> & {
  asinList?: string[];
  products?: Array<Record<string, unknown>>;
  tokensLeft?: number;
  error?: unknown;
};

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
  if (!res.ok || json.error) {
    const message =
      typeof json.error === "string"
        ? json.error
        : `Keepa ${path} failed (${res.status})`;
    throw new Error(message);
  }
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
  if (!res.ok || json.error) {
    const message =
      typeof json.error === "string"
        ? json.error
        : `Keepa ${path} failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}
