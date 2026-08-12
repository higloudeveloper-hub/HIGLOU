"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { FolderTree, Loader2, RefreshCw, Check, Sparkles } from "lucide-react";
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
  suggestedPath2?: string | null;
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
    willCreate?: number;
    byFolder?: Record<string, number>;
  };
  suggestions?: Suggestion[];
};

export function EbayStoreOrganizeForm() {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
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
        // Pre-select everything that still needs a move (including review rows).
        next[row.offerId] = !row.unchanged;
      }
      setSelected(next);
      const topFolders = Object.entries(body.summary?.byFolder || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([path, n]) => `${path} ${n}`)
        .join(" · ");
      toast.success("Store scan complete", {
        description:
          topFolders ||
          `${body.summary?.offerCount ?? 0} offers analyzed`,
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
        suggestedPath2: s.suggestedPath2 ?? null,
        listingId: s.listingId,
        title: s.title,
        categoryId: s.categoryId,
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
        createdFolders?: string[];
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
      const created = body.createdFolders?.length || 0;
      toast.success(`Updated ${body.applied ?? 0} listings`, {
        description: [
          created ? `Created ${created} folders` : null,
          failCount ? `${failCount} failed: ${body.failed?.[0]?.error}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Store categories assigned",
      });
      await runScan();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  const organizeEverything = async () => {
    setAutoRunning(true);
    try {
      const res = await fetch("/api/ebay/store-organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto", minConfidence: 0.3 }),
      });
      const body = (await res.json()) as {
        error?: string;
        applied?: number;
        scanned?: number;
        skipped?: number;
        createdFolders?: string[];
        failed?: Array<{ offerId: string; error: string }>;
        beforeByFolder?: Record<string, number>;
        afterByFolder?: Record<string, number>;
      };
      if (!res.ok) throw new Error(body.error || "Auto organize failed");
      const failCount = body.failed?.length || 0;
      if (failCount && (body.applied ?? 0) === 0) {
        throw new Error(
          body.failed?.[0]?.error ||
            "Could not organize Store. Confirm the account has an eBay Store subscription.",
        );
      }
      const folderDelta = Object.keys({
        ...(body.beforeByFolder || {}),
        ...(body.afterByFolder || {}),
      })
        .map((path) => {
          const before = body.beforeByFolder?.[path] || 0;
          const after = body.afterByFolder?.[path] || 0;
          if (before === after) return null;
          return `${path}: ${before}→${after}`;
        })
        .filter(Boolean)
        .slice(0, 4)
        .join(" · ");
      toast.success(`Organized ${body.applied ?? 0} listings`, {
        description: [
          `Scanned ${body.scanned ?? 0}`,
          folderDelta || null,
          body.createdFolders?.length
            ? `created ${body.createdFolders.length} folders`
            : null,
          failCount ? `${failCount} failed` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      await runScan();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Auto organize failed",
      );
    } finally {
      setAutoRunning(false);
    }
  };

  const suggestions = scan?.suggestions || [];
  const busy = loading || applying || autoRunning;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-[12px] text-emerald-900">
        Featured Store folders: <strong>Tools</strong>,{" "}
        <strong>Smart Home</strong>, <strong>Outdoor Living</strong>,{" "}
        <strong>Bath and Plumbing</strong>. Each listing gets the eBay
        marketplace category plus up to two of these Store folders (example:
        outdoor LED → Outdoor Living + Smart Home).
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => void organizeEverything()}
        >
          {autoRunning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {autoRunning ? "Organizing…" : "Organize everything"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void runScan()}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {loading ? "Scanning…" : "Scan only"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !suggestions.length}
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
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3 text-[12.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <FolderTree className="size-3.5" />
              {scan.summary.offerCount} offers
            </span>
            <span>{scan.summary.ready} ready</span>
            <span>{scan.summary.needsReview} review</span>
            <span>{scan.summary.unchanged} already OK</span>
            <span>{scan.summary.willCreate ?? 0} folders to create</span>
          </div>
          {scan.summary.byFolder &&
          Object.keys(scan.summary.byFolder).length ? (
            <div className="flex flex-wrap gap-2 text-[11.5px] text-emerald-900">
              {Object.entries(scan.summary.byFolder)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([path, count]) => (
                  <span
                    key={path}
                    className="rounded-md bg-emerald-50 px-2 py-1"
                  >
                    {path} · {count}
                  </span>
                ))}
            </div>
          ) : null}
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
                      {row.suggestedPath2 ? (
                        <span className="text-muted-foreground">
                          {" "}
                          + {row.suggestedPath2}
                        </span>
                      ) : null}
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
          Connect eBay, then click Organize everything — Higlou creates missing
          folders and sorts live listings.
        </p>
      )}
    </div>
  );
}
