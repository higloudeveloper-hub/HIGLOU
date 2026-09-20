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
  cost?: number | null;
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
    const selected =
      cards?.filter((card) =>
        ids.includes((card.asin || card.sourceId || "").toUpperCase()),
      ) || [];
    if (!selected.length) {
      toast.error("Pick at least one winner.");
      return false;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/winners/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, cards: selected }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        id?: string;
        href?: string;
        marketReady?: boolean;
        note?: string;
        analysis?: {
          bestRoute?: string;
          bestKeep?: number | null;
          quotes?: Array<{ platform: string; price: number | null }>;
        };
      } | null;

      if (!response.ok || !body?.ok || !body.id) {
        toast.error(body?.error || "Import failed");
        return false;
      }

      const prices = (body.analysis?.quotes || [])
        .filter((q) => q.price != null)
        .map((q) => `${q.platform} $${q.price}`)
        .join(" · ");
      toast.success(
        body.marketReady
          ? `Real opportunity imported${prices ? ` — ${prices}` : ""}`
          : body.note || "Imported with cross-platform prices",
      );
      if (body.analysis?.bestKeep != null) {
        toast.message(`Best keep ~$${body.analysis.bestKeep.toFixed(2)}`);
      }
      router.push(body.href || `/listings/${body.id}`);
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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <FindWinnersBoard busy={busy} onImport={importWinners} />
    </div>
  );
}
