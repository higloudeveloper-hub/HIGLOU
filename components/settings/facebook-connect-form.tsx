"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Unlink } from "lucide-react";
import { FacebookFMark } from "@/components/brand/store-marks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Connection = {
  connected: boolean;
  pageId: string | null;
  pageName: string | null;
  connectedAt: string | null;
  lastError: string | null;
  lastShareAt: string | null;
  encryptionReady: boolean;
};

export function FacebookConnectForm() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pageId, setPageId] = useState("");
  const [pageName, setPageName] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const load = async () => {
    try {
      const res = await fetch("/api/facebook/connection", { cache: "no-store" });
      const body = (await res.json()) as { connection?: Connection };
      setConnection(body.connection || null);
    } catch {
      setConnection(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/facebook/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId,
          pageName: pageName || undefined,
          accessToken,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        connection?: Connection;
      };
      if (!res.ok) {
        toast.error(body.error || "No se pudo conectar Facebook");
        return;
      }
      setConnection(body.connection || null);
      setAccessToken("");
      toast.success("Facebook Page conectada");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await fetch("/api/facebook/connection", { method: "DELETE" });
      toast.message("Facebook desconectado");
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-28 items-center justify-center rounded-3xl border border-[#ebe7e0] bg-white">
        <Loader2 className="size-4 animate-spin text-[#8a847c]" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-[#ebe7e0] bg-white">
      <div className="flex items-start gap-3 border-b border-[#efeae2] bg-[#faf9f6] px-5 py-4">
        <span className="grid size-10 place-items-center rounded-xl bg-[#1877F2] text-white">
          <FacebookFMark className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold tracking-tight">Facebook</h2>
          <p className="mt-0.5 text-[13px] text-[#6b6560]">
            Conectá tu Page para publicar affiliate links y potenciar ads. Disponible
            para todas las cuentas Higlou.
          </p>
        </div>
        {connection?.connected ? (
          <span className="rounded-full bg-[#e8f5ee] px-2.5 py-1 text-[10px] font-bold tracking-wide text-[#1f7a4d] uppercase">
            Conectada
          </span>
        ) : (
          <span className="rounded-full bg-[#f0ebe3] px-2.5 py-1 text-[10px] font-bold tracking-wide text-[#8a847c] uppercase">
            Off
          </span>
        )}
      </div>

      <div className="space-y-4 px-5 py-5">
        {connection?.connected ? (
          <div className="rounded-2xl border border-[#ebe7e0] bg-[#faf9f6] px-4 py-3">
            <p className="text-[13px] font-semibold text-[#141414]">
              {connection.pageName || "Facebook Page"}
            </p>
            <p className="mt-0.5 text-[12px] text-[#6b6560]">
              Page ID {connection.pageId}
              {connection.connectedAt
                ? ` · desde ${new Date(connection.connectedAt).toLocaleDateString()}`
                : ""}
            </p>
            {connection.lastError ? (
              <p className="mt-2 text-[12px] text-[#b42318]">{connection.lastError}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/affiliate"
                className="inline-flex h-9 items-center rounded-full bg-[#141414] px-3.5 text-[12px] font-semibold text-white"
              >
                Ir a Affiliate
              </Link>
              <Link
                href="/facebook"
                className="inline-flex h-9 items-center rounded-full border border-[#ddd7cd] bg-white px-3.5 text-[12px] font-semibold text-[#141414]"
              >
                Promo carrusel
              </Link>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void disconnect()}
                className="h-9 rounded-full"
              >
                <Unlink className="size-3.5" />
                Desconectar
              </Button>
            </div>
          </div>
        ) : (
          <>
            {!connection?.encryptionReady ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-900">
                Operador: set{" "}
                <code className="font-mono">FACEBOOK_TOKEN_ENCRYPTION_KEY</code>{" "}
                o reutiliza{" "}
                <code className="font-mono">EBAY_TOKEN_ENCRYPTION_KEY</code> (≥32
                chars) para guardar tokens.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[12px] font-semibold text-[#6b6560]">
                Page ID
                <input
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  placeholder="123456789012345"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#ebe7e0] bg-[#faf9f6] px-3 text-[14px] text-[#141414] outline-none focus:border-[#141414] focus:bg-white"
                />
              </label>
              <label className="block text-[12px] font-semibold text-[#6b6560]">
                Nombre de la Page (opcional)
                <input
                  value={pageName}
                  onChange={(e) => setPageName(e.target.value)}
                  placeholder="Mi tienda"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#ebe7e0] bg-[#faf9f6] px-3 text-[14px] text-[#141414] outline-none focus:border-[#141414] focus:bg-white"
                />
              </label>
            </div>
            <label className="block text-[12px] font-semibold text-[#6b6560]">
              Page access token
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAAB…"
                className="mt-1.5 h-11 w-full rounded-xl border border-[#ebe7e0] bg-[#faf9f6] px-3 font-mono text-[13px] text-[#141414] outline-none focus:border-[#141414] focus:bg-white"
              />
            </label>
            <p className="text-[12px] leading-relaxed text-[#8a847c]">
              En Meta Business Suite → Settings → Page access tokens. Usamos el
              token solo para publicar links affiliate en tu Page.
            </p>
            <button
              type="button"
              disabled={busy || !pageId.trim() || !accessToken.trim()}
              onClick={() => void connect()}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-full bg-[#1877F2] px-5 text-[13px] font-semibold text-white disabled:opacity-40",
              )}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FacebookFMark className="size-3.5" />
              )}
              Conectar Facebook
            </button>
          </>
        )}
      </div>
    </div>
  );
}
