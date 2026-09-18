"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import {
  ArrowUpRight,
  Boxes,
  ChartColumnIncreasing,
  CircleDollarSign,
  Link2,
  Loader2,
  Package,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AutopilotPanel } from "@/components/money/autopilot-panel";
import { LiveDot } from "@/components/ui/studio";
import { cn } from "@/lib/utils";

type DashboardPayload = {
  enabled?: boolean;
  demo?: boolean;
  revenue?: {
    amazonSales: number | null;
    ebaySales: number | null;
    affiliateRevenue: number | null;
  };
  profit?: {
    estimatedGross: number | null;
    estimatedNet: number | null;
    note?: string;
    availability?: string;
  };
  performance?: {
    clicks: number;
    uniqueClicks: number | null;
    conversions: number | null;
    conversionRate: number | null;
    revenuePerClick: number | null;
  };
  inventory?: {
    activeProducts: number | null;
    lowStock: number | null;
    potentialWinners: number | null;
  };
  opportunities?: Record<string, number>;
};

const EASE = [0.22, 1, 0.36, 1] as const;

function numOrNa(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "Not Available";
  return v.toLocaleString("en-US");
}

function AnimatedCount({
  value,
  reduce,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number | null | undefined;
  reduce: boolean;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const safe = value != null && Number.isFinite(value) ? value : null;
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 22 });
  const display = useTransform(spring, (n) => {
    if (safe == null) return "Not Available";
    return `${prefix}${n.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`;
  });

  useEffect(() => {
    if (safe == null) {
      mv.set(0);
      return;
    }
    if (reduce) {
      mv.set(safe);
      return;
    }
    mv.set(0);
    const id = requestAnimationFrame(() => mv.set(safe));
    return () => cancelAnimationFrame(id);
  }, [safe, reduce, mv]);

  if (safe == null) {
    return <span className="text-[1.55rem] sm:text-[1.85rem]">Not Available</span>;
  }

  return <motion.span className="tabular-nums">{display}</motion.span>;
}

function PanelShell({
  children,
  className,
  delay = 0,
  reduce,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  reduce: boolean;
}) {
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, delay, ease: EASE }}
      className={cn(
        "overflow-hidden rounded-[28px] border border-[#ececec] bg-white shadow-[0_1px_0_rgba(0,0,0,0.03)]",
        className,
      )}
    >
      {children}
    </motion.section>
  );
}

function PanelHead({
  icon: Icon,
  kicker,
  title,
  action,
}: {
  icon: typeof Wallet;
  kicker: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#f2f2f2] px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-2xl bg-[#111] text-[#f4c928]">
          <Icon className="size-4.5" />
        </span>
        <div>
          <p className="text-[10px] font-semibold tracking-[0.18em] text-[#9b9b9b] uppercase">
            {kicker}
          </p>
          <h2 className="font-display text-[1.65rem] leading-none tracking-tight text-[#141414]">
            {title}
          </h2>
        </div>
      </div>
      {action}
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
  accent,
  delay,
  reduce,
  wide,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
  delay: number;
  reduce: boolean;
  wide?: boolean;
}) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      whileHover={reduce ? undefined : { y: -3 }}
      className={cn(
        "group relative overflow-hidden rounded-[22px] border p-4 sm:p-5",
        accent
          ? "border-[#f4c928]/35 bg-gradient-to-br from-[#141414] to-[#1c1c1c] text-white"
          : "border-[#eee] bg-[#fafafa] hover:border-[#f4c928]/45 hover:bg-white",
        wide && "sm:col-span-2",
      )}
    >
      {!reduce ? (
        <motion.div
          className={cn(
            "pointer-events-none absolute -right-10 -top-10 size-28 rounded-full blur-2xl",
            accent ? "bg-[#f4c928]/20" : "bg-[#f4c928]/0 group-hover:bg-[#f4c928]/18",
          )}
          animate={
            accent
              ? { opacity: [0.35, 0.6, 0.35], scale: [1, 1.08, 1] }
              : undefined
          }
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
      <p
        className={cn(
          "relative text-[10px] font-semibold tracking-[0.16em] uppercase",
          accent ? "text-[#f4c928]" : "text-[#9b9b9b]",
        )}
      >
        {label}
      </p>
      <div
        className={cn(
          "relative mt-2 font-display text-[1.85rem] leading-none tracking-tight sm:text-[2.15rem]",
          accent ? "text-white" : "text-[#141414]",
        )}
      >
        {value}
      </div>
      {hint ? (
        <p
          className={cn(
            "relative mt-2.5 text-[12px] leading-snug",
            accent ? "text-white/50" : "text-[#8a8a8a]",
          )}
        >
          {hint}
        </p>
      ) : null}
    </motion.div>
  );
}

