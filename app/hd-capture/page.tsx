import type { Metadata } from "next";
import { HomeDepotCaptureSplash } from "./splash";

export const metadata: Metadata = {
  title: "Come back to Higlou",
  robots: { index: false, follow: false },
};

export default function HomeDepotCapturePage() {
  return <HomeDepotCaptureSplash />;
}
