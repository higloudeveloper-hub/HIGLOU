"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  MessageCircle,
  MousePointerClick,
  Share2,
  Sparkles,
} from "lucide-react";
import { AmazonMark, FacebookFMark } from "@/components/brand/store-marks";
import { cn } from "@/lib/utils";

type AffLink = {
  id: string;
  tracking_id: string;
  asin: string;
  destination_url: string;
  source: string | null;
  click_count: number | null;
  created_at: string;
  smartPath?: string | null;
  imageUrl?: string | null;
};

type Dash = {
  flags?: { affiliateEngine?: boolean; smartLinks?: boolean };
  revenue?: { affiliateRevenue: number | null };
  performance?: {
    clicks: number | null;
    conversions: number | null;
    conversionRate: number | null;
  };
};

const EASE = [0.22, 1, 0.36, 1] as const;

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
  return `https://wa.me/?text=${encodeURIComponent(`Oferta · ASIN ${asin}\n${url}`)}`;
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
  const [associateTag, setAssociateTag] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingTag, setSavingTag] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linksRes, dashRes, fbRes, moneyRes] = await Promise.all([
        fetch("/api/money/affiliate/links", { cache: "no-store" }),
        fetch("/api/money/dashboard", { cache: "no-store" }),
        fetch("/api/facebook/connection", { cache: "no-store" }),
        fetch("/api/settings/money-machine", { cache: "no-store" }),
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
        setNote("Activá Money Engine + Affiliate en Settings → Money");
      }

      if (dashRes.ok) setDash((await dashRes.json()) as Dash);
      else setDash(null);

      if (fbRes.ok) {
        const fb = (await fbRes.json()) as {
          connection?: { connected?: boolean };
        };
        setFbConnected(Boolean(fb.connection?.connected));
      }

      if (moneyRes.ok) {
        const body = (await moneyRes.json()) as {
          prefs?: { associateTag?: string };
        };
        const tag = String(body.prefs?.associateTag || "").trim();
        setAssociateTag(tag);
        setTagDraft(tag);
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

  const saveTag = async () => {
    const next = tagDraft.trim();
    if (!next) {
      toast.message("Pegá tu Tracking ID (ej. tu-tienda-20)");
      return;
    }
    setSavingTag(true);
    try {
      const res = await fetch("/api/settings/money-machine", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          associateTag: next,
          affiliateEngine: true,
          moneyEngine: true,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || "No se pudo guardar el tag");
        return;
      }
      setAssociateTag(next);
      toast.success("Associates listo");
    } finally {
      setSavingTag(false);
    }
  };

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
        toast.success(
          body.postUrl
            ? "Publicado en tu Facebook Page vía API"
            : "Publicado en tu Facebook Page vía API",
        );
        if (body.postUrl) {
          toast.message("Post listo", {
            action: {
              label: "Ver en Facebook",
              onClick: () =>
                window.open(body.postUrl!, "_blank", "noopener,noreferrer"),
            },
          });
        }
      } else if (body.shareUrl) {
        if (fbConnected) {
          toast.error(
            "Graph no publicó. Reconectá el Page token en Settings → Facebook.",
          );
          return;
        }
        window.open(body.shareUrl, "_blank", "noopener,noreferrer");
        toast.message("Conectá Facebook en Settings para post por API");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#f7f7f7] text-[#191919] md:h-full">
      <header className="shrink-0 border-b border-[#e5e5e5] bg-white">
        <div className="flex flex-wrap items-center gap-3 bg-[#3665F3] px-4 py-2.5 text-white md:px-8">
          <span className="size-2 rounded-full bg-white" />
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">
            Affiliate
          </p>
          <p className="hidden min-w-0 flex-1 truncate text-[13px] text-white/85 sm:block">
            Associates · links · stats · Facebook
          </p>
          <Link
            href="/connect"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-[12px] font-semibold text-white hover:bg-white/25"
          >
            Integraciones
          </Link>
          <Link
            href="/facebook"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12px] font-semibold text-[#191919]"
          >
            <FacebookFMark className="size-3.5" />
            Facebook Ads
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 pb-24 md:px-8 md:py-6 md:pb-16">
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white"
        >
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[#232F3E]">
              <AmazonMark invert className="h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[22px] font-semibold tracking-tight text-[#191919] sm:text-[26px]">
                  Amazon Associates
                </p>
                {associateTag ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5ee] px-2.5 py-1 text-[10px] font-bold tracking-wide text-[#1f7a4d] uppercase">
                    <CheckCircle2 className="size-3" />
                    Activo
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold tracking-wide text-amber-800 uppercase">
                    Falta tag
                  </span>
                )}
              </div>
              <p className="mt-2 text-[14px] text-[#707070]">
                Pegá tu Tracking ID. Higlou lo usa en Market, Affiliate y
                Facebook Ads. No es el token Atzr| de Seller API.
              </p>
            </div>
          </div>
          <div className="border-t border-[#e5e5e5] bg-[#f7f7f7] px-5 py-4 sm:px-6">
            <label className="block text-[11px] font-bold tracking-[0.12em] text-[#8a8a8a] uppercase">
              Tracking ID
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8a8a8a]" />
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  placeholder="tu-tienda-20"
                  className="h-12 w-full rounded-xl border border-[#e5e5e5] bg-white pr-3 pl-10 text-[15px] font-medium text-[#191919] outline-none focus:border-[#3665F3]"
                />
              </div>
              <button
                type="button"
                disabled={savingTag}
                onClick={() => void saveTag()}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#3665F3] px-5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {savingTag ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4 text-white/90" />
                )}
                Guardar y activar
              </button>
            </div>
            <p className="mt-2 text-[12px] text-[#8a8a8a]">
              Associates Central → Tracking IDs.{" "}
              <a
                href="https://affiliate-program.amazon.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#3665F3] hover:underline"
              >
                Abrir Associates
              </a>
            </p>
          </div>
        </motion.section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Links",
              value: String(links.length),
              hint: "Amazon tagged",
            },
            {
              label: "Clicks",
              value: String(totalClicks),
              hint: "Smart + affiliate",
            },
            {
              label: "Conversiones",
              value:
                dash?.performance?.conversions == null
                  ? "—"
                  : String(dash.performance.conversions),
              hint: "Cuando Associates reporta",
            },
            {
              label: "Revenue",
              value: money(dash?.revenue?.affiliateRevenue),
              hint: "Unknown hasta reportes",
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.04, ease: EASE }}
              className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3.5"
            >
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a8a8a] uppercase">
                {stat.label}
              </p>
              <p className="mt-1 text-[28px] leading-none font-semibold tabular-nums text-[#191919]">
                {loading ? "…" : stat.value}
              </p>
              <p className="mt-1.5 text-[11px] text-[#8a8a8a]">{stat.hint}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              title: "Smart Links",
              ok: Boolean(dash?.flags?.smartLinks),
              href: "/settings#money",
              hint: "/go/… con tracking",
            },
            {
              title: "Facebook Page",
              ok: fbConnected,
              href: "/settings#facebook-store",
              hint: "Post directo a tu Page",
            },
            {
              title: "Facebook Ads",
              ok: true,
              href: "/facebook",
              hint: "Elegí y publicá ofertas",
            },
          ].map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3.5 transition hover:border-[#c8c8c8]"
            >
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-semibold text-[#191919]">
                  {item.title}
                </p>
                <span
                  className={cn(
                    "size-2 rounded-full",
                    item.ok ? "bg-[#1f7a4d]" : "bg-[#d0d0d0]",
                  )}
                />
              </div>
              <p className="mt-1 text-[12px] text-[#8a8a8a]">{item.hint}</p>
            </Link>
          ))}
        </div>

        {note ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            {note}{" "}
            <Link href="/settings#money" className="font-semibold underline">
              Settings → Money
            </Link>
          </p>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e5e5] bg-[#f7f7f7] px-4 py-3">
            <div>
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a8a8a] uppercase">
                Productos
              </p>
              <p className="text-[14px] font-semibold text-[#191919]">
                Links actuales
              </p>
            </div>
            <Link
              href="/market"
              className="text-[12px] font-semibold text-[#3665F3] hover:underline"
            >
              + Crear desde Market
            </Link>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-[#8a8a8a]" />
            </div>
          ) : links.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-[22px] font-semibold text-[#191919]">
                Empezá por un producto
              </p>
              <p className="mx-auto mt-3 max-w-sm text-[14px] text-[#707070]">
                En Market tocá <strong>Ganar</strong>. Acá verás el link, los
                clicks y los botones para Facebook / WhatsApp / X.
              </p>
              <Link
                href="/market"
                className="mt-5 inline-flex h-11 items-center rounded-full bg-[#3665F3] px-5 text-[13px] font-semibold text-white"
              >
                Abrir Market
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-[#e5e5e5]">
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
                      transition={{
                        delay: Math.min(i * 0.03, 0.2),
                        ease: EASE,
                      }}
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-[#191919]">
                          ASIN {link.asin}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-[#8a8a8a]">
                          {link.source || "manual"} ·{" "}
                          {new Date(link.created_at).toLocaleDateString()}
                          {link.smartPath ? ` · ${link.smartPath}` : ""}
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-[#707070]">
                          <MousePointerClick className="size-3.5" />
                          {Number(link.click_count) || 0} clicks
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <a
                          href={link.destination_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 items-center gap-1 rounded-full border border-[#e5e5e5] bg-white px-3 text-[11px] font-semibold text-[#3665F3]"
                        >
                          Amazon
                          <ExternalLink className="size-3 opacity-60" />
                        </a>
                        <button
                          type="button"
                          onClick={() => void copyLink(shareUrl)}
                          className="inline-flex h-9 items-center gap-1 rounded-full border border-[#e5e5e5] bg-white px-3 text-[11px] font-semibold text-[#191919]"
                        >
                          {link.smartPath ? (
                            <Link2 className="size-3" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          {link.smartPath ? "Smart" : "Copiar"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === link.id}
                          onClick={() => void shareFacebook(link)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1877F2] px-3 text-[11px] font-semibold text-white hover:bg-[#166fe5] disabled:opacity-40"
                        >
                          {busyId === link.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Share2 className="size-3" />
                          )}
                          Facebook
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
                          className="inline-flex h-9 items-center gap-1 rounded-full bg-[#191919] px-3 text-[11px] font-semibold text-white"
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
    </div>
  );
}
