"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { MousePointer2 } from "lucide-react";

export function ReadyGrabGhost({
  sku,
  phase,
  src,
}: {
  sku: number;
  phase: "grab" | "drag" | "drop";
  src: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null);
  const [to, setTo] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const overlay = root.current;
    if (!overlay) return;

    const place = () => {
      const box = overlay.getBoundingClientRect();
      const cards = document.querySelectorAll("[data-ready-sku]");
      const count = cards.length || 1;
      const index = ((sku % count) + count) % count;
      const card = document.querySelector<HTMLElement>(
        `[data-ready-sku="${index}"]`,
      );
      const slot = document.querySelector<HTMLElement>("[data-listing-slot]");
      if (card) {
        const r = card.getBoundingClientRect();
        setFrom({
          x: r.left - box.left + r.width / 2,
          y: r.top - box.top + r.height * 0.38,
        });
      }
      if (slot) {
        const r = slot.getBoundingClientRect();
        setTo({
          x: r.left - box.left + r.width / 2,
          y: r.top - box.top + r.height / 2,
        });
      }
    };

    place();
    const ro = new ResizeObserver(place);
    ro.observe(overlay);
    window.addEventListener("scroll", place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", place, true);
    };
  }, [sku, phase]);

  const holding = phase === "grab" || phase === "drag";
  const ready = from && to;
  const x = phase === "grab" ? from?.x ?? 0 : to?.x ?? 0;
  const y = phase === "grab" ? from?.y ?? 0 : to?.y ?? 0;

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-40">
      {ready ? (
        <motion.div
          className="absolute"
          initial={false}
          animate={{
            left: x,
            top: y,
            opacity: phase === "drop" ? 0 : 1,
            scale: phase === "drop" ? 0.2 : 1,
            rotate: 0,
          }}
          transition={{
            type: "spring",
            stiffness: phase === "drag" ? 108 : 280,
            damping: phase === "drag" ? 16 : 20,
          }}
        >
          <div className="-translate-x-1/2 -translate-y-[108%]">
            <div
              className={
                holding
                  ? "relative h-[140px] w-[112px] overflow-hidden rounded-[2px] bg-white p-1.5 pb-6 ring-1 ring-[#e5e5e5] sm:h-[156px] sm:w-[124px]"
                  : "relative size-11 overflow-hidden rounded-sm bg-white ring-1 ring-[#e5e5e5]"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-full object-contain" />
            </div>
            {holding ? (
              <MousePointer2
                className="absolute -right-1 -bottom-3 size-5 text-[#141414]"
                fill="white"
                strokeWidth={1.6}
              />
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
