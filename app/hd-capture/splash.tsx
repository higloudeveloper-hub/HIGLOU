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
    window.open(parsed.canonicalUrl, "hd-product");
    try {
      window.opener?.focus();
    } catch {
      /* some browsers block focus steal */
    }
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
        Home Depot is in the other window. Go back to Higlou and drag{" "}
        <span className="font-medium text-[#141414]">Bring all photos</span> onto
        that Home Depot tab.
      </p>
    </main>
  );
}
