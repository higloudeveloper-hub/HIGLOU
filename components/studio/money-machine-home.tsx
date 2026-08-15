"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ListingPipeline } from "@/components/studio/listing-pipeline";

export function MoneyMachineHome({
  storeName,
}: {
  name?: string | null;
  storeName?: string | null;
  nextDraft?: { id: string; title: string } | null;
  ebayConnected?: boolean;
  setupHref?: string | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white md:h-full">
      <div className="flex shrink-0 items-center gap-4 bg-[#3665F3] px-5 py-2.5 text-white">
        <span className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
          <span className="relative size-2 rounded-full bg-white" />
        </span>
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">
          Money machine
        </p>
        <p className="hidden min-w-0 flex-1 truncate text-[13px] text-white/85 sm:block">
          Photos in · Higlou writes · one click · eBay · Amazon · Facebook · your website
        </p>
        <Link
          href="/listings/new"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-[#3665F3]"
        >
          <Sparkles className="size-3.5" />
          New listing
        </Link>
      </div>
      <ListingPipeline storeName={storeName} />
    </div>
  );
}
