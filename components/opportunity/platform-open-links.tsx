"use client";

import { ExternalLink } from "lucide-react";
import {
  PLATFORM_LINK_LABELS,
  type PlatformKey,
  type PlatformUrls,
} from "@/lib/opportunity/platform-links";
import { cn } from "@/lib/utils";

const ORDER: PlatformKey[] = ["amazon", "ebay", "walmart", "homedepot"];

export function PlatformOpenLinks({
  urls,
  className,
  size = "md",
}: {
  urls?: PlatformUrls | null;
  className?: string;
  size?: "sm" | "md";
}) {
  if (!urls) return null;
  const links = ORDER.filter((key) => urls[key]);
  if (!links.length) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {links.map((key) => (
        <a
          key={key}
          href={urls[key]!}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1 border border-[#d5d9d9] bg-white font-semibold text-[#2162a1] hover:bg-[#f7f8f8] hover:underline",
            size === "sm"
              ? "h-7 px-2 text-[11px]"
              : "h-8 px-2.5 text-[12px]",
          )}
        >
          {PLATFORM_LINK_LABELS[key]}
          <ExternalLink className="size-3 opacity-70" />
        </a>
      ))}
    </div>
  );
}
