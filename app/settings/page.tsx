import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBrandingForm } from "@/components/settings/store-branding-form";
import { EbayTemplateForm } from "@/components/settings/ebay-template-form";
import { EbayPoliciesForm } from "@/components/settings/ebay-policies-form";
import { EbayConnectForm } from "@/components/settings/ebay-connect-form";
import { AiSettingsForm } from "@/components/settings/ai-settings-form";
import { BudgetSettingsForm } from "@/components/settings/budget-settings-form";
import { EXPECTED_SEED_TEMPLATE_SHA256 } from "@/types/ebay";

const HUB = [
  {
    href: "#ebay-store",
    title: "eBay store",
    body: "Connect your real eBay seller account via OAuth.",
  },
  {
    href: "#branding",
    title: "Store branding",
    body: "Higlou Store header, colors, and thank-you footer.",
  },
  {
    href: "#templates",
    title: "eBay template",
    body: "Official Create New Drafts CSV — #INFO preserved.",
  },
  {
    href: "/usage",
    title: "Usage & costs",
    body: "What Higlou AI spent this month — estimates only.",
  },
  {
    href: "#policies",
    title: "eBay policies",
    body: "Import shipping, return, and payment policies from your connected account.",
  },
] as const;

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      description="Quiet controls for your store — Higlou handles the rest."
    >
      <div className="mx-auto max-w-3xl space-y-14">
        <section className="grid gap-3 sm:grid-cols-2">
          {HUB.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl bg-white px-5 py-4 transition hover:bg-zinc-50"
            >
              <p className="text-sm font-semibold text-zinc-950">{item.title}</p>
              <p className="mt-1 text-sm text-zinc-500">{item.body}</p>
            </Link>
          ))}
        </section>

        <section id="ebay-store" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              eBay store connection
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Link your real eBay seller account so Higlou can create drafts and
              publish listings through the eBay Sell APIs.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 sm:p-6">
            <EbayConnectForm />
          </div>
        </section>

        <section id="ai" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Higlou AI
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              How I analyze photos and draft your listings.
            </p>
          </div>
          <AiSettingsForm />
        </section>

        <section id="branding" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Store branding
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Pick your store name, colors, and HTML template. Drafts use this
              branding automatically for every listing.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 sm:p-6">
            <StoreBrandingForm />
          </div>
        </section>

        <section id="templates" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              eBay template
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Replace the official draft template without touching code.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 sm:p-6">
            <EbayTemplateForm />
          </div>
          <div className="rounded-2xl bg-zinc-50 px-5 py-4 text-sm text-zinc-600">
            <p className="font-medium text-zinc-800">Seed template on disk</p>
            <p className="mt-1">
              <code className="text-xs">templates/ebay-draft-listing-template.csv</code>
            </p>
            <p className="mt-2 break-all text-xs text-zinc-500">
              SHA256 {EXPECTED_SEED_TEMPLATE_SHA256}
            </p>
          </div>
        </section>

        <section id="policies" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              eBay policies
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Import business policies from your connected eBay account, or enter
              IDs manually. Publish live uses these automatically.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 sm:p-6">
            <EbayPoliciesForm />
          </div>
        </section>

        <details className="rounded-2xl bg-white p-5 sm:p-6">
          <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
            Budget & cost controls
            <span className="ml-2 text-xs font-normal text-zinc-400">
              Optional · operators
            </span>
          </summary>
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <BudgetSettingsForm />
          </div>
        </details>
      </div>
    </AppShell>
  );
}
