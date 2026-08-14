"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayNameFromEbayUsername } from "@/lib/ebay/store-display-name";
import { StoreLinkLive } from "@/components/settings/store-link-live";
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
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [pinging, setPinging] = useState(false);

  const load = async (opts?: { silent?: boolean }) => {
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
        setPinging(true);
        const started = performance.now();
        try {
          const storeRes = await fetch("/api/ebay/store-name", {
            cache: "no-store",
          });
          setPingMs(Math.max(1, Math.round(performance.now() - started)));
          if (storeRes.ok) {
            const storeBody = (await storeRes.json()) as {
              storeName?: string | null;
            };
            if (storeBody.storeName) resolved = storeBody.storeName;
          }
        } catch {
          setPingMs(null);
        } finally {
          setPinging(false);
        }
      } else {
        setPingMs(null);
        setPinging(false);
      }
      setStoreName(resolved);
      onStoreChange?.({
        connected: Boolean(next?.connected),
        username: next?.ebayUsername || null,
        storeName: resolved,
      });
    } catch (error) {
      if (!opts?.silent) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load eBay status",
        );
      }
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
    const pulse = window.setInterval(() => void load({ silent: true }), 12_000);
    return () => window.clearInterval(pulse);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount + live pulse
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
      <StoreLinkLive
        live={Boolean(connected)}
        storeName={connected ? display : "Connect your eBay store"}
        username={connection?.ebayUsername}
        envLabel={isProduction ? "Production" : "Sandbox"}
        pingMs={pingMs}
        pinging={pinging}
      />

      {connection?.lastError ? (
        <p className="text-xs text-red-600">{connection.lastError}</p>
      ) : null}

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
          <RefreshCw className={cn("size-4", pinging && "animate-spin")} />
          Refresh
        </Button>
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
