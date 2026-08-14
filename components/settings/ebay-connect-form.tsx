"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayNameFromEbayUsername } from "@/lib/ebay/store-display-name";
import { cn } from "@/lib/utils";

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

export function EbayConnectForm({
  onStoreChange,
}: {
  onStoreChange?: (info: {
    connected: boolean;
    username: string | null;
    storeName: string | null;
  }) => void;
} = {}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
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
      const next = body.connection || null;
      setConnection(next);

      let resolved: string | null = next?.ebayUsername
        ? displayNameFromEbayUsername(next.ebayUsername)
        : null;
      if (next?.connected) {
        try {
          const storeRes = await fetch("/api/ebay/store-name");
          if (storeRes.ok) {
            const storeBody = (await storeRes.json()) as {
              storeName?: string | null;
            };
            if (storeBody.storeName) resolved = storeBody.storeName;
          }
        } catch {
          /* username fallback */
        }
      }
      setStoreName(resolved);
      onStoreChange?.({
        connected: Boolean(next?.connected),
        username: next?.ebayUsername || null,
        storeName: resolved,
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount
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
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Checking eBay…
      </div>
    );
  }

  const configured = connection?.configured;
  const connected = connection?.connected;
  const isProduction = connection?.env === "production";
  const display =
    storeName ||
    (connection?.ebayUsername
      ? displayNameFromEbayUsername(connection.ebayUsername)
      : "") ||
    "eBay seller";

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "relative overflow-hidden rounded-3xl border p-5",
          connected
            ? "border-brand/40 bg-gradient-to-br from-brand-soft/70 to-surface"
            : "border-border bg-muted/30",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 -right-6 size-28 rounded-full bg-[radial-gradient(circle,rgba(255,199,44,0.35),transparent_70%)]"
        />
        <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          {connected ? "Connected store" : "No store yet"}
        </p>
        <h3 className="mt-1 font-display text-2xl tracking-tight">
          {connected ? display : "Connect your eBay store"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {connected
            ? `${isProduction ? "Production" : "Sandbox"}${connection?.ebayUsername ? ` · @${connection.ebayUsername}` : ""}`
            : configured
              ? "Higlou can draft without this. Live publish needs the seller account."
              : connection?.missingReason ||
                "Add eBay Developer credentials to enable Connect."}
        </p>
        {connection?.lastError ? (
          <p className="mt-2 text-xs text-red-600">{connection.lastError}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
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
              className="higlou-cta-pulse"
              onClick={() => {
                window.location.href = "/api/ebay/oauth/start";
              }}
            >
              <Link2 className="size-4" />
              {isProduction
                ? "Connect real eBay account"
                : "Connect eBay Sandbox"}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => void load()}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>
      </div>

      {isProduction ? (
        <p className="text-[12px] text-muted-foreground">
          OAuth opens <strong>auth.ebay.com</strong> — sign in with the seller
          account you want Higlou to publish into.
        </p>
      ) : (
        <p className="text-[12px] text-amber-800">
          Currently on Sandbox. Production keys are required to connect a live
          seller.
        </p>
      )}
    </div>
  );
}
