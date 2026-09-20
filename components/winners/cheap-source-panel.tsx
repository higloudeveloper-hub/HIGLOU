"use client";

import { useState } from "react";
import { ExternalLink, Factory, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CheapOffer = {
  platform: string;
  title: string;
  url: string;
  price: number | null;
  landedEstimate: number | null;
  saveVsBuy: number | null;
  matchedBy: string;
};

type CheapResult = {
  query: string;
  buyPrice: number | null;
  bestSave: number | null;
  offers: CheapOffer[];
  searchLinks: Array<{ platform: string; label: string; url: string }>;
  warnings: string[];
  identity?: {
    brandHints?: string[];
    modelHints?: string[];
    searchPhrases?: string[];
  };
};

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function platformLabel(p: string) {
  switch (p) {
    case "alibaba":
      return "Alibaba";
    case "aliexpress":
      return "AliExpress";
    case "brand":
      return "Marca / distribuidor";
    case "google_lens":
      return "Google Lens";
    case "web_match":
      return "Vision match";
    default:
      return p;
  }
}

export function CheapSourcePanel({
  title,
  brand,
  mpn,
  upc,
  imageUrl,
  buyPrice,
  sellPrice,
  className,
}: {
  title: string;
  brand?: string;
  mpn?: string;
  upc?: string;
  imageUrl?: string;
  buyPrice?: number | null;
  sellPrice?: number | null;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheapResult | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/winners/cheap-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          brand: brand || "",
          mpn: mpn || "",
          upc: upc || "",
          imageUrl: imageUrl || "",
          buyPrice: buyPrice ?? null,
          sellPrice: sellPrice ?? null,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | (CheapResult & { error?: string; ok?: boolean })
        | null;
      if (!res.ok) {
        throw new Error(body?.error || "No se pudo buscar suministro barato");
      }
      setResult(body);
      if (body?.bestSave != null && body.bestSave > 0) {
        toast.success(`Hasta ${money(body.bestSave)} más barato vs tu compra`);
      } else {
        toast.message("Links de fábrica listos — verifica precio y MOQ");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Cheap source failed",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "border border-[#e4e0d8] bg-[#fbfaf7] px-3 py-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
            Suministro barato · la verdadera máquina
          </p>
          <p className="mt-0.5 text-[12px] text-[#8a847c]">
            Alibaba · AliExpress · marca directa · Vision / Lens
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="inline-flex h-9 items-center gap-1.5 bg-[#141414] px-3 text-[12px] font-semibold text-white hover:bg-[#2a2a2a] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Factory className="size-3.5" />
          )}
          {busy ? "Buscando…" : "Localizar más barato"}
        </button>
      </div>

      {result ? (
        <div className="mt-3 space-y-3">
          <p className="text-[12px] text-[#6b6560]">
            Query: <span className="font-medium text-[#141414]">{result.query}</span>
            {result.buyPrice != null ? (
              <>
                {" "}
                · compra actual {money(result.buyPrice)}
              </>
            ) : null}
            {result.bestSave != null ? (
              <span className="ml-1 font-semibold text-[#1f7a4d]">
                · ahorro hasta {money(result.bestSave)}
              </span>
            ) : null}
          </p>

          {result.identity?.modelHints?.length ? (
            <p className="text-[11px] text-[#8a847c]">
              Vision model: {result.identity.modelHints.slice(0, 3).join(" · ")}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {result.searchLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1 border border-[#d5d9d9] bg-white px-2 text-[11px] font-semibold text-[#2162a1] hover:underline"
              >
                {link.label}
                <ExternalLink className="size-2.5 opacity-70" />
              </a>
            ))}
          </div>

          <ul className="space-y-2">
            {result.offers.slice(0, 8).map((offer) => (
              <li key={`${offer.platform}-${offer.url}`}>
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between gap-3 border border-[#e4e0d8] bg-white px-2.5 py-2 hover:border-[#141414]"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold tracking-wide text-[#8a847c] uppercase">
                      {platformLabel(offer.platform)}
                      {offer.matchedBy === "web_match" ||
                      offer.matchedBy === "vision"
                        ? " · Vision"
                        : ""}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[13px] font-medium text-[#141414]">
                      {offer.title}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-semibold tabular-nums">
                      {offer.price != null ? money(offer.price) : "Ver precio"}
                    </p>
                    {offer.landedEstimate != null ? (
                      <p className="text-[10px] text-[#8a847c]">
                        ~{money(offer.landedEstimate)} landed
                      </p>
                    ) : null}
                    {offer.saveVsBuy != null && offer.saveVsBuy > 0 ? (
                      <p className="text-[11px] font-semibold text-[#1f7a4d]">
                        −{money(offer.saveVsBuy)}
                      </p>
                    ) : null}
                  </div>
                </a>
              </li>
            ))}
          </ul>

          {result.warnings?.length ? (
            <p className="text-[11px] text-[#8a847c]">
              {result.warnings.slice(0, 2).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-[#8a847c]">
          <ScanSearch className="mt-0.5 size-3.5 shrink-0" />
          Vision lee la foto; luego busca el mismo producto en fábrica y marca
          directa para bajar el costo de compra.
        </p>
      )}
    </div>
  );
}
