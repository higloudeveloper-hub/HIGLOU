"use client";

import { useEffect } from "react";
import { parseHomeDepotLink } from "@/lib/homedepot/item-id";

export function HomeDepotCaptureSplash() {
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("url") || "";
    const parsed = parseHomeDepotLink(raw);
    if (!parsed) {
      window.close();
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        window.opener?.focus();
      } catch {
        /* some browsers block focus steal */
      }
      window.location.replace(parsed.canonicalUrl);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen bg-white px-8 py-16 text-[#141414]">
      <p className="text-[12px] font-medium tracking-[0.12em] text-[#707070] uppercase">
        Higlou
      </p>
      <h1 className="mt-6 max-w-xl text-[36px] leading-[1.1] font-semibold tracking-[-0.03em]">
        Come back to Higlou
      </h1>
      <p className="mt-4 max-w-md text-[16px] leading-7 text-[#707070]">
        This tab loads Home Depot the way an iPhone does — that is how we get
        every photo. When you see the product, switch back to Higlou and click
        Bring all photos.
      </p>
      <p className="mt-8 text-[13px] text-[#707070]">Opening Home Depot…</p>
    </main>
  );
}
