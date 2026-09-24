import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { RonAgentFab } from "@/components/ron/ron-agent-fab";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Higlou – Create your perfect eBay listing",
  description:
    "Upload your product photos and Higlou builds a professional, high-converting eBay listing for you in minutes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        {children}
        <RonAgentFab />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