function OppCard({
  label,
  count,
  tone,
  delay,
  reduce,
}: {
  label: string;
  count: number;
  tone: "gold" | "dark" | "soft" | "line";
  delay: number;
  reduce: boolean;
}) {
  const styles = {
    gold: "bg-[#f4c928] text-[#141414]",
    dark: "bg-[#141414] text-white",
    soft: "bg-[#f6f6f6] text-[#141414] border border-[#ececec]",
    line: "bg-white text-[#141414] border border-[#e5e5e5]",
  }[tone];

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      whileHover={reduce ? undefined : { scale: 1.02 }}
      className={cn("relative overflow-hidden rounded-[24px] p-5", styles)}
    >
      <p className="text-[10px] font-semibold tracking-[0.18em] uppercase opacity-70">
        {label}
      </p>
      <p className="mt-3 font-display text-5xl tabular-nums leading-none">{count}</p>
      <p className="mt-3 text-[12px] opacity-60">en ledger</p>
      {!reduce && tone === "gold" ? (
        <motion.span
          className="pointer-events-none absolute inset-y-0 w-1/4 bg-white/30"
          animate={{ left: ["-25%", "120%"] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear", repeatDelay: 1.2 }}
        />
      ) : null}
    </motion.div>
  );
}

function QuickLink({
  href,
  label,
  sub,
  icon: Icon,
  delay,
  reduce,
}: {
  href: string;
  label: string;
  sub: string;
  icon: typeof Target;
  delay: number;
  reduce: boolean;
}) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay, ease: EASE }}
    >
      <Link
        href={href}
        className="group flex items-center gap-3.5 rounded-[22px] border border-[#ececec] bg-white p-4 transition hover:border-[#f4c928]/50 hover:shadow-[0_18px_40px_-28px_rgba(0,0,0,0.35)]"
      >
        <span className="grid size-11 place-items-center rounded-2xl bg-[#111] text-[#f4c928] transition group-hover:scale-105">
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-[#191919]">{label}</span>
          <span className="block text-[12px] text-[#8a8a8a]">{sub}</span>
        </span>
        <ArrowUpRight className="size-4 text-[#bbb] transition group-hover:text-[#141414]" />
      </Link>
    </motion.div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-spin text-[#f4c928]" />
        <p className="text-[12px] font-semibold tracking-[0.16em] text-[#9b9b9b] uppercase">
          Cargando Money Center
        </p>
      </div>
    </div>
  );
}

