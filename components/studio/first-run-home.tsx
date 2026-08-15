"use client";

import Link from "next/link";
import { Check, Circle, Sparkles } from "lucide-react";
import { MoneyEngine } from "@/components/studio/money-engine";
import { StudioFrame } from "@/components/layout/studio-frame";
import { cn } from "@/lib/utils";

const PARTS = [
  {
    n: "01",
    title: "Drop photos",
    body: "That’s your only hard input. A few clear angles.",
  },
  {
    n: "02",
    title: "Higlou writes",
    body: "Title, category, specifics, description — drafted for you.",
  },
  {
    n: "03",
    title: "You glance",
    body: "Fix price or a word if you want. Most of it is already done.",
  },
  {
    n: "04",
    title: "One click",
    body: "eBay, Amazon, Facebook, and your website — same listing, everywhere.",
  },
] as const;

export function FirstRunHome({
  name,
  setupItems,
  setupDoneCount,
}: {
  name: string | null;
  setupItems: {
    done: boolean;
    title: string;
    body: string;
    href: string;
  }[];
  setupDoneCount: number;
}) {
  return (
    <StudioFrame
      kicker="First time here"
      title={name ? `${name}, this is your listing engine` : "Your listing engine"}
      hint="Photos in. One click. Every store."
      action={
        <Link
          href="/listings/new"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#3665F3] px-4 text-[13px] font-semibold text-white"
        >
          <Sparkles className="size-3.5" />
          Start my first listing
        </Link>
      }
      scroll={false}
    >
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.15fr)]">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-b border-[#e5e5e5] bg-[#f7f7f7] p-5 lg:border-r lg:border-b-0">
          <p className="text-[14px] leading-relaxed text-[#565959]">
            You bring photos of what you sell. Higlou writes the listing. One
            click sends it to eBay, Amazon, Facebook, and your website.
          </p>
          <ol className="grid gap-2 sm:grid-cols-2">
            {PARTS.map((part) => (
              <li
                key={part.n}
                className="rounded-xl border border-[#e5e5e5] bg-white p-3.5"
              >
                <p className="text-[10px] font-semibold tracking-[0.16em] text-[#707070] uppercase">
                  Part {part.n}
                </p>
                <p className="mt-1 text-[14px] font-semibold text-[#191919]">
                  {part.title}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#707070]">
                  {part.body}
                </p>
              </li>
            ))}
          </ol>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-[13px] font-semibold text-[#191919]">
                So it can go live everywhere
              </p>
              <p className="text-[12px] text-[#707070]">
                {setupDoneCount}/{setupItems.length}
              </p>
            </div>
            <div className="grid gap-2">
              {setupItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-xl border px-3.5 py-3 transition",
                    item.done
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-[#e5e5e5] bg-white hover:border-[#ccc]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {item.done ? (
                      <Check className="size-3.5 text-emerald-700" strokeWidth={3} />
                    ) : (
                      <Circle className="size-3.5 text-[#ccc]" />
                    )}
                    <p className="text-[13px] font-semibold text-[#191919]">
                      {item.title}
                    </p>
                  </div>
                  <p className="mt-1 pl-6 text-[12px] text-[#707070]">{item.body}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-col bg-white p-4">
          <MoneyEngine />
        </div>
      </div>
    </StudioFrame>
  );
}
