"use client";

import { useMemo, useState } from "react";
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
      return "Marca";
    case "google_lens":
      return "Lens";
    case "web_match":
      return "Vision";
    default:
      return p;
  }
}

function isSearchTool(offer: CheapOffer) {
  return (
    offer.matchedBy === "link" ||
    offer.matchedBy === "vision" ||
    /^Buscar en |Contactar |Google Lens/i.test(offer.title)
  );
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

  const { exactOffers, toolOffers } = useMemo(() => {
    const offers = result?.offers || [];
    return {
      exactOffers: offers.filter((o) => !isSearchTool(o)),
      toolOffers: offers.filter((o) => isSearchTool(o)),
    };
  }, [result]);

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
      const exact = (body?.offers || []).filter((o) => !isSearchTool(o));
      if (exact.length) {
        toast.success(
          `${exact.length} coincidencia${exact.length === 1 ? "" : "s"} del mismo SKU`,
        );
      } else {
        toast.message("Sin SKU exacto scrapeado — usa Buscar marca+modelo");
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
    <section
      className={cn(
        "border border-[#d5d0c8] bg-white",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#efeae2] bg-[#f7f4ef] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-[#6b6560] uppercase">
            B · Más barato · mismo SKU
          </p>
          <p className="mt-0.5 truncate text-[12px] text-[#8a847c]">
            Solo marca + modelo. Rechaza similares y otras marcas.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 bg-[#141414] px-3 text-[12px] font-semibold text-white hover:bg-[#2a2a2a] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Factory className="size-3.5" />
          )}
          {busy ? "Buscando…" : "Buscar suministro"}
        </button>
      </header>

      {!result ? (
        <p className="flex items-start gap-2 px-3 py-3 text-[12px] leading-relaxed text-[#8a847c]">
          <ScanSearch className="mt-0.5 size-3.5 shrink-0" />
          Busca el mismo ítem en Alibaba / AliExpress / marca. Sin match
          exacto no se muestran productos — solo links de búsqueda marca+modelo.
        </p>
      ) : (
        <div className="divide-y divide-[#efeae2]">
          <div className="grid gap-3 px-3 py-3 sm:grid-cols-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-wide text-[#8a847c] uppercase">
                Query exacta
              </p>
              <p className="mt-0.5 truncate text-[13px] font-medium text-[#141414]">
                {result.query}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-wide text-[#8a847c] uppercase">
                Compra actual
              </p>
              <p className="mt-0.5 text-[13px] font-medium tabular-nums">
                {money(result.buyPrice)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-wide text-[#8a847c] uppercase">
                Ahorro máx.
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[13px] font-semibold tabular-nums",
                  result.bestSave != null
                    ? "text-[#1f7a4d]"
                    : "text-[#8a847c]",
                )}
              >
                {result.bestSave != null ? `−${money(result.bestSave)}` : "—"}
              </p>
            </div>
          </div>

          <div className="px-3 py-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-[#6b6560] uppercase">
                Coincidencias exactas
              </p>
              <span className="text-[11px] tabular-nums text-[#8a847c]">
                {exactOffers.length}
              </span>
            </div>
            {exactOffers.length === 0 ? (
              <p className="border border-dashed border-[#e4e0d8] bg-[#fbfaf7] px-3 py-4 text-center text-[12px] text-[#8a847c]">
                Ningún scrape pasó el filtro mismo SKU. Usa los links de abajo
                con la query exacta.
              </p>
            ) : (
              <ul className="space-y-2">
                {exactOffers.map((offer) => (
                  <li key={`exact-${offer.platform}-${offer.url}`}>
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start justify-between gap-3 border border-[#e4e0d8] bg-[#fbfaf7] px-2.5 py-2.5 hover:border-[#141414]"
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold tracking-wide text-[#1f7a4d] uppercase">
                          {platformLabel(offer.platform)} · mismo SKU
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[13px] font-medium text-[#141414]">
                          {offer.title}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[13px] font-semibold tabular-nums">
                          {offer.price != null
                            ? money(offer.price)
                            : "Ver precio"}
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
            )}
          </div>

          <div className="px-3 py-3">
            <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#6b6560] uppercase">
              Buscar tú mismo
            </p>
            <p className="mb-2 text-[11px] text-[#8a847c]">
              Abre búsqueda con marca + modelo — no es un listing de producto.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(result.searchLinks.length
                ? result.searchLinks
                : toolOffers.map((o) => ({
                    platform: o.platform,
                    label: platformLabel(o.platform),
                    url: o.url,
                  }))
              ).map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1 border border-[#d5d9d9] bg-white px-2.5 text-[12px] font-semibold text-[#2162a1] hover:bg-[#f7f8f8]"
                >
                  {link.label}
                  <ExternalLink className="size-3 opacity-70" />
                </a>
              ))}
            </div>
            {result.identity?.modelHints?.length ? (
              <p className="mt-2 text-[11px] text-[#8a847c]">
                Modelo: {result.identity.modelHints.slice(0, 3).join(" · ")}
              </p>
            ) : null}
            {result.warnings?.length ? (
              <p className="mt-1.5 text-[11px] text-[#8a847c]">
                {result.warnings.slice(0, 2).join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
