"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Store, Link2, Unlink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Connection = {
  connected: boolean;
  configured: boolean;
  env: "sandbox" | "production";
  ebayUsername: string | null;
  ebayUserId: string | null;
  marketplaceId: string | null;
  connectedAt: string | null;
  lastError: string | null;
  missingReason?: string;
};

export function EbayConnectForm() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/ebay/connection");
      const body = (await res.json()) as {
        connection?: Connection;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Failed to load connection");
      setConnection(body.connection || null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load eBay status",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("ebay_connected") === "1") {
      toast.success("eBay store connected");
      params.delete("ebay_connected");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash || "#ebay-store"}`;
      window.history.replaceState({}, "", next);
    }
    const err = params.get("ebay_error");
    if (err) {
      toast.error(decodeURIComponent(err));
      params.delete("ebay_error");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash || "#ebay-store"}`;
      window.history.replaceState({}, "", next);
    }
  }, []);

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ebay/oauth/disconnect", { method: "POST" });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(body?.error || "Disconnect failed");
      toast.success("eBay store disconnected");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Checking eBay connection…</p>;
  }

  const configured = connection?.configured;
  const connected = connection?.connected;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-zinc-800">
          <Store className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-950">
            {connected
              ? `Connected as ${connection?.ebayUsername || "eBay seller"}`
              : "No eBay store connected"}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {configured
              ? `Environment: ${connection?.env}. Connect once — then create drafts or publish live from Export.`
              : connection?.missingReason ||
                "Add eBay Developer credentials to enable Connect."}
          </p>
          {connection?.lastError ? (
            <p className="mt-2 text-xs text-red-600">{connection.lastError}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {connected ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Unlink className="size-4" />
            )}
            Disconnect
          </Button>
        ) : (
          <Button
            type="button"
            disabled={!configured || busy}
            onClick={() => {
              window.location.href = "/api/ebay/oauth/start";
            }}
          >
            <Link2 className="size-4" />
            Connect eBay store
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-[12px] text-zinc-600">
        Setup checklist: create a Sandbox app at developer.ebay.com → RuName
        pointing to{" "}
        <code className="text-[11px]">
          /api/ebay/oauth/callback
        </code>{" "}
        → set{" "}
        <code className="text-[11px]">
          EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_RU_NAME /
          EBAY_TOKEN_ENCRYPTION_KEY
        </code>{" "}
        → run the{" "}
        <code className="text-[11px]">ebay_connections</code> SQL migration.
      </div>
    </div>
  );
}
