"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AmazonAutoImportPanel } from "@/components/listing/wizard/amazon-auto-import";
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

type CatalogImportBody = {
  ok?: boolean;
  error?: string;
  title?: string;
  brand?: string;
  model?: string;
  price?: number | null;
  upc?: string;
  features?: string[];
  sku?: string;
  images?: Array<{
    id?: string;
    url: string;
    storagePath?: string;
    fileName?: string;
    sortOrder?: number;
    isPrimary?: boolean;
  }>;
};

async function importRetailToListing(
  card: WinnerCard,
  mode: OpportunityMode,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const isHd = mode.startsWith("homedepot");
  const sourceId = card.sourceId || card.asin;
  const url = isHd
    ? `https://www.homedepot.com/p/${sourceId}`
    : `https://www.walmart.com/ip/${sourceId}`;
  const endpoint = isHd ? "/api/homedepot/import" : "/api/walmart/import";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = (await response.json().catch(() => null)) as CatalogImportBody | null;
  if (!response.ok || !body?.ok || !body.images?.length) {
    return { ok: false, error: body?.error || "Retail import failed" };
  }

  const create = await fetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: body.title || card.title,
      brand: body.brand || card.brand,
      model: body.model || "",
      price: card.ebayPrice ?? body.price ?? card.amazonPrice,
      upc: body.upc || card.upc || "",
      sku: body.sku || "",
      features: body.features || [],
      images: body.images.map((img, index) => ({
        url: img.url,
        storagePath: img.storagePath || "",
        fileName: img.fileName || `${sourceId}-${index + 1}.jpg`,
        sortOrder: img.sortOrder ?? index,
        isPrimary: img.isPrimary ?? index === 0,
      })),
    }),
  });
  const created = (await create.json().catch(() => null)) as {
    product?: { id?: string };
    id?: string;
    error?: string;
  } | null;
  const id = created?.product?.id || created?.id;
  if (!create.ok || !id) {
    return { ok: false, error: created?.error || "Could not save listing" };
  }
  return { ok: true, id };
}

export function FindWinnersStudio() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const importWinners = async (
    ids: string[],
    mode: OpportunityMode,
    cards?: WinnerCard[],
  ): Promise<boolean> => {
    if (busy) return false;

    const retailEbay =
      mode === "homedepot_to_ebay" || mode === "walmart_to_ebay";

    setBusy(true);
    try {
      if (retailEbay) {
        const card = (cards || []).find((row) =>
          ids.includes(row.sourceId || row.asin),
        );
        if (!card) {
          toast.error("Pick a Home Depot or Walmart product with a source id.");
          return false;
        }
        const result = await importRetailToListing(card, mode);
        if (!result.ok || !result.id) {
          toast.error(result.error || "Import failed");
          return false;
        }
        toast.success("Product imported. Finish the listing and publish to eBay.");
        router.push(`/listings/${result.id}`);
        return true;
      }

      const next = [
        ...new Set(
          ids
            .map((value) => value.trim().toUpperCase())
            .filter((value) => /^[A-Z0-9]{10}$/.test(value)),
        ),
      ].slice(0, 5);
      if (!next.length) {
        toast.error("No Amazon ASIN to import. Exact UPC→ASIN match required.");
        return false;
      }

      const importMode: OpportunityMode =
        mode === "ebay_to_amazon" ||
        mode === "homedepot_to_amazon" ||
        mode === "walmart_to_amazon"
          ? "amazon"
          : mode === "amazon" || mode === "supplier" || mode === "amazon_to_ebay"
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

  return <AmazonAutoImportPanel busy={busy} onImport={importWinners} />;
}
