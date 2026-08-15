"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Plus, Sparkles } from "lucide-react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LiveDot } from "@/components/ui/studio";
import { cn } from "@/lib/utils";

export function AppShell({
  title,
  description,
  actions,
  children,
  hideHeader = false,
  contentClassName,
  flush = false,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Home / conversational screens — no admin chrome title bar */
  hideHeader?: boolean;
  contentClassName?: string;
  /** Fill the PC viewport with no page padding (Stats machine). */
  flush?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <div className="sticky top-0 hidden h-screen md:block">
        <AppSidebar />
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          flush && "md:h-screen md:overflow-hidden",
        )}
      >
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur-md md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-foreground"
              aria-label="Open menu"
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[15.5rem] border-border p-0"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Higlou navigation</SheetTitle>
              </SheetHeader>
              <AppSidebar onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <Link href="/home" className="inline-flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-brand-gradient text-brand-foreground">
              <Sparkles className="size-3.5" strokeWidth={2.5} />
            </span>
            <span className="text-[16px] font-semibold tracking-tight">
              Higlou
            </span>
          </Link>
          <Link
            href="/listings/new"
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[12px] font-semibold text-background"
          >
            <Plus className="size-3" />
            New
          </Link>
        </div>

        {!hideHeader && title ? (
          <header className="sticky top-0 z-20 border-b border-border/60 bg-background/90 backdrop-blur-md">
            <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-10 sm:py-6">
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  <LiveDot />
                  Studio
                </p>
                <h1 className="font-display text-3xl tracking-tight text-foreground">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                    {description}
                  </p>
                ) : null}
              </div>
              {actions ? (
                <div className="flex flex-wrap gap-2">{actions}</div>
              ) : null}
            </div>
          </header>
        ) : null}
        <main
          className={cn(
            "flex-1",
            flush
              ? "flex min-h-0 flex-col p-0"
              : hideHeader
                ? "px-5 pt-6 pb-16 sm:px-10 sm:pt-10"
                : "px-5 pt-2 pb-16 sm:px-10",
            contentClassName,
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
