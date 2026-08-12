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

export const STUDIO_NAV = [
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
    href: "/settings",
    label: "Settings",
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
        "flex h-full w-[15.5rem] shrink-0 flex-col border-r border-border/80 bg-surface",
        className,
      )}
    >
      <div className="px-5 pb-4 pt-7">
        <Link href="/home" onClick={onNavigate} className="group block">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-gradient text-brand-foreground shadow-sm">
              <Sparkles className="size-4" strokeWidth={2.5} />
            </span>
            <div>
              <div className="text-[17px] font-semibold leading-none tracking-tight text-foreground">
                Higlou
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                eBay listings, step by step
              </div>
            </div>
          </div>
        </Link>
      </div>

      <div className="px-3 pb-4">
        <Link
          href="/listings/new"
          onClick={onNavigate}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
            onNewListing
              ? "bg-brand text-brand-foreground shadow-sm"
              : "bg-foreground text-background hover:opacity-90",
          )}
        >
          <Sparkles className="size-3.5" />
          New Listing
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {STUDIO_NAV.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-soft text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </form>
        <p className="mt-3 px-3 text-[11px] leading-relaxed text-muted-foreground">
          Photos → AI draft → edit → publish to eBay
        </p>
      </div>
    </aside>
  );
}
