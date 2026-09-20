"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FindWinnersBoard } from "@/components/winners/find-winners-board";
import type { OpportunityMode } from "@/lib/opportunity/types";

type WinnerCard = {
  asin: string;
  title: string;
  brand: string;
  imageUrl: string;
  amazonPrice: number | null;
  ebayPrice: number | null;
  sourceId?: string;
  sourceMarket?: string;
  upc?: string;
};

export function FindWinnersStudio() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const importWinners = async (
    ids: string[],
    mode: OpportunityMode,
    cards?: WinnerCard[],
  ): Promise<boolean> => {
    if (busy) return false;

    setBusy(true);
    try {
      const next = [
        ...new Set(
          ids
            .map((value) => value.trim().toUpperCase())
            .filter((value) => /^[A-Z0-9]{10}$/.test(value)),
        ),
      ].slice(0, 5);
      if (!next.length) {
        toast.error("No Amazon ASIN to import.");
        return false;
      }

      const importMode: OpportunityMode =
        mode === "amazon" || mode === "supplier" || mode === "amazon_to_ebay"
          ? mode
          : "amazon_to_ebay";

      const response = await fetch("/api/amazon/auto-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asins: next, mode: importMode, cards: cards || [] }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        id?: string;
        extras?: Array<{ id: string; asin: string; title: string }>;
        skipped?: Array<{ asin: string; reason: string }>;
        mode?: OpportunityMode;
      } | null;
      if (!response.ok || !body?.ok || !body.id) {
        const timedOut = [502, 503, 504].includes(response.status);
        toast.error(
          body?.error ||
            body?.skipped?.[0]?.reason ||
            (timedOut
              ? "Amazon took too long. Tap Import again."
              : `Could not import (${response.status}). Try again.`),
        );
        return false;
      }

      const extraCount = body.extras?.length || 0;
      const channel = body.mode || importMode;
      toast.success(
        extraCount
          ? `Imported ${1 + extraCount} winners — drafts ready for eBay.`
          : channel === "amazon"
            ? "Amazon draft saved. Publish from Export."
            : "Winner saved for eBay. Finish listing and publish.",
      );
      router.push(`/listings/${body.id}`);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import that product.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-[70dvh] flex-1 flex-col md:min-h-0">
      <FindWinnersBoard busy={busy} onImport={importWinners} />
    </div>
  );
}
