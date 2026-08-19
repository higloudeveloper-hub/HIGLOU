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

const KEY = (mode: OpportunityMode) => `higlou-opportunity-ledger-v1:${mode}`;

export function emptyLedger(mode: OpportunityMode): OpportunityLedger {
  return { mode, hits: [], learn: [], analyzed: 0, updatedAt: 0 };
}

export function loadLocalLedger(mode: OpportunityMode): OpportunityLedger {
  if (typeof window === "undefined") return emptyLedger(mode);
  try {
    const raw = window.localStorage.getItem(KEY(mode));
    if (!raw) return emptyLedger(mode);
    const parsed = JSON.parse(raw) as OpportunityLedger;
    if (!parsed || parsed.mode !== mode || !Array.isArray(parsed.hits)) {
      return emptyLedger(mode);
    }
    return {
      mode,
      hits: parsed.hits.filter((hit) => /^[A-Z0-9]{10}$/i.test(String(hit.asin || ""))),
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
    window.localStorage.setItem(
      KEY(ledger.mode),
      JSON.stringify({ ...ledger, updatedAt: Date.now() }),
    );
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
      hits: body.hits,
      learn: body.learn || [],
      analyzed: Number(body.analyzed) || 0,
      updatedAt: Number(body.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export async function pushRemoteLedger(ledger: OpportunityLedger) {
  try {
    await fetch("/api/amazon/opportunities/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ledger),
    });
  } catch {
    /* local ledger is enough until the table exists */
  }
}
