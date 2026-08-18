"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StoreLinkLive } from "@/components/settings/store-link-live";
import { cn } from "@/lib/utils";

type Connection = {
  connected: boolean;
  configured: boolean;
  env: "sandbox" | "production";
  sellingPartnerId: string | null;
  marketplaceId: string | null;
  connectedAt: string | null;
  lastError: string | null;
  missingReason?: string;
};

export function AmazonConnectForm() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [pinging, setPinging] = useState(false);
  const [refreshToken, setRefreshToken] = useState("");

  const load = async (opts?: { silent?: boolean }) => {
    try {
      const started = performance.now();
      setPinging(true);
      const res = await fetch("/api/amazon/connection", { cache: "no-store" });
      const body = (await res.json()) as {
        connection?: Connection;
        error?: string;
      };
      setPingMs(Math.max(1, Math.round(performance.now() - started)));
      if (!res.ok) throw new Error(body.error || "Failed to load Amazon");
      setConnection(body.connection || null);
    } catch (error) {
      setPingMs(null);
      if (!opts?.silent) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load Amazon status",
        );
      }
    } finally {
      setPinging(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("amazon_connected") === "1") {
      toast.success("Amazon seller connected");
      params.delete("amazon_connected");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}#amazon-store`;
      window.history.replaceState({}, "", next);
    }
    const err = params.get("amazon_error");
    if (err) {
      toast.error(decodeURIComponent(err));
      params.delete("amazon_error");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}#amazon-store`;
      window.history.replaceState({}, "", next);
    }
    const pulse = window.setInterval(() => void load({ silent: true }), 12_000);
    return () => window.clearInterval(pulse);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount + live pulse
  }, []);

  const saveToken = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/amazon/self-authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Could not save Amazon token");
      setRefreshToken("");
      toast.success("Amazon seller connected");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save Amazon token");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/amazon/oauth/disconnect", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Disconnect failed");
      toast.success("Amazon seller disconnected");
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
        <Loader2 className="size-4 animate-spin" /> Checking Amazon…
      </div>
    );
  }

  const configured = connection?.configured;
  const connected = connection?.connected;
  const display = connected
    ? connection?.sellingPartnerId || "Amazon seller"
    : "Connect your Amazon seller account";

  return (
    <div className="space-y-4">
      <StoreLinkLive
        live={Boolean(connected)}
        storeName={display}
        username={connection?.sellingPartnerId}
        envLabel={connection?.env === "sandbox" ? "Sandbox" : "Production"}
        pingMs={pingMs}
        pinging={pinging}
        channel="amazon"
      />

      {connection?.lastError ? (
        <p className="text-xs text-red-600">{connection.lastError}</p>
      ) : null}
      {!configured && connection?.missingReason ? (
        <p className="text-[12px] text-amber-800">{connection.missingReason}</p>
      ) : null}

      {connected ? (
        <div className="flex flex-wrap gap-2">
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
          <Button type="button" variant="ghost" onClick={() => void load()}>
            <RefreshCw className={cn("size-4", pinging && "animate-spin")} />
            Refresh
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Textarea
            value={refreshToken}
            onChange={(event) => setRefreshToken(event.target.value)}
            placeholder="Paste the Amazon refresh token (starts with Atzr|)"
            className="min-h-24 font-mono text-[12px]"
            disabled={!configured || busy}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!configured || busy || !refreshToken.trim()}
              className="higlou-cta-pulse"
              onClick={() => void saveToken()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4" />
              )}
              Save Amazon token
            </Button>
            <Button type="button" variant="ghost" onClick={() => void load()}>
              <RefreshCw className={cn("size-4", pinging && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      )}

      <p className="text-[12px] text-muted-foreground">
        Private Amazon apps do not use login links. Copy the refresh token from
        Amazon (Ficha de actualización) and paste it here. Higlou then puts
        offers on products Amazon already sells.
      </p>
    </div>
  );
}
