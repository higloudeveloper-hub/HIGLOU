"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StudioFrame } from "@/components/layout/studio-frame";
import { AmazonAutoImportPanel } from "@/components/listing/wizard/amazon-auto-import";
import type { OpportunityMode } from "@/lib/opportunity/types";

export function FindWinnersStudio() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const importWinners = async (
    asins: string[],
    mode: OpportunityMode,
  ): Promise<boolean> => {
    if (busy) return false;
    const next = [
      ...new Set(
        asins
          .map((value) => value.trim().toUpperCase())
          .filter((value) => /^[A-Z0-9]{10}$/.test(value)),
      ),
    ].slice(0, 5);
    if (!next.length) return false;
    setBusy(true);
    try {
      const response = await fetch("/api/amazon/auto-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asins: next, mode }),
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
        toast.error(
          body?.error ||
            body?.skipped?.[0]?.reason ||
            "Could not import that product. Try another card.",
        );
        return false;
      }

      const extraCount = body.extras?.length || 0;
      const skippedCount = body.skipped?.length || 0;
      const channel = body.mode || mode;
      toast.success(
        extraCount
          ? channel === "amazon"
            ? `Imported ${1 + extraCount} Amazon drafts. Publish from Export.`
            : channel === "supplier"
              ? `Imported ${1 + extraCount} drafts for Amazon and eBay.`
              : `Imported ${1 + extraCount} Amazon products for eBay.`
          : channel === "amazon"
            ? "Amazon draft saved. Publish to Amazon from Export."
            : channel === "supplier"
              ? "Draft saved for Amazon and eBay."
              : "Amazon product saved for eBay.",
      );
      if (skippedCount) {
        toast.message(
          `${skippedCount} Amazon product${skippedCount === 1 ? "" : "s"} could not be imported.`,
        );
      }
      router.push(`/listings/${body.id}`);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import that product. Try another card.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <StudioFrame
      kicker="Studio"
      title="Find winners"
      hint="Tap a card like a catalog. You keep is the opportunity."
    >
      <div className="mx-auto w-full max-w-[1120px] px-5 py-6">
        <AmazonAutoImportPanel busy={busy} onImport={importWinners} />
      </div>
    </StudioFrame>
  );
}
