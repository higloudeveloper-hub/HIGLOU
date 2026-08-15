"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const WANTED_KEY = "higlou-wanted-channels";
const DONE_KEY = "higlou-onboarding-done";

const CHANNELS = [
  {
    id: "ebay",
    name: "eBay",
    body: "Connect now. Higlou publishes live to your store.",
    live: true,
  },
  {
    id: "amazon",
    name: "Amazon",
    body: "We’ll list here from the same photo.",
    live: false,
  },
  {
    id: "facebook",
    name: "Facebook Marketplace",
    body: "Same listing. Posted to Marketplace.",
    live: false,
  },
  {
    id: "shopify",
    name: "Shopify",
    body: "Pushes into your storefront.",
    live: false,
  },
  {
    id: "site",
    name: "Your site",
    body: "Your domain. Your bag button.",
    live: false,
  },
] as const;

type ChannelId = (typeof CHANNELS)[number]["id"];

function readWanted(): ChannelId[] {
  try {
    const raw = window.localStorage.getItem(WANTED_KEY);
    if (!raw) return ["ebay"];
    const parsed = JSON.parse(raw) as string[];
    return CHANNELS.map((c) => c.id).filter((id) => parsed.includes(id));
  } catch {
    return ["ebay"];
  }
}

export function markOnboardingDone() {
  try {
    window.localStorage.setItem(DONE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function onboardingAlreadyDone() {
  try {
    return window.localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function ConnectOnboarding({
  name,
  ebayConnected,
  ebayConfigured,
  policiesReady,
  brandingReady,
}: {
  name: string | null;
  ebayConnected: boolean;
  ebayConfigured: boolean;
  policiesReady: boolean;
  brandingReady: boolean;
}) {
  const [wanted, setWanted] = useState<ChannelId[]>(["ebay"]);
  const [ebayError, setEbayError] = useState<string | null>(null);
  const hello = name ? `Hi ${name}.` : "Welcome to Higlou.";

  useEffect(() => {
    setWanted(readWanted());
    try {
      const params = new URLSearchParams(window.location.search);
      const err = params.get("ebay_error");
      if (err) setEbayError(err);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(WANTED_KEY, JSON.stringify(wanted));
    } catch {
      /* ignore */
    }
  }, [wanted]);

  const toggle = (id: ChannelId) => {
    setWanted((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const liveCount = useMemo(() => {
    let n = 0;
    if (wanted.includes("ebay") && ebayConnected) n += 1;
    if (wanted.includes("site") && brandingReady) n += 1;
    return n;
  }, [wanted, ebayConnected, brandingReady]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex shrink-0 items-center gap-4 bg-[#3665F3] px-5 py-2.5 text-white">
        <span className="size-2 rounded-full bg-white" />
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">
          Set up
        </p>
        <p className="hidden min-w-0 flex-1 truncate text-[13px] text-white/85 sm:block">
          Connect the stores you want. Higlou lists to all of them from one photo.
        </p>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col px-5 py-8 sm:py-12">
        <p className="text-[12px] font-medium tracking-[0.16em] text-[#8a8a8a] uppercase">
          Your stores
        </p>
        <h1 className="mt-2 text-[32px] font-medium tracking-tight text-[#141414] leading-[1.05] sm:text-[40px]">
          {hello}
          <span className="mt-1 block">Pick where you sell.</span>
        </h1>
        <p className="mt-3 max-w-[520px] text-[15px] leading-relaxed text-[#707070]">
          Connect in real time. eBay is live today. The others use the same
          listing the moment you hook them up.
        </p>
        {ebayError ? (
          <p className="mt-3 text-[13px] text-[#b45309]">{ebayError}</p>
        ) : null}

        <div className="mt-8 divide-y divide-[#eee] border border-[#e5e5e5]">
          {CHANNELS.map((channel) => {
            const on = wanted.includes(channel.id);
            const connected =
              (channel.id === "ebay" && ebayConnected) ||
              (channel.id === "site" && brandingReady);
            return (
              <div
                key={channel.id}
                className="flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap"
              >
                <button
                  type="button"
                  onClick={() => toggle(channel.id)}
                  className={cn(
                    "grid size-5 shrink-0 place-items-center border",
                    on ? "border-[#141414] bg-[#141414] text-white" : "border-[#cfcfcf] bg-white",
                  )}
                  aria-pressed={on}
                  aria-label={`Use ${channel.name}`}
                >
                  {on ? <Check className="size-3" strokeWidth={3} /> : null}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-[#141414]">
                    {channel.name}
                    {connected ? (
                      <span className="ml-2 text-[12px] font-normal text-[#707070]">
                        Connected
                      </span>
                    ) : channel.live ? (
                      <span className="ml-2 text-[12px] font-normal text-[#3665F3]">
                        Live now
                      </span>
                    ) : (
                      <span className="ml-2 text-[12px] font-normal text-[#8a8a8a]">
                        Same listing
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[13px] text-[#707070]">{channel.body}</p>
                </div>
                {channel.id === "ebay" ? (
                  connected ? (
                    <span className="text-[13px] text-[#707070]">eBay store linked</span>
                  ) : (
                    <a
                      href={
                        ebayConfigured
                          ? "/api/ebay/oauth/start?next=/home"
                          : "/settings#ebay-store"
                      }
                      className="shrink-0 bg-[#3665F3] px-4 py-2 text-[13px] font-medium text-white"
                    >
                      Connect eBay
                    </a>
                  )
                ) : channel.id === "site" ? (
                  <Link
                    href="/settings#branding"
                    className="shrink-0 text-[13px] font-medium text-[#3665F3]"
                  >
                    {connected ? "Edit site" : "Add your site"}
                  </Link>
                ) : (
                  <span className="shrink-0 text-[12px] text-[#8a8a8a]">
                    {on ? "Queued for this account" : "Off"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {ebayConnected && !policiesReady ? (
          <div className="mt-5 border border-[#e5e5e5] px-4 py-4">
            <p className="text-[15px] font-medium text-[#141414]">Shipping & returns</p>
            <p className="mt-1 text-[13px] text-[#707070]">
              eBay needs the three policies before a listing can go live.
            </p>
            <Link
              href="/settings#policies"
              className="mt-3 inline-block text-[13px] font-medium text-[#3665F3]"
            >
              Set policies
            </Link>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => {
              markOnboardingDone();
              window.location.href = "/listings/new";
            }}
            className="bg-[#141414] px-5 py-2.5 text-[14px] font-medium text-white"
          >
            {ebayConnected ? "Start a listing" : "Continue"}
          </button>
          <button
            type="button"
            onClick={() => {
              markOnboardingDone();
              window.location.href = "/home";
            }}
            className="text-[13px] text-[#8a8a8a] hover:text-[#141414]"
          >
            I’ll connect later
          </button>
          {liveCount > 0 ? (
            <p className="text-[12px] text-[#8a8a8a]">{liveCount} connected</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