export function MoneyCenterStudio() {
  const reduce = useReducedMotion() ?? false;
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/money/dashboard");
        if (res.status === 404) {
          if (!cancelled) {
            setDisabled(true);
            setLoading(false);
          }
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setError("Could not load Money Center");
            setLoading(false);
          }
          return;
        }
        const body = (await res.json()) as DashboardPayload;
        if (!cancelled) {
          setData(body);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load Money Center");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const opp = data?.opportunities || {};
  const oppTotal = useMemo(
    () =>
      (opp.SELL || 0) +
      (opp.AFFILIATE || 0) +
      (opp.BOTH || 0) +
      (opp.WATCH || 0),
    [opp],
  );

  if (disabled) {
    return (
      <AppShell
        title="Money Center"
        description="Enable MONEY_ENGINE_ENABLED to activate this module."
      >
        <div className="mx-auto max-w-lg rounded-[28px] border border-[#ececec] bg-white p-8 text-center">
          <Sparkles className="mx-auto size-6 text-[#f4c928]" />
          <h2 className="mt-3 font-display text-3xl text-[#141414]">Motor apagado</h2>
          <p className="mt-2 text-sm text-[#707070]">
            Activa Money Engine en Settings → Money o en Vercel.
          </p>
          <Link
            href="/settings#money"
            className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#141414] px-5 text-[13px] font-semibold text-[#f4c928]"
          >
            Ir a setup
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell hideHeader>
      <div className="relative min-h-screen bg-[#f7f7f5]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(244,201,40,0.12),transparent_60%)]" />

        <div className="relative mx-auto max-w-6xl space-y-7 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {/* Hero */}
          <motion.header
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="relative overflow-hidden rounded-[32px] bg-[#0f0f0f] px-5 py-7 text-white sm:px-8 sm:py-9"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_10%,rgba(244,201,40,0.22),transparent_45%)]" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:32px_32px]" />
            {!reduce ? (
              <motion.div
                className="pointer-events-none absolute -left-20 bottom-0 size-64 rounded-full bg-[#f4c928]/10 blur-3xl"
                animate={{ opacity: [0.25, 0.5, 0.25], x: [0, 20, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : null}

            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.22em] text-[#f4c928] uppercase">
                  <LiveDot />
                  Higlou · Money OS
                </p>
                <h1 className="mt-3 font-display text-[3.1rem] leading-[0.92] tracking-tight sm:text-[4rem]">
                  Money
                  <span className="block italic text-[#f4c928]">Center</span>
                </h1>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/60">
                  Cash, margen, tráfico y cola de oportunidades — datos reales,
                  cards claras, piloto al mando.
                </p>
              </div>

              <div className="grid w-full max-w-md grid-cols-3 gap-2">
                {[
                  { label: "Ops", value: String(oppTotal) },
                  {
                    label: "Winners",
                    value: numOrNa(data?.inventory?.potentialWinners),
                  },
                  {
                    label: "Clicks",
                    value: numOrNa(data?.performance?.clicks ?? 0),
                  },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.06, duration: 0.4, ease: EASE }}
                    className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 backdrop-blur-sm"
                  >
                    <p className="text-[9px] font-semibold tracking-[0.16em] text-white/40 uppercase">
                      {stat.label}
                    </p>
                    <p className="mt-1 truncate font-display text-xl tabular-nums text-[#f4c928]">
                      {loading ? "—" : stat.value}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="relative mt-7 flex flex-wrap gap-2">
              <Link
                href="/settings#money"
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 text-[13px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
              >
                <Settings2 className="size-3.5" />
                APIs & setup
              </Link>
              <Link
                href="/winners"
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#f4c928] px-4 text-[13px] font-semibold text-[#141414]"
              >
                <Target className="size-3.5" />
                Find Winners
              </Link>
              <Link
                href="/listings/new"
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#f4c928]/40 px-4 text-[13px] font-semibold text-[#f4c928]"
              >
                New listing
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          </motion.header>

          <AnimatePresence>
            {data?.demo ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-2.5 text-[13px] font-semibold text-amber-950"
              >
                DEMO DATA — no uses esto para decisiones reales
              </motion.div>
            ) : null}
          </AnimatePresence>
          {error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900">
              {error}
            </p>
          ) : null}

          {loading ? <LoadingState /> : null}

          {!loading ? (
            <>
              <AutopilotPanel />

              {/* Quick actions */}
              <div className="grid gap-3 sm:grid-cols-3">
                <QuickLink
                  href="/winners"
                  label="Alimentar cola"
                  sub="Find Winners → Money"
                  icon={Target}
                  delay={0.05}
                  reduce={reduce}
                />
                <QuickLink
                  href="/settings#money"
                  label="Conectar APIs"
                  sub="Tag, flags, interruptores"
                  icon={Link2}
                  delay={0.1}
                  reduce={reduce}
                />
                <QuickLink
                  href="/listings/new"
                  label="Crear listing"
                  sub="Con Money score en review"
                  icon={Package}
                  delay={0.15}
                  reduce={reduce}
                />
              </div>

              {/* Revenue */}
              <PanelShell delay={0.05} reduce={reduce}>
                <PanelHead icon={CircleDollarSign} kicker="Cash" title="Revenue" />
                <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                  <MetricTile
                    label="Amazon Sales"
                    value={
                      <AnimatedCount
                        value={data?.revenue?.amazonSales}
                        reduce={reduce}
                        prefix="$"
                        decimals={2}
                      />
                    }
                    hint="API Required for order sync"
                    delay={0.08}
                    reduce={reduce}
                    accent
                  />
                  <MetricTile
                    label="eBay Sales"
                    value={
                      <AnimatedCount
                        value={data?.revenue?.ebaySales}
                        reduce={reduce}
                        prefix="$"
                        decimals={2}
                      />
                    }
                    hint="Desde ebay_sold_qty × price"
                    delay={0.12}
                    reduce={reduce}
                  />
                  <MetricTile
                    label="Affiliate Revenue"
                    value={
                      <AnimatedCount
                        value={data?.revenue?.affiliateRevenue}
                        reduce={reduce}
                        prefix="$"
                        decimals={2}
                      />
                    }
                    hint="Solo reportes atribuidos"
                    delay={0.16}
                    reduce={reduce}
                  />
                </div>
              </PanelShell>

              {/* Profit + Inventory bento */}
              <div className="grid gap-7 lg:grid-cols-5">
                <PanelShell className="lg:col-span-3" delay={0.08} reduce={reduce}>
                  <PanelHead icon={Wallet} kicker="Margin" title="Profit" />
                  <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                    <MetricTile
                      label="Estimated Gross"
                      value={
                        <AnimatedCount
                          value={data?.profit?.estimatedGross}
                          reduce={reduce}
                          prefix="$"
                          decimals={2}
                        />
                      }
                      hint={data?.profit?.note || "Insufficient Data"}
                      delay={0.1}
                      reduce={reduce}
                      accent
                    />
                    <MetricTile
                      label="Estimated Net"
                      value={
                        <AnimatedCount
                          value={data?.profit?.estimatedNet}
                          reduce={reduce}
                          prefix="$"
                          decimals={2}
                        />
                      }
                      hint={data?.profit?.availability || "insufficient"}
                      delay={0.14}
                      reduce={reduce}
                    />
                  </div>
                </PanelShell>

                <PanelShell className="lg:col-span-2" delay={0.12} reduce={reduce}>
                  <PanelHead icon={Boxes} kicker="Stock" title="Inventory" />
                  <div className="grid gap-3 p-4 sm:p-5">
                    <MetricTile
                      label="Active Products"
                      value={
                        <AnimatedCount
                          value={data?.inventory?.activeProducts}
                          reduce={reduce}
                        />
                      }
                      delay={0.12}
                      reduce={reduce}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <MetricTile
                        label="Low Stock"
                        value={
                          <AnimatedCount
                            value={data?.inventory?.lowStock}
                            reduce={reduce}
                          />
                        }
                        delay={0.16}
                        reduce={reduce}
                      />
                      <MetricTile
                        label="Winners"
                        value={
                          <AnimatedCount
                            value={data?.inventory?.potentialWinners}
                            reduce={reduce}
                          />
                        }
                        hint="Ledger"
                        delay={0.2}
                        reduce={reduce}
                        accent
                      />
                    </div>
                  </div>
                </PanelShell>
              </div>

              {/* Performance */}
              <PanelShell delay={0.1} reduce={reduce}>
                <PanelHead
                  icon={ChartColumnIncreasing}
                  kicker="Traffic"
                  title="Performance"
                />
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 sm:p-5">
                  <MetricTile
                    label="Clicks"
                    value={
                      <AnimatedCount
                        value={data?.performance?.clicks}
                        reduce={reduce}
                      />
                    }
                    delay={0.12}
                    reduce={reduce}
                    accent
                  />
                  <MetricTile
                    label="Unique Clicks"
                    value={
                      <AnimatedCount
                        value={data?.performance?.uniqueClicks}
                        reduce={reduce}
                      />
                    }
                    delay={0.14}
                    reduce={reduce}
                  />
                  <MetricTile
                    label="Conversions"
                    value={
                      <AnimatedCount
                        value={data?.performance?.conversions}
                        reduce={reduce}
                      />
                    }
                    delay={0.16}
                    reduce={reduce}
                  />
                  <MetricTile
                    label="Conv. Rate"
                    value={
                      data?.performance?.conversionRate == null ? (
                        "Not Available"
                      ) : (
                        <AnimatedCount
                          value={data.performance.conversionRate * 100}
                          reduce={reduce}
                          suffix="%"
                          decimals={1}
                        />
                      )
                    }
                    delay={0.18}
                    reduce={reduce}
                  />
                  <MetricTile
                    label="Rev / Click"
                    value={
                      <AnimatedCount
                        value={data?.performance?.revenuePerClick}
                        reduce={reduce}
                        prefix="$"
                        decimals={2}
                      />
                    }
                    delay={0.2}
                    reduce={reduce}
                  />
                </div>
              </PanelShell>

              {/* Opportunities */}
              <PanelShell delay={0.12} reduce={reduce}>
                <PanelHead
                  icon={TrendingUp}
                  kicker="Queue"
                  title="Opportunities"
                  action={
                    <span className="rounded-full bg-[#f4c928]/15 px-3 py-1 text-[11px] font-semibold text-[#8a6d00]">
                      {oppTotal} total
                    </span>
                  }
                />
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
                  <OppCard
                    label="SELL"
                    count={opp.SELL ?? 0}
                    tone="gold"
                    delay={0.14}
                    reduce={reduce}
                  />
                  <OppCard
                    label="AFFILIATE"
                    count={opp.AFFILIATE ?? 0}
                    tone="dark"
                    delay={0.18}
                    reduce={reduce}
                  />
                  <OppCard
                    label="BOTH"
                    count={opp.BOTH ?? 0}
                    tone="soft"
                    delay={0.22}
                    reduce={reduce}
                  />
                  <OppCard
                    label="WATCH"
                    count={opp.WATCH ?? 0}
                    tone="line"
                    delay={0.26}
                    reduce={reduce}
                  />
                </div>
                <p className="border-t border-[#f2f2f2] px-5 py-3 text-[12.5px] text-[#8a8a8a] sm:px-6">
                  Conteos reales de monetization_opportunities. Vacío = aún no hay
                  decisiones guardadas — corre Find Winners o Autopilot.
                </p>
              </PanelShell>
            </>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
