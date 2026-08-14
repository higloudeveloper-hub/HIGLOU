"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Camera, Check, Circle, Sparkles } from "lucide-react";
import { MoneyEngine } from "@/components/studio/money-engine";
import { cn } from "@/lib/utils";

const PARTS = [
  {
    n: "01",
    title: "Drop photos",
    body: "That’s your only hard input. A few clear angles.",
  },
  {
    n: "02",
    title: "Higlou writes",
    body: "Title, category, specifics, description — drafted for you.",
  },
  {
    n: "03",
    title: "You glance",
    body: "Fix price or a word if you want. Most of it is already done.",
  },
  {
    n: "04",
    title: "Publish",
    body: "Send a draft to eBay, or download the CSV. Then it can sell.",
  },
] as const;

export function FirstRunHome({
  name,
  setupItems,
  setupDoneCount,
}: {
  name: string | null;
  setupItems: {
    done: boolean;
    title: string;
    body: string;
    href: string;
  }[];
  setupDoneCount: number;
}) {
  const setupComplete = setupDoneCount === setupItems.length;

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="pt-2 pb-8"
      >
        <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          First time here
        </p>
        <h1 className="mt-3 font-display text-4xl tracking-tight text-foreground sm:text-[3.2rem]">
          {name ? `${name}, this is` : "This is"} your listing engine.
        </h1>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
          You bring photos of what you sell. Higlou writes the eBay listing.
          You publish. That’s how inventory turns into money — without sitting
          down to write.
        </p>
        <Link
          href="/listings/new"
          className="mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-foreground px-6 text-sm font-semibold text-background transition hover:opacity-90"
        >
          <Sparkles className="size-4" />
          Start my first listing
          <ArrowRight className="size-4" />
        </Link>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <MoneyEngine />
      </motion.div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">
          How you use it — four parts
        </h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {PARTS.map((part, i) => (
            <motion.li
              key={part.n}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 + i * 0.08, duration: 0.4 }}
              className="rounded-2xl border border-border/80 bg-surface p-4"
            >
              <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-foreground uppercase">
                Part {part.n}
              </p>
              <p className="mt-2 text-[15px] font-semibold">{part.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {part.body}
              </p>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            So it can publish to eBay
          </h2>
          <p className="text-sm text-muted-foreground">
            {setupDoneCount}/{setupItems.length}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          You can list a draft now. Connect these when you’re ready to send it live.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {setupItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-2xl border px-4 py-4 transition",
                item.done
                  ? "border-success/30 bg-success-soft/40"
                  : "border-border bg-surface hover:bg-muted/60",
              )}
            >
              <div className="flex items-center justify-between">
                {item.done ? (
                  <Check className="size-4 text-success" strokeWidth={3} />
                ) : (
                  <Circle className="size-4 text-muted-foreground/50" />
                )}
              </div>
              <p className="mt-3 text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{item.body}</p>
            </Link>
          ))}
        </div>
        {setupComplete ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-success">
            <Camera className="size-4" />
            Store is ready. Go make the first listing.
          </p>
        ) : null}
      </section>
    </div>
  );
}
