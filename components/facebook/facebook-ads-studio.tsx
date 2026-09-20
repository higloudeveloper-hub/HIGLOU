"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Share2,
  Sparkles,
} from "lucide-react";
import { FacebookFMark } from "@/components/brand/store-marks";
import { StudioFrame } from "@/components/layout/studio-frame";
import { cn } from "@/lib/utils";

type AffLink = {
  id: string;
  asin: string;
  destination_url: string;
  source: string | null;
  click_count: number | null;
  created_at: string;
  smartPath?: string | null;
};

type MarketDrop = {
  id: string;
  asin: string;
  title: string;
  photo: string;
  affiliateUrl?: string | null;
  sell?: number | null;
  buy?: number | null;
};

type FbConn = {
  connected: boolean;
  pageName: string | null;
  pageId: string | null;
};

const EASE = [0.22, 1, 0.36, 1] as const;

function absoluteUrl(path: string | null | undefined, fallback: string) {
  if (path) {
    if (typeof window !== "undefined") return `${window.location.origin}${path}`;
    return path;
  }
  return fallback;
}

export function FacebookAdsStudio() {
  const reduce = useReducedMotion();
  const [links, setLinks] = useState<AffLink[]>([]);
  const [drops, setDrops] = useState<MarketDrop[]>([]);
  const [fb, setFb] = useState<FbConn | null>(null);
  const [hasTag, setHasTag] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "Oferta verificada · tocá el link y comprá seguro.",
  );
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"affiliate" | "market">("affiliate");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [affRes, feedRes, fbRes, moneyRes] = await Promise.all([
        fetch("/api/money/affiliate/links", { cache: "no-store" }),
        fetch("/api/market/feed", { cache: "no-store" }),
        fetch("/api/facebook/connection", { cache: "no-store" }),
        fetch("/api/settings/money-machine", { cache: "no-store" }),
      ]);

      if (affRes.ok) {
        const body = (await affRes.json()) as { links?: AffLink[] };
        setLinks(body.links || []);
      } else {
        setLinks([]);
      }

      if (feedRes.ok) {
        const body = (await feedRes.json()) as { drops?: MarketDrop[] };
        setDrops((body.drops || []).filter((d) => d.asin && d.photo).slice(0, 24));
      } else {
        setDrops([]);
      }

      if (fbRes.ok) {
        const body = (await fbRes.json()) as { connection?: FbConn };
        setFb(body.connection || null);
      }

      if (moneyRes.ok) {
        const body = (await moneyRes.json()) as {
          prefs?: { associateTag?: string };
          services?: Array<{ id: string; status: string }>;
        };
        setHasTag(
          Boolean(body.prefs?.associateTag?.trim()) ||
            body.services?.some(
              (s) =>
                s.id === "amazon_associates" &&
                (s.status === "ready" || s.status === "connected"),
            ) === true,
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedLink = useMemo(
    () => links.find((l) => l.id === selected) || null,
    [links, selected],
  );

  const selectedDrop = useMemo(
    () => drops.find((d) => d.id === selected) || null,
    [drops, selected],
  );

  const shareUrl = useMemo(() => {
    if (tab === "affiliate" && selectedLink) {
      return absoluteUrl(selectedLink.smartPath, selectedLink.destination_url);
    }
    if (tab === "market" && selectedDrop) {
      return (
        selectedDrop.affiliateUrl ||
        `https://www.amazon.com/dp/${selectedDrop.asin}`
      );
    }
    return null;
  }, [tab, selectedLink, selectedDrop]);

  const share = async () => {
    if (!shareUrl) {
      toast.message("Elegí un producto primero");
      return;
    }
    setBusy(true);
    try {
      // If market drop without affiliate link yet, create one
      let url = shareUrl;
      if (tab === "market" && selectedDrop) {
        const created = await fetch("/api/money/affiliate/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asin: selectedDrop.asin,
            campaignName: "Facebook Ads",
            source: "facebook",
            createSmartLink: true,
            platform: "facebook",
          }),
        });
        if (created.ok) {
          const body = (await created.json()) as {
            smartLink?: { path?: string };
            link?: { destinationUrl?: string };
          };
          url = body.smartLink?.path
            ? `${window.location.origin}${body.smartLink.path}`
            : body.link?.destinationUrl || url;
        }
      }

      const title =
        selectedDrop?.title ||
        (selectedLink ? `ASIN ${selectedLink.asin}` : "Oferta Higlou");

      const res = await fetch("/api/facebook/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          asin: selectedDrop?.asin || selectedLink?.asin,
          message: message.trim() || `Oferta · ${title}`,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        mode?: string;
        shareUrl?: string;
        postUrl?: string;
      };
      if (!res.ok) {
        toast.error(body.error || "No se pudo publicar");
        return;
      }
      if (body.mode === "page_post") {
        toast.success("Publicado en tu Facebook Page");
        if (body.postUrl) window.open(body.postUrl, "_blank", "noopener,noreferrer");
      } else if (body.shareUrl) {
        window.open(body.shareUrl, "_blank", "noopener,noreferrer");
        toast.message(
          fb?.connected
            ? "Abriendo Facebook…"
            : "Conectá tu Page para publicar directo",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard?.writeText(shareUrl);
      toast.success("Link copiado");
    } catch {
      toast.message(shareUrl);
    }
  };

  return (
    <StudioFrame
      kicker="Ads"
      title="Facebook Ads"
      hint="Elegí · escribí · publicá. Sin tiendas externas."
      scroll
      action={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/settings#facebook-store"
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#ddd7cd] bg-white px-3.5 text-[12px] font-semibold text-[#141414]"
          >
            <FacebookFMark className="size-3.5" />
            {fb?.connected ? fb.pageName || "Page OK" : "Conectar Page"}
          </Link>
          <Link
            href="/affiliate"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#141414] px-3.5 text-[12px] font-semibold text-white"
          >
            <Sparkles className="size-3.5 text-[#f4c928]" />
            Affiliate
          </Link>
        </div>
      }
    >
      <div className="relative min-h-0 flex-1 overflow-y-auto bg-[#f6f4f0]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,_rgba(24,119,242,0.16),_transparent_60%)]"
        />
        <div className="relative mx-auto grid max-w-6xl gap-5 p-5 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Setup strip */}
          <div className="lg:col-span-2 grid gap-2 sm:grid-cols-2">
            <StatusChip
              ok={Boolean(fb?.connected)}
              title="Facebook Page"
              detail={
                fb?.connected
                  ? fb.pageName || `Page ${fb.pageId}`
                  : "Conectá en Settings (1 minuto)"
              }
              href="/settings#facebook-store"
            />
            <StatusChip
              ok={hasTag}
              title="Amazon Associates"
              detail={
                hasTag
                  ? "Tracking ID activo · links listos"
                  : "Pegá tu tag en Affiliate"
              }
              href="/affiliate"
            />
          </div>

          <div className="overflow-hidden rounded-[1.5rem] border border-[#ebe7e0] bg-white">
            <div className="flex gap-1 border-b border-[#efeae2] bg-[#faf9f6] p-2">
              {(
                [
                  { id: "affiliate" as const, label: "Tus links", count: links.length },
                  { id: "market" as const, label: "Market", count: drops.length },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTab(t.id);
                    setSelected(null);
                  }}
                  className={cn(
                    "flex-1 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition",
                    tab === t.id
                      ? "bg-white text-[#141414] shadow-sm"
                      : "text-[#8a847c] hover:text-[#141414]",
                  )}
                >
                  {t.label}
                  <span className="ml-1.5 tabular-nums text-[#b8b0a4]">
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-[#8a847c]" />
              </div>
            ) : tab === "affiliate" ? (
              links.length === 0 ? (
                <EmptyPick
                  title="Todavía no tenés links"
                  body="Creá uno desde Market (Ganar) o Affiliate. Después volvé acá y publicá."
                  href="/market"
                  cta="Abrir Market"
                />
              ) : (
                <ul className="max-h-[28rem] divide-y divide-[#efeae2] overflow-y-auto">
                  {links.map((link, i) => (
                    <motion.li
                      key={link.id}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.15), ease: EASE }}
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(link.id)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3.5 text-left transition",
                          selected === link.id
                            ? "bg-[#eef4ff]"
                            : "hover:bg-[#faf9f6]",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-5 place-items-center rounded-full border",
                            selected === link.id
                              ? "border-[#1877F2] bg-[#1877F2] text-white"
                              : "border-[#ddd7cd]",
                          )}
                        >
                          {selected === link.id ? (
                            <Check className="size-3" />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-[#141414]">
                            ASIN {link.asin}
                          </span>
                          <span className="block truncate text-[12px] text-[#8a847c]">
                            {link.smartPath || link.destination_url}
                          </span>
                        </span>
                        <span className="text-[11px] tabular-nums text-[#8a847c]">
                          {Number(link.click_count) || 0} clicks
                        </span>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              )
            ) : drops.length === 0 ? (
              <EmptyPick
                title="Market vacío"
                body="Escaneá Find Winners. Los productos verificados aparecen acá para ads."
                href="/winners"
                cta="Find Winners"
              />
            ) : (
              <ul className="max-h-[28rem] divide-y divide-[#efeae2] overflow-y-auto">
                {drops.map((drop, i) => (
                  <motion.li
                    key={drop.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.15), ease: EASE }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(drop.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition",
                        selected === drop.id
                          ? "bg-[#eef4ff]"
                          : "hover:bg-[#faf9f6]",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={drop.photo}
                        alt=""
                        className="size-12 rounded-xl border border-[#efeae2] object-contain bg-white"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-[#141414]">
                          {drop.title}
                        </span>
                        <span className="block text-[12px] text-[#8a847c]">
                          {drop.asin}
                          {drop.sell != null ? ` · $${drop.sell}` : ""}
                        </span>
                      </span>
                      {selected === drop.id ? (
                        <Check className="size-4 text-[#1877F2]" />
                      ) : null}
                    </button>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-[1.5rem] border border-[#ebe7e0] bg-white p-5">
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a847c] uppercase">
                Mensaje del post
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="mt-3 w-full resize-none rounded-2xl border border-[#ebe7e0] bg-[#faf9f6] px-3.5 py-3 text-[14px] text-[#141414] outline-none focus:border-[#1877F2] focus:bg-white"
                placeholder="Texto corto para Facebook…"
              />
              <AnimatePresence mode="wait">
                {shareUrl ? (
                  <motion.p
                    key={shareUrl}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-3 truncate rounded-xl border border-dashed border-[#ddd7cd] bg-[#faf9f6] px-3 py-2 font-mono text-[11px] text-[#6b6560]"
                  >
                    {shareUrl}
                  </motion.p>
                ) : (
                  <motion.p
                    key="empty"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-3 text-[13px] text-[#8a847c]"
                  >
                    Elegí un producto a la izquierda.
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !shareUrl}
                  onClick={() => void share()}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#1877F2] px-5 text-[14px] font-semibold text-white hover:bg-[#166fe5] disabled:opacity-40 sm:flex-none"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Share2 className="size-4" />
                  )}
                  {fb?.connected ? "Publicar en Page" : "Compartir en Facebook"}
                </button>
                <button
                  type="button"
                  disabled={!shareUrl}
                  onClick={() => void copyUrl()}
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-[#ddd7cd] bg-white px-4 text-[13px] font-semibold text-[#141414] disabled:opacity-40"
                >
                  <Copy className="size-3.5" />
                  Copiar link
                </button>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-[#ebe7e0] bg-white p-5">
              <p className="font-display text-[28px] leading-none text-[#141414]">
                3 pasos
              </p>
              <ol className="mt-4 space-y-3 text-[13px] text-[#6b6560]">
                <li>
                  <span className="font-semibold text-[#141414]">1.</span> Conectá
                  tu Page en Settings.
                </li>
                <li>
                  <span className="font-semibold text-[#141414]">2.</span> Elegí un
                  link Affiliate o un winner del Market.
                </li>
                <li>
                  <span className="font-semibold text-[#141414]">3.</span> Publicá.
                  El link lleva tu tag Associates.
                </li>
              </ol>
              <a
                href="https://www.facebook.com/adsmanager"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1877F2] hover:underline"
              >
                Abrir Ads Manager
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </StudioFrame>
  );
}

function StatusChip({
  ok,
  title,
  detail,
  href,
}: {
  ok: boolean;
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 transition",
        ok
          ? "border-[#d8efe3] bg-[#f3faf6]"
          : "border-amber-200 bg-amber-50 hover:border-amber-300",
      )}
    >
      <span
        className={cn(
          "size-2.5 rounded-full",
          ok ? "bg-[#1f7a4d]" : "bg-amber-500",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-[#141414]">
          {title}
        </span>
        <span className="block truncate text-[12px] text-[#6b6560]">{detail}</span>
      </span>
      <span className="text-[11px] font-bold tracking-wide text-[#8a847c] uppercase">
        {ok ? "OK" : "Falta"}
      </span>
    </Link>
  );
}

function EmptyPick({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-display text-[26px] leading-none text-[#141414]">
        {title}
      </p>
      <p className="mx-auto mt-3 max-w-sm text-[14px] text-[#6b6560]">{body}</p>
      <Link
        href={href}
        className="mt-5 inline-flex h-11 items-center rounded-full bg-[#141414] px-5 text-[13px] font-semibold text-white"
      >
        {cta}
      </Link>
    </div>
  );
}
