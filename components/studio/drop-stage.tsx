"use client";

import { motion } from "motion/react";
import {
  AmazonMark,
  EbayMark,
  FacebookMark,
  ShopifyMark,
  SiteMark,
} from "@/components/brand/store-marks";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

function LiveOnMarks() {
  return (
    <div className="flex items-center gap-2.5" aria-label="Five stores">
      <EbayMark className="h-3.5" />
      <AmazonMark className="h-3" />
      <FacebookMark className="h-3" />
      <ShopifyMark className="h-4" />
      <SiteMark className="h-4" />
    </div>
  );
}

export function DropStage({
  fileDrag,
  freezeDrop,
  shots,
  catalog,
  sku,
  compact = false,
}: {
  fileDrag: boolean;
  freezeDrop: boolean;
  shots: string[];
  catalog: readonly { name: string; photos: readonly string[] }[];
  sku: number;
  compact?: boolean;
}) {
  const hero = freezeDrop ? shots[0] : null;
  const extras = freezeDrop
    ? shots.slice(0, 5)
    : catalog.map((item) => item.photos[0]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#f7f7f7]">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-4 py-5 sm:gap-6">
        <div className="text-center">
          <p
            className={cn(
              "font-medium tracking-tight text-[#141414]",
              compact ? "text-[20px]" : "text-[26px] sm:text-[32px]",
            )}
          >
            {freezeDrop ? "Photo in." : fileDrag ? "Drop it." : "Drop one photo here."}
          </p>
          <p className="mt-1 text-[13px] text-[#707070] sm:text-[14px]">
            {freezeDrop
              ? "Higlou will write the listing from this shot."
              : "On this pad. Higlou writes the listing. Five stores go live."}
          </p>
        </div>

        <motion.div
          data-listing-slot=""
          initial={false}
          animate={{
            scale: fileDrag ? 1.03 : 1,
            borderColor: fileDrag ? "#141414" : "#141414",
          }}
          transition={{ duration: 0.28, ease: EASE }}
          className={cn(
            "relative flex w-full max-w-[440px] flex-col items-center justify-center bg-white",
            compact ? "h-[168px]" : "h-[min(38vh,300px)] min-h-[200px]",
            fileDrag
              ? "border-2 border-solid border-[#141414]"
              : "border border-dashed border-[#141414]",
          )}
        >
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hero}
              alt=""
              className="absolute inset-0 size-full object-contain p-6"
            />
          ) : (
            <div className="flex flex-col items-center px-6 text-center">
              <motion.p
                animate={
                  fileDrag
                    ? { opacity: 1 }
                    : { opacity: [0.45, 1, 0.45] }
                }
                transition={
                  fileDrag
                    ? { duration: 0.2 }
                    : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
                }
                className={cn(
                  "font-medium tracking-tight text-[#141414]",
                  compact ? "text-[16px]" : "text-[20px] sm:text-[22px]",
                )}
              >
                {fileDrag ? "Release to list" : "Drop here"}
              </motion.p>
              <p className="mt-1 text-[12px] text-[#8a8a8a]">
                or click to choose from your computer
              </p>
              <div className="mt-5">
                <LiveOnMarks />
              </div>
            </div>
          )}
        </motion.div>

        <div className="flex items-end justify-center gap-2 sm:gap-2.5">
          {extras.map((src, i) => {
            const on = freezeDrop ? i === 0 : i === sku % catalog.length;
            const label = freezeDrop ? `Photo ${i + 1}` : catalog[i]?.name;
            return (
              <div key={`${label}-${src}`} className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "overflow-hidden bg-white ring-1 transition",
                    on
                      ? "h-[64px] w-[52px] ring-[#141414] sm:h-[72px] sm:w-[58px]"
                      : "h-[48px] w-[40px] opacity-40 ring-[#e5e5e5] sm:h-[56px] sm:w-[46px]",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="size-full object-contain p-1" />
                </div>
                <p
                  className={cn(
                    "text-[10px]",
                    on ? "font-medium text-[#141414]" : "text-[#8a8a8a]",
                  )}
                >
                  {label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
