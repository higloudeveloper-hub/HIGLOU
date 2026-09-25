import type { CSSProperties, ReactNode } from "react";
import { Figtree, Syne } from "next/font/google";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-compare-display",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-compare-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default function CompareLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      className={`${syne.variable} ${figtree.variable} min-h-dvh`}
      style={
        {
          "--compare-display":
            "var(--font-compare-display), ui-sans-serif, system-ui",
          "--compare-sans":
            "var(--font-compare-sans), ui-sans-serif, system-ui",
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
