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
  if (v == null || !Number.isFinite(v)) return "—";
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
  const spring = useSpring(mv, { stiffness: 100, damping: 24 });
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
    return (
      <span className="text-[1.35rem] font-semibold tracking-tight text-[#9b9b9b] sm:text-[1.5rem]">
        Not Available
      </span>
    );
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
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-32px" }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      className={cn(
        "overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white",
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
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e5e5] px-5 py-3.5">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] text-[#191919]">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9b9b9b] uppercase">
            {kicker}
          </p>
          <h2 className="text-[15px] font-semibold tracking-tight text-[#191919]">
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
  delay,
  reduce,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  delay: number;
  reduce: boolean;
}) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-16px" }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4 transition hover:border-[#d0d0d0] hover:bg-white"
    >
      <p className="text-[10px] font-semibold tracking-[0.14em] text-[#9b9b9b] uppercase">
        {label}
      </p>
      <div className="mt-2 text-[1.65rem] font-semibold leading-none tracking-tight text-[#191919] sm:text-[1.85rem]">
        {value}
      </div>
      {hint ? (
        <p className="mt-2 text-[12px] leading-snug text-[#8a8a8a]">{hint}</p>
      ) : null}
    </motion.div>
  );
}

function OppCard({
  label,
  count,
  delay,
  reduce,
}: {
  label: string;
  count: number;
  delay: number;
  reduce: boolean;
}) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      className="rounded-xl border border-[#e5e5e5] bg-white p-4"
    >
      <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9b9b9b] uppercase">
        {label}
      </p>
      <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-[#191919]">
        {count}
      </p>
      <p className="mt-1.5 text-[12px] text-[#9b9b9b]">en ledger</p>
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
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, delay, ease: EASE }}
    >
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-4 transition hover:border-[#cfcfcf]"
      >
        <span className="grid size-10 place-items-center rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] text-[#191919]">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-[#191919]">
            {label}
          </span>
          <span className="block text-[12px] text-[#8a8a8a]">{sub}</span>
        </span>
        <ArrowUpRight className="size-4 text-[#bbb] transition group-hover:text-[#191919]" />
      </Link>
    </motion.div>
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
        <div className="mx-auto max-w-lg rounded-2xl border border-[#e5e5e5] bg-white p-8 text-center">
          <Sparkles className="mx-auto size-5 text-[#707070]" />
          <h2 className="mt-3 text-lg font-semibold text-[#191919]">
            Motor apagado
          </h2>
          <p className="mt-2 text-sm text-[#707070]">
            Activa Money Engine en Settings → Money o en Vercel.
          </p>
          <Link
            href="/settings#money"
            className="mt-6 inline-flex h-10 items-center rounded-full bg-[#191919] px-5 text-[13px] font-semibold text-white"
          >
            Ir a setup
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell hideHeader>
      <div className="flex min-h-0 flex-1 flex-col bg-white md:h-full">
        <header className="flex shrink-0 items-center gap-3 border-b border-[#e5e5e5] px-5 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-[#707070] uppercase">
              <LiveDot tone="muted" />
              Money
            </p>
            <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
              <h1 className="truncate text-[17px] font-semibold tracking-tight text-[#191919]">
                Money Center
              </h1>
              <p className="hidden min-w-0 truncate text-[12px] text-[#707070] sm:block">
                Revenue, profit, traffic y cola — datos reales
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              href="/settings#money"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-3.5 text-[12px] font-semibold text-[#191919]"
            >
              <Settings2 className="size-3.5" />
              Setup
            </Link>
            <Link
              href="/winners"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#191919] px-3.5 text-[12px] font-semibold text-white"
            >
              Find Winners
            </Link>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f7f7]">
          <div className="mx-auto max-w-6xl space-y-5 p-5">
            {/* Summary strip */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="grid grid-cols-3 gap-2 sm:gap-3"
            >
              {[
                { label: "Ops", value: String(oppTotal) },
                {
                  label: "Winners",
                  value: loading ? "—" : numOrNa(data?.inventory?.potentialWinners),
                },
                {
                  label: "Clicks",
                  value: loading
                    ? "—"
                    : numOrNa(data?.performance?.clicks ?? 0),
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3"
                >
                  <p className="text-[10px] font-semibold tracking-[0.14em] text-[#9b9b9b] uppercase">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-[#191919]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </motion.div>

            <AnimatePresence>
              {data?.demo ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-medium text-amber-950"
                >
                  DEMO DATA — no uses esto para decisiones reales
                </motion.div>
              ) : null}
            </AnimatePresence>
            {error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900">
                {error}
              </p>
            ) : null}

            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-[#e5e5e5] bg-white">
                <Loader2 className="size-5 animate-spin text-[#9b9b9b]" />
              </div>
            ) : (
              <>
                <AutopilotPanel />

                <div className="grid gap-3 sm:grid-cols-3">
                  <QuickLink
                    href="/winners"
                    label="Alimentar cola"
                    sub="Find Winners → Money"
                    icon={Target}
                    delay={0.04}
                    reduce={reduce}
                  />
                  <QuickLink
                    href="/settings#money"
                    label="Conectar APIs"
                    sub="Tag, flags, interruptores"
                    icon={Link2}
                    delay={0.08}
                    reduce={reduce}
                  />
                  <QuickLink
                    href="/listings/new"
                    label="Crear listing"
                    sub="Money score en review"
                    icon={Package}
                    delay={0.12}
                    reduce={reduce}
                  />
                </div>

                <PanelShell delay={0.04} reduce={reduce}>
                  <PanelHead icon={CircleDollarSign} kicker="Cash" title="Revenue" />
                  <div className="grid gap-3 p-4 sm:grid-cols-3">
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
                      delay={0.06}
                      reduce={reduce}
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
                      delay={0.1}
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
                      delay={0.14}
                      reduce={reduce}
                    />
                  </div>
                </PanelShell>

                <div className="grid gap-5 lg:grid-cols-5">
                  <PanelShell className="lg:col-span-3" delay={0.06} reduce={reduce}>
                    <PanelHead icon={Wallet} kicker="Margin" title="Profit" />
                    <div className="grid gap-3 p-4 sm:grid-cols-2">
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
                        delay={0.08}
                        reduce={reduce}
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
                        delay={0.12}
                        reduce={reduce}
                      />
                    </div>
                  </PanelShell>

                  <PanelShell className="lg:col-span-2" delay={0.1} reduce={reduce}>
                    <PanelHead icon={Boxes} kicker="Stock" title="Inventory" />
                    <div className="grid gap-3 p-4">
                      <MetricTile
                        label="Active Products"
                        value={
                          <AnimatedCount
                            value={data?.inventory?.activeProducts}
                            reduce={reduce}
                          />
                        }
                        delay={0.1}
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
                          delay={0.14}
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
                          delay={0.18}
                          reduce={reduce}
                        />
                      </div>
                    </div>
                  </PanelShell>
                </div>

                <PanelShell delay={0.08} reduce={reduce}>
                  <PanelHead
                    icon={ChartColumnIncreasing}
                    kicker="Traffic"
                    title="Performance"
                  />
                  <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
                    <MetricTile
                      label="Clicks"
                      value={
                        <AnimatedCount
                          value={data?.performance?.clicks}
                          reduce={reduce}
                        />
                      }
                      delay={0.1}
                      reduce={reduce}
                    />
                    <MetricTile
                      label="Unique Clicks"
                      value={
                        <AnimatedCount
                          value={data?.performance?.uniqueClicks}
                          reduce={reduce}
                        />
                      }
                      delay={0.12}
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
                      delay={0.14}
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
                      delay={0.16}
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
                      delay={0.18}
                      reduce={reduce}
                    />
                  </div>
                </PanelShell>

                <PanelShell delay={0.1} reduce={reduce}>
                  <PanelHead
                    icon={TrendingUp}
                    kicker="Queue"
                    title="Opportunities"
                    action={
                      <span className="rounded-full border border-[#e5e5e5] bg-[#f7f7f7] px-2.5 py-1 text-[11px] font-semibold text-[#707070]">
                        {oppTotal} total
                      </span>
                    }
                  />
                  <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <OppCard label="SELL" count={opp.SELL ?? 0} delay={0.12} reduce={reduce} />
                    <OppCard label="AFFILIATE" count={opp.AFFILIATE ?? 0} delay={0.16} reduce={reduce} />
                    <OppCard label="BOTH" count={opp.BOTH ?? 0} delay={0.2} reduce={reduce} />
                    <OppCard label="WATCH" count={opp.WATCH ?? 0} delay={0.24} reduce={reduce} />
                  </div>
                  <p className="border-t border-[#e5e5e5] px-5 py-3 text-[12.5px] text-[#8a8a8a]">
                    Conteos reales de monetization_opportunities. Vacío = aún no
                    hay decisiones — corre Find Winners o Autopilot.
                  </p>
                </PanelShell>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
