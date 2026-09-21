"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ExternalLink, Loader2, X } from "lucide-react";
import { PlatformOpenLinks } from "@/components/opportunity/platform-open-links";
import { CheapSourcePanel } from "@/components/winners/cheap-source-panel";
import type { PlatformUrls } from "@/lib/opportunity/platform-links";
import type { OpportunityPriceBoard } from "@/lib/opportunity/price-board";
import { cn } from "@/lib/utils";

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function signed(n: number) {
  const abs = money(Math.abs(n));
  return n >= 0 ? `+${abs}` : `−${abs.replace("-", "")}`;
}

export type WinnerDetailHit = {
  id: string;
  title: string;
  brand?: string;
  imageUrl?: string | null;
  mpn?: string;
  upc?: string;
  meta?: string;
  playLabel: "Verificado" | "Tendencia" | "Hot" | "Amazon";
  buyLabel: string;
  sellLabel: string;
  keep: number | null;
  demand: number | null;
  showDemand: boolean;
  board: OpportunityPriceBoard;
  platformUrls?: PlatformUrls | null;
  cost?: number | null;
  amazonPrice?: number | null;
  buyBoxPrice?: number | null;
  ebayActiveLow?: number | null;
  ebayPrice?: number | null;
  salePrice?: number | null;
};

export function WinnerDetailPanel({
  hit,
  locked,
  importing,
  onClose,
  onImport,
  onSkip,
}: {
  hit: WinnerDetailHit | null;
  locked?: boolean;
  importing?: boolean;
  onClose: () => void;
  onImport: () => void;
  onSkip: () => void;
}) {
  const reduce = useReducedMotion();
  const open = Boolean(hit);

  return (
    <AnimatePresence>
      {open && hit ? (
        <>
          <motion.button
            type="button"
            aria-label="Cerrar"
            className="fixed inset-0 z-40 bg-[#141414]/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Detalle del winner"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-[-16px_0_48px_rgba(20,20,20,0.12)]"
            initial={reduce ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={reduce ? undefined : { x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-[#e5e5e5] px-5 py-4">
              <div className="min-w-0">
                <p
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.16em] uppercase",
                    hit.playLabel === "Hot"
                      ? "text-[#ff6b35]"
                      : hit.playLabel === "Tendencia"
                        ? "text-[#3665F3]"
                        : "text-[#1f7a4d]",
                  )}
                >
                  {hit.playLabel}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-[#191919]">
                  {hit.buyLabel}
                  <ArrowRight className="size-3.5 text-[#a8a8a8]" />
                  {hit.sellLabel}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  {hit.showDemand ? (
                    <>
                      <p className="text-[18px] font-semibold leading-none tabular-nums">
                        {Math.round(hit.demand ?? 0)}
                      </p>
                      <p className="text-[9px] font-semibold tracking-wider text-[#8a8a8a] uppercase">
                        Score
                      </p>
                    </>
                  ) : (
                    <>
                      <p
                        className={cn(
                          "text-[18px] font-semibold leading-none tabular-nums",
                          (hit.keep ?? 0) >= 12
                            ? "text-[#1f7a4d]"
                            : "text-[#b42318]",
                        )}
                      >
                        {hit.keep != null ? signed(hit.keep) : "—"}
                      </p>
                      <p className="text-[9px] font-semibold tracking-wider text-[#8a8a8a] uppercase">
                        Keep neto
                      </p>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex size-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[#707070] hover:bg-[#ebebeb] hover:text-[#191919]"
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex gap-4">
                <div className="relative size-28 shrink-0 overflow-hidden rounded-xl bg-[#f5f5f5]">
                  {hit.imageUrl ? (
                    <Image
                      src={hit.imageUrl}
                      alt=""
                      fill
                      className="object-contain p-2"
                      unoptimized
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] leading-snug font-semibold text-[#191919]">
                    {hit.title}
                  </h2>
                  <p className="mt-1 text-[12px] text-[#8a8a8a]">
                    {[hit.brand, hit.meta].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>

              <section className="overflow-hidden rounded-2xl border border-[#e5e5e5]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e5e5] bg-[#fafafa] px-3.5 py-2.5">
                  <p className="text-[11px] font-semibold tracking-[0.12em] text-[#707070] uppercase">
                    Precios verificados
                  </p>
                  <PlatformOpenLinks size="sm" urls={hit.platformUrls} />
                </div>
                <div className="grid grid-cols-2 gap-px bg-[#e5e5e5]">
                  {hit.board.platforms.map((p) => {
                    const href = p.url || null;
                    const role =
                      p.role === "buy"
                        ? "Compra"
                        : p.role === "sell"
                          ? "Venta"
                          : null;
                    const cell = (
                      <>
                        <p className="text-[10px] font-semibold tracking-wide text-[#8a8a8a] uppercase">
                          {p.label}
                          {role ? ` · ${role}` : ""}
                        </p>
                        <p className="mt-1 text-[18px] font-semibold leading-none tabular-nums">
                          {money(p.price)}
                        </p>
                        {p.note ? (
                          <p className="mt-1 text-[10px] text-[#8a8a8a]">
                            {p.note}
                          </p>
                        ) : null}
                        {href ? (
                          <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[#2162a1]">
                            Abrir
                            <ExternalLink className="size-2.5" />
                          </p>
                        ) : null}
                      </>
                    );
                    const cls = cn(
                      "bg-white p-3 transition",
                      (p.role === "buy" || p.role === "sell") && "bg-[#fffcf5]",
                      p.price == null && "opacity-50",
                    );
                    return href ? (
                      <a
                        key={p.platform}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(cls, "hover:bg-[#fafafa]")}
                      >
                        {cell}
                      </a>
                    ) : (
                      <div key={p.platform} className={cls}>
                        {cell}
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-[#e5e5e5] px-3.5 py-2.5 text-[12px] text-[#707070]">
                  Compra {money(hit.board.activeBuy)}
                  <span className="mx-1.5 text-[#c5bfb5]">→</span>
                  Venta {money(hit.board.activeSell)}
                  {hit.board.activeKeep != null
                    ? ` · net ${signed(hit.board.activeKeep)}`
                    : ""}
                </div>
              </section>

              <CheapSourcePanel
                title={hit.title}
                brand={hit.brand}
                mpn={hit.mpn}
                upc={hit.upc}
                imageUrl={hit.imageUrl || undefined}
                buyPrice={
                  hit.board.activeBuy ??
                  hit.cost ??
                  hit.amazonPrice ??
                  hit.buyBoxPrice
                }
                sellPrice={
                  hit.board.activeSell ??
                  hit.ebayActiveLow ??
                  hit.ebayPrice ??
                  hit.salePrice
                }
                className="!border-[#e5e5e5] overflow-hidden rounded-2xl"
              />
            </div>

            <footer className="flex gap-2 border-t border-[#e5e5e5] bg-[#fafafa] px-5 py-3.5">
              <button
                type="button"
                disabled={locked}
                onClick={onSkip}
                className="h-11 flex-1 rounded-xl border border-[#ddd7cd] bg-white text-[13px] font-semibold text-[#707070] hover:border-[#141414] hover:text-[#191919] disabled:opacity-40"
              >
                Descartar
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={onImport}
                className="inline-flex h-11 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-[#141414] text-[13px] font-semibold text-white hover:bg-[#2a2a2a] disabled:opacity-40"
              >
                {importing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Importando…
                  </>
                ) : (
                  "Importar listing"
                )}
              </button>
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
