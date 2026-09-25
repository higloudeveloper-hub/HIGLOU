import type { Metadata } from "next";
import { CompareStudio } from "@/components/compare/compare-studio";

export const metadata: Metadata = {
  title: "Compare · Higlou Marketplace",
  description:
    "Marketplace Higlou: buscá productos en tendencia o pegá Amazon y compará el mismo deal en eBay, Walmart y Home Depot.",
  openGraph: {
    title: "Higlou Compare Pro",
    description:
      "Tendencias Keepa + comparación multi-tienda. ¿Amazon es lo más barato?",
  },
};

export default function ComparePage() {
  return <CompareStudio />;
}
