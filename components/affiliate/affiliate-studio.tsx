"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  MessageCircle,
  MousePointerClick,
  Share2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { FacebookFMark } from "@/components/brand/store-marks";
import { StudioFrame } from "@/components/layout/studio-frame";
import { cn } from "@/lib/utils";

type AffLink = {
  id: string;
  tracking_id: string;
  asin: string;
  destination_url: string;
  source: string | null;
  click_count: number | null;
  created_at: string;
  product_id: string | null;
  provider_id: string | null;
  smartPath?: string | null;
};

type Dash = {
  enabled?: boolean;
  flags?: { affiliateEngine?: boolean; smartLinks?: boolean };
  revenue?: { affiliateRevenue: number | null };
  performance?: {
    clicks: number | null;
    conversions: number | null;
    conversionRate: number | null;
  };
};

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function absoluteSmartUrl(path: string | null | undefined, destination: string) {
  if (path) {
    if (typeof window !== "undefined") {
      return `${window.location.origin}${path}`;
    }
    return path;
  }
  return destination;
}

function whatsappShareUrl(url: string, asin: string) {
  const text = `Oferta verificada · ASIN ${asin}\n${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function xShareUrl(url: string, asin: string) {
  const u = new URL("https://twitter.com/intent/tweet");
  u.searchParams.set("text", `Oferta verificada · ASIN ${asin}`);
  u.searchParams.set("url", url);
  return u.toString();
}

export function AffiliateStudio() {
  const reduce = useReducedMotion();
  const [links, setLinks] = useState<AffLink[]>([]);
  const [dash, setDash] = useState<Dash | null>(null);
  const [fbConnected, setFbConnected] = useState(false);
  const [fbPageName, setFbPageName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linksRes, dashRes, fbRes] = await Promise.all([
        fetch("/api/money/affiliate/links", { cache: "no-store" }),
        fetch("/api/money/dashboard", { cache: "no-store" }),
        fetch("/api/facebook/connection", { cache: "no-store" }),
      ]);

      if (linksRes.ok) {
        const body = (await linksRes.json()) as {
          links?: AffLink[];
          note?: string;
        };
        setLinks(body.links || []);
        setNote(body.note || null);
      } else {
        setLinks([]);
        setNote("Activa Money Engine + Affiliate en Settings → Money");
      }

      if (dashRes.ok) {
        setDash((await dashRes.json()) as Dash);
      } else {
        setDash(null);
      }

      if (fbRes.ok) {
        const fb = (await fbRes.json()) as {
          connection?: {
            connected?: boolean;
            pageName?: string | null;
          };
        };
        setFbConnected(Boolean(fb.connection?.connected));
        setFbPageName(fb.connection?.pageName || null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalClicks = useMemo(
    () =>
      links.reduce((sum, l) => sum + (Number(l.click_count) || 0), 0) ||
      dash?.performance?.clicks ||
      0,
    [links, dash],
  );

  const conversions = dash?.performance?.conversions ?? null;
  const conversionRate = dash?.performance?.conversionRate ?? null;

  const integrations = useMemo(
    () => [
      {
        id: "amazon",
        title: "Amazon Associates",
        hint: dash?.flags?.affiliateEngine
          ? "Links con tag Associates"
          : "Activalo en Settings → Money",
        href: "/settings#money",
        ready: Boolean(dash?.flags?.affiliateEngine),
        accent: "#ff9900",
      },
      {
        id: "smart",
        title: "Smart Links",
        hint: dash?.flags?.smartLinks
          ? "Tracking /go/… listo"
          : "Activalo en Settings → Money",
        href: "/settings#money",
        ready: Boolean(dash?.flags?.smartLinks),
        accent: "#141414",
      },
      {
        id: "facebook",
        title: "Facebook Page",
        hint: fbConnected
          ? fbPageName || "Page conectada · post directo"
          : "Conectá tu Page para ads",
        href: "/settings#facebook-store",
        ready: fbConnected,
        accent: "#1877F2",
      },
      {
        id: "promo",
        title: "Promo Carrusel",
        hint: "Carrusel / vitrina · todas las cuentas",
        href: "/facebook",
        ready: true,
        accent: "#1877F2",
      },
    ],
    [dash, fbConnected, fbPageName],
  );

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard?.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.message(url);
    }
  };

  const shareFacebook = async (link: AffLink) => {
    setBusyId(link.id);
    try {
      const url = absoluteSmartUrl(link.smartPath, link.destination_url);
      const res = await fetch("/api/facebook/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          asin: link.asin,
          message: `Oferta · ASIN ${link.asin} · link verificado Higlou`,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        mode?: string;
        shareUrl?: string;
        postUrl?: string;
      };
      if (!res.ok) {
        toast.error(body.error || "No se pudo compartir");
        return;
      }
      if (body.mode === "page_post") {
        toast.success("Publicado en tu Facebook Page");
        if (body.postUrl) window.open(body.postUrl, "_blank", "noopener,noreferrer");
      } else if (body.shareUrl) {
        window.open(body.shareUrl, "_blank", "noopener,noreferrer");
        toast.message(
          fbConnected
            ? "Abriendo Facebook…"
            : "Conectá Facebook en Settings para publicar directo en tu Page",
        );
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <StudioFrame
      kicker="Money"
      title="Affiliate"
      hint="Productos · stats · Facebook · WhatsApp · X · promo."
      scroll
      action={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/settings#facebook-store"
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#ddd7cd] bg-white px-3.5 text-[12px] font-semibold text-[#141414]"
          >
            <FacebookFMark className="size-3.5" />
            {fbConnected ? "FB conectada" : "Conectar FB"}
          </Link>
          <Link
            href="/market"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#141414] px-3.5 text-[12px] font-semibold text-white"
          >
            <Sparkles className="size-3.5 text-[#f4c928]" />
            Market
          </Link>
        </div>
      }
    >
      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Links activos",
              value: String(links.length),
              hint: "Amazon Associates",
            },
            {
              label: "Clicks",
              value: String(totalClicks),
              hint: "Smart links + affiliate",
            },
            {
              label: "Conversiones",
              value:
                conversions == null
                  ? "—"
                  : `${conversions}${
                      conversionRate != null
                        ? ` · ${(conversionRate * 100).toFixed(1)}%`
                        : ""
                    }`,
              hint: "Atribuidas cuando hay data",
            },
            {
              label: "Revenue affiliate",
              value: money(dash?.revenue?.affiliateRevenue),
              hint:
                dash?.revenue?.affiliateRevenue == null
                  ? "Unknown hasta Associates"
                  : "Atribuido",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-[#ebe7e0] bg-white px-4 py-3.5"
            >
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a847c] uppercase">
                {stat.label}
              </p>
              <p className="mt-1 font-display text-[26px] leading-none tabular-nums">
                {loading ? "…" : stat.value}
              </p>
              <p className="mt-1.5 text-[11px] text-[#8a847c]">{stat.hint}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-2 flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a847c] uppercase">
                Integraciones
              </p>
              <p className="text-[14px] font-semibold text-[#141414]">
                Canales listos para publicitar
              </p>
            </div>
            <Link
              href="/settings#facebook-store"
              className="text-[12px] font-semibold text-[#1877F2] hover:underline"
            >
              Gestionar en Settings
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {integrations.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="group rounded-2xl border border-[#ebe7e0] bg-white px-4 py-3.5 transition hover:border-[#cfc8bc]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="mt-0.5 size-2.5 rounded-full"
                    style={{ background: item.accent }}
                    aria-hidden
                  />
                  {item.ready ? (
                    <CheckCircle2 className="size-4 text-[#1f7a4d]" />
                  ) : (
                    <XCircle className="size-4 text-[#b8b0a4]" />
                  )}
                </div>
                <p className="mt-2 text-[14px] font-semibold text-[#141414]">
                  {item.title}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-[#8a847c]">
                  {item.hint}
                </p>
              </Link>
            ))}
          </div>
        </div>

        {note ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            {note}{" "}
            <Link href="/settings#money" className="font-semibold underline">
              Settings → Money
            </Link>
          </p>
        ) : null}

        <div className="overflow-hidden rounded-3xl border border-[#ebe7e0] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#efeae2] bg-[#faf9f6] px-4 py-3">
            <div>
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a847c] uppercase">
                Productos en affiliate
              </p>
              <p className="text-[14px] font-semibold text-[#141414]">
                Tus links actuales
              </p>
            </div>
            <Link
              href="/facebook"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#1877F2] hover:underline"
            >
              <FacebookFMark className="size-3.5" />
              Promo carrusel
            </Link>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-[#8a847c]" />
            </div>
          ) : links.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="font-display text-[24px] leading-none">
                Sin links aún
              </p>
              <p className="mx-auto mt-3 max-w-sm text-[14px] text-[#6b6560]">
                Crea affiliate desde Market (Ganar) o desde el Money Engine de un
                listing. Aquí verás productos, clicks y compartir en Facebook,
                WhatsApp o X.
              </p>
              <Link
                href="/market"
                className="mt-5 inline-flex h-11 items-center rounded-full bg-[#141414] px-5 text-[13px] font-semibold text-white"
              >
                Abrir Market
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-[#efeae2]">
              <AnimatePresence initial={false}>
                {links.map((link, i) => {
                  const shareUrl = absoluteSmartUrl(
                    link.smartPath,
                    link.destination_url,
                  );
                  return (
                    <motion.li
                      key={link.id}
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.2) }}
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-[#141414]">
                          ASIN {link.asin}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-[#8a847c]">
                          {link.source || "manual"} ·{" "}
                          {new Date(link.created_at).toLocaleDateString()}
                          {link.smartPath ? ` · ${link.smartPath}` : ""}
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-[#6b6560]">
                          <MousePointerClick className="size-3.5" />
                          {Number(link.click_count) || 0} clicks
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <a
                          href={link.destination_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 items-center gap-1 rounded-full border border-[#ddd7cd] bg-white px-3 text-[11px] font-semibold text-[#2162a1]"
                        >
                          Amazon
                          <ExternalLink className="size-3 opacity-60" />
                        </a>
                        {link.smartPath ? (
                          <button
                            type="button"
                            onClick={() => void copyLink(shareUrl)}
                            className="inline-flex h-9 items-center gap-1 rounded-full border border-[#ddd7cd] bg-white px-3 text-[11px] font-semibold text-[#141414]"
                          >
                            <Link2 className="size-3" />
                            Smart
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void copyLink(shareUrl)}
                            className="inline-flex h-9 items-center gap-1 rounded-full border border-[#ddd7cd] bg-white px-3 text-[11px] font-semibold text-[#141414]"
                          >
                            <Copy className="size-3" />
                            Copiar
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === link.id}
                          onClick={() => void shareFacebook(link)}
                          className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold text-white",
                            "bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-40",
                          )}
                        >
                          {busyId === link.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Share2 className="size-3" />
                          )}
                          Facebook ads
                        </button>
                        <a
                          href={whatsappShareUrl(shareUrl, link.asin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 items-center gap-1 rounded-full bg-[#25D366] px-3 text-[11px] font-semibold text-white"
                        >
                          <MessageCircle className="size-3" />
                          WhatsApp
                        </a>
                        <a
                          href={xShareUrl(shareUrl, link.asin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 items-center gap-1 rounded-full bg-[#141414] px-3 text-[11px] font-semibold text-white"
                        >
                          X
                        </a>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </StudioFrame>
  );
}
