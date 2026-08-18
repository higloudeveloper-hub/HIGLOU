"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CreditCard, RotateCcw, Truck } from "lucide-react";
import { StoreBrandingForm } from "@/components/settings/store-branding-form";
import { EbayTemplateForm } from "@/components/settings/ebay-template-form";
import { EbayPoliciesForm } from "@/components/settings/ebay-policies-form";
import { EbayConnectForm } from "@/components/settings/ebay-connect-form";
import { AmazonConnectForm } from "@/components/settings/amazon-connect-form";
import { EbayStoreOrganizeForm } from "@/components/settings/ebay-store-organize-form";
import { EbaySetupStory } from "@/components/settings/ebay-setup-story";
import { AiSettingsForm } from "@/components/settings/ai-settings-form";
import { BudgetSettingsForm } from "@/components/settings/budget-settings-form";
import { StudioFrame } from "@/components/layout/studio-frame";
import { EXPECTED_SEED_TEMPLATE_SHA256 } from "@/types/ebay";
import { cn } from "@/lib/utils";

type Tab = "ebay" | "brand" | "tools";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "ebay", label: "Stores", hint: "eBay & Amazon" },
  { id: "brand", label: "Look", hint: "Store branding" },
  { id: "tools", label: "Tools", hint: "AI, folders, CSV" },
];

function tabFromHash(hash: string): Tab {
  if (hash === "#branding") return "brand";
  if (hash === "#amazon-store") return "ebay";
  if (
    hash === "#organize-store" ||
    hash === "#ai" ||
    hash === "#templates"
  ) {
    return "tools";
  }
  return "ebay";
}

export function SettingsStudio() {
  const [tab, setTab] = useState<Tab>("ebay");
  const [store, setStore] = useState<{
    connected: boolean;
    username: string | null;
    storeName: string | null;
  }>({ connected: false, username: null, storeName: null });

  useEffect(() => {
    const apply = () => setTab(tabFromHash(window.location.hash));
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  function go(next: Tab) {
    setTab(next);
    const hash =
      next === "brand" ? "#branding" : next === "tools" ? "#ai" : "#ebay-store";
    window.history.replaceState({}, "", `/settings${hash}`);
  }

  return (
    <StudioFrame
      kicker="Store"
      title="Settings"
      hint="Connect eBay and Amazon, lock policies, then Higlou can publish."
      scroll
    >
      <div className="sticky top-0 z-10 border-b border-[#e5e5e5] bg-white px-5 py-2">
        <div
          role="tablist"
          className="grid grid-cols-3 rounded-full border border-[#e5e5e5] bg-[#f7f7f7] p-1"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => go(item.id)}
              className={cn(
                "rounded-full px-2 py-2 text-center transition",
                tab === item.id
                  ? "bg-[#3665F3] text-white shadow-sm"
                  : "text-[#707070] hover:text-[#191919]",
              )}
            >
              <span className="block text-[13px] font-semibold">{item.label}</span>
              <span
                className={cn(
                  "mt-0.5 hidden text-[11px] sm:block",
                  tab === item.id ? "text-white/80" : "text-[#9b9b9b]",
                )}
              >
                {item.hint}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="p-5">
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === "ebay" ? (
            <div className="space-y-8">
              <EbaySetupStory
                connected={store.connected}
                username={store.username}
                storeName={store.storeName}
              />

              <section id="ebay-store" className="scroll-mt-24">
                <EbayConnectForm onStoreChange={setStore} />
              </section>

              <section id="amazon-store" className="scroll-mt-24 space-y-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Amazon</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Connect Seller Central to offer your Higlou listings on Amazon.
                  </p>
                </div>
                <AmazonConnectForm />
              </section>

              <section id="policies" className="scroll-mt-24 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Shipping, payment, returns
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The three eBay policies every live listing needs.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { Icon: Truck, label: "Shipping", hint: "How it leaves" },
                    { Icon: RotateCcw, label: "Returns", hint: "14 days" },
                    { Icon: CreditCard, label: "Payment", hint: "How you get paid" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 rounded-2xl border border-border/70 bg-surface px-3.5 py-3"
                    >
                      <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-foreground">
                        <item.Icon className="size-4" />
                      </span>
                      <div>
                        <p className="text-[13px] font-semibold">{item.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.hint}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-3xl border border-border/80 bg-surface p-5 sm:p-6">
                  <EbayPoliciesForm />
                </div>
              </section>
            </div>
          ) : null}

          {tab === "brand" ? (
            <section id="branding" className="scroll-mt-24">
              <StoreBrandingForm />
            </section>
          ) : null}

          {tab === "tools" ? (
            <div className="space-y-5">
              <section id="ai" className="scroll-mt-24">
                <AiSettingsForm />
              </section>

              <details
                id="organize-store"
                className="scroll-mt-24 rounded-[24px] border border-border/80 bg-surface px-5 py-4"
              >
                <summary className="cursor-pointer list-none text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  Store folders
                  <span className="ml-2 font-normal text-muted-foreground">
                    file live listings
                  </span>
                </summary>
                <div className="mt-4 border-t border-border/60 pt-4">
                  <EbayStoreOrganizeForm />
                </div>
              </details>

              <details className="rounded-[24px] border border-border/80 bg-surface px-5 py-4">
                <summary className="cursor-pointer list-none text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  CSV template
                  <span className="ml-2 font-normal text-muted-foreground">
                    rarely needed
                  </span>
                </summary>
                <div id="templates" className="mt-4 space-y-4 border-t border-border/60 pt-4">
                  <EbayTemplateForm />
                  <p className="break-all text-[11px] text-muted-foreground">
                    Seed SHA256 {EXPECTED_SEED_TEMPLATE_SHA256}
                  </p>
                </div>
              </details>

              <details className="rounded-[24px] border border-border/80 bg-surface px-5 py-4">
                <summary className="cursor-pointer list-none text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  Budget
                  <span className="ml-2 font-normal text-muted-foreground">
                    operators
                  </span>
                </summary>
                <div className="mt-4 border-t border-border/60 pt-4">
                  <BudgetSettingsForm />
                </div>
              </details>

              <p className="px-1 text-[13px] text-muted-foreground">
                See spend on{" "}
                <Link href="/usage" className="font-medium text-foreground underline">
                  Usage
                </Link>
                .
              </p>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>
      </div>
    </StudioFrame>
  );
}
