"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  Share2,
  Store,
  Zap,
} from "lucide-react";
import { AmazonMark, EbayMark, FacebookFMark } from "@/components/brand/store-marks";
import { StudioFrame } from "@/components/layout/studio-frame";
import { cn } from "@/lib/utils";

type Channel = {
  id: string;
  title: string;
  blurb: string;
  href: string;
  cta: string;
  ready: boolean;
  detail: string;
  mark: "ebay" | "amazon" | "facebook" | "associates" | "smart";
};

type Snapshot = {
  ebay: boolean;
  amazon: boolean;
  facebook: boolean;
  associates: boolean;
  smartLinks: boolean;
  affiliateLinks: number;
  loading: boolean;
};

const EASE = [0.22, 1, 0.36, 1] as const;

function Mark({ kind }: { kind: Channel["mark"] }) {
  if (kind === "ebay") return <EbayMark className="h-5" />;
  if (kind === "amazon") return <AmazonMark className="h-5" />;
  if (kind === "facebook")
    return (
      <span className="grid size-8 place-items-center rounded-xl bg-[#1877F2] text-white">
        <FacebookFMark className="size-3.5" />
      </span>
    );
  if (kind === "associates")
    return (
      <span className="grid size-8 place-items-center rounded-xl bg-[#232F3E] text-[#ff9900]">
        <KeyRound className="size-3.5" />
      </span>
    );
  return (
    <span className="grid size-8 place-items-center rounded-xl bg-[#141414] text-white">
      <Link2 className="size-3.5" />
    </span>
  );
}

