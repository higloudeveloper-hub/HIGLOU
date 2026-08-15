"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";

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
  const [from, setFrom] = useState({ x: 0, y: 0 });
  const [to, setTo] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const overlay = root.current;
    if (!overlay) return;

    const place = () => {
      const box = overlay.getBoundingClientRect();
      const card = document.querySelector<HTMLElement>(
        `[data-ready-sku="${sku}"]`,
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
  const x = phase === "grab" ? from.x : to.x;
  const y = phase === "grab" ? from.y : to.y;

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-40">
      <motion.div
        className="absolute"
        initial={false}
        animate={{
          left: x,
          top: y,
          opacity: phase === "drop" ? 0 : 1,
          scale: phase === "drop" ? 0.16 : phase === "grab" ? 1 : 1.06,
          rotate: phase === "grab" ? -6 : phase === "drag" ? -12 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: phase === "drag" ? 150 : 240,
          damping: phase === "drag" ? 20 : 22,
        }}
      >
        <div
          className={
            holding
              ? "-translate-x-1/2 -translate-y-[108%] h-[148px] w-[118px] overflow-hidden rounded-[4px] bg-white p-1.5 pb-7 shadow-[0_28px_50px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/10 sm:h-[168px] sm:w-[132px]"
              : "-translate-x-1/2 -translate-y-1/2 size-12 overflow-hidden rounded-md bg-white shadow-[0_10px_24px_-12px_rgba(0,0,0,0.4)] ring-1 ring-black/10"
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="size-full object-contain" />
        </div>
      </motion.div>
    </div>
  );
}
