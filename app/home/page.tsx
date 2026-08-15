"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/client";
import { FirstRunHome } from "@/components/studio/first-run-home";
import { ReturningHome } from "@/components/studio/returning-home";
import { WelcomeGate } from "@/components/studio/welcome-gate";
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

type SetupState = {
  ebayConnected: boolean;
  policiesReady: boolean;
  brandingReady: boolean;
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
  const [setup, setSetup] = useState<SetupState>({
    ebayConnected: false,
    policiesReady: false,
    brandingReady: false,
  });

  useEffect(() => {
    let cancelled = false;

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
        const [connRes, policyRes, brandRes] = await Promise.all([
          fetch("/api/ebay/connection"),
          fetch("/api/settings/policies"),
          fetch("/api/settings/branding"),
        ]);
        const conn = connRes.ok
          ? ((await connRes.json()) as {
              connection?: { connected?: boolean };
              connected?: boolean;
            })
          : null;
        const policies = policyRes.ok
          ? ((await policyRes.json()) as {
              policies?: {
                shippingPolicyId?: string;
                returnPolicyId?: string;
                paymentPolicyId?: string;
              };
            })
          : null;
        const branding = brandRes.ok
          ? ((await brandRes.json()) as {
              branding?: { storeName?: string };
              storeName?: string;
            })
          : null;
        if (cancelled) return;
        const p = policies?.policies;
        setSetup({
          ebayConnected: Boolean(
            conn?.connection?.connected || conn?.connected,
          ),
          policiesReady: Boolean(
            p?.shippingPolicyId?.trim() &&
              p?.returnPolicyId?.trim() &&
              p?.paymentPolicyId?.trim(),
          ),
          brandingReady: Boolean(
            branding?.branding?.storeName?.trim() ||
              branding?.storeName?.trim(),
          ),
        });
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

  const setupItems = [
    {
      done: setup.ebayConnected,
      title: "Connect eBay",
      body: "Link your seller account",
      href: "/settings#ebay-store",
    },
    {
      done: setup.policiesReady,
      title: "Shipping & returns",
      body: "Create or import the 3 policies",
      href: "/settings#policies",
    },
    {
      done: setup.brandingReady,
      title: "Store branding",
      body: "Name and listing look",
      href: "/settings#branding",
    },
  ] as const;
  const setupDoneCount = setupItems.filter((i) => i.done).length;
  const isFirstRun = ready && products.length === 0;

  return (
    <WelcomeGate>
      <AppShell hideHeader flush>
        {!ready ? (
          <div className="flex h-full min-h-0 flex-1 animate-pulse bg-white" />
        ) : isFirstRun ? (
          <FirstRunHome
            name={name}
            setupDoneCount={setupDoneCount}
            setupItems={setupItems.map(({ done, title, body, href }) => ({
              done,
              title,
              body,
              href,
            }))}
          />
        ) : (
          <ReturningHome
            name={name}
            listingCount={products.length}
            drafts={drafts}
            readyListings={readyListings}
            exportsList={exportsList}
            ebayConnected={setup.ebayConnected}
          />
        )}
      </AppShell>
    </WelcomeGate>
  );
}