export function ConnectStudio() {
  const reduce = useReducedMotion();
  const [snap, setSnap] = useState<Snapshot>({
    ebay: false,
    amazon: false,
    facebook: false,
    associates: false,
    smartLinks: false,
    affiliateLinks: 0,
    loading: true,
  });

  const load = useCallback(async () => {
    try {
      const [ebayRes, amazonRes, fbRes, moneyRes, affRes] = await Promise.all([
        fetch("/api/ebay/connection", { cache: "no-store" }),
        fetch("/api/amazon/connection", { cache: "no-store" }),
        fetch("/api/facebook/connection", { cache: "no-store" }),
        fetch("/api/settings/money-machine", { cache: "no-store" }),
        fetch("/api/money/affiliate/links", { cache: "no-store" }),
      ]);

      const ebay = ebayRes.ok
        ? Boolean(((await ebayRes.json()) as { connection?: { connected?: boolean } })
            .connection?.connected)
        : false;
      const amazon = amazonRes.ok
        ? Boolean(
            ((await amazonRes.json()) as { connection?: { connected?: boolean } })
              .connection?.connected,
          )
        : false;
      const facebook = fbRes.ok
        ? Boolean(
            ((await fbRes.json()) as { connection?: { connected?: boolean } })
              .connection?.connected,
          )
        : false;

      let associates = false;
      let smartLinks = false;
      if (moneyRes.ok) {
        const body = (await moneyRes.json()) as {
          prefs?: { associateTag?: string; smartLinks?: boolean; affiliateEngine?: boolean };
          services?: Array<{ id: string; status: string }>;
        };
        associates = Boolean(body.prefs?.associateTag?.trim()) ||
          body.services?.some(
            (s) =>
              s.id === "amazon_associates" &&
              (s.status === "ready" || s.status === "connected"),
          ) === true;
        smartLinks = Boolean(body.prefs?.smartLinks);
      }

      let affiliateLinks = 0;
      if (affRes.ok) {
        const body = (await affRes.json()) as { links?: unknown[] };
        affiliateLinks = body.links?.length || 0;
      }

      setSnap({
        ebay,
        amazon,
        facebook,
        associates,
        smartLinks,
        affiliateLinks,
        loading: false,
      });
    } catch {
      setSnap((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const channels: Channel[] = [
    {
      id: "ebay",
      title: "eBay",
      blurb: "Publicá listings y cobrá ventas.",
      href: "/settings#ebay-store",
      cta: snap.ebay ? "Ver tienda" : "Conectar eBay",
      ready: snap.ebay,
      detail: snap.ebay ? "Tienda lista" : "1 clic en Settings",
      mark: "ebay",
    },
    {
      id: "amazon",
      title: "Amazon Seller",
      blurb: "Publicá ofertas en Seller Central.",
      href: "/settings#amazon-store",
      cta: snap.amazon ? "Ver conexión" : "Pegar token Atzr|",
      ready: snap.amazon,
      detail: snap.amazon ? "Seller conectado" : "Refresh token SP-API",
      mark: "amazon",
    },
    {
      id: "associates",
      title: "Amazon Associates",
      blurb: "Tu Tracking ID para ganar con links.",
      href: "/affiliate",
      cta: snap.associates ? "Ver Affiliate" : "Pegar Tracking ID",
      ready: snap.associates,
      detail: snap.associates
        ? `${snap.affiliateLinks} links activos`
        : "Ejemplo: tu-tienda-20",
      mark: "associates",
    },
    {
      id: "facebook",
      title: "Facebook Ads",
      blurb: "Compartí ofertas en tu Page.",
      href: snap.facebook ? "/facebook" : "/settings#facebook-store",
      cta: snap.facebook ? "Crear promo" : "Conectar Page",
      ready: snap.facebook,
      detail: snap.facebook ? "Page lista" : "Page ID + token",
      mark: "facebook",
    },
    {
      id: "smart",
      title: "Smart Links",
      blurb: "Links cortos /go con clicks.",
      href: "/settings#money",
      cta: snap.smartLinks ? "Ir a Affiliate" : "Activar",
      ready: snap.smartLinks,
      detail: snap.smartLinks ? "Tracking on" : "Settings → Money",
      mark: "smart",
    },
  ];

  const readyCount = channels.filter((c) => c.ready).length;
  const next = channels.find((c) => !c.ready) || channels[0];

  return (
    <StudioFrame
      kicker="Plataforma"
      title="Integraciones"
      hint="Conectá una vez. Higlou hace el resto."
      scroll
      action={
        <Link
          href={next.href}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#141414] px-4 text-[12px] font-semibold text-white"
        >
          <Zap className="size-3.5 text-[#f4c928]" />
          Siguiente: {next.title}
        </Link>
      }
    >
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(244,201,40,0.18),_transparent_50%),radial-gradient(ellipse_at_bottom_right,_rgba(24,119,242,0.12),_transparent_45%)]"
        />
        <div className="relative space-y-6 p-5 sm:p-7">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="max-w-2xl"
          >
            <p className="font-display text-[42px] leading-[0.95] tracking-tight text-[#141414] sm:text-[52px]">
              Todo listo
              <span className="text-[#8a847c]"> en minutos</span>
            </p>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-[#6b6560]">
              Conectá tus canales. Cada tarjeta te dice qué falta y el botón exacto
              para arreglarlo — sin pasos raros.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#ebe7e0] bg-white/80 px-3.5 py-1.5 text-[12px] font-semibold text-[#141414] backdrop-blur">
                {snap.loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5 text-[#1f7a4d]" />
                )}
                {snap.loading ? "Revisando…" : `${readyCount} de ${channels.length} listas`}
              </div>
              <Link
                href="/affiliate"
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#1877F2] hover:underline"
              >
                Ir a Affiliate
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </motion.div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {channels.map((ch, i) => (
                <motion.div
                  key={ch.id}
                  initial={reduce ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.25), duration: 0.4, ease: EASE }}
                >
                  <Link
                    href={ch.href}
                    className={cn(
                      "group flex h-full flex-col rounded-[1.35rem] border bg-white/90 p-4 backdrop-blur transition",
                      ch.ready
                        ? "border-[#d8efe3] hover:border-[#1f7a4d]/40"
                        : "border-[#ebe7e0] hover:border-[#141414]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Mark kind={ch.mark} />
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase",
                          ch.ready
                            ? "bg-[#e8f5ee] text-[#1f7a4d]"
                            : "bg-[#f0ebe3] text-[#8a847c]",
                        )}
                      >
                        {ch.ready ? "Listo" : "Falta"}
                      </span>
                    </div>
                    <p className="mt-3 text-[16px] font-semibold tracking-tight text-[#141414]">
                      {ch.title}
                    </p>
                    <p className="mt-1 flex-1 text-[13px] leading-snug text-[#6b6560]">
                      {ch.blurb}
                    </p>
                    <p className="mt-3 text-[11px] font-medium text-[#8a847c]">
                      {ch.detail}
                    </p>
                    <span className="mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#141414] px-4 text-[12px] font-semibold text-white transition group-hover:bg-[#2a2a2a]">
                      {ch.cta}
                      <ArrowRight className="size-3.5 opacity-70 transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[1.35rem] border border-[#ebe7e0] bg-white p-5">
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a847c] uppercase">
                Flujo fácil
              </p>
              <ol className="mt-3 space-y-3">
                {[
                  {
                    n: "1",
                    t: "Pegá tu Tracking ID de Associates",
                    d: "Affiliate → un campo. Listo.",
                    href: "/affiliate",
                  },
                  {
                    n: "2",
                    t: "Conectá Facebook Page",
                    d: "Settings → Page ID + token.",
                    href: "/settings#facebook-store",
                  },
                  {
                    n: "3",
                    t: "Elegí productos y publicá",
                    d: "Facebook Ads o Market → Ganar.",
                    href: "/facebook",
                  },
                ].map((step) => (
                  <li key={step.n}>
                    <Link
                      href={step.href}
                      className="flex items-start gap-3 rounded-2xl border border-transparent px-2 py-2 transition hover:border-[#ebe7e0] hover:bg-[#faf9f6]"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#141414] text-[12px] font-bold text-white">
                        {step.n}
                      </span>
                      <span>
                        <span className="block text-[14px] font-semibold text-[#141414]">
                          {step.t}
                        </span>
                        <span className="block text-[12px] text-[#8a847c]">
                          {step.d}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
            <div className="relative overflow-hidden rounded-[1.35rem] border border-[#1877F2]/25 bg-[#1877F2] p-5 text-white">
              <Share2 className="absolute -right-2 -top-2 size-24 opacity-10" />
              <p className="text-[10px] font-bold tracking-[0.14em] text-white/70 uppercase">
                Publicar ahora
              </p>
              <p className="mt-2 font-display text-[32px] leading-none">
                Facebook Ads
              </p>
              <p className="mt-2 text-[13px] text-white/85">
                Elegí ofertas con tu link Associates y compartilas en tu Page.
              </p>
              <Link
                href="/facebook"
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-[#1877F2]"
              >
                <FacebookFMark className="size-3.5" />
                Abrir Facebook Ads
              </Link>
            </div>
          </div>

          <p className="flex items-center gap-2 text-[12px] text-[#8a847c]">
            <Store className="size-3.5" />
            eBay y Amazon Seller siguen en Settings → Stores. Associates y Facebook
            viven en Affiliate y Facebook Ads.
          </p>
        </div>
      </div>
    </StudioFrame>
  );
}
