"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/client";
import { ReturningHome } from "@/components/studio/returning-home";
import { pickBestReadyListings } from "@/lib/studio/ready-from-products";

type ProductRow = {
  id: string;
  title: string;
  brand: string;
  status: string;
  updatedAt: string;
  coverUrl?: string | null;
  categoryName?: string | null;
  price?: number | null;
  descriptionSummary?: string | null;
  descriptionHtml?: string | null;
  itemLocation?: string | null;
  handlingTime?: number | null;
  photos?: string[] | null;
};

type CsvRow = {
  id: string;
  fileName: string;
  createdAt: string;
  productId?: string | null;
};

function firstNameFromEmail(email: string | null | undefined) {
  if (!email) return null;
  const local = email.split("@")[0]?.trim();
  if (!local) return null;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default function HomeWorkspacePage() {
  const [name, setName] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [exportsList, setExportsList] = useState<CsvRow[]>([]);
  const [ready, setReady] = useState(false);
  const [owner, setOwner] = useState(false);
  const [ebayConnected, setEbayConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const body = (await res.json()) as { owner?: boolean };
        if (!cancelled) setOwner(Boolean(body.owner));
      } catch {
        /* guest */
      }
    })();

    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        const metaName =
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null;
        setName(metaName?.split(" ")[0] || firstNameFromEmail(user.email));
      } catch {
        /* guest / unconfigured */
      }
    })();

    void (async () => {
      try {
        const res = await fetch("/api/products");
        if (!res.ok) return;
        const body = (await res.json()) as { products: ProductRow[] };
        if (!cancelled) setProducts(body.products ?? []);
      } catch {
        /* degrade gracefully */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    void (async () => {
      try {
        const res = await fetch("/api/csv-history");
        if (!res.ok) return;
        const body = (await res.json()) as { files: CsvRow[] };
        if (!cancelled) setExportsList(body.files ?? []);
      } catch {
        /* degrade gracefully */
      }
    })();

    void (async () => {
      try {
        const res = await fetch("/api/ebay/connection");
        if (!res.ok) return;
        const conn = (await res.json()) as {
          connection?: { connected?: boolean };
          connected?: boolean;
        };
        if (!cancelled) {
          setEbayConnected(Boolean(conn.connection?.connected || conn.connected));
        }
      } catch {
        /* degrade gracefully */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const drafts = useMemo(
    () =>
      products
        .filter((p) => {
          const s = (p.status || "").toLowerCase();
          return !s.includes("csv generated") && !s.includes("exported");
        })
        .slice(0, 8),
    [products],
  );
  const readyListings = useMemo(
    () => pickBestReadyListings(products, 5),
    [products],
  );
  const hasInventory = products.length > 0;
  const connectHref =
    !owner && !ebayConnected ? "/api/ebay/oauth/start?next=/home" : null;

  return (
    <AppShell hideHeader flush>
      {!ready ? (
        <div className="flex h-full min-h-0 flex-1 animate-pulse bg-white" />
      ) : (
        <ReturningHome
          name={name}
          listingCount={products.length}
          drafts={drafts}
          readyListings={readyListings}
          exportsList={exportsList}
          ebayConnected={ebayConnected}
          connectHref={connectHref}
          showRestCta={!hasInventory}
        />
      )}
    </AppShell>
  );
}
