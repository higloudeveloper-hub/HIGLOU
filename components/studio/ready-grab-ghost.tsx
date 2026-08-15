"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { MousePointer2 } from "lucide-react";
import { READY_LISTINGS } from "@/components/studio/ready-catalog";

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
      const index = ((sku % READY_LISTINGS.length) + READY_LISTINGS.length) % READY_LISTINGS.length;
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
            scale: phase === "drop" ? 0.16 : phase === "grab" ? 1.12 : 1.08,
            rotate: phase === "grab" ? -8 : phase === "drag" ? -14 : 0,
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
                  ? "relative h-[148px] w-[118px] overflow-hidden rounded-[4px] bg-white p-1.5 pb-7 shadow-[0_40px_70px_-16px_rgba(0,0,0,0.55)] ring-1 ring-black/10 sm:h-[168px] sm:w-[132px]"
                  : "relative size-12 overflow-hidden rounded-md bg-white shadow-[0_10px_24px_-12px_rgba(0,0,0,0.4)] ring-1 ring-black/10"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-full object-contain" />
            </div>
            {holding ? (
              <>
                {phase === "grab" ? (
                  <motion.span
                    initial={{ scale: 0.25, opacity: 0.55 }}
                    animate={{ scale: 2.3, opacity: 0 }}
                    transition={{ duration: 0.55, ease: "easeOut" }}
                    className="absolute right-1 -bottom-2 size-8 rounded-full border-2 border-[#141414]"
                  />
                ) : null}
                <MousePointer2
                  className="absolute -right-2 -bottom-4 size-6 text-[#141414] drop-shadow-[0_2px_6px_rgba(0,0,0,0.28)]"
                  fill="white"
                  strokeWidth={1.75}
                />
              </>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
