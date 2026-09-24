"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Loader2, Search, Sparkles } from "lucide-react";
import type { CompareOffer, CompareResult } from "@/lib/compare/from-amazon";
import { cn } from "@/lib/utils";

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function OfferRow({ offer, amazonPrice }: { offer: CompareOffer; amazonPrice: number | null }) {
  return (
    <a
      href={offer.url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={cn(
        "group flex items-center gap-4 border-b border-[#1a1a1a]/10 py-4 transition-colors last:border-0",
        "hover:bg-[#f4c928]/12",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg text-[#191919]">
            {offer.label}
          </span>
          {offer.isCheaper ? (
            <span className="rounded-sm bg-[#1a7a4c] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Más barato
            </span>
          ) : null}
          {offer.affiliate ? (
            <span className="text-[10px] uppercase tracking-wide text-[#191919]/45">
              Afiliado
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm text-[#191919]/55">{offer.title}</p>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display text-xl tabular-nums text-[#191919]">
          {money(offer.price)}
        </div>
        {offer.saveVsAmazon != null && offer.saveVsAmazon > 0 ? (
          <div className="text-xs font-medium text-[#1a7a4c]">
            −{money(offer.saveVsAmazon)} vs Amazon
          </div>
        ) : amazonPrice != null && offer.platform === "amazon" ? (
          <div className="text-xs text-[#191919]/40">precio referencia</div>
        ) : null}
      </div>
      <ArrowRight className="size-4 shrink-0 text-[#191919]/35 transition-transform group-hover:translate-x-0.5 group-hover:text-[#191919]" />
    </a>
  );
}

export function CompareStudio() {
  const reduceMotion = useReducedMotion();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Pegá el link de Amazon del producto.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        });
        const body = (await res.json().catch(() => null)) as
          | CompareResult
          | { error?: string }
          | null;
        if (!res.ok || !body || !("ok" in body) || !body.ok) {
          setResult(null);
          setError(
            (body && "error" in body && body.error) ||
              "No pudimos comparar ese producto.",
          );
          return;
        }
        setResult(body);
      } catch {
        setResult(null);
        setError("Error de red. Intentá de nuevo.");
      }
    });
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#0f1410] text-[#f6f3ea]">
      {/* Atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,#2a3d28_0%,transparent_55%),radial-gradient(ellipse_at_90%_10%,#3d2e12_0%,transparent_40%),linear-gradient(180deg,#0f1410_0%,#121a14_40%,#0c100e_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-5 py-5 md:px-8">
        <Link
          href="/"
          className="font-display text-2xl tracking-tight text-[#f4c928] md:text-3xl"
        >
          Higlou
        </Link>
        <Link
          href="/home"
          className="text-sm text-[#f6f3ea]/55 transition-colors hover:text-[#f6f3ea]"
        >
          Entrar al studio
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-5 pb-24 pt-6 md:px-8 md:pt-12">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl"
        >
          <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f4c928]/90">
            <Sparkles className="size-3.5" />
            Compare
          </p>
          <h1 className="font-display text-[clamp(2.4rem,6vw,3.75rem)] leading-[1.05] tracking-tight text-[#f6f3ea]">
            ¿Amazon es lo más barato?
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-[#f6f3ea]/65 md:text-lg">
            Pegá el link del producto. Higlou busca la misma opción en eBay,
            Walmart y Home Depot — y te manda al mejor precio.
          </p>
        </motion.div>

        <motion.form
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-stretch"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Link de Amazon</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#0f1410]/40" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.amazon.com/dp/…"
              className="h-14 w-full rounded-none border-0 bg-[#f6f3ea] pl-11 pr-4 text-[#191919] outline-none ring-2 ring-transparent placeholder:text-[#191919]/35 focus:ring-[#f4c928]"
              autoComplete="off"
              inputMode="url"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-14 items-center justify-center gap-2 bg-[#f4c928] px-8 font-semibold text-[#191919] transition-transform enabled:hover:scale-[1.02] disabled:opacity-60"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Comparando…
              </>
            ) : (
              <>
                Comparar
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </motion.form>

        {error ? (
          <p className="mt-4 text-sm text-[#f4a090]" role="alert">
            {error}
          </p>
        ) : null}

        <AnimatePresence mode="wait">
          {result ? (
            <motion.section
              key={result.asin}
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="mt-12 grid gap-8 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-10"
            >
              <div className="space-y-4">
                <div className="aspect-square overflow-hidden bg-[#1a221c]">
                  {result.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.imageUrl}
                      alt=""
                      className="h-full w-full object-contain p-4"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[#f6f3ea]/35">
                      Sin foto
                    </div>
                  )}
                </div>
                <div>
                  {result.brand ? (
                    <p className="text-xs uppercase tracking-wider text-[#f4c928]/80">
                      {result.brand}
                    </p>
                  ) : null}
                  <h2 className="mt-1 font-display text-2xl leading-snug text-[#f6f3ea]">
                    {result.title}
                  </h2>
                  <p className="mt-2 text-sm text-[#f6f3ea]/50">
                    ASIN {result.asin} · Amazon {money(result.amazonPrice)}
                  </p>
                </div>
              </div>

              <div className="bg-[#f6f3ea] px-5 py-2 text-[#191919] md:px-7">
                <div className="border-b border-[#1a1a1a]/10 py-5">
                  <p className="font-display text-xl text-[#191919]">
                    {result.note}
                  </p>
                  {result.bestSave != null ? (
                    <p className="mt-1 text-sm text-[#1a7a4c]">
                      Hasta {money(result.bestSave)} de ahorro potencial
                    </p>
                  ) : null}
                </div>
                <div>
                  {result.offers.map((offer) => (
                    <OfferRow
                      key={`${offer.platform}-${offer.url}`}
                      offer={offer}
                      amazonPrice={result.amazonPrice}
                    />
                  ))}
                </div>
                <p className="py-4 text-[11px] leading-relaxed text-[#191919]/40">
                  Precios orientativos. Los links de Amazon pueden incluir tag
                  de afiliado Higlou — sin costo extra para vos.
                </p>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}
