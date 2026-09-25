"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Flame,
  Loader2,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { CompareOffer, CompareResult } from "@/lib/compare/from-amazon";
import type {
  CompareLane,
  CompareTrendItem,
} from "@/lib/compare/trending";
import { cn } from "@/lib/utils";

type LaneMeta = { id: CompareLane; label: string; blurb: string };
type CatMeta = { id: string; label: string };

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function looksLikeAmazonInput(raw: string): boolean {
  const t = raw.trim();
  if (/^[A-Z0-9]{10}$/i.test(t)) return true;
  if (/amazon\./i.test(t) || /\/dp\//i.test(t) || /amzn\.to/i.test(t)) {
    return true;
  }
  return false;
}

function laneIcon(lane: CompareLane) {
  switch (lane) {
    case "price_drop":
      return TrendingDown;
    case "rising_price":
      return TrendingUp;
    case "velocity":
      return Zap;
    default:
      return Flame;
  }
}

function OfferRow({
  offer,
  amazonPrice,
  index,
}: {
  offer: CompareOffer;
  amazonPrice: number | null;
  index: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.a
      href={offer.url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      initial={reduce ? false : { opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group flex items-center gap-4 border-b border-[#0a0b0d]/08 py-4 transition-colors last:border-0",
        "hover:bg-[#c8f542]/18",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-lg font-semibold tracking-tight text-[#0a0b0d]"
            style={{ fontFamily: "var(--compare-display)" }}
          >
            {offer.label}
          </span>
          {offer.isCheaper ? (
            <span className="bg-[#0a0b0d] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#c8f542]">
              Más barato
            </span>
          ) : null}
          {offer.affiliate ? (
            <span className="text-[10px] uppercase tracking-wide text-[#0a0b0d]/40">
              Afiliado
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm text-[#0a0b0d]/55">
          {offer.title}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div
          className="text-xl tabular-nums text-[#0a0b0d]"
          style={{ fontFamily: "var(--compare-display)" }}
        >
          {money(offer.price)}
        </div>
        {offer.saveVsAmazon != null && offer.saveVsAmazon > 0 ? (
          <div className="text-xs font-medium text-[#1a7a4c]">
            −{money(offer.saveVsAmazon)} vs Amazon
          </div>
        ) : amazonPrice != null && offer.platform === "amazon" ? (
          <div className="text-xs text-[#0a0b0d]/40">referencia</div>
        ) : null}
      </div>
      <ArrowRight className="size-4 shrink-0 text-[#0a0b0d]/30 transition-transform group-hover:translate-x-1 group-hover:text-[#0a0b0d]" />
    </motion.a>
  );
}

function ProductTile({
  item,
  index,
  onCompare,
  busy,
}: {
  item: CompareTrendItem;
  index: number;
  onCompare: (asin: string) => void;
  busy: boolean;
}) {
  const reduce = useReducedMotion();
  const Icon = laneIcon(item.lane);
  const offPct =
    item.discount90 != null && item.discount90 > 0.05
      ? Math.round(item.discount90 * 100)
      : null;

  return (
    <motion.button
      type="button"
      disabled={busy}
      onClick={() => onCompare(item.asin)}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index * 0.04, 0.35),
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={reduce ? undefined : { y: -4 }}
      className="group relative flex flex-col overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-[#c8f542]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[#14161a]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt=""
          className="h-full w-full object-contain p-5 transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0b0d]/80 via-transparent to-transparent opacity-80" />
        {offPct != null ? (
          <span className="absolute left-3 top-3 bg-[#c8f542] px-2 py-1 text-[11px] font-bold tabular-nums text-[#0a0b0d]">
            −{offPct}%
          </span>
        ) : (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 bg-[#0a0b0d]/75 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#c8f542] backdrop-blur-sm">
            <Icon className="size-3" />
            {item.lane.replace("_", " ")}
          </span>
        )}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
          <span
            className="text-xl tabular-nums text-[#f2efe6]"
            style={{ fontFamily: "var(--compare-display)" }}
          >
            {money(item.amazonPrice)}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[#c8f542] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            Comparar
            <ArrowRight className="size-3" />
          </span>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        {item.brand ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c8f542]/85">
            {item.brand}
          </p>
        ) : null}
        <p
          className="line-clamp-2 text-[15px] leading-snug text-[#f2efe6]"
          style={{ fontFamily: "var(--compare-display)" }}
        >
          {item.title}
        </p>
      </div>
    </motion.button>
  );
}

export function CompareStudio() {
  const reduce = useReducedMotion();
  const resultsRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [floorPending, setFloorPending] = useState(true);
  const [searchPending, setSearchPending] = useState(false);
  const [items, setItems] = useState<CompareTrendItem[]>([]);
  const [lanes, setLanes] = useState<LaneMeta[]>([
    { id: "hot_deals", label: "Hot deals", blurb: "Drops Keepa del momento" },
    { id: "price_drop", label: "Price drop", blurb: "Bajó fuerte en 30d" },
    { id: "velocity", label: "Velocity", blurb: "Se está vendiendo ya" },
    { id: "rising_price", label: "Rising", blurb: "Precio subiendo" },
  ]);
  const [categories, setCategories] = useState<CatMeta[]>([
    { id: "all", label: "Todo" },
  ]);
  const [lane, setLane] = useState<CompareLane>("hot_deals");
  const [categoryId, setCategoryId] = useState("all");
  const [floorNote, setFloorNote] = useState("Cargando tendencias…");
  const [mode, setMode] = useState<"trending" | "search">("trending");

  const loadTrending = useCallback(
    async (nextLane: CompareLane, nextCat: string) => {
      setFloorPending(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/compare/trending?lane=${encodeURIComponent(nextLane)}&category=${encodeURIComponent(nextCat)}&limit=12&seed=${Date.now() % 97}`,
        );
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          items?: CompareTrendItem[];
          note?: string;
          error?: string;
          lanes?: LaneMeta[];
          categories?: CatMeta[];
        } | null;
        if (body?.lanes?.length) setLanes(body.lanes);
        if (body?.categories?.length) setCategories(body.categories);
        if (!res.ok || !body?.ok) {
          setItems([]);
          setFloorNote(body?.error || "No pudimos cargar tendencias.");
          return;
        }
        setItems(body.items || []);
        setFloorNote(body.note || "");
        setMode("trending");
      } catch {
        setItems([]);
        setFloorNote("Error de red cargando tendencias.");
      } finally {
        setFloorPending(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadTrending(lane, categoryId);
  }, [lane, categoryId, loadTrending]);

  const runCompare = useCallback((input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Pegá un link de Amazon, un ASIN o buscá un producto.");
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
        window.setTimeout(() => {
          resultsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 80);
      } catch {
        setResult(null);
        setError("Error de red. Intentá de nuevo.");
      }
    });
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setError("Escribí al menos 2 caracteres para buscar.");
      return;
    }
    setSearchPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/compare/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: trimmed, limit: 16 }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        items?: CompareTrendItem[];
        note?: string;
        error?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        setItems([]);
        setFloorNote(body?.error || "Búsqueda falló.");
        return;
      }
      setItems(body.items || []);
      setFloorNote(body.note || "");
      setMode("search");
    } catch {
      setItems([]);
      setFloorNote("Error de red en la búsqueda.");
    } finally {
      setSearchPending(false);
    }
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Pegá un link de Amazon o buscá por nombre.");
      return;
    }
    if (looksLikeAmazonInput(trimmed)) {
      runCompare(trimmed);
      return;
    }
    void runSearch(trimmed);
  };

  const busy = pending || searchPending;

  return (
    <div
      className="relative min-h-dvh overflow-x-hidden bg-[#0a0b0d] text-[#f2efe6]"
      style={{ fontFamily: "var(--compare-sans)" }}
    >
      {/* Atmosphere — ink + chartreuse bloom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, #2a3318 0%, transparent 55%), radial-gradient(ellipse 40% 30% at 95% 20%, #1a2210 0%, transparent 50%), radial-gradient(ellipse 35% 40% at 5% 60%, #12180e 0%, transparent 45%), linear-gradient(180deg, #0a0b0d 0%, #0c0e10 45%, #08090b 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Soft scan line shimmer */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c8f542]/50 to-transparent"
        initial={reduce ? false : { opacity: 0.2, scaleX: 0.4 }}
        animate={
          reduce
            ? { opacity: 0.35 }
            : { opacity: [0.2, 0.7, 0.2], scaleX: [0.4, 1, 0.4] }
        }
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />

      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
        <Link
          href="/"
          className="text-[1.65rem] font-extrabold tracking-tight text-[#c8f542] md:text-3xl"
          style={{ fontFamily: "var(--compare-display)" }}
        >
          Higlou
        </Link>
        <nav className="flex items-center gap-5 text-sm text-[#f2efe6]/55">
          <a
            href="#tendencias"
            className="transition-colors hover:text-[#f2efe6]"
          >
            Tendencias
          </a>
          <Link
            href="/home"
            className="transition-colors hover:text-[#f2efe6]"
          >
            Studio
          </Link>
        </nav>
      </header>

      {/* HERO — full-bleed: brand + one line + search over market atmosphere */}
      <section className="relative z-10 flex min-h-[min(92dvh,900px)] flex-col justify-end overflow-hidden pb-16 pt-10 md:justify-center md:pb-28 md:pt-16">
        {/* Dominant visual plane — marketplace glow field */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_70%_40%,#3d4f1a_0%,transparent_60%)]" />
          <motion.div
            className="absolute -right-20 top-1/4 h-[55vh] w-[55vh] rounded-full bg-[#c8f542]/10 blur-3xl"
            animate={
              reduce
                ? undefined
                : { scale: [1, 1.08, 1], opacity: [0.35, 0.55, 0.35] }
            }
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <div
            className="absolute inset-y-0 right-0 hidden w-[48%] md:block"
            style={{
              background:
                "linear-gradient(100deg, transparent 0%, rgba(10,11,13,0.2) 30%, rgba(10,11,13,0.75) 100%), repeating-linear-gradient(-12deg, transparent, transparent 28px, rgba(200,245,66,0.04) 28px, rgba(200,245,66,0.04) 29px)",
            }}
          />
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-5 md:px-8">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1
              className="max-w-[10ch] text-[clamp(3.4rem,13vw,7.5rem)] font-extrabold leading-[0.9] tracking-[-0.045em] text-[#f2efe6]"
              style={{ fontFamily: "var(--compare-display)" }}
            >
              Higlou
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-[#f2efe6]/65 md:text-lg">
              El marketplace que compara Amazon con eBay, Walmart y Home Depot —
              y te lleva al precio ganador.
            </p>
          </motion.div>

          <motion.form
            initial={reduce ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.12,
              duration: 0.55,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="mt-10 flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-stretch"
            onSubmit={onSubmit}
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Buscar o pegar link</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#0a0b0d]/45" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar producto o pegar link de Amazon…"
                className="h-14 w-full border-0 bg-[#f2efe6] pl-11 pr-4 text-[#0a0b0d] outline-none ring-2 ring-transparent placeholder:text-[#0a0b0d]/35 focus:ring-[#c8f542]"
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-14 items-center justify-center gap-2 bg-[#c8f542] px-8 font-semibold text-[#0a0b0d] transition-transform enabled:hover:scale-[1.02] disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {pending ? "Comparando…" : "Buscando…"}
                </>
              ) : (
                <>
                  {looksLikeAmazonInput(query) ? "Comparar" : "Buscar"}
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
        </div>
      </section>

      {/* Compare result */}
      <AnimatePresence mode="wait">
        {result ? (
          <motion.section
            ref={resultsRef}
            key={result.asin}
            initial={reduce ? false : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 mx-auto max-w-6xl px-5 pb-16 md:px-8"
          >
            <div className="grid gap-8 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:gap-12">
              <div className="space-y-4">
                <div className="aspect-square overflow-hidden bg-[#14161a]">
                  {result.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.imageUrl}
                      alt=""
                      className="h-full w-full object-contain p-5"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[#f2efe6]/35">
                      Sin foto
                    </div>
                  )}
                </div>
                <div>
                  {result.brand ? (
                    <p className="text-xs uppercase tracking-[0.16em] text-[#c8f542]/85">
                      {result.brand}
                    </p>
                  ) : null}
                  <h2
                    className="mt-1 text-2xl leading-snug text-[#f2efe6] md:text-3xl"
                    style={{ fontFamily: "var(--compare-display)" }}
                  >
                    {result.title}
                  </h2>
                  <p className="mt-2 text-sm text-[#f2efe6]/45">
                    ASIN {result.asin} · Amazon {money(result.amazonPrice)}
                  </p>
                </div>
              </div>

              <div className="bg-[#f2efe6] px-5 py-2 text-[#0a0b0d] md:px-8">
                <div className="border-b border-[#0a0b0d]/10 py-6">
                  <p
                    className="text-xl text-[#0a0b0d] md:text-2xl"
                    style={{ fontFamily: "var(--compare-display)" }}
                  >
                    {result.note}
                  </p>
                  {result.bestSave != null ? (
                    <p className="mt-2 text-sm font-medium text-[#1a7a4c]">
                      Hasta {money(result.bestSave)} de ahorro potencial
                    </p>
                  ) : null}
                </div>
                <div>
                  {result.offers.map((offer, i) => (
                    <OfferRow
                      key={`${offer.platform}-${offer.url}`}
                      offer={offer}
                      amazonPrice={result.amazonPrice}
                      index={i}
                    />
                  ))}
                </div>
                <p className="py-4 text-[11px] leading-relaxed text-[#0a0b0d]/40">
                  Precios orientativos. Links de Amazon pueden incluir tag de
                  afiliado Higlou — sin costo extra para vos.
                </p>
              </div>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {/* TRENDING / SEARCH FLOOR */}
      <section
        id="tendencias"
        className="relative z-10 mx-auto max-w-6xl px-5 pb-28 pt-4 md:px-8"
      >
        <div className="mb-6">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c8f542]/90">
            <Sparkles className="size-3.5" />
            {mode === "search" ? "Resultados" : "Floor · Live Keepa"}
          </p>
          <h2
            className="mt-2 text-3xl font-bold tracking-tight text-[#f2efe6] md:text-4xl"
            style={{ fontFamily: "var(--compare-display)" }}
          >
            {mode === "search" ? "Tu búsqueda" : "En tendencia ahora"}
          </h2>
          <p className="mt-2 max-w-lg text-sm text-[#f2efe6]/50">
            {floorNote}
          </p>
        </div>

        {mode === "trending" ? (
          <div className="mb-8 flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {lanes.map((l) => {
                const Icon = laneIcon(l.id);
                const active = lane === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLane(l.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide transition-colors",
                      active
                        ? "bg-[#c8f542] text-[#0a0b0d]"
                        : "bg-[#f2efe6]/08 text-[#f2efe6]/70 hover:bg-[#f2efe6]/14 hover:text-[#f2efe6]",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {l.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const active = categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(c.id)}
                    className={cn(
                      "px-3 py-1.5 text-[12px] font-medium transition-colors",
                      active
                        ? "bg-[#f2efe6] text-[#0a0b0d]"
                        : "bg-transparent text-[#f2efe6]/55 ring-1 ring-[#f2efe6]/15 hover:text-[#f2efe6]",
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mb-8">
            <button
              type="button"
              onClick={() => {
                setMode("trending");
                setQuery("");
                void loadTrending(lane, categoryId);
              }}
              className="text-sm font-medium text-[#c8f542] hover:underline"
            >
              Volver a tendencias
            </button>
          </div>
        )}

        {floorPending ? (
          <div className="flex min-h-[240px] items-center justify-center gap-3 text-[#f2efe6]/50">
            <Loader2 className="size-5 animate-spin text-[#c8f542]" />
            Escaneando Keepa…
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center text-[#f2efe6]/45">
            <p>Nada en el floor ahora.</p>
            <p className="text-sm">Pegá un link de Amazon arriba para comparar.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
            {items.map((item, i) => (
              <ProductTile
                key={item.asin}
                item={item}
                index={i}
                busy={pending}
                onCompare={(asin) => {
                  setQuery(`https://www.amazon.com/dp/${asin}`);
                  runCompare(asin);
                }}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="relative z-10 border-t border-[#f2efe6]/08 px-5 py-8 text-center text-xs text-[#f2efe6]/35 md:px-8">
        Higlou Compare · precios en vivo vía Keepa · afiliado Amazon cuando hay
        tag
      </footer>
    </div>
  );
}
