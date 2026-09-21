"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Unlink } from "lucide-react";
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
    <div className="overflow-hidden rounded-[1.5rem] border border-[#ebe7e0] bg-white">
      <div className="flex items-start gap-3 border-b border-[#efeae2] bg-[linear-gradient(135deg,#1877F2_0%,#0f5fca_100%)] px-5 py-5 text-white">
        <span className="grid size-11 place-items-center rounded-2xl bg-white/15">
          <FacebookFMark className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold tracking-tight">
            Facebook Page
          </h2>
          <p className="mt-1 text-[13px] text-white/85">
            Para todo el público Higlou. Conectá una vez y publicá ofertas con
            tu link Associates.
          </p>
        </div>
        {connection?.connected ? (
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase">
            On
          </span>
        ) : (
          <span className="rounded-full bg-black/20 px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase">
            Off
          </span>
        )}
      </div>

      <div className="space-y-4 px-5 py-5">
        {connection?.connected ? (
          <div className="rounded-2xl border border-[#d8efe3] bg-[#f3faf6] px-4 py-3">
            <p className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#141414]">
              <CheckCircle2 className="size-4 text-[#1f7a4d]" />
              {connection.pageName || "Facebook Page"}
            </p>
            <p className="mt-1 text-[12px] text-[#6b6560]">
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
                href="/facebook"
                className="inline-flex h-9 items-center rounded-full bg-[#1877F2] px-3.5 text-[12px] font-semibold text-white"
              >
                Crear Facebook Ad
              </Link>
              <Link
                href="/affiliate"
                className="inline-flex h-9 items-center rounded-full border border-[#ddd7cd] bg-white px-3.5 text-[12px] font-semibold text-[#141414]"
              >
                Ver Affiliate
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
            <ol className="grid gap-2 sm:grid-cols-3">
              {[
                "Graph Explorer → GET /me/accounts",
                "Copiá el id de tu Page",
                "Copiá el access_token de esa Page (no el User token)",
              ].map((step, i) => (
                <li
                  key={step}
                  className="rounded-2xl border border-[#e8e8e8] bg-[#fafafa] px-3 py-2.5 text-[12px] text-[#707070]"
                >
                  <span className="font-bold text-[#191919]">{i + 1}.</span>{" "}
                  {step}
                </li>
              ))}
            </ol>

            {connection?.lastError ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-800">
                {connection.lastError}
              </p>
            ) : null}

            {!connection?.encryptionReady ? (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-900">
                Operador: set{" "}
                <code className="font-mono">FACEBOOK_TOKEN_ENCRYPTION_KEY</code>{" "}
                o reutiliza{" "}
                <code className="font-mono">EBAY_TOKEN_ENCRYPTION_KEY</code> (≥32
                chars).
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[12px] font-semibold text-[#6b6560]">
                Page ID
                <input
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  placeholder="123456789012345"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#ebe7e0] bg-[#faf9f6] px-3 text-[14px] text-[#141414] outline-none focus:border-[#1877F2] focus:bg-white"
                />
              </label>
              <label className="block text-[12px] font-semibold text-[#6b6560]">
                Nombre (opcional)
                <input
                  value={pageName}
                  onChange={(e) => setPageName(e.target.value)}
                  placeholder="Mi tienda"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#ebe7e0] bg-[#faf9f6] px-3 text-[14px] text-[#141414] outline-none focus:border-[#1877F2] focus:bg-white"
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
                className="mt-1.5 h-11 w-full rounded-xl border border-[#ebe7e0] bg-[#faf9f6] px-3 font-mono text-[13px] text-[#141414] outline-none focus:border-[#1877F2] focus:bg-white"
              />
            </label>
            <button
              type="button"
              disabled={busy || !pageId.trim() || !accessToken.trim()}
              onClick={() => void connect()}
              className={cn(
                "inline-flex h-12 items-center gap-2 rounded-full bg-[#1877F2] px-5 text-[14px] font-semibold text-white disabled:opacity-40",
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
