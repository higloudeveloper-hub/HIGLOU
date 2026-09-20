"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/** One-line tip — no card wall. */
export function MarketEarnGuide({
  tagReady,
  className,
}: {
  tagReady: boolean;
  className?: string;
}) {
  return (
    <p className={cn("text-[13px] text-[#707070]", className)}>
      {tagReady ? (
        <>Tocá un tile · <strong className="font-medium text-[#191919]">Ganar</strong> abre Amazon con tu tag · <strong className="font-medium text-[#191919]">Vender</strong> lo mete a tu tienda.</>
      ) : (
        <>
          Tip: pegá tu Associate tag en{" "}
          <Link href="/settings" className="font-medium text-[#3665F3] hover:underline">
            Settings
          </Link>{" "}
          para activar links de Ganar.
        </>
      )}
    </p>
  );
}
