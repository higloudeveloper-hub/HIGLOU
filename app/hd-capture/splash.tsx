"use client";

import { useEffect } from "react";
import { parseHomeDepotLink } from "@/lib/homedepot/item-id";

export function HomeDepotCaptureSplash() {
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("url") || "";
    const parsed = parseHomeDepotLink(raw);
    if (!parsed) return;
    window.location.replace(parsed.canonicalUrl);
  }, []);

  return (
    <main className="min-h-screen bg-white px-8 py-16 text-[#141414]">
      <p className="text-[12px] font-medium tracking-[0.12em] text-[#707070] uppercase">
        Higlou
      </p>
      <h1 className="mt-6 max-w-xl text-[36px] leading-[1.1] font-semibold tracking-[-0.03em]">
        Opening Home Depot
      </h1>
      <p className="mt-4 max-w-md text-[16px] leading-7 text-[#707070]">
        This tab is loading the product. Go back to Higlou — photos import from
        the link, without opening Home Depot.
      </p>
    </main>
  );
}
