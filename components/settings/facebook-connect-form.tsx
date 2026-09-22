"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Trash2, Unlink } from "lucide-react";
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
  neverExpires?: boolean;
  tokenExpiresAt?: string | null;
  canExtendTokens?: boolean;
};

type PreviewPost = {
  id: string;
  createdTime: string | null;
  message: string | null;
};

export function FacebookConnectForm() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [pageId, setPageId] = useState("");
  const [pageName, setPageName] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [preview, setPreview] = useState<PreviewPost[]>([]);
  const [confirmText, setConfirmText] = useState("");
  const [deleteMax, setDeleteMax] = useState<50 | 200 | 500>(50);

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
          pageId: pageId.trim(),
          pageName: pageName.trim() || undefined,
          accessToken: accessToken.trim(),
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        connection?: Connection;
      };
      if (!res.ok || !body.connection?.connected) {
        if (body.connection) setConnection(body.connection);
        toast.error(body.error || "No se pudo conectar Facebook");
        return;
      }
      setConnection(body.connection);
      setAccessToken("");
      setPageId("");
      setPageName("");
      setReplacing(false);
      toast.success(
        `Page conectada · ${body.connection.pageName || body.connection.pageId}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/facebook/connection", { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as {
        connection?: Connection;
      } | null;
      setConnection(
        body?.connection || {
          connected: false,
          pageId: null,
          pageName: null,
          connectedAt: null,
          lastError: null,
          lastShareAt: null,
          encryptionReady: connection?.encryptionReady ?? true,
        },
      );
      setReplacing(true);
      setPreview([]);
      toast.message("Facebook desconectado · pegá un token nuevo");
    } finally {
      setBusy(false);
    }
  };

  const loadPreview = async () => {
    try {
      const res = await fetch("/api/facebook/posts", { cache: "no-store" });
      const body = (await res.json()) as {
        error?: string;
        posts?: PreviewPost[];
      };
      if (!res.ok) {
        toast.error(body.error || "No se pudieron listar posts");
        return;
      }
      setPreview(body.posts || []);
    } catch {
      toast.error("Error al listar posts");
    }
  };

  const bulkDelete = async () => {
    if (!connection?.connected) return;
    if (deleteMax > 50 && confirmText.trim().toUpperCase() !== "BORRAR") {
      toast.message('Escribí BORRAR para confirmar más de 50 posts');
      return;
    }
    const ok = window.confirm(
      `¿Borrar los ${deleteMax} posts más recientes de “${connection.pageName || "tu Page"}”? Esto no se puede deshacer.`,
    );
    if (!ok) return;

    setCleaning(true);
    try {
      const res = await fetch("/api/facebook/posts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max: deleteMax,
          confirm: deleteMax > 50 ? "BORRAR" : undefined,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        message?: string;
        deleted?: number;
        remainingHint?: boolean;
      };
      if (!res.ok) {
        toast.error(body.error || "No se pudieron borrar posts");
        return;
      }
      toast.success(body.message || `Borrados: ${body.deleted ?? 0}`);
      setConfirmText("");
      await loadPreview();
      if (body.remainingHint) {
        toast.message("Quedan más posts — volvé a tocar Limpiar.");
      }
    } finally {
      setCleaning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-28 items-center justify-center rounded-3xl border border-[#e8e8e8] bg-white">
        <Loader2 className="size-4 animate-spin text-[#8a8a8a]" />
      </div>
    );
  }

  const showForm = !connection?.connected || replacing;

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[#e8e8e8] bg-white">
      <div className="flex items-start gap-3 border-b border-[#ebebeb] bg-[linear-gradient(135deg,#1877F2_0%,#0f5fca_100%)] px-5 py-5 text-white">
        <span className="grid size-11 place-items-center rounded-2xl bg-white/15">
          <FacebookFMark className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold tracking-tight">
            Facebook Page
          </h2>
          <p className="mt-1 text-[13px] text-white/85">
            Pegá un User token de Graph. Higlou lo convierte en Page token
            {connection?.canExtendTokens
              ? " permanente (no vence)."
              : " — agregá FACEBOOK_APP_ID + SECRET en Vercel para que no venza."}
          </p>
        </div>
        {connection?.connected && !replacing ? (
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
        {connection?.connected && !replacing ? (
          <div className="rounded-2xl border border-[#e8e8e8] bg-[#fafafa] px-4 py-3">
            <p className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#191919]">
              <CheckCircle2 className="size-4 text-[#3665F3]" />
              {connection.pageName || "Facebook Page"}
            </p>
            <p className="mt-1 text-[12px] text-[#707070]">
              Page ID {connection.pageId}
              {connection.connectedAt
                ? ` · desde ${new Date(connection.connectedAt).toLocaleDateString()}`
                : ""}
              {connection.neverExpires
                ? " · token permanente ✓"
                : connection.tokenExpiresAt
                  ? ` · vence ${new Date(connection.tokenExpiresAt).toLocaleDateString()}`
                  : " · token puede vencer (Graph Explorer)"}
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setPageId(connection.pageId || "");
                  setPageName(connection.pageName || "");
                  setReplacing(true);
                }}
                className="h-9 rounded-full"
              >
                Cambiar token
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || cleaning}
                onClick={() => void loadPreview()}
                className="h-9 rounded-full"
              >
                Ver posts recientes
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void disconnect()}
                className="h-9 rounded-full"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Unlink className="size-3.5" />
                )}
                Desconectar
              </Button>
            </div>
          </div>
        ) : null}

        {connection?.connected && !replacing ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/60 px-4 py-4">
            <div className="flex items-start gap-2">
              <Trash2 className="mt-0.5 size-4 shrink-0 text-[#b42318]" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-[#191919]">
                  Limpiar posts de la Page
                </p>
                <p className="mt-1 text-[12px] text-[#707070]">
                  Borra en bloque los posts más recientes (los de Don Baratón /
                  Telegram viejos). No se puede deshacer.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {([50, 200, 500] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setDeleteMax(n)}
                      className={cn(
                        "h-9 rounded-full px-3.5 text-[12px] font-semibold transition",
                        deleteMax === n
                          ? "bg-[#191919] text-white"
                          : "border border-[#e5e5e5] bg-white text-[#707070]",
                      )}
                    >
                      Últimos {n}
                    </button>
                  ))}
                </div>
                {deleteMax > 50 ? (
                  <label className="mt-3 block text-[12px] font-semibold text-[#b42318]">
                    Escribí BORRAR para confirmar
                    <input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="BORRAR"
                      className="mt-1.5 h-10 w-full max-w-xs rounded-xl border border-red-200 bg-white px-3 text-[14px] text-[#191919] outline-none focus:border-[#b42318]"
                    />
                  </label>
                ) : null}
                <Button
                  type="button"
                  disabled={cleaning}
                  onClick={() => void bulkDelete()}
                  className="mt-3 h-10 rounded-full bg-[#b42318] px-4 text-[13px] font-semibold text-white hover:bg-[#912018]"
                >
                  {cleaning ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Borrar últimos {deleteMax}
                </Button>
                {preview.length > 0 ? (
                  <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-[#e8e8e8] bg-white p-2">
                    {preview.map((p) => (
                      <li
                        key={p.id}
                        className="truncate text-[11px] text-[#707070]"
                      >
                        {p.createdTime
                          ? new Date(p.createdTime).toLocaleDateString()
                          : "—"}{" "}
                        · {p.message || "(sin texto / solo imagen)"}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {showForm ? (
          <>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                "Permisos: pages_manage_posts + pages_read_engagement + pages_show_list",
                "Generá User token (no el de 1 hora de Page si podés evitarlo)",
                "Con FACEBOOK_APP_ID + SECRET en Vercel → Page token permanente",
                "Page ID + pegá el token · Higlou extiende y guarda cifrado",
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

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[12px] font-semibold text-[#707070]">
                Page ID
                <input
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  placeholder="1079254478615173"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-[14px] text-[#191919] outline-none focus:border-[#1877F2]"
                />
              </label>
              <label className="block text-[12px] font-semibold text-[#707070]">
                Nombre (opcional)
                <input
                  value={pageName}
                  onChange={(e) => setPageName(e.target.value)}
                  placeholder="Don Baraton Deals"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#e5e5e5] bg-white px-3 text-[14px] text-[#191919] outline-none focus:border-[#1877F2]"
                />
              </label>
            </div>
            <label className="block text-[12px] font-semibold text-[#707070]">
              Access token (User o Page)
              <textarea
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAAB… (si es User token, Higlou lo cambia al de la Page)"
                rows={3}
                className="mt-1.5 w-full resize-y rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[#191919] outline-none focus:border-[#1877F2]"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  busy ||
                  !pageId.trim() ||
                  accessToken.trim().length < 20 ||
                  connection?.encryptionReady === false
                }
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
              {replacing && connection?.connected ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setReplacing(false)}
                  className="inline-flex h-12 items-center rounded-full border border-[#e5e5e5] px-4 text-[13px] font-semibold text-[#707070]"
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
