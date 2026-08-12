import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBrandingForm } from "@/components/settings/store-branding-form";
import { EbayTemplateForm } from "@/components/settings/ebay-template-form";
import { EbayPoliciesForm } from "@/components/settings/ebay-policies-form";
import { EbayConnectForm } from "@/components/settings/ebay-connect-form";
import { EbayStoreOrganizeForm } from "@/components/settings/ebay-store-organize-form";
import { AiSettingsForm } from "@/components/settings/ai-settings-form";
import { BudgetSettingsForm } from "@/components/settings/budget-settings-form";
import { EXPECTED_SEED_TEMPLATE_SHA256 } from "@/types/ebay";

const READY_HUB = [
  {
    href: "#ebay-store",
    step: "1",
    title: "Connect eBay",
    body: "Link your real seller account with OAuth.",
  },
  {
    href: "#policies",
    step: "2",
    title: "Shipping & returns",
    body: "Create the 3 policies Higlou needs to publish.",
  },
  {
    href: "#branding",
    step: "3",
    title: "Store branding",
    body: "Store name, colors, and listing footer.",
  },
] as const;

const TOOLS_HUB = [
  {
    href: "#organize-store",
    title: "Organize Store",
    body: "Auto-sort live eBay offers into Store folders.",
  },
  {
    href: "#templates",
    title: "eBay CSV template",
    body: "Official Create Drafts template — #INFO preserved.",
  },
  {
    href: "#ai",
    title: "Higlou AI",
    body: "How photos become titles and specifics.",
  },
  {
    href: "/usage",
    title: "Usage & costs",
    body: "What Higlou AI spent this month.",
  },
] as const;

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      description="Get ready once — then every listing follows the same path."
    >
      <div className="mx-auto max-w-3xl space-y-14">
        <section className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Get ready to sell
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Do these three first. Then create listings with confidence.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {READY_HUB.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-border/80 bg-surface px-4 py-4 transition hover:bg-muted/50"
              >
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Step {item.step}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {item.title}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {item.body}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section id="ebay-store" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              1 · eBay store connection
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Link your real eBay seller account so Higlou can create drafts and
              publish through the eBay Sell APIs.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-surface p-5 sm:p-6">
            <EbayConnectForm />
          </div>
        </section>

        <section id="policies" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              2 · eBay policies
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Shipping (buyer pays), payment, and 14-day returns. Create with
              Higlou or import from Seller Hub.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-surface p-5 sm:p-6">
            <EbayPoliciesForm />
          </div>
        </section>

        <section id="branding" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              3 · Store branding
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Store name, colors, and HTML template used on every draft.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-surface p-5 sm:p-6">
            <StoreBrandingForm />
          </div>
        </section>

        <section className="space-y-3 border-t border-border/80 pt-10">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Listing tools
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS_HUB.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-border/70 bg-surface px-4 py-4 transition hover:bg-muted/50"
              >
                <p className="text-sm font-semibold text-foreground">
                  {item.title}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {item.body}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section id="organize-store" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Organize eBay Store
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Scan the connected account and place each offer into the right
              Store folder. Higlou only — uses your live eBay Inventory API.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-surface p-5 sm:p-6">
            <EbayStoreOrganizeForm />
          </div>
        </section>

        <section id="ai" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Higlou AI
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              How photos become titles, categories, and specifics.
            </p>
          </div>
          <AiSettingsForm />
        </section>

        <section id="templates" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              eBay template
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Replace the official draft template without touching code.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-surface p-5 sm:p-6">
            <EbayTemplateForm />
          </div>
          <div className="rounded-2xl bg-muted/50 px-5 py-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Seed template on disk</p>
            <p className="mt-1">
              <code className="text-xs">
                templates/ebay-draft-listing-template.csv
              </code>
            </p>
            <p className="mt-2 break-all text-xs">
              SHA256 {EXPECTED_SEED_TEMPLATE_SHA256}
            </p>
          </div>
        </section>

        <details className="rounded-2xl border border-border/70 bg-surface p-5 sm:p-6">
          <summary className="cursor-pointer list-none text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            Budget & cost controls
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Optional · operators
            </span>
          </summary>
          <div className="mt-4 border-t border-border/60 pt-4">
            <BudgetSettingsForm />
          </div>
        </details>
      </div>
    </AppShell>
  );
}
