import type { OpportunityMode, OpportunityProduct } from "@/lib/opportunity/types";

export type NicheLearnRow = {
  query: string;
  categoryId: string;
  scans: number;
  confirmed: number;
  bestKeep: number;
};

export type OpportunityLedger = {
  mode: OpportunityMode;
  hits: OpportunityProduct[];
  learn: NicheLearnRow[];
  analyzed: number;
  updatedAt: number;
};

/** Bump to drop ghost Find Winners history (no photos) from every browser. */
const LEDGER_VERSION = "v2";
const KEY = (mode: OpportunityMode) =>
  `higlou-opportunity-ledger-${LEDGER_VERSION}:${mode}`;

const LEGACY_KEYS = [
  "higlou-opportunity-ledger-v1:amazon",
  "higlou-opportunity-ledger-v1:amazon_to_ebay",
  "higlou-opportunity-ledger-v1:supplier",
];

function hasHttpsImage(hit: OpportunityProduct): boolean {
  const url = String(hit.imageUrl || "").trim();
  return (
    /^https?:\/\//i.test(url) &&
    !/placeholder|via\.placeholder|example\.com/i.test(url)
  );
}

function usableHit(hit: OpportunityProduct): boolean {
  return (
    /^[A-Z0-9]{10}$/i.test(String(hit.asin || "")) && hasHttpsImage(hit)
  );
}

/** Wipe legacy + current local Find Winners caches (ghost ASINs without photos). */
export function clearLocalOpportunityLedgers() {
  if (typeof window === "undefined") return;
  try {
    for (const key of LEGACY_KEYS) {
      window.localStorage.removeItem(key);
    }
    for (const mode of ["amazon", "amazon_to_ebay", "supplier"] as const) {
      window.localStorage.removeItem(KEY(mode));
    }
  } catch {
    /* private mode */
  }
}

export function emptyLedger(mode: OpportunityMode): OpportunityLedger {
  return { mode, hits: [], learn: [], analyzed: 0, updatedAt: 0 };
}

export function loadLocalLedger(mode: OpportunityMode): OpportunityLedger {
  if (typeof window === "undefined") return emptyLedger(mode);
  // Drop legacy ghost caches once per session
  try {
    for (const key of LEGACY_KEYS) {
      if (window.localStorage.getItem(key)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = window.localStorage.getItem(KEY(mode));
    if (!raw) return emptyLedger(mode);
    const parsed = JSON.parse(raw) as OpportunityLedger;
    if (!parsed || parsed.mode !== mode || !Array.isArray(parsed.hits)) {
      return emptyLedger(mode);
    }
    return {
      mode,
      hits: parsed.hits.filter(usableHit),
      learn: Array.isArray(parsed.learn) ? parsed.learn : [],
      analyzed: Number(parsed.analyzed) || 0,
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return emptyLedger(mode);
  }
}

export function saveLocalLedger(ledger: OpportunityLedger) {
  if (typeof window === "undefined") return;
  try {
    const clean: OpportunityLedger = {
      ...ledger,
      hits: (ledger.hits || []).filter(usableHit),
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(KEY(ledger.mode), JSON.stringify(clean));
  } catch {
    /* quota */
  }
}

export async function pullRemoteLedger(
  mode: OpportunityMode,
): Promise<OpportunityLedger | null> {
  try {
    const res = await fetch(
      `/api/amazon/opportunities/ledger?mode=${encodeURIComponent(mode)}`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as OpportunityLedger;
    if (!body || !Array.isArray(body.hits)) return null;
    return {
      mode,
      hits: (body.hits || []).filter(usableHit),
      learn: body.learn || [],
      analyzed: Number(body.analyzed) || 0,
      updatedAt: Number(body.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export async function pushRemoteLedger(ledger: OpportunityLedger) {
  // Never push an empty board — that raced hydration and could confuse clients
  if (!ledger.hits?.length) return;
  try {
    await fetch("/api/amazon/opportunities/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...ledger,
        hits: (ledger.hits || []).filter(usableHit),
      }),
    });
  } catch {
    /* local ledger is enough until the table exists */
  }
}
