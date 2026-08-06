"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Download,
  Home,
  Images,
  LogOut,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/sign-out";

const NAV = [
  {
    href: "/home",
    label: "Home",
    icon: Home,
    match: (path: string) => path === "/home",
  },
  {
    href: "/listings",
    label: "Listings",
    icon: Images,
    match: (path: string) =>
      path === "/listings" ||
      (path.startsWith("/listings/") && path !== "/listings/new"),
  },
  {
    href: "/exports",
    label: "Exports",
    icon: Download,
    match: (path: string) => path === "/exports" || path.startsWith("/exports/"),
  },
  {
    href: "/settings#branding",
    label: "Store & templates",
    icon: Settings,
    match: (path: string) =>
      path === "/settings" ||
      path.startsWith("/settings/") ||
      path === "/usage" ||
      path === "/templates",
  },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const onNewListing = pathname === "/listings/new";

  return (
    <aside className="flex h-full w-[15.5rem] shrink-0 flex-col border-r border-zinc-200/70 bg-white">
      <div className="px-5 pb-4 pt-7">
        <Link href="/home" className="group block">
          <div className="text-[11px] font-semibold tracking-[0.2em] text-zinc-400 transition group-hover:text-zinc-500">
            STORE STUDIO
          </div>
          <div className="mt-1.5 text-[15px] font-semibold leading-snug tracking-tight text-zinc-950">
            Multi-store listings
          </div>
        </Link>
      </div>

      <div className="px-3 pb-4">
        <Link
          href="/listings/new"
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition",
            onNewListing
              ? "bg-zinc-950 text-white"
              : "bg-zinc-950 text-white hover:bg-zinc-800",
          )}
        >
          <Sparkles className="size-3.5" />
          New Listing
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-100 text-zinc-950"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900",
              )}
            >
              <Icon className="size-4 opacity-80" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-5 pt-2">
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </form>
        <p className="mt-3 px-3 text-[11px] leading-relaxed text-zinc-400">
          Analyze → perfect CSV for eBay &amp; marketplace
        </p>
      </div>
    </aside>
  );
}
