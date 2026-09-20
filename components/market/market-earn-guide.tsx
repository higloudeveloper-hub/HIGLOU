"use client";

import Link from "next/link";
import { Banknote, ExternalLink, Share2, Store } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Three clear money paths — simple clicks, no jargon wall.
 */
export function MarketEarnGuide({
  tagReady,
  className,
}: {
  tagReady: boolean;
  className?: string;
}) {
  const ways = [
    {
      icon: Share2,
      title: "1 · Comparte Amazon",
      body: tagReady
        ? "Cada winner ya trae tu link affiliate. Un click → ganas comisión."
        : "Pega tu Associate tag en Settings → Money para activar links.",
      href: tagReady ? undefined : "/settings",
      cta: tagReady ? null : "Configurar tag",
    },
    {
      icon: Store,
      title: "2 · Ponlo en tu tienda",
      body: "Importa el draft y publícalo en eBay / Amazon. Tú te quedas el keep.",
      href: undefined,
      cta: null,
    },
    {
      icon: Banknote,
      title: "3 · Compra más barato",
      body: "Busca el mismo SKU en Alibaba / marca y sube tu margen.",
      href: undefined,
      cta: null,
    },
  ] as const;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-3xl border border-[#ebe7e0] bg-white",
        className,
      )}
    >
      <div className="border-b border-[#efeae2] bg-[#faf9f6] px-4 py-3 sm:px-5">
        <p className="text-[10px] font-bold tracking-[0.16em] text-[#8a847c] uppercase">
          Gana fácil
        </p>
        <p className="mt-1 font-display text-[22px] leading-none tracking-tight">
          3 formas de hacer dinero
        </p>
        <p className="mt-1.5 text-[13px] text-[#6b6560]">
          Clicks simples. Sin inventar comisiones — solo canales reales.
        </p>
      </div>
      <div className="grid gap-px bg-[#efeae2] sm:grid-cols-3">
        {ways.map((way) => (
          <div key={way.title} className="bg-white px-4 py-4">
            <way.icon className="size-4 text-[#1f7a4d]" />
            <p className="mt-2 text-[13px] font-semibold text-[#141414]">
              {way.title}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#6b6560]">
              {way.body}
            </p>
            {way.href && way.cta ? (
              <Link
                href={way.href}
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#2162a1] hover:underline"
              >
                {way.cta}
                <ExternalLink className="size-3 opacity-70" />
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
