"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Banknote,
  ExternalLink,
  Loader2,
  Search,
  Store,
  X,
} from "lucide-react";
import { PlatformOpenLinks } from "@/components/opportunity/platform-open-links";
import { CheapSourcePanel } from "@/components/winners/cheap-source-panel";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";
import {
  hasArbitrageKeep,
  marketPlay,
  marketTilePricing,
  marketTrend,
} from "@/lib/market/route-intent";
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

export function MarketDetailPanel({
  item,
  busy,
  affBusy,
  tagReady,
  onClose,
  onClaim,
  onEarn,
}: {
  item: MarketDropPublic | null;
  busy?: boolean;
  affBusy?: boolean;
  tagReady?: boolean;
  onClose: () => void;
  onClaim: () => void;
  onEarn: () => void;
}) {
  const reduce = useReducedMotion();
  const open = Boolean(item);
  const showKeep = item ? hasArbitrageKeep(item) : false;
  const play = item ? marketPlay(item) : null;
  const trend = item ? marketTrend(item) : null;
  const pricing = item ? marketTilePricing(item) : null;
  const amazonHref =
    item?.affiliateUrl || item?.platformUrls?.amazon || null;
  const playColor = "text-[#3665F3]";

  const comps = item
    ? [
        {
          key: "amazon",
          label: item.affiliateUrl ? "Amazon · Aff" : "Amazon",
          price: item.amazonPrice ?? (item.lane === "amazon" ? item.sell : item.buy),
          role: item.lane === "amazon" ? "Buy Box" : "Compra",
          href: amazonHref,
        },
        {
          key: "ebay",
          label: "eBay",
          price: item.ebayPrice ?? (item.lane === "amazon" ? null : item.sell),
          role: item.lane === "amazon" ? "Comp" : "Venta",
          href: item.platformUrls?.ebay,
        },
        {
          key: "walmart",
          label: "Walmart",
          price: item.walmartPrice,
          role: "Comp",
          href: item.platformUrls?.walmart,
        },
        {
          key: "homedepot",
          label: "Home Depot",
          price: item.homedepotPrice,
          role: "Comp",
          href: item.platformUrls?.homedepot,
        },
      ]
    : [];

  return (
    <AnimatePresence>
      {open && item && play && trend && pricing ? (
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
            aria-label="Detalle del deal"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-[-16px_0_48px_rgba(20,20,20,0.12)]"
            initial={reduce ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={reduce ? undefined : { x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-[#efeae2] px-5 py-4">
              <div className="min-w-0">
                <p className={cn("text-[10px] font-bold tracking-[0.16em] uppercase", playColor)}>
                  {play.badge}
                </p>
                <p className="mt-1 text-[12px] text-[#8a847c]">{play.hint}</p>
                <p className="mt-1.5 text-[11px] font-semibold text-[#5a554e]">
                  Tendencia {trend.label}
                  <span className="font-normal text-[#8a847c]"> · {trend.detail}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  {showKeep && pricing.mode === "spread" ? (
                    <>
                      <p
                        className={cn(
                          "font-display text-[28px] leading-none tabular-nums",
                          pricing.keep >= 12 ? "text-[#1f7a4d]" : "text-[#141414]",
                        )}
                      >
                        {signed(pricing.keep)}
                      </p>
                      <p className="text-[9px] font-semibold tracking-wider text-[#8a847c] uppercase">
                        Keep neto
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-display text-[28px] leading-none tabular-nums">
                        {money(pricing.mode === "single" ? pricing.price : item.sell)}
                      </p>
                      <p className="text-[9px] font-semibold tracking-wider text-[#8a847c] uppercase">
                        {pricing.mode === "single" ? pricing.label : "Precio"}
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
                <div className="relative size-28 shrink-0 overflow-hidden rounded-xl border border-[#ebebeb] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.photo}
                    alt=""
                    className="size-full object-contain p-2"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] leading-snug font-semibold text-[#191919]">
                    {item.title}
                  </h2>
                  <p className="mt-1 text-[12px] text-[#8a8a8a]">
                    {[item.name, item.asin, item.ships].filter(Boolean).join(" · ")}
                  </p>
                  {item.blurb ? (
                    <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-[#707070]">
                      {item.blurb}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Comparisons */}
              <section className="overflow-hidden rounded-xl border border-[#e8e8e8]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ebebeb] bg-[#fafafa] px-3.5 py-2.5">
                  <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8a8a8a] uppercase">
                    Comparar precios
                  </p>
                  <PlatformOpenLinks size="sm" urls={item.platformUrls} />
                </div>
                <div className="grid grid-cols-2 gap-px bg-[#ebebeb]">
                  {comps.map((c) => {
                    const cell = (
                      <>
                        <p className="text-[10px] font-semibold tracking-wide text-[#a0a0a0] uppercase">
                          {c.label}
                          {c.role ? ` · ${c.role}` : ""}
                        </p>
                        <p className="mt-1 text-[20px] leading-none font-semibold tabular-nums text-[#191919]">
                          {money(c.price)}
                        </p>
                        {c.href ? (
                          <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[#3665F3]">
                            Abrir
                            <ExternalLink className="size-2.5" />
                          </p>
                        ) : null}
                      </>
                    );
                    const cls = cn(
                      "bg-white p-3 transition",
                      c.price == null && "opacity-50",
                    );
                    return c.href ? (
                      <a
                        key={c.key}
                        href={c.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(cls, "hover:bg-[#fafafa]")}
                      >
                        {cell}
                      </a>
                    ) : (
                      <div key={c.key} className={cls}>
                        {cell}
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-[#ebebeb] px-3.5 py-2.5 text-[12px] text-[#707070]">
                  {pricing.mode === "spread" ? (
                    <>
                      Compra {money(pricing.buy)}
                      <span className="mx-1.5 text-[#d0d0d0]">→</span>
                      Venta {money(pricing.sell)}
                      {` · keep ${signed(pricing.keep)}`}
                    </>
                  ) : (
                    <>
                      {pricing.label} {money(pricing.price)}
                      <span className="mx-1.5 text-[#d0d0d0]">·</span>
                      {play.action}
                    </>
                  )}
                </div>
              </section>

              {/* Trend meter */}
              <section className="rounded-xl border border-[#e8e8e8] px-3.5 py-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8a8a8a] uppercase">
                    Tendencia verificada
                  </p>
                  <p className="text-[12px] font-semibold text-[#191919]">{trend.label}</p>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]">
                  <div
                    className="h-full rounded-full bg-[#191919]"
                    style={{ width: `${trend.progress}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-[#8a8a8a]">{trend.detail}</p>
              </section>

              {/* Money actions — 2 clear clicks */}
              <section className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onClaim}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#191919] text-[13px] font-semibold text-white hover:bg-[#2a2a2a] disabled:opacity-40"
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Store className="size-4" />
                    )}
                    {busy
                      ? "Agregando…"
                      : play.play === "sell_amazon"
                        ? "Listar en Amazon"
                        : "A mi tienda"}
                  </button>
                  <button
                    type="button"
                    disabled={affBusy || !item.asin}
                    onClick={onEarn}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#3665F3] text-[13px] font-semibold text-white hover:bg-[#2f5ae0] disabled:opacity-40"
                  >
                    {affBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Banknote className="size-4" />
                    )}
                    {item.affiliateUrl || tagReady
                      ? "1 click · Ganar"
                      : "Ganar affiliate"}
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-[#8a8a8a]">
                  {item.affiliateUrl || tagReady
                    ? "Abre Amazon con tu tag y copia el link para compartir. Comisión real vía Associates."
                    : "Configura tu Associate tag en Settings → Money para activar links en cada producto."}
                </p>
              </section>

              <CheapSourcePanel
                title={item.title}
                brand={item.name}
                upc=""
                imageUrl={item.photo || undefined}
                buyPrice={item.buy}
                sellPrice={item.sell}
                className="!border-[#e8e8e8] overflow-hidden rounded-xl"
              />

              <Link
                href="/winners"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d0d0d0] bg-[#fafafa] px-4 py-3 text-[13px] font-semibold text-[#3665F3] hover:border-[#3665F3]"
              >
                <Search className="size-4" />
                Buscar más winners como este
              </Link>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
