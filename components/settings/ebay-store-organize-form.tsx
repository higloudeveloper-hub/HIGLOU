"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { FolderTree, Loader2, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type Suggestion = {
  offerId: string;
  sku: string;
  status: string;
  title: string;
  categoryId: string;
  listingId: string | null;
  currentStorePaths: string[];
  suggestedPath: string;
  confidence: number;
  reason: string;
  needsReview: boolean;
  unchanged: boolean;
};

type ScanResponse = {
  ok?: boolean;
  error?: string;
  store?: {
    source: "ebay" | "default";
    warning?: string;
    categories: Array<{ path: string; name: string }>;
  };
  summary?: {
    offerCount: number;
    needsReview: number;
    unchanged: number;
    ready: number;
  };
  suggestions?: Suggestion[];
};

export function EbayStoreOrganizeForm() {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const runScan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ebay/store-organize");
      const body = (await res.json()) as ScanResponse;
      if (!res.ok) throw new Error(body.error || "Scan failed");
      setScan(body);
      const next: Record<string, boolean> = {};
      for (const row of body.suggestions || []) {
        // Pre-select high-confidence changes only
        next[row.offerId] = !row.unchanged && !row.needsReview;
      }
      setSelected(next);
      toast.success("Store scan complete", {
        description: `${body.summary?.offerCount ?? 0} offers analyzed`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const applySelected = async () => {
    if (!scan?.suggestions?.length) return;
    const items = scan.suggestions
      .filter((s) => selected[s.offerId] && !s.unchanged)
      .map((s) => ({
        offerId: s.offerId,
        suggestedPath: s.suggestedPath,
        listingId: s.listingId,
      }));
    if (!items.length) {
      toast.error("Select at least one listing to update");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/ebay/store-organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const body = (await res.json()) as {
        error?: string;
        applied?: number;
        failed?: Array<{ offerId: string; error: string }>;
      };
      if (!res.ok) throw new Error(body.error || "Apply failed");
      const failCount = body.failed?.length || 0;
      if (failCount && (body.applied ?? 0) === 0) {
        throw new Error(
          body.failed?.[0]?.error ||
            "Could not update Store folders. Publish listings first, then Apply again.",
        );
      }
      toast.success(`Updated ${body.applied ?? 0} listings`, {
        description: failCount
          ? `${failCount} failed: ${body.failed?.[0]?.error || "see Seller Hub folders"}`
          : "Store categories assigned",
      });
      await runScan();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  const suggestions = scan?.suggestions || [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-[12px] text-emerald-900">
        Organize Store uses eBay Trading only. It assigns leaf Store folders
        (parents with subfolders are rejected by eBay), verifies each change,
        then re-scans. If a row stays selected after Apply, expand the red
        toast — the folder did not stick.
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={loading || applying}
          onClick={() => void runScan()}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {loading ? "Scanning…" : "Scan store inventory"}
        </Button>
        <Button
          type="button"
          disabled={loading || applying || !suggestions.length}
          onClick={() => void applySelected()}
        >
          {applying ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {applying ? "Applying…" : "Apply selected"}
        </Button>
      </div>

      {scan?.store?.warning ? (
        <p className="text-[12.5px] text-amber-800">{scan.store.warning}</p>
      ) : null}

      {scan?.summary ? (
        <div className="flex flex-wrap gap-3 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <FolderTree className="size-3.5" />
            {scan.summary.offerCount} offers
          </span>
          <span>{scan.summary.ready} ready</span>
          <span>{scan.summary.needsReview} review</span>
          <span>{scan.summary.unchanged} already OK</span>
          <span>
            Categories: {scan.store?.source === "ebay" ? "from eBay" : "defaults"}
          </span>
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="max-h-[420px] overflow-auto rounded-xl border border-border/60">
          <table className="w-full text-left text-[12.5px]">
            <thead className="sticky top-0 bg-muted/80 text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-2 py-2 w-8" />
                <th className="px-2 py-2">Listing</th>
                <th className="px-2 py-2">Suggested Store path</th>
                <th className="px-2 py-2">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((row) => (
                <tr
                  key={row.offerId}
                  className="border-t border-border/50 align-top"
                >
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[row.offerId])}
                      disabled={row.unchanged}
                      onChange={(e) =>
                        setSelected((prev) => ({
                          ...prev,
                          [row.offerId]: e.target.checked,
                        }))
                      }
                      aria-label={`Select ${row.sku}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <p className="font-medium text-foreground line-clamp-2">
                      {row.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {row.sku} · {row.status}
                      {row.currentStorePaths[0]
                        ? ` · now ${row.currentStorePaths[0]}`
                        : " · no store folder"}
                    </p>
                  </td>
                  <td className="px-2 py-2">
                    <p className="font-medium tabular-nums">
                      {row.suggestedPath}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {row.reason}
                      {row.needsReview ? " · needs review" : ""}
                      {row.unchanged ? " · unchanged" : ""}
                    </p>
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {Math.round(row.confidence * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect eBay, then scan to classify live offers into Store folders.
        </p>
      )}
    </div>
  );
}
