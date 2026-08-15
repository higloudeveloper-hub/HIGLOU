import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function NewListingButton({
  className,
  size = "md",
  tone = "solid",
  label = "New listing",
  block = false,
  onClick,
}: {
  className?: string;
  size?: "sm" | "md";
  tone?: "solid" | "inverse" | "on-blue";
  label?: string;
  block?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href="/listings/new"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold tracking-[-0.01em] transition-colors",
        size === "sm" && "h-8 rounded-md px-3 text-[12px]",
        size === "md" && "h-10 rounded-md px-4 text-[13px]",
        tone === "solid" && "bg-[#141414] text-white hover:bg-[#2a2a2a]",
        tone === "inverse" &&
          "border border-[#d8d8d8] bg-white text-[#141414] hover:bg-[#f6f6f6]",
        tone === "on-blue" && "bg-white text-[#141414] hover:bg-[#f3f6ff]",
        block && "w-full",
        className,
      )}
    >
      <Plus className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2} />
      {label}
    </Link>
  );
}
