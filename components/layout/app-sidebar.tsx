"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Download,
  Home,
  Images,
  LogOut,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/sign-out";
import { HiglouLogo } from "@/components/brand/higlou-logo";
import { NewListingButton } from "@/components/brand/new-listing-button";

export const STUDIO_NAV = [
  {
    href: "/home",
    label: "Home",
    hint: "Money machine",
    icon: Home,
    match: (path: string) => path === "/home",
  },
  {
    href: "/stats",
    label: "Stats",
    hint: "Live store",
    icon: BarChart3,
    match: (path: string) => path === "/stats" || path.startsWith("/stats/"),
  },
  {
    href: "/listings",
    label: "Listings",
    hint: "Library",
    icon: Images,
    match: (path: string) =>
      path === "/listings" ||
      (path.startsWith("/listings/") && path !== "/listings/new"),
  },
  {
    href: "/exports",
    label: "Exports",
    hint: "CSV files",
    icon: Download,
    match: (path: string) => path === "/exports" || path.startsWith("/exports/"),
  },
  {
    href: "/settings",
    label: "Settings",
    hint: "Store setup",
    icon: Settings,
    match: (path: string) =>
      path === "/settings" ||
      path.startsWith("/settings/") ||
      path === "/usage" ||
      path === "/templates",
  },
] as const;

export function AppSidebar({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const onNewListing = pathname === "/listings/new";

  return (
    <aside
      className={cn(
        "flex h-full w-[16.5rem] shrink-0 flex-col border-r border-border/80 bg-surface",
        className,
      )}
    >
      <div className="px-5 pb-5 pt-7">
        <HiglouLogo href="/home" size={34} subtitle="Studio" onClick={onNavigate} />
      </div>

      <div className="px-3 pb-5">
        <NewListingButton
          block
          onClick={onNavigate}
          className={onNewListing ? "bg-[#2a2a2a]" : undefined}
        />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        <p className="px-3 pb-1.5 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Workspace
        </p>
        {STUDIO_NAV.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors",
                active
                  ? "bg-brand-soft text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 opacity-80" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-[11px] text-muted-foreground/80">
                  {item.hint}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border/70 px-3 py-4">
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
